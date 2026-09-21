use super::{ProofError, commands};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, fs, path::Path};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Claim {
    Pass,
    Findings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum ClaimScope {
    Pass,
    Findings,
    Both,
}

impl ClaimScope {
    pub(super) const fn includes(self, claim: Claim) -> bool {
        match self {
            Self::Pass => matches!(claim, Claim::Pass),
            Self::Findings => matches!(claim, Claim::Findings),
            Self::Both => true,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Contract {
    pub command: String,
    pub claim: ClaimScope,
    pub expected_exit: u8,
    pub output_includes: Vec<String>,
    pub targets: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Check {
    command: String,
    claim: Claim,
    expected_exit: u8,
    output_includes: Vec<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct PolicyDocument {
    #[serde(default)]
    artifacts: Vec<String>,
    #[serde(default)]
    checks: Vec<Check>,
}

#[derive(Debug, Default)]
pub(super) struct Policy {
    pub artifacts: Vec<String>,
    pub checks: Vec<Contract>,
    pub source_sha256: Option<String>,
}

pub(super) fn digest(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

impl Policy {
    pub(super) fn read(root: &Path) -> Result<Self, ProofError> {
        let raw = match fs::read(root.join(".oh-my-zcode/proof-policy.json")) {
            Ok(raw) => raw,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Self::default());
            }
            Err(error) => return Err(error.into()),
        };
        let document: PolicyDocument = serde_json::from_slice(&raw)?;
        if document.artifacts.iter().any(|name| name.trim().is_empty()) {
            return Err(ProofError::Policy("Artifact paths cannot be empty".into()));
        }
        let mut seen = BTreeSet::new();
        let mut checks = Vec::with_capacity(document.checks.len());
        for check in document.checks {
            if !seen.insert(check.command.clone()) {
                return Err(ProofError::Policy("Check commands must be unique".into()));
            }
            checks.push(check.into_contract()?);
        }
        Ok(Self {
            artifacts: document.artifacts,
            checks,
            source_sha256: Some(digest(&raw)),
        })
    }

    pub(super) fn contract(&self, command: &str, root: &Path, cwd: &Path) -> Option<Contract> {
        if command.len() > 16_384 {
            return None;
        }
        self.checks
            .iter()
            .find(|check| check.command == command)
            .cloned()
            .or_else(|| commands::automatic(command, root, cwd))
    }
}

impl Check {
    fn into_contract(self) -> Result<Contract, ProofError> {
        let valid_command = !self.command.is_empty() && self.command == self.command.trim();
        let valid_output = !self.output_includes.is_empty()
            && self
                .output_includes
                .iter()
                .all(|value| !value.trim().is_empty());
        let valid_exit = self.claim == Claim::Findings || self.expected_exit == 0;
        if !valid_command || !valid_output || !valid_exit {
            return Err(ProofError::Policy(
                "Checks require an exact command, expected status and output assertions".into(),
            ));
        }
        Ok(Contract {
            command: self.command,
            claim: match self.claim {
                Claim::Pass => ClaimScope::Pass,
                Claim::Findings => ClaimScope::Findings,
            },
            expected_exit: self.expected_exit,
            output_includes: self.output_includes,
            targets: Vec::new(),
        })
    }
}
