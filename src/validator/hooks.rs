use std::{collections::BTreeMap, path::Path};

use serde::Deserialize;

use super::{ValidationReport, files};

#[derive(Debug, Deserialize)]
struct Hooks {
    hooks: BTreeMap<String, Vec<Group>>,
}

#[derive(Debug, Deserialize)]
struct Group {
    matcher: Option<String>,
    hooks: Vec<Hook>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Hook {
    #[serde(rename = "type")]
    _kind: HookKind,
    command: String,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default, rename = "async")]
    asynchronous: bool,
    timeout_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum HookKind {
    Process,
}

const EVENTS: &[&str] = &[
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PermissionRequest",
    "PostToolUse",
    "PostToolUseFailure",
    "Stop",
];
const SYNCHRONOUS: &[&str] = &[
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PermissionRequest",
    "Stop",
];

struct Binding {
    event: &'static str,
    matcher: Option<&'static str>,
    handlers: &'static [&'static str],
}

const REQUIRED: &[Binding] = &[
    Binding {
        event: "SessionStart",
        matcher: Some("startup|clear|compact"),
        handlers: &["session_start"],
    },
    Binding {
        event: "PreToolUse",
        matcher: Some("Bash"),
        handlers: &["scope", "proof_start"],
    },
    Binding {
        event: "PreToolUse",
        matcher: Some("Agent|Task"),
        handlers: &["dispatch"],
    },
    Binding {
        event: "PostToolUse",
        matcher: Some("Bash"),
        handlers: &["evidence"],
    },
    Binding {
        event: "PostToolUse",
        matcher: Some("WebFetch|WebSearch|webReader|webSearchPrime|web_reader|web_search_prime"),
        handlers: &["sources"],
    },
    Binding {
        event: "PostToolUseFailure",
        matcher: Some("Bash"),
        handlers: &["evidence_failure"],
    },
    Binding {
        event: "Stop",
        matcher: None,
        handlers: &["stop"],
    },
];

pub(super) fn check(root: &Path, packaged: bool, report: &mut ValidationReport) {
    let Some(document) = files::json::<Hooks>(&root.join("hooks/hooks.json"), report) else {
        return;
    };
    check_topology(&document, report);
    for (event, groups) in &document.hooks {
        report.check(
            EVENTS.contains(&event.as_str()),
            format!("hooks.json: supported event required ({event})"),
        );
        for group in groups {
            for hook in &group.hooks {
                check_hook(event, hook, report);
                for target in std::iter::once(&hook.command).chain(&hook.args) {
                    files::reference(root, target, report, packaged);
                }
            }
        }
    }
}

fn check_topology(document: &Hooks, report: &mut ValidationReport) {
    let count: usize = document.hooks.values().map(Vec::len).sum();
    report.check(
        count == REQUIRED.len(),
        "hooks.json: exactly seven required groups must be registered",
    );
    for binding in REQUIRED {
        let matches = document
            .hooks
            .get(binding.event)
            .into_iter()
            .flatten()
            .filter(|group| group.matcher.as_deref() == binding.matcher)
            .collect::<Vec<_>>();
        let valid = match matches.as_slice() {
            [group] => {
                group.hooks.len() == binding.handlers.len()
                    && group
                        .hooks
                        .iter()
                        .zip(binding.handlers)
                        .all(|(hook, handler)| hook.args.as_slice() == ["hook", *handler])
            }
            _ => false,
        };
        report.check(
            valid,
            format!(
                "hooks.json: {} matcher {:?} must register {:?} exactly once in order",
                binding.event, binding.matcher, binding.handlers
            ),
        );
    }
}

fn check_hook(event: &str, hook: &Hook, report: &mut ValidationReport) {
    report.check(
        !hook.asynchronous || !SYNCHRONOUS.contains(&event),
        format!("{event}: async gating hooks cannot inject context or block"),
    );
    report.check(
        files::native_command(&hook.command),
        format!("{event}: native plugin command required"),
    );
    if hook.timeout_ms.is_none_or(|timeout| timeout == 0) {
        report
            .warnings
            .push(format!("{event}: explicit positive timeoutMs recommended"));
    }
}
