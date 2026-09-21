use super::{
    ProofError,
    policy::digest,
    snapshot::{Snapshot, path_name},
    snapshot_selection,
};
use crate::workspace::canonical_path;
use serde::Serialize;
use std::{
    collections::BTreeSet,
    fs::{self, Metadata},
    io::Read,
    path::{Path, PathBuf},
};

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(super) enum Identity {
    Missing,
    Directory,
    Link { target: PathBuf },
    File { sha256: String, attributes: u32 },
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub(super) struct Revision {
    size: u64,
    modified: String,
    changed: String,
    file_id: String,
}

#[derive(Debug, Serialize)]
pub(super) struct Entry {
    pub identity: Identity,
    revision: Option<Revision>,
}

#[derive(Default)]
pub(super) struct Traversal {
    pub explicit: bool,
    pub ancestors: BTreeSet<PathBuf>,
}

struct Artifact<'a> {
    path: &'a Path,
    name: &'a str,
    metadata: &'a Metadata,
    actual: &'a Path,
}

impl Snapshot {
    pub(super) fn visit(
        &mut self,
        path: &Path,
        name: &str,
        traversal: &Traversal,
    ) -> Result<(), ProofError> {
        self.guard()?;
        if self.entries.contains_key(name) {
            return Ok(());
        }
        let Some(metadata) = source_metadata(path, traversal.explicit)? else {
            self.entries.insert(
                name.into(),
                Entry {
                    identity: Identity::Missing,
                    revision: None,
                },
            );
            return Ok(());
        };
        let actual = canonical_path(path)?;
        let relative = actual
            .strip_prefix(&self.root)
            .map_err(|_| ProofError::Snapshot(format!("Artifact escapes workspace: {name}")))?;
        self.covered.insert(path_name(relative)?);
        self.visit_kind(
            &Artifact {
                path,
                name,
                metadata: &metadata,
                actual: &actual,
            },
            traversal,
        )
    }

    fn visit_kind(
        &mut self,
        artifact: &Artifact<'_>,
        traversal: &Traversal,
    ) -> Result<(), ProofError> {
        let Artifact {
            path,
            name,
            metadata,
            actual,
        } = *artifact;
        if metadata.is_symlink() {
            if traversal.ancestors.contains(actual) {
                return Err(ProofError::Snapshot(format!(
                    "Artifact symlink cycles: {name}"
                )));
            }
            self.entries.insert(
                format!("{name}#link"),
                Entry {
                    identity: Identity::Link {
                        target: fs::read_link(path)?,
                    },
                    revision: Some(revision(path, metadata)?),
                },
            );
            let mut ancestors = traversal.ancestors.clone();
            ancestors.insert(actual.to_path_buf());
            return self.visit(
                actual,
                name,
                &Traversal {
                    explicit: traversal.explicit,
                    ancestors,
                },
            );
        }
        if metadata.is_dir() {
            return self.directory(path, name, traversal);
        }
        if metadata.is_file() {
            return self.file(path, name, metadata);
        }
        Err(ProofError::Snapshot(format!(
            "Unsupported artifact type: {name}"
        )))
    }

    fn directory(
        &mut self,
        path: &Path,
        name: &str,
        traversal: &Traversal,
    ) -> Result<(), ProofError> {
        self.entries.insert(
            format!("{name}/"),
            Entry {
                identity: Identity::Directory,
                revision: None,
            },
        );
        let mut children = fs::read_dir(path)?.collect::<Result<Vec<_>, _>>()?;
        children.sort_by_key(std::fs::DirEntry::file_name);
        for child in children {
            let filename = child.file_name();
            if snapshot_selection::runtime(&filename)
                || (!traversal.explicit && snapshot_selection::generated(&filename))
            {
                continue;
            }
            self.visit(
                &child.path(),
                &format!("{name}/{}", path_name(Path::new(&filename))?),
                traversal,
            )?;
        }
        Ok(())
    }

    fn file(&mut self, path: &Path, name: &str, metadata: &Metadata) -> Result<(), ProofError> {
        self.bytes += metadata.len();
        self.guard()?;
        let before = revision(path, metadata)?;
        let mut content = Vec::new();
        fs::File::open(path)?
            .take(metadata.len() + 1)
            .read_to_end(&mut content)?;
        let after = fs::symlink_metadata(path)?;
        if before != revision(path, &after)?
            || u64::try_from(content.len()).ok() != Some(metadata.len())
        {
            return Err(ProofError::Snapshot(format!(
                "Artifact changed while hashing: {name}"
            )));
        }
        self.entries.insert(
            name.into(),
            Entry {
                identity: Identity::File {
                    sha256: digest(&content),
                    attributes: attributes(metadata),
                },
                revision: Some(before),
            },
        );
        Ok(())
    }
}

fn source_metadata(path: &Path, explicit: bool) -> Result<Option<Metadata>, ProofError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(Some(metadata)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound && !explicit => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn revision(path: &Path, metadata: &Metadata) -> Result<Revision, ProofError> {
    #[cfg(windows)]
    let changed = crate::windows_metadata::change_time(path)?.to_string();
    #[cfg(unix)]
    let changed = changed(metadata);
    Ok(Revision {
        size: metadata.len(),
        modified: modified(metadata),
        changed,
        file_id: file_identity(path)?,
    })
}

fn file_identity(path: &Path) -> Result<String, ProofError> {
    Ok(match file_id::get_file_id(path)? {
        file_id::FileId::Inode {
            device_id,
            inode_number,
        } => format!("inode:{device_id}:{inode_number}"),
        file_id::FileId::LowRes {
            volume_serial_number,
            file_index,
        } => format!("lowres:{volume_serial_number}:{file_index}"),
        file_id::FileId::HighRes {
            volume_serial_number,
            file_id,
        } => format!("highres:{volume_serial_number}:{file_id}"),
    })
}

#[cfg(windows)]
fn attributes(metadata: &Metadata) -> u32 {
    use std::os::windows::fs::MetadataExt;
    metadata.file_attributes()
}

#[cfg(unix)]
fn attributes(metadata: &Metadata) -> u32 {
    use std::os::unix::fs::MetadataExt;
    metadata.mode()
}

#[cfg(windows)]
fn modified(metadata: &Metadata) -> String {
    use std::os::windows::fs::MetadataExt;
    metadata.last_write_time().to_string()
}

#[cfg(unix)]
fn modified(metadata: &Metadata) -> String {
    use std::os::unix::fs::MetadataExt;
    format!("{}:{}", metadata.mtime(), metadata.mtime_nsec())
}

#[cfg(unix)]
fn changed(metadata: &Metadata) -> String {
    use std::os::unix::fs::MetadataExt;
    format!("{}:{}", metadata.ctime(), metadata.ctime_nsec())
}
