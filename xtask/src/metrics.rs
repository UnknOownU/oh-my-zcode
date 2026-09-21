//! Fail-closed complexity checks backed by Mozilla's Rust AST analysis.
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, thiserror::Error)]
pub enum MetricsError {
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("AST analyzer failed: {0}")]
    Analyzer(String),
    #[error("No Rust production sources found")]
    Empty,
    #[error("{0} quality limits exceeded; see the JSON report")]
    Limits(usize),
}

#[derive(Debug, Deserialize)]
struct Aggregate {
    sum: f64,
}

#[derive(Debug, Deserialize)]
struct Lines {
    ploc: f64,
}

#[derive(Debug, Deserialize)]
struct Metrics {
    cyclomatic: Aggregate,
    cognitive: Aggregate,
    loc: Lines,
}

#[derive(Debug, Deserialize)]
struct Space {
    name: Option<String>,
    kind: String,
    start_line: usize,
    spaces: Vec<Self>,
    metrics: Metrics,
}

#[derive(Debug, Serialize)]
struct Function {
    name: String,
    line: usize,
    cyclomatic: f64,
    cognitive: f64,
    code_lines: f64,
}

#[derive(Debug, Serialize)]
struct FileReport {
    path: String,
    sha256: String,
    code_lines: f64,
    functions: Vec<Function>,
}

#[derive(Debug, Serialize)]
struct Report {
    analyzer: String,
    files: Vec<FileReport>,
    failures: Vec<String>,
}

fn sources(directory: &Path, output: &mut Vec<PathBuf>) -> Result<(), MetricsError> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        if kind.is_dir() {
            sources(&entry.path(), output)?;
        } else if kind.is_file() && entry.path().extension().is_some_and(|value| value == "rs") {
            output.push(entry.path());
        }
    }
    Ok(())
}

fn functions(space: &Space, output: &mut Vec<Function>) {
    if space.kind == "function" {
        let children_cyclomatic: f64 = space
            .spaces
            .iter()
            .map(|child| child.metrics.cyclomatic.sum)
            .sum();
        let children_cognitive: f64 = space
            .spaces
            .iter()
            .map(|child| child.metrics.cognitive.sum)
            .sum();
        output.push(Function {
            name: space
                .name
                .clone()
                .unwrap_or_else(|| "<anonymous>".to_owned()),
            line: space.start_line,
            cyclomatic: space.metrics.cyclomatic.sum - children_cyclomatic,
            cognitive: space.metrics.cognitive.sum - children_cognitive,
            code_lines: space.metrics.loc.ploc,
        });
    }
    for child in &space.spaces {
        functions(child, output);
    }
}

fn analyze(path: &Path, analyzer: &Path) -> Result<FileReport, MetricsError> {
    let before = fs::read(path)?;
    let result = Command::new(analyzer)
        .args(["--metrics", "--language-type", "rust", "--paths"])
        .arg(path)
        .args(["--output-format", "json"])
        .output()?;
    if !result.status.success() {
        return Err(MetricsError::Analyzer(
            String::from_utf8_lossy(&result.stderr).into_owned(),
        ));
    }
    let space: Space = serde_json::from_slice(&result.stdout)?;
    if space.kind != "unit" {
        return Err(MetricsError::Analyzer(format!(
            "Missing root unit: {}",
            path.display()
        )));
    }
    if before != fs::read(path)? {
        return Err(MetricsError::Analyzer(format!(
            "Source changed during analysis: {}",
            path.display()
        )));
    }
    let mut records = Vec::new();
    functions(&space, &mut records);
    Ok(FileReport {
        path: path.to_string_lossy().replace(char::from(92), "/"),
        sha256: format!("{:x}", Sha256::digest(&before)),
        code_lines: space.metrics.loc.ploc,
        functions: records,
    })
}

fn violations(report: &FileReport, output: &mut Vec<String>) {
    if report.code_lines > 250.0 {
        output.push(format!(
            "{}: {} code lines exceeds 250",
            report.path, report.code_lines
        ));
    }
    for function in &report.functions {
        let location = format!("{}:{}:{}", report.path, function.line, function.name);
        for (name, value, limit) in [
            ("cyclomatic", function.cyclomatic, 10.0),
            ("cognitive", function.cognitive, 15.0),
            ("function code lines", function.code_lines, 50.0),
        ] {
            if value > limit || value < 0.0 || !value.is_finite() {
                output.push(format!("{location}: {name}={value}, limit={limit}"));
            }
        }
    }
}

fn analyzer_version(analyzer: &Path) -> Result<String, MetricsError> {
    let result = Command::new(analyzer).arg("--version").output()?;
    let version = String::from_utf8_lossy(&result.stdout).trim().to_owned();
    if !result.status.success() || version != "rust-code-analysis-cli 0.0.25" {
        return Err(MetricsError::Analyzer(format!(
            "Expected rust-code-analysis-cli 0.0.25, received {version:?}"
        )));
    }
    Ok(version)
}

fn verify_sources(root: &Path, files: &[FileReport]) -> Result<(), MetricsError> {
    let mut current = Vec::new();
    sources(&root.join("src"), &mut current)?;
    sources(&root.join("xtask/src"), &mut current)?;
    current.sort();
    let expected: Vec<PathBuf> = files.iter().map(|file| PathBuf::from(&file.path)).collect();
    if current != expected {
        return Err(MetricsError::Analyzer(
            "Source inventory changed during analysis".to_owned(),
        ));
    }
    for file in files {
        let digest = format!("{:x}", Sha256::digest(fs::read(&file.path)?));
        if digest != file.sha256 {
            return Err(MetricsError::Analyzer(format!(
                "Source changed during analysis: {}",
                file.path
            )));
        }
    }
    Ok(())
}

/// Analyze every first-party production Rust source, including build tooling.
pub fn check(root: &Path, analyzer: &Path) -> Result<(), MetricsError> {
    let version = analyzer_version(analyzer)?;
    let mut paths = Vec::new();
    sources(&root.join("src"), &mut paths)?;
    sources(&root.join("xtask").join("src"), &mut paths)?;
    paths.sort();
    if paths.is_empty() {
        return Err(MetricsError::Empty);
    }
    let mut report = Report {
        analyzer: version,
        files: Vec::new(),
        failures: Vec::new(),
    };
    for path in paths {
        let file = analyze(&path, analyzer)?;
        violations(&file, &mut report.failures);
        report.files.push(file);
    }
    verify_sources(root, &report.files)?;
    writeln!(io::stdout(), "{}", serde_json::to_string_pretty(&report)?)?;
    if report.failures.is_empty() {
        Ok(())
    } else {
        Err(MetricsError::Limits(report.failures.len()))
    }
}

#[cfg(test)]
#[path = "../tests/metrics/mod.rs"]
mod tests;
