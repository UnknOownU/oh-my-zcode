mod audit;
mod events;
mod security;
mod shell;
mod shell_lexer;
mod shell_wrappers;
mod source_identity;
mod sources;
mod stop;
mod targets;
mod update;

use serde::Serialize;
pub use source_identity::IdentityError;

#[derive(Debug, thiserror::Error)]
pub enum HookError {
    #[error("Invalid hook input: {0}")]
    Input(#[from] serde_json::Error),
    #[error("Hook I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("Proof rejected: {0}")]
    Proof(#[from] crate::proof::ProofError),
    #[error("Scope unavailable: {0}")]
    Scope(#[from] crate::scope::ScopeError),
    #[error("Hook pattern invalid: {0}")]
    Pattern(#[from] regex::Error),
    #[error(transparent)]
    Source(#[from] IdentityError),
    #[error("Unknown hook event: {0}")]
    Event(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Block {
    decision: &'static str,
    reason: String,
}

impl Block {
    fn new(reason: impl Into<String>) -> Self {
        Self {
            decision: "block",
            reason: reason.into(),
        }
    }
}

fn output(value: &impl Serialize) -> Result<Option<String>, HookError> {
    Ok(Some(serde_json::to_string(value)?))
}

pub fn run(event: &str, input: &[u8]) -> Result<Option<String>, HookError> {
    match event {
        "session_start" => events::session_start(input),
        "proof_start" => events::proof_start(input),
        "evidence" => events::evidence(input),
        "evidence_failure" => events::evidence_failure(input),
        "sources" => sources::record(input),
        "scope" => security::scope(input),
        "dispatch" => security::dispatch(input),
        "stop" => stop::run(input),
        _ => Err(HookError::Event(event.to_owned())),
    }
}
