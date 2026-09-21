use super::{
    ProofError,
    policy::{Policy, digest},
    snapshot_entries::{Entry, Traversal},
    snapshot_selection,
};
use crate::workspace::canonical_path;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Component, Path, PathBuf},
    time::Instant,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum FingerprintSchema {
    #[serde(rename = "oh-my-zcode/fingerprint-v1")]
    V1,
}

/// Stable identity and revision digests use explicit schema and canonical root.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Fingerprint {
    pub fingerprint_schema: FingerprintSchema,
    pub root: PathBuf,
    pub sha256: String,
    pub revision: String,
    pub files: usize,
    pub bytes: u64,
    pub selection: String,
}

pub(super) struct Snapshot {
    pub root: PathBuf,
    pub entries: BTreeMap<String, Entry>,
    pub covered: BTreeSet<String>,
    pub bytes: u64,
    started: Instant,
}

impl Snapshot {
    pub(super) fn guard(&self) -> Result<(), ProofError> {
        if self.started.elapsed().as_millis() > 2500
            || self.entries.len() > 10_000
            || self.bytes > 64 * 1024 * 1024
        {
            return Err(ProofError::Snapshot(
                "Snapshot exceeds 2.5s, 10000 files or 64 MiB".into(),
            ));
        }
        Ok(())
    }

    fn artifacts(&mut self, policy: &Policy) -> Result<(), ProofError> {
        for name in &policy.artifacts {
            let relative = Path::new(name);
            if relative.is_absolute() || relative.components().any(forbidden_component) {
                return Err(ProofError::Snapshot(
                    "Explicit artifacts must stay outside runtime state and inside the workspace"
                        .into(),
                ));
            }
            let path = self.root.join(relative);
            if canonical_path(&path)? == self.root {
                return Err(ProofError::Snapshot(
                    "Artifact must be a workspace file or directory".into(),
                ));
            }
            self.visit(
                &path,
                &format!("@artifact/{}", path_name(relative)?),
                &Traversal {
                    explicit: true,
                    ..Traversal::default()
                },
            )?;
        }
        Ok(())
    }

    fn policy(&mut self, policy: &Policy) -> Result<(), ProofError> {
        let path = self.root.join(".oh-my-zcode/proof-policy.json");
        let hash = match fs::read(&path) {
            Ok(raw) => Some(digest(&raw)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error.into()),
        };
        if hash != policy.source_sha256 {
            return Err(ProofError::Snapshot(
                "Proof policy changed during snapshot".into(),
            ));
        }
        if hash.is_some() {
            self.visit(
                &path,
                "@proof-policy",
                &Traversal {
                    explicit: true,
                    ..Traversal::default()
                },
            )?;
        }
        Ok(())
    }

    fn finish(&self, selection: String) -> Result<Fingerprint, ProofError> {
        let mut identity = Sha256::new();
        let mut revision = Sha256::new();
        identity.update(b"oh-my-zcode/fingerprint-v1\0");
        identity.update(serde_json::to_vec(&(&self.root, &selection))?);
        revision.update(b"oh-my-zcode/revision-v1\0");
        for (name, entry) in &self.entries {
            identity.update(serde_json::to_vec(&(name, &entry.identity))?);
            revision.update(serde_json::to_vec(&(name, entry))?);
        }
        self.guard()?;
        Ok(Fingerprint {
            fingerprint_schema: FingerprintSchema::V1,
            root: self.root.clone(),
            sha256: hex::encode(identity.finalize()),
            revision: hex::encode(revision.finalize()),
            files: self.entries.len(),
            bytes: self.bytes,
            selection,
        })
    }
}

fn forbidden_component(component: Component<'_>) -> bool {
    match component {
        Component::ParentDir | Component::Prefix(_) | Component::RootDir => true,
        Component::Normal(name) => snapshot_selection::runtime(name),
        Component::CurDir => false,
    }
}

pub(super) fn path_name(path: &Path) -> Result<String, ProofError> {
    path.to_str()
        .map(|name| name.replace('\\', "/"))
        .ok_or_else(|| ProofError::Snapshot("Artifact names must be valid UTF-8".into()))
}

pub(super) fn capture(
    root: &Path,
    policy: &Policy,
    targets: &[String],
) -> Result<Fingerprint, ProofError> {
    let mut snapshot = Snapshot {
        root: canonical_path(root)?,
        entries: BTreeMap::new(),
        covered: BTreeSet::new(),
        bytes: 0,
        started: Instant::now(),
    };
    let selection = snapshot_selection::select(&mut snapshot)?;
    snapshot.artifacts(policy)?;
    for target in targets {
        if !snapshot.covered.iter().any(|name| {
            target.is_empty() || name == target || name.starts_with(&format!("{target}/"))
        }) {
            return Err(ProofError::Snapshot(format!(
                "Test target absent from snapshot; declare policy.artifacts: {target}"
            )));
        }
    }
    snapshot.policy(policy)?;
    snapshot.finish(selection)
}
