use super::{ProofError, policy::Contract, snapshot::Fingerprint};
use crate::workspace::{canonical_path, session_key};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};

#[derive(Debug, Deserialize, Serialize)]
enum ReceiptSchema {
    #[serde(rename = "oh-my-zcode/receipt-v1")]
    V1,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Attempt {
    pub id: String,
    pub tool_use_id: String,
    pub cwd: PathBuf,
    pub contract: Contract,
    pub artifact: Fingerprint,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
pub(super) enum Outcome {
    Verified {
        exit_code: i64,
        artifact: Fingerprint,
    },
    Rejected {
        reason: String,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Completion {
    pub attempt_id: Option<String>,
    pub command: String,
    pub contract: Option<Contract>,
    pub outcome: Outcome,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(super) enum Event {
    Start { attempt: Attempt },
    StartFailed { command: String, reason: String },
    Completed { completion: Completion },
    TurnEnd,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Receipt {
    #[serde(rename = "receipt_schema")]
    schema: ReceiptSchema,
    session_id: String,
    root: PathBuf,
    event: Event,
}

pub(super) struct Journal {
    file: File,
    root: PathBuf,
    session: String,
    pub events: Vec<Event>,
}

impl Journal {
    pub(super) fn open(root: &Path, session: &str) -> Result<Self, ProofError> {
        if session.trim().is_empty() {
            return Err(ProofError::Journal("Missing session ID".into()));
        }
        let root = canonical_path(root)?;
        let directory = root.join(".oh-my-zcode/receipts");
        fs::create_dir_all(&directory)?;
        let mut file = OpenOptions::new()
            .read(true)
            .append(true)
            .create(true)
            .open(directory.join(format!("{}.jsonl", session_key(session))))?;
        file.lock()?;
        let mut raw = String::new();
        (&mut file)
            .take(16 * 1024 * 1024 + 1)
            .read_to_string(&mut raw)?;
        if raw.len() > 16 * 1024 * 1024 {
            return Err(ProofError::Journal("Receipt journal exceeds 16 MiB".into()));
        }
        let events = parse(&raw, &root, session)?;
        Ok(Self {
            file,
            root,
            session: session.into(),
            events,
        })
    }

    pub(super) fn append(&mut self, event: Event) -> Result<(), ProofError> {
        let receipt = Receipt {
            schema: ReceiptSchema::V1,
            session_id: self.session.clone(),
            root: self.root.clone(),
            event,
        };
        let mut bytes = serde_json::to_vec(&receipt)?;
        bytes.push(b'\n');
        self.file.seek(SeekFrom::End(0))?;
        self.file.write_all(&bytes)?;
        self.file.sync_data()?;
        self.events.push(receipt.event);
        Ok(())
    }

    pub(super) fn current(&self) -> &[Event] {
        let start = self
            .events
            .iter()
            .rposition(|event| matches!(event, Event::TurnEnd))
            .map_or(0, |index| index + 1);
        self.events.get(start..).unwrap_or_default()
    }
}

fn parse(raw: &str, root: &Path, session: &str) -> Result<Vec<Event>, ProofError> {
    raw.lines()
        .map(|line| {
            let receipt: Receipt = serde_json::from_str(line)?;
            if receipt.root != root || receipt.session_id != session {
                return Err(ProofError::Journal(
                    "Receipt belongs to another workspace or session".into(),
                ));
            }
            Ok(receipt.event)
        })
        .collect()
}
