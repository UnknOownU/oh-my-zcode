use super::{Block, HookError, audit, events::Context, output, sources};
use crate::proof::{self, Claim};
use regex::Regex;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Event {
    #[serde(flatten)]
    context: Context,
    #[serde(default)]
    last_assistant_message: String,
}

enum Signature {
    Pass,
    Findings,
    Sources,
    None,
}

fn signature(message: &str) -> Result<Signature, HookError> {
    let fence = Regex::new(r"^\s*`{3,}\w*\s*$")?;
    let line = message
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty() && !fence.is_match(line))
        .unwrap_or("");
    let pattern = Regex::new(
        r"(?i)^\s*\**\s*(VERDICT\s*:?\s*PASS|SOURCES\s*:?\s*VERIFIED|FINDINGS\s*:?\s*VERIFIED)\s*\**\s*[.!]?\s*$",
    )?;
    let Some(found) = pattern.captures(line).and_then(|found| found.get(1)) else {
        return Ok(Signature::None);
    };
    match found
        .as_str()
        .split([' ', ':'])
        .next()
        .unwrap_or("")
        .to_ascii_uppercase()
        .as_str()
    {
        "VERDICT" => Ok(Signature::Pass),
        "FINDINGS" => Ok(Signature::Findings),
        "SOURCES" => Ok(Signature::Sources),
        _ => Ok(Signature::None),
    }
}

fn proof_block(context: &Context, claim: Claim) -> Option<Block> {
    let result = context.evidence_root().and_then(|root| {
        proof::evaluate(&root, &context.session_id, claim).map_err(HookError::from)
    });
    let reason = match result {
        Ok(evaluation) if evaluation.ok => return None,
        Ok(evaluation) => evaluation
            .reason
            .unwrap_or_else(|| "No current execution proof".to_owned()),
        Err(error) => error.to_string(),
    };
    Some(Block::new(format!(
        "Evidence gate: expected result and unchanged artifact identity are required. Run the deciding check in this session after the last edit; see docs/proof.md. If proof is unavailable, use VERDICT: FAIL. Reason: {reason}"
    )))
}

fn citation_block(event: &Event) -> Result<Option<Block>, HookError> {
    let cited = sources::cited(&event.last_assistant_message)?;
    let fetched = audit::fetched(&event.context)?;
    let missing: Vec<_> = cited
        .difference(&fetched)
        .map(ToString::to_string)
        .collect();
    if missing.is_empty() && (!cited.is_empty() || !fetched.is_empty()) {
        return Ok(None);
    }
    let reason = if missing.is_empty() {
        "no page fetched in this session".to_owned()
    } else {
        format!("unfetched citations: {}", missing.join(", "))
    };
    Ok(Some(Block::new(format!(
        "Citation gate: {reason}. Open each cited URL and read it before signing SOURCES: VERIFIED. Search snippets do not authorize citations."
    ))))
}

fn evaluate(event: &Event) -> Result<Option<Block>, HookError> {
    let block = match signature(&event.last_assistant_message)? {
        Signature::Pass => proof_block(&event.context, Claim::Pass),
        Signature::Findings => proof_block(&event.context, Claim::Findings),
        Signature::Sources => match citation_block(event) {
            Ok(block) => block,
            Err(error) => Some(Block::new(format!(
                "Citation gate: source authority could not be read: {error}"
            ))),
        },
        Signature::None => None,
    };
    Ok(block)
}

pub(super) fn run(input: &[u8]) -> Result<Option<String>, HookError> {
    let event: Event = serde_json::from_slice(input)?;
    let block = evaluate(&event)?;
    if let Some(block) = block {
        audit::record(
            &event.context,
            audit::Entry::GateBlock {
                reason: block.reason.clone(),
                missing: Vec::new(),
            },
        );
        return output(&block);
    }
    if !event.context.session_id.is_empty() {
        proof::close_turn(&event.context.evidence_root()?, &event.context.session_id)?;
    }
    audit::record(&event.context, audit::Entry::TurnEnd);
    Ok(None)
}
