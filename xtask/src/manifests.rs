use crate::{
    assets::{Entry, reject_link},
    package::{Error, Result},
    target::Target,
};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, path::Path};

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Plugin {
    pub(crate) name: String,
    pub(crate) version: String,
    pub(crate) description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    author: Option<Author>,
    #[serde(skip_serializing_if = "Option::is_none")]
    license: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    keywords: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    agents: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    commands: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    skills: Option<String>,
    #[serde(rename = "mcpServers")]
    servers: BTreeMap<String, Server>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Author {
    name: String,
    url: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
enum Server {
    Stdio { command: String, args: Vec<String> },
    Http { url: String },
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Hooks {
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    hooks: BTreeMap<String, Vec<Group>>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Group {
    #[serde(skip_serializing_if = "Option::is_none")]
    matcher: Option<String>,
    hooks: Vec<Hook>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Hook {
    #[serde(rename = "type")]
    kind: String,
    command: String,
    args: Vec<String>,
    #[serde(rename = "timeoutMs")]
    timeout_ms: u64,
    #[serde(rename = "async", skip_serializing_if = "Option::is_none")]
    asynchronous: Option<bool>,
}

pub(crate) fn bake(root: &Path, target: Target) -> Result<(Plugin, Vec<Entry>)> {
    let mut plugin: Plugin = read_json(&root.join(".zcode-plugin/plugin.json"))?;
    if plugin.name != "oh-my-zcode" || plugin.version != env!("CARGO_PKG_VERSION") {
        return Err(Error::Manifest(
            "plugin name/version must match the package builder",
        ));
    }
    let Some(Server::Stdio { command, args }) = plugin.servers.get_mut("scope") else {
        return Err(Error::Manifest("scope must be a stdio server"));
    };
    if args != &["scope-mcp"] {
        return Err(Error::Manifest(
            "scope must invoke the native scope-mcp command",
        ));
    }
    *command = target.command();
    let mut hooks: Hooks = read_json(&root.join("hooks/hooks.json"))?;
    for hook in hooks
        .hooks
        .values_mut()
        .flatten()
        .flat_map(|group| &mut group.hooks)
    {
        bake_hook(hook, target)?;
    }
    let entries = vec![
        Entry::new(
            Path::new(".zcode-plugin/plugin.json"),
            serde_json::to_vec_pretty(&plugin)?,
            false,
        )?,
        Entry::new(
            Path::new("hooks/hooks.json"),
            serde_json::to_vec_pretty(&hooks)?,
            false,
        )?,
    ];
    Ok((plugin, entries))
}

fn bake_hook(hook: &mut Hook, target: Target) -> Result<()> {
    let [command, event] = hook.args.as_slice() else {
        return Err(Error::Manifest(
            "each native hook requires [hook, event] arguments",
        ));
    };
    let valid_event = matches!(
        event.as_str(),
        "session_start"
            | "proof_start"
            | "evidence_failure"
            | "evidence"
            | "sources"
            | "scope"
            | "dispatch"
            | "stop"
    );
    if hook.kind != "process" || command != "hook" || !valid_event {
        return Err(Error::Manifest("unsupported native hook invocation"));
    }
    hook.command = target.command();
    Ok(())
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    reject_link(path)?;
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

#[derive(Debug, Serialize)]
pub(crate) struct Marketplace<'a> {
    pub(crate) name: String,
    pub(crate) description: &'a str,
    pub(crate) owner: Owner,
    pub(crate) plugins: [Listing<'a>; 1],
}

#[derive(Debug, Serialize)]
pub(crate) struct Owner {
    pub(crate) name: &'static str,
    pub(crate) url: &'static str,
}

#[derive(Debug, Serialize)]
pub(crate) struct Listing<'a> {
    pub(crate) name: &'a str,
    pub(crate) version: &'a str,
    pub(crate) description: &'a str,
    pub(crate) source: Source<'a>,
    #[serde(rename = "_artifact")]
    pub(crate) artifact: Artifact<'a>,
}

#[derive(Debug, Serialize)]
pub(crate) struct Source<'a> {
    #[serde(rename = "source")]
    pub(crate) origin: &'static str,
    #[serde(rename = "type")]
    pub(crate) kind: &'static str,
    pub(crate) url: &'a str,
    pub(crate) sha256: &'a str,
    pub(crate) path: &'a str,
}

#[derive(Debug, Serialize)]
pub(crate) struct Artifact<'a> {
    pub(crate) path: &'a str,
    pub(crate) sha256: &'a str,
    pub(crate) size: usize,
}
