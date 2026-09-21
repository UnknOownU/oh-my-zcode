use super::{
    ProofError,
    journal::{Completion, Event, Journal, Outcome},
    policy::{Claim, Policy},
    snapshot::{self, Fingerprint},
};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};

#[derive(Debug, Serialize)]
pub struct ProofSummary {
    pub id: String,
    pub command: String,
    pub expected_exit: u8,
    pub exit_code: i64,
    pub artifact: Fingerprint,
}

#[derive(Debug, Serialize)]
pub struct Evaluation {
    pub ok: bool,
    pub reason: Option<String>,
    pub proofs: Vec<ProofSummary>,
}

impl Evaluation {
    fn rejected(reason: impl Into<String>) -> Self {
        Self {
            ok: false,
            reason: Some(reason.into()),
            proofs: Vec::new(),
        }
    }
}

struct Turn {
    pending: BTreeSet<String>,
    latest: BTreeMap<String, Completion>,
}

impl Turn {
    fn read(events: &[Event]) -> Self {
        let mut turn = Self {
            pending: BTreeSet::new(),
            latest: BTreeMap::new(),
        };
        for event in events {
            match event {
                Event::Start { attempt } => {
                    turn.pending.insert(attempt.id.clone());
                }
                Event::StartFailed { command, reason } => {
                    turn.latest.insert(
                        command.clone(),
                        Completion {
                            command: command.clone(),
                            attempt_id: None,
                            contract: None,
                            outcome: Outcome::Rejected {
                                reason: reason.clone(),
                            },
                        },
                    );
                }
                Event::Completed { completion } => {
                    if let Some(id) = &completion.attempt_id {
                        turn.pending.remove(id);
                    }
                    turn.latest
                        .insert(completion.command.clone(), completion.clone());
                }
                Event::TurnEnd => {}
            }
        }
        turn
    }

    fn required(&self, policy: &Policy, claim: Claim) -> Option<Evaluation> {
        policy
            .checks
            .iter()
            .filter(|check| check.claim.includes(claim))
            .find(|check| !self.latest.contains_key(&check.command))
            .map(|check| {
                Evaluation::rejected(format!("Required check not executed: {}", check.command))
            })
    }
}

pub fn evaluate(root: &Path, session: &str, claim: Claim) -> Result<Evaluation, ProofError> {
    let journal = Journal::open(root, session)?;
    let turn = Turn::read(journal.current());
    if !turn.pending.is_empty() {
        return Ok(Evaluation::rejected(
            "Verification is still pending or lacks a matched result",
        ));
    }
    let policy = Policy::read(root)?;
    if let Some(rejected) = turn.required(&policy, claim) {
        return Ok(rejected);
    }
    let applicable = turn
        .latest
        .values()
        .filter(|proof| {
            proof
                .contract
                .as_ref()
                .is_none_or(|contract| contract.claim.includes(claim))
        })
        .collect::<Vec<_>>();
    if applicable.is_empty() {
        return Ok(Evaluation::rejected(
            "No completed verification with a pre-execution snapshot this turn",
        ));
    }
    let now = snapshot::capture(root, &policy, &[])?;
    let mut proofs = Vec::with_capacity(applicable.len());
    for completion in applicable {
        match summarize(completion, &now) {
            Ok(summary) => proofs.push(summary),
            Err(reason) => return Ok(Evaluation::rejected(reason)),
        }
    }
    Ok(Evaluation {
        ok: true,
        reason: None,
        proofs,
    })
}

fn summarize(completion: &Completion, now: &Fingerprint) -> Result<ProofSummary, String> {
    let (exit_code, artifact) = match &completion.outcome {
        Outcome::Verified {
            exit_code,
            artifact,
        } => (*exit_code, artifact),
        Outcome::Rejected { reason } => return Err(reason.clone()),
    };
    if artifact != now {
        return Err(
            "Proof is stale: source, policy or artifact changed; rerun verification".into(),
        );
    }
    let contract = completion
        .contract
        .as_ref()
        .ok_or("Verified receipt has no contract")?;
    let id = completion
        .attempt_id
        .as_ref()
        .ok_or("Verified receipt has no attempt")?;
    Ok(ProofSummary {
        id: id.clone(),
        command: completion.command.clone(),
        expected_exit: contract.expected_exit,
        exit_code,
        artifact: artifact.clone(),
    })
}
