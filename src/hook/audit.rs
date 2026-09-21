use super::{HookError, events::Context, source_identity::SourceIdentity};
use crate::workspace;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::PathBuf,
};

#[derive(Debug, Serialize, Deserialize)]
enum Schema {
    #[serde(rename = "oh-my-zcode/audit/v3")]
    V3,
}

#[derive(Debug, Serialize, Deserialize)]
struct Record {
    schema: Schema,
    session_id: String,
    ts: String,
    #[serde(flatten)]
    entry: Entry,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(super) enum Entry {
    SessionStart {
        source: Option<String>,
    },
    Evidence {
        tool: String,
        command: String,
    },
    EvidenceFailure {
        command: String,
    },
    Source {
        tool: String,
        url: SourceIdentity,
        raw_url: String,
    },
    FetchFailed {
        tool: String,
        url: SourceIdentity,
        raw_url: String,
    },
    Search {
        tool: String,
        query: String,
    },
    ScopeBlock {
        reason: String,
        command: String,
    },
    ScopePass {
        command: String,
    },
    ScopeAttackPass {
        command: String,
    },
    DispatchBlock {
        reason: String,
        prompt: String,
    },
    DispatchPass {
        prompt: String,
    },
    GateBlock {
        reason: String,
        missing: Vec<String>,
    },
    TurnEnd,
}

pub(super) fn truncate(text: &str, length: usize) -> String {
    text.chars().take(length).collect()
}

fn path(context: &Context) -> Result<PathBuf, HookError> {
    Ok(context
        .evidence_root()?
        .join(".oh-my-zcode")
        .join("evidence")
        .join(format!(
            "{}.jsonl",
            workspace::session_key(&context.session_id)
        )))
}

pub(super) fn record(context: &Context, entry: Entry) {
    if context.session_id.is_empty() {
        return;
    }
    if let Err(error) = append(context, entry) {
        eprintln!("[oh-my-zcode] Audit write failed: {error}");
    }
}

fn append(context: &Context, entry: Entry) -> Result<(), HookError> {
    let target = path(context)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let record = Record {
        schema: Schema::V3,
        session_id: context.session_id.clone(),
        ts: jiff::Timestamp::now().to_string(),
        entry,
    };
    let mut line = serde_json::to_vec(&record)?;
    line.push(b'\n');
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(target)?
        .write_all(&line)?;
    Ok(())
}

pub(super) fn fetched(context: &Context) -> Result<BTreeSet<SourceIdentity>, HookError> {
    if context.session_id.is_empty() {
        return Ok(BTreeSet::new());
    }
    let raw = read(context)?;
    let mut sources = BTreeSet::new();
    for line in raw.lines().filter(|line| !line.trim().is_empty()) {
        let record: Record = serde_json::from_str(line)?;
        if record.session_id != context.session_id {
            continue;
        }
        if let Entry::Source { url, .. } = record.entry {
            sources.insert(url);
        }
    }
    Ok(sources)
}

fn read(context: &Context) -> Result<String, HookError> {
    let file = match fs::File::open(path(context)?) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(String::new()),
        Err(error) => return Err(error.into()),
    };
    let mut raw = String::new();
    file.take(16 * 1024 * 1024 + 1).read_to_string(&mut raw)?;
    if raw.len() > 16 * 1024 * 1024 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Audit journal exceeds 16 MiB",
        )
        .into());
    }
    Ok(raw)
}
