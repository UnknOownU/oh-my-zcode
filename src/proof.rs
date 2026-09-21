//! Execution receipts bind a result to the precise workspace revision tested.
mod commands;
mod evaluation;
mod journal;
mod policy;
mod records;
mod result;
mod snapshot;
mod snapshot_entries;
mod snapshot_selection;

pub use evaluation::{Evaluation, ProofSummary, evaluate};
pub use policy::Claim;
pub use records::{close_turn, fail, finish, start};
pub use result::ExecutionResult;
pub use snapshot::Fingerprint;
use std::path::PathBuf;

/// Identity supplied by one host tool event.
#[derive(Debug, Clone)]
pub struct ProofContext {
    pub root: PathBuf,
    pub session_id: String,
    pub tool_use_id: String,
    pub command: String,
    pub cwd: PathBuf,
}

/// Errors prevent a receipt from authorizing a successful claim.
#[derive(Debug, thiserror::Error)]
pub enum ProofError {
    #[error("Proof I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("Invalid proof data: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Invalid proof policy: {0}")]
    Policy(String),
    #[error("Invalid receipt journal: {0}")]
    Journal(String),
    #[error("Artifact snapshot failed: {0}")]
    Snapshot(String),
}
