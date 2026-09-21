use super::{
    Block, HookError, audit,
    events::{CommandInput, Context},
    output,
    shell::{self, Invocation},
    targets,
};
use crate::scope::{self, ValidatedScope};
use regex::Regex;
use serde::Deserialize;
use std::time::SystemTime;

const POINTER: &str =
    "Authorization is armed by running /ohmy-redteam with your target; it expires in 60 minutes.";

#[derive(Debug, Deserialize)]
struct CommandEvent {
    #[serde(flatten)]
    context: Context,
    #[serde(default)]
    tool_input: CommandInput,
}

#[derive(Debug, Deserialize, Default)]
struct DispatchInput {
    prompt: Option<String>,
    #[serde(default)]
    description: String,
}

#[derive(Debug, Deserialize)]
struct DispatchEvent {
    #[serde(flatten)]
    context: Context,
    #[serde(default)]
    tool_input: DispatchInput,
}

fn loaded(context: &Context) -> Result<Option<ValidatedScope>, HookError> {
    Ok(scope::read_scope(&context.read_root()?, SystemTime::now())?)
}

fn scope_block(event: &CommandEvent, reason: &str) -> Result<Option<String>, HookError> {
    audit::record(
        &event.context,
        audit::Entry::ScopeBlock {
            reason: reason.to_owned(),
            command: audit::truncate(&event.tool_input.command, 200),
        },
    );
    output(&Block::new(format!(
        "Scope gate: {reason}
{POINTER}"
    )))
}

pub(super) fn scope(input: &[u8]) -> Result<Option<String>, HookError> {
    let event: CommandEvent = serde_json::from_slice(input)?;
    if event.tool_input.command.is_empty() {
        return Ok(None);
    }
    let commands = match shell::analyze(&event.tool_input.command) {
        Ok(commands) => commands,
        Err(reason) => {
            return scope_block(
                &event,
                &format!("shell command cannot be inspected: {reason}"),
            );
        }
    };
    authorize_command(&event, &commands)
}

fn authorize_command(
    event: &CommandEvent,
    commands: &[Invocation],
) -> Result<Option<String>, HookError> {
    let attack = commands.iter().any(Invocation::is_attack);
    if event.context.session_id.is_empty() {
        return if attack {
            scope_block(event, "attack command without a session id")
        } else {
            Ok(None)
        };
    }
    match loaded(&event.context) {
        Ok(Some(scope)) => confined_command(event, &scope, commands),
        Ok(None) if attack => scope_block(
            event,
            "no valid active_scope.json: scope absent, invalid or expired",
        ),
        Ok(None) => Ok(None),
        Err(error) => scope_block(event, &format!("scope cannot be read: {error}")),
    }
}

fn confined_command(
    event: &CommandEvent,
    scope: &ValidatedScope,
    commands: &[Invocation],
) -> Result<Option<String>, HookError> {
    if let Err(error) = targets::confine(scope, commands) {
        return scope_block(event, &error.to_string());
    }
    let command = audit::truncate(&event.tool_input.command, 200);
    let entry = if commands.iter().any(Invocation::is_attack) {
        audit::Entry::ScopeAttackPass { command }
    } else {
        audit::Entry::ScopePass { command }
    };
    audit::record(&event.context, entry);
    Ok(None)
}

fn dispatch_block(
    event: &DispatchEvent,
    reason: &str,
    prompt: &str,
) -> Result<Option<String>, HookError> {
    audit::record(
        &event.context,
        audit::Entry::DispatchBlock {
            reason: reason.to_owned(),
            prompt: audit::truncate(prompt, 200),
        },
    );
    output(&Block::new(format!(
        "Dispatch gate: {reason}
{POINTER}"
    )))
}

pub(super) fn dispatch(input: &[u8]) -> Result<Option<String>, HookError> {
    let event: DispatchEvent = serde_json::from_slice(input)?;
    let prompt = event
        .tool_input
        .prompt
        .as_deref()
        .unwrap_or(&event.tool_input.description);
    if !Regex::new(r"(?i)\[ohmy-redteam[^\]]*\]")?.is_match(prompt) {
        return Ok(None);
    }
    if event.context.session_id.is_empty() {
        return dispatch_block(&event, "tagged dispatch without a session id", prompt);
    }
    let scope = match loaded(&event.context) {
        Ok(Some(scope)) => scope,
        Ok(None) => {
            return dispatch_block(
                &event,
                "no valid active_scope.json: scope absent, invalid or expired",
                prompt,
            );
        }
        Err(error) => {
            return dispatch_block(&event, &format!("scope cannot be read: {error}"), prompt);
        }
    };
    if let Err(error) = targets::dispatch(&scope, prompt) {
        return dispatch_block(&event, &error.to_string(), prompt);
    }
    audit::record(
        &event.context,
        audit::Entry::DispatchPass {
            prompt: audit::truncate(prompt, 200),
        },
    );
    Ok(None)
}
