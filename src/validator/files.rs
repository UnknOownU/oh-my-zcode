use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use serde::de::DeserializeOwned;

use super::{ValidationError, ValidationReport};

pub(super) fn text(path: &Path, report: &mut ValidationReport) -> Result<String, ValidationError> {
    let text = fs::read_to_string(path).map_err(|source| ValidationError::Io {
        path: path.to_owned(),
        source,
    })?;
    if let Some(stripped) = text.strip_prefix('\u{feff}') {
        report
            .warnings
            .push(format!("{}: UTF-8 BOM present", path.display()));
        Ok(stripped.to_owned())
    } else {
        Ok(text)
    }
}

pub(super) fn json<T: DeserializeOwned>(path: &Path, report: &mut ValidationReport) -> Option<T> {
    let result = text(path, report).and_then(|text| {
        serde_json::from_str(&text).map_err(|source| ValidationError::Json {
            path: path.to_owned(),
            source,
        })
    });
    report.record(result)
}

pub(super) fn frontmatter<T: DeserializeOwned>(
    path: &Path,
    report: &mut ValidationReport,
) -> Option<T> {
    let result = text(path, report).and_then(|text| {
        let mut lines = text.lines();
        if lines.next() != Some("---") {
            return Err(ValidationError::Frontmatter(path.to_owned()));
        }
        let mut body = String::new();
        for line in lines {
            if line == "---" {
                return yaml_serde::from_str(&body).map_err(|source| ValidationError::Yaml {
                    path: path.to_owned(),
                    source,
                });
            }
            body.push_str(line);
            body.push('\n');
        }
        Err(ValidationError::Frontmatter(path.to_owned()))
    });
    report.record(result)
}

pub(super) fn entries(path: &Path) -> Result<Vec<PathBuf>, ValidationError> {
    let entries = fs::read_dir(path).map_err(|source| ValidationError::Io {
        path: path.to_owned(),
        source,
    })?;
    let mut paths = entries
        .map(|entry| entry.map(|value| value.path()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|source| ValidationError::Io {
            path: path.to_owned(),
            source,
        })?;
    paths.sort();
    Ok(paths)
}

pub(super) fn native_command(command: &str) -> bool {
    matches!(
        command,
        "${ZCODE_PLUGIN_ROOT}/bin/oh-my-zcode" | "${ZCODE_PLUGIN_ROOT}/bin/oh-my-zcode.exe"
    )
}

pub(super) fn reference(root: &Path, target: &str, report: &mut ValidationReport, packaged: bool) {
    let Some(relative) = target.strip_prefix("${ZCODE_PLUGIN_ROOT}/") else {
        if target.contains("PLUGIN_ROOT") {
            report
                .errors
                .push(format!("invalid plugin reference: {target}"));
        }
        return;
    };
    let path = Path::new(relative);
    if relative.contains('\\')
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        report
            .errors
            .push(format!("plugin reference escapes its root: {target}"));
        return;
    }
    let resolved = root.join(path);
    if resolved.is_file() {
        check_containment(root, &resolved, report);
    } else if relative == "bin/oh-my-zcode" || relative == "bin/oh-my-zcode.exe" {
        report.check(
            !packaged,
            format!(
                "native executable: {relative}{}",
                if packaged {
                    " missing"
                } else {
                    " built during packaging"
                }
            ),
        );
    } else if relative.starts_with("vendor/codegraph/node_modules/") {
        report
            .warnings
            .push("Codegraph is not bootstrapped; from the plugin directory run npm --prefix vendor/codegraph ci --omit=dev --no-audit --no-fund".to_owned());
    } else {
        report
            .errors
            .push(format!("plugin target missing: {relative}"));
    }
}

pub(super) fn required_file(root: &Path, relative: &str, report: &mut ValidationReport) {
    let resolved = root.join(relative);
    if resolved.is_file() {
        check_containment(root, &resolved, report);
    } else {
        report
            .errors
            .push(format!("universal runtime payload missing: {relative}"));
    }
}

fn check_containment(root: &Path, target: &Path, report: &mut ValidationReport) {
    let result = fs::canonicalize(root)
        .and_then(|root| fs::canonicalize(target).map(|target| target.starts_with(root)))
        .map_err(|source| ValidationError::Io {
            path: target.to_owned(),
            source,
        });
    if let Some(contained) = report.record(result) {
        report.check(
            contained,
            format!("{}: target must stay inside plugin root", target.display()),
        );
    }
}

pub(super) fn check_encoding(root: &Path, report: &mut ValidationReport) {
    let mut directories = vec![root.to_owned()];
    while let Some(directory) = directories.pop() {
        let Some(paths) = report.record(entries(&directory)) else {
            continue;
        };
        for path in paths {
            check_encoding_entry(&path, &mut directories, report);
        }
    }
}

fn check_encoding_entry(
    path: &Path,
    directories: &mut Vec<PathBuf>,
    report: &mut ValidationReport,
) {
    if path.file_name().is_some_and(|name| {
        ["bin", "node_modules", ".oh-my-zcode", ".git"]
            .iter()
            .any(|skip| name == *skip)
    }) {
        return;
    }
    let result = fs::symlink_metadata(path).map_err(|source| ValidationError::Io {
        path: path.to_owned(),
        source,
    });
    let Some(metadata) = report.record(result) else {
        return;
    };
    if metadata.is_symlink() {
        report.errors.push(format!(
            "{}: package content must not be a symlink",
            path.display()
        ));
    } else if metadata.is_dir() {
        directories.push(path.to_owned());
    } else if metadata.is_file() {
        let result = text(path, report);
        report.record(result);
    }
}
