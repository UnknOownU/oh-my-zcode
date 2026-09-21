mod agents;
mod content;
mod files;
mod hooks;
mod manifest;
mod marketplace;
mod routing;

use std::{
    fmt,
    path::{Path, PathBuf},
};

use serde::Serialize;

#[derive(Debug, Default, Serialize)]
pub struct ValidationReport {
    pub checks: Vec<String>,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

impl ValidationReport {
    pub fn is_valid(&self) -> bool {
        self.errors.is_empty()
    }

    fn check(&mut self, valid: bool, message: impl Into<String>) {
        if valid {
            self.checks.push(message.into());
        } else {
            self.errors.push(message.into());
        }
    }

    fn record<T>(&mut self, result: Result<T, ValidationError>) -> Option<T> {
        match result {
            Ok(value) => Some(value),
            Err(error) => {
                self.errors.push(error.to_string());
                None
            }
        }
    }
}

impl fmt::Display for ValidationReport {
    fn fmt(&self, output: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (label, messages) in [
            ("OK", &self.checks),
            ("WARN", &self.warnings),
            ("ERR", &self.errors),
        ] {
            for message in messages {
                writeln!(output, "{label}: {message}")?;
            }
        }
        let status = if self.is_valid() { "SUCCESS" } else { "FAILED" };
        write!(
            output,
            "{status}: {} checks passed, {} warnings, {} errors",
            self.checks.len(),
            self.warnings.len(),
            self.errors.len()
        )
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ValidationError {
    #[error("plugin directory not found: {0}")]
    MissingRoot(PathBuf),
    #[error("{path}: {source}")]
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("{path}: invalid JSON: {source}")]
    Json {
        path: PathBuf,
        source: serde_json::Error,
    },
    #[error("{path}: invalid YAML frontmatter: {source}")]
    Yaml {
        path: PathBuf,
        source: yaml_serde::Error,
    },
    #[error("{0}: YAML frontmatter missing or unterminated")]
    Frontmatter(PathBuf),
}

pub fn validate(root: &Path, packaged: bool) -> Result<ValidationReport, ValidationError> {
    if !root.is_dir() {
        return Err(ValidationError::MissingRoot(root.to_owned()));
    }
    let mut report = ValidationReport::default();
    manifest::check(root, packaged, &mut report);
    hooks::check(root, packaged, &mut report);
    agents::check(root, &mut report);
    content::check(root, &mut report);
    files::check_encoding(root, &mut report);
    Ok(report)
}
