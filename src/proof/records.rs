use super::{
    ExecutionResult, ProofContext, ProofError,
    journal::{Attempt, Completion, Event, Journal, Outcome},
    policy::Policy,
    snapshot,
};
use crate::workspace::canonical_path;
use std::{collections::BTreeSet, path::Path};

pub fn start(context: &ProofContext) -> Result<(), ProofError> {
    let mut journal = Journal::open(&context.root, &context.session_id)?;
    let event = match prepare(context, &journal.events) {
        Ok(Some(attempt)) => Event::Start { attempt },
        Ok(None) => return Ok(()),
        Err(error) => Event::StartFailed {
            command: context.command.clone(),
            reason: error.to_string(),
        },
    };
    journal.append(event)
}

fn prepare(context: &ProofContext, prior: &[Event]) -> Result<Option<Attempt>, ProofError> {
    let policy = Policy::read(&context.root)?;
    let cwd = canonical_path(&context.cwd)?;
    let Some(contract) = policy.contract(&context.command, &context.root, &cwd) else {
        return Ok(None);
    };
    if context.tool_use_id.trim().is_empty() {
        return Err(ProofError::Journal("Missing tool-use ID".into()));
    }
    if prior.iter().any(|event| matches!(event, Event::Start { attempt } if attempt.tool_use_id == context.tool_use_id)) {
        return Err(ProofError::Journal("Tool-use ID already belongs to an earlier attempt".into()));
    }
    let artifact = snapshot::capture(&context.root, &policy, &contract.targets)?;
    Ok(Some(Attempt {
        id: uuid::Uuid::new_v4().to_string(),
        tool_use_id: context.tool_use_id.clone(),
        cwd,
        contract,
        artifact,
    }))
}

pub fn finish(context: &ProofContext, result: &ExecutionResult) -> Result<(), ProofError> {
    complete(context, |attempt| match verify(context, attempt, result) {
        Ok(exit_code) => Outcome::Verified {
            exit_code,
            artifact: attempt.artifact.clone(),
        },
        Err(reason) => Outcome::Rejected { reason },
    })
}

pub fn fail(context: &ProofContext, reason: &str) -> Result<(), ProofError> {
    complete(context, |_| Outcome::Rejected {
        reason: reason.into(),
    })
}

fn complete(
    context: &ProofContext,
    outcome: impl FnOnce(&Attempt) -> Outcome,
) -> Result<(), ProofError> {
    let mut journal = Journal::open(&context.root, &context.session_id)?;
    let attempt = matched(context, journal.current())?;
    let completion = if let Some(attempt) = attempt {
        Completion {
            attempt_id: Some(attempt.id.clone()),
            command: context.command.clone(),
            contract: Some(attempt.contract.clone()),
            outcome: outcome(&attempt),
        }
    } else {
        let policy = Policy::read(&context.root)?;
        let Some(contract) = policy.contract(&context.command, &context.root, &context.cwd) else {
            return Ok(());
        };
        Completion {
            attempt_id: None,
            command: context.command.clone(),
            contract: Some(contract),
            outcome: Outcome::Rejected {
                reason: "Missing or ambiguous pre-execution snapshot".into(),
            },
        }
    };
    journal.append(Event::Completed { completion })
}

fn matched(context: &ProofContext, events: &[Event]) -> Result<Option<Attempt>, ProofError> {
    let used: BTreeSet<&str> = events
        .iter()
        .filter_map(|event| match event {
            Event::Completed { completion } => completion.attempt_id.as_deref(),
            Event::Start { .. } | Event::StartFailed { .. } | Event::TurnEnd => None,
        })
        .collect();
    let cwd = canonical_path(&context.cwd)?;
    let mut candidates = events.iter().filter_map(|event| match event {
        Event::Start { attempt }
            if matches_context(attempt, context, &cwd) && !used.contains(attempt.id.as_str()) =>
        {
            Some(attempt)
        }
        Event::Start { .. }
        | Event::StartFailed { .. }
        | Event::Completed { .. }
        | Event::TurnEnd => None,
    });
    let first = candidates.next();
    Ok(if candidates.next().is_none() {
        first.cloned()
    } else {
        None
    })
}

fn matches_context(attempt: &Attempt, context: &ProofContext, cwd: &Path) -> bool {
    attempt.contract.command == context.command
        && attempt.cwd == cwd
        && attempt.tool_use_id == context.tool_use_id
}

fn verify(
    context: &ProofContext,
    attempt: &Attempt,
    result: &ExecutionResult,
) -> Result<i64, String> {
    let code = result.check(&attempt.contract)?;
    let policy = Policy::read(&context.root).map_err(|error| error.to_string())?;
    let after = snapshot::capture(&context.root, &policy, &attempt.contract.targets)
        .map_err(|error| error.to_string())?;
    if attempt.artifact != after {
        return Err("Artifacts changed during execution".into());
    }
    Ok(code)
}

pub fn close_turn(root: &Path, session: &str) -> Result<(), ProofError> {
    Journal::open(root, session)?.append(Event::TurnEnd)
}
