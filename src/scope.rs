//! Validated invocation scopes shared by hooks and the read-only MCP server.
mod host;
mod target;

use jiff::Timestamp;
use serde::Deserialize;
use std::{
    fs, io,
    path::{Path, PathBuf},
    time::SystemTime,
};
use target::Target;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ScopeError {
    #[error("cannot read scope: {0}")]
    Io(#[from] io::Error),
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ScopeDocument {
    targets: Vec<String>,
    env: Environment,
    granted_at: String,
    expires_at: String,
    source: ScopeSource,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Environment {
    Local,
    Dev,
    Test,
    Staging,
}

impl Environment {
    const fn as_str(&self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Dev => "dev",
            Self::Test => "test",
            Self::Staging => "staging",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ScopeSource {
    Invocation,
}

/// A parsed scope whose environment, targets, source and time window are valid.
#[derive(Debug)]
pub struct ValidatedScope {
    document: ScopeDocument,
    targets: Vec<Target>,
}

impl ValidatedScope {
    #[must_use]
    pub fn targets(&self) -> &[String] {
        &self.document.targets
    }
    #[must_use]
    pub const fn env(&self) -> &str {
        self.document.env.as_str()
    }
    #[must_use]
    pub fn granted_at(&self) -> &str {
        &self.document.granted_at
    }
    #[must_use]
    pub fn expires_at(&self) -> &str {
        &self.document.expires_at
    }
    #[must_use]
    pub const fn source(&self) -> &str {
        match self.document.source {
            ScopeSource::Invocation => "invocation",
        }
    }
    /// Match one hostname or literal IP for an operation with unrestricted ports.
    #[must_use]
    pub fn permits_host(&self, value: &str) -> bool {
        let Some(host) = host::canonical_host(value) else {
            return false;
        };
        self.targets
            .iter()
            .any(|target| target.matches_bare_host(&host))
    }

    /// Match an HTTP(S) URL against the validated host and port targets.
    #[must_use]
    pub fn permits_url(&self, value: &str) -> bool {
        let Ok(url) = url::Url::parse(value) else {
            return false;
        };
        matches!(url.scheme(), "http" | "https")
            && self.targets.iter().any(|target| target.matches(&url))
    }
}

/// Read a current invocation scope. Invalid or expired files are unarmed and untouched.
///
/// # Errors
/// Returns an I/O error when an existing scope cannot be read.
pub fn read_scope(root: &Path, now: SystemTime) -> Result<Option<ValidatedScope>, ScopeError> {
    let bytes = match fs::read(scope_path(root)) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    Ok(parse_scope(&bytes, now))
}

fn parse_scope(bytes: &[u8], now: SystemTime) -> Option<ValidatedScope> {
    let document: ScopeDocument = serde_json::from_slice(bytes).ok()?;
    let now = Timestamp::try_from(now).ok()?;
    let granted: Timestamp = document.granted_at.parse().ok()?;
    let expires: Timestamp = document.expires_at.parse().ok()?;
    if document.targets.is_empty() || granted > now || expires <= now {
        return None;
    }
    let targets = document
        .targets
        .iter()
        .map(|target| Target::parse(target))
        .collect::<Option<Vec<_>>>()?;
    Some(ValidatedScope { document, targets })
}

pub(crate) fn scope_path(root: &Path) -> PathBuf {
    root.join(".oh-my-zcode/security/active_scope.json")
}

pub(crate) fn revoke(root: &Path) -> Result<(), ScopeError> {
    match fs::remove_file(scope_path(root)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}
