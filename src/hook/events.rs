use super::{HookError, audit, output, update};
use crate::{proof, workspace};
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use std::path::PathBuf;

const DOCTRINE: &str = "Evidence-gated pipeline active. Three sealed roles: the Builder writes, the Reviewer judges in a fresh context, the Verifier proves by executing. Whoever produces an artifact never signs its own verdict. Before implementation, have plan-critic check the plan against the codebase. Before signing, run the deciding command in this session after the last edit. PASS requires the expected exit/output and unchanged source/artifact fingerprints before execution, after execution and at verdict. See docs/proof.md. End a verdict with VERDICT: PASS or VERDICT: FAIL alone on its final line. Set max_tokens to 131072 for roles returning a verdict. Research requires opening and reading every cited source; only then sign SOURCES: VERIFIED. Reproduce every security finding before signing FINDINGS: VERIFIED. Retries do not authorize unsupported claims. You are not multimodal: when an image reaches you and you cannot see it, never dead-end — copy it under .oh-my-zcode/images/<session8>/ (the attachment path, or the newest file in this session's image-cache subfolder), then dispatch vision with the path and the question, and answer from its description.";

#[derive(Debug, Default, Deserialize)]
pub(super) struct Context {
    #[serde(default)]
    pub session_id: String,
    pub cwd: Option<PathBuf>,
}

impl Context {
    pub(super) fn cwd(&self) -> Result<PathBuf, HookError> {
        Ok(match &self.cwd {
            Some(path) => workspace::canonical_path(path)?,
            None => std::env::current_dir()?,
        })
    }

    pub(super) fn evidence_root(&self) -> Result<PathBuf, HookError> {
        Ok(workspace::resolve_evidence_root(&self.cwd()?)?)
    }

    pub(super) fn read_root(&self) -> Result<PathBuf, HookError> {
        let cwd = self.cwd()?;
        Ok(workspace::resolve_read_root(&cwd)?.unwrap_or(cwd))
    }
}

#[derive(Debug, Default, Deserialize)]
pub(super) struct CommandInput {
    #[serde(default)]
    pub command: String,
}

#[derive(Debug, Deserialize)]
struct ToolEvent {
    #[serde(flatten)]
    context: Context,
    #[serde(default)]
    tool_name: String,
    #[serde(default)]
    tool_use_id: String,
    #[serde(default)]
    tool_input: CommandInput,
    tool_response: Option<Box<RawValue>>,
    error: Option<String>,
}

impl ToolEvent {
    fn proof_context(&self) -> Result<Option<proof::ProofContext>, HookError> {
        if self.context.session_id.is_empty() || self.tool_name != "Bash" {
            return Ok(None);
        }
        Ok(Some(proof::ProofContext {
            root: self.context.evidence_root()?,
            session_id: self.context.session_id.clone(),
            tool_use_id: self.tool_use_id.clone(),
            command: self.tool_input.command.clone(),
            cwd: self.context.cwd()?,
        }))
    }
}

#[derive(Debug, Deserialize)]
struct SessionEvent {
    #[serde(flatten)]
    context: Context,
    source: Option<String>,
}

#[derive(Debug, Serialize)]
struct SessionOutput {
    #[serde(rename = "hookSpecificOutput")]
    hook_specific_output: SessionContext,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionContext {
    hook_event_name: &'static str,
    additional_context: String,
}

pub(super) fn session_start(input: &[u8]) -> Result<Option<String>, HookError> {
    let event: SessionEvent = serde_json::from_slice(input)?;
    audit::record(
        &event.context,
        audit::Entry::SessionStart {
            source: event.source,
        },
    );
    let mut additional_context = DOCTRINE.to_string();
    if let Some(notice) = update::notice() {
        additional_context.push(' ');
        additional_context.push_str(&notice);
    }
    output(&SessionOutput {
        hook_specific_output: SessionContext {
            hook_event_name: "SessionStart",
            additional_context,
        },
    })
}

pub(super) fn proof_start(input: &[u8]) -> Result<Option<String>, HookError> {
    let event: ToolEvent = serde_json::from_slice(input)?;
    if let Some(context) = event.proof_context()? {
        proof::start(&context)?;
    }
    Ok(None)
}

pub(super) fn evidence(input: &[u8]) -> Result<Option<String>, HookError> {
    let event: ToolEvent = serde_json::from_slice(input)?;
    if let Some(context) = event.proof_context()? {
        let result = event.tool_response.as_deref().map_or_else(
            proof::ExecutionResult::missing,
            proof::ExecutionResult::from_raw,
        );
        proof::finish(&context, &result)?;
    }
    audit::record(
        &event.context,
        audit::Entry::Evidence {
            tool: event.tool_name,
            command: audit::truncate(&event.tool_input.command, 500),
        },
    );
    Ok(None)
}

pub(super) fn evidence_failure(input: &[u8]) -> Result<Option<String>, HookError> {
    let event: ToolEvent = serde_json::from_slice(input)?;
    if let Some(context) = event.proof_context()? {
        proof::fail(
            &context,
            event.error.as_deref().unwrap_or("Tool execution failed"),
        )?;
    }
    audit::record(
        &event.context,
        audit::Entry::EvidenceFailure {
            command: audit::truncate(&event.tool_input.command, 500),
        },
    );
    Ok(None)
}
