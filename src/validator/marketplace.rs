use std::{
    fs,
    path::{Component, Path},
};

use serde::Deserialize;

use super::{ValidationReport, files};

#[derive(Debug, Deserialize)]
struct Marketplace {
    plugins: Vec<Entry>,
}

#[derive(Debug, Deserialize)]
struct Entry {
    name: String,
    version: String,
    source: Source,
    #[serde(rename = "_artifact")]
    artifact: Option<Artifact>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum Source {
    Local(String),
    Archive(Archive),
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Archive {
    #[serde(rename = "source")]
    _source: UrlSource,
    #[serde(rename = "type")]
    _kind: ZipType,
    url: String,
    sha256: String,
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum UrlSource {
    Url,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ZipType {
    Zip,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Artifact {
    path: String,
    sha256: String,
    size: u64,
}

pub(super) fn check(root: &Path, name: &str, version: &str, report: &mut ValidationReport) {
    let Some(parent) = root.parent() else { return };
    let path = parent.join("marketplace.json");
    if !path.is_file() {
        return;
    }
    let Some(marketplace) = files::json::<Marketplace>(&path, report) else {
        return;
    };
    let entries = marketplace
        .plugins
        .iter()
        .filter(|entry| entry.name == name)
        .collect::<Vec<_>>();
    report.check(
        entries.len() == 1,
        format!("marketplace must declare exactly one '{name}' entry"),
    );
    for entry in entries {
        report.check(
            entry.version == version,
            format!(
                "marketplace version {} must match plugin {version}",
                entry.version
            ),
        );
        check_source(root, entry, report);
    }
    for entry in &marketplace.plugins {
        let points_to_plugin = match &entry.source {
            Source::Local(source) => same_directory(root, &parent.join(source)),
            Source::Archive(_) => false,
        };
        if points_to_plugin {
            report.check(
                entry.name == name,
                "marketplace source identity must match plugin name",
            );
        }
    }
}

fn same_directory(left: &Path, right: &Path) -> bool {
    match (fs::canonicalize(left), fs::canonicalize(right)) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

fn check_source(root: &Path, entry: &Entry, report: &mut ValidationReport) {
    match &entry.source {
        Source::Local(source) => {
            let matching_root = root
                .parent()
                .is_some_and(|parent| same_directory(root, &parent.join(source)));
            report.check(
                matching_root,
                "marketplace local source identity must resolve to the validated plugin root",
            );
            report.check(
                entry.artifact.is_none(),
                "marketplace artifact metadata requires an archive source",
            );
        }
        Source::Archive(archive) => {
            let valid_url = url::Url::parse(&archive.url).is_ok_and(|url| {
                matches!(url.scheme(), "http" | "https") && url.host_str().is_some()
            });
            report.check(valid_url, "marketplace archive requires an HTTP(S) URL");
            report.check(
                valid_digest(&archive.sha256),
                "marketplace archive requires a lowercase SHA-256 digest",
            );
            report.check(
                archive.path == entry.name,
                "marketplace archive path must match plugin identity",
            );
            if let Some(artifact) = &entry.artifact {
                check_artifact(artifact, archive, report);
            }
        }
    }
}

fn check_artifact(artifact: &Artifact, archive: &Archive, report: &mut ValidationReport) {
    report.check(
        artifact.sha256 == archive.sha256,
        "marketplace artifact digest must match archive source",
    );
    report.check(
        artifact.size > 0,
        "marketplace artifact size must be positive",
    );
    let contained = !artifact.path.is_empty()
        && !artifact.path.contains('\\')
        && Path::new(&artifact.path)
            .components()
            .all(|part| matches!(part, Component::Normal(_)));
    report.check(
        contained,
        "marketplace artifact path must stay inside its distribution directory",
    );
}

fn valid_digest(digest: &str) -> bool {
    digest.len() == 64
        && digest
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}
