//! Canonical workspace boundaries shared by hooks and the scope server.
use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const MARKERS: [&str; 4] = ["package.json", "pyproject.toml", "go.mod", "Cargo.toml"];

/// Resolve aliases and Windows short names before comparing workspace paths.
pub fn canonical_path(path: &Path) -> io::Result<PathBuf> {
    fs::canonicalize(path)
}

#[derive(Debug)]
struct Boundary {
    path: PathBuf,
    state: bool,
    git: bool,
    project: bool,
}

impl Boundary {
    fn read(path: &Path) -> io::Result<Self> {
        let state = path.join(".oh-my-zcode").try_exists()?;
        let git = path.join(".git").try_exists()?;
        let mut project = git;
        for marker in MARKERS {
            project |= path.join(marker).try_exists()?;
        }
        Ok(Self {
            path: path.to_path_buf(),
            state,
            git,
            project,
        })
    }
}

fn home_boundary() -> Option<PathBuf> {
    let variable = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    env::var_os(variable).and_then(|path| canonical_path(Path::new(&path)).ok())
}

fn boundaries(start: &Path) -> io::Result<Vec<Boundary>> {
    let directory = canonical_path(start)?;
    let home = home_boundary();
    directory
        .ancestors()
        .take(12)
        .take_while(|path| home.as_deref() != Some(*path))
        .map(Boundary::read)
        .collect()
}

/// Find the nearest plugin state, otherwise the nearest project boundary.
/// A directory outside a marked project has no readable scope root.
pub fn resolve_read_root(start: &Path) -> io::Result<Option<PathBuf>> {
    let candidates = boundaries(start)?;
    let selected = candidates
        .iter()
        .find(|entry| entry.state)
        .or_else(|| candidates.iter().find(|entry| entry.project));
    Ok(selected.map(|entry| entry.path.clone()))
}

/// Anchor first evidence at the repository edge so nested packages cannot shadow it.
pub fn resolve_evidence_root(start: &Path) -> io::Result<PathBuf> {
    let candidates = boundaries(start)?;
    let selected = candidates
        .iter()
        .find(|entry| entry.state)
        .or_else(|| candidates.iter().rfind(|entry| entry.git))
        .or_else(|| candidates.iter().rfind(|entry| entry.project));
    match selected {
        Some(entry) => Ok(entry.path.clone()),
        None => canonical_path(start),
    }
}

/// Create a portable log filename; records must also verify the full session ID.
pub fn session_key(session: &str) -> String {
    session
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '_' | '.' | '-') {
                character
            } else {
                '_'
            }
        })
        .collect()
}
