use super::{HookError, audit, events::Context, source_identity::SourceIdentity};
use regex::Regex;
use serde::Deserialize;
use serde_json::value::RawValue;
use std::collections::BTreeSet;

#[derive(Debug, Deserialize, Default)]
struct RetrievalInput {
    #[serde(alias = "URL", default)]
    url: String,
    #[serde(default)]
    query: String,
}

#[derive(Debug, Deserialize)]
struct Event {
    #[serde(flatten)]
    context: Context,
    #[serde(default)]
    tool_name: String,
    #[serde(default)]
    tool_input: RetrievalInput,
    tool_response: Option<Box<RawValue>>,
}

#[derive(Debug, Deserialize)]
struct RetrievalResult {
    #[serde(rename = "isError", alias = "is_error", default)]
    is_error: bool,
    error: Option<Box<RawValue>>,
    #[serde(alias = "statusCode", alias = "status_code")]
    status: Option<f64>,
    exit_code: Option<i32>,
}

fn fetch_failed(raw: Option<&RawValue>) -> bool {
    let Some(raw) = raw else {
        return true;
    };
    let Ok(result) = serde_json::from_str::<RetrievalResult>(raw.get()) else {
        return true;
    };
    result.is_error
        || result
            .error
            .is_some_and(|value| !matches!(value.get(), "null" | "false" | "\"\"" | "0"))
        || result.status.is_some_and(|status| status >= 400.0)
        || result.exit_code.is_some_and(|code| code != 0)
}

pub(super) fn url_pattern() -> Result<Regex, HookError> {
    let pattern = Regex::new(r#"(?i)https?://[^\s<>()\[\]"'`]+"#)?;
    Ok(pattern)
}

pub(super) fn urls(text: &str) -> Result<Vec<&str>, HookError> {
    let pattern = url_pattern()?;
    Ok(pattern
        .find_iter(text)
        .map(|found| found.as_str())
        .collect())
}

pub(super) fn cited(text: &str) -> Result<BTreeSet<SourceIdentity>, HookError> {
    urls(text)?
        .into_iter()
        .map(|raw| SourceIdentity::parse(raw).map_err(HookError::from))
        .collect()
}

pub(super) fn record(input: &[u8]) -> Result<Option<String>, HookError> {
    let event: Event = serde_json::from_slice(input)?;
    let entry = if event.tool_input.url.is_empty() {
        if event.tool_input.query.is_empty() {
            return Ok(None);
        }
        audit::Entry::Search {
            tool: event.tool_name,
            query: audit::truncate(&event.tool_input.query, 200),
        }
    } else {
        source_entry(&event)?
    };
    audit::record(&event.context, entry);
    Ok(None)
}

fn source_entry(event: &Event) -> Result<audit::Entry, HookError> {
    let tool = event.tool_name.clone();
    let url = SourceIdentity::parse(&event.tool_input.url)?;
    let raw_url = audit::truncate(&event.tool_input.url, 300);
    Ok(if fetch_failed(event.tool_response.as_deref()) {
        audit::Entry::FetchFailed { tool, url, raw_url }
    } else {
        audit::Entry::Source { tool, url, raw_url }
    })
}
