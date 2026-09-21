use std::{collections::BTreeMap, path::Path};

use serde::{Deserialize, de::IgnoredAny};

use super::{ValidationReport, files, marketplace};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    name: String,
    version: String,
    description: String,
    agents: String,
    commands: String,
    skills: String,
    hooks: Option<IgnoredAny>,
    mcp_servers: BTreeMap<String, Server>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum Server {
    Stdio {
        command: String,
        #[serde(default)]
        args: Vec<String>,
    },
    Http {
        url: String,
    },
}

pub(super) fn check(root: &Path, packaged: bool, report: &mut ValidationReport) {
    report.check(
        !root.join(".claude-plugin").exists(),
        "only the .zcode-plugin manifest is supported",
    );
    let Some(manifest) = files::json::<Manifest>(&root.join(".zcode-plugin/plugin.json"), report)
    else {
        return;
    };
    report.check(
        valid_name(&manifest.name),
        "plugin name must match [a-z0-9][a-z0-9._-]{0,127}",
    );
    report.check(
        !manifest.description.trim().is_empty(),
        "plugin description must not be empty",
    );
    report.check(
        valid_version(&manifest.version),
        "plugin version must contain three numeric components",
    );
    report.check(
        manifest.hooks.is_none(),
        "plugin manifest must not duplicate automatic hooks declaration",
    );
    for (field, directory) in [
        ("agents", &manifest.agents),
        ("commands", &manifest.commands),
        ("skills", &manifest.skills),
    ] {
        report.check(
            directory == field && root.join(directory).is_dir(),
            format!("manifest {field} must reference the {field}/ directory"),
        );
    }
    check_servers(root, &manifest.mcp_servers, packaged, report);
    marketplace::check(root, &manifest.name, &manifest.version, report);
}

fn valid_name(name: &str) -> bool {
    let Some(first) = name.bytes().next() else {
        return false;
    };
    name.len() <= 128
        && (first.is_ascii_lowercase() || first.is_ascii_digit())
        && name.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"._-".contains(&byte)
        })
}

fn valid_version(version: &str) -> bool {
    let parts = version.split('.').collect::<Vec<_>>();
    parts.len() == 3
        && parts.iter().all(|part| {
            !part.is_empty()
                && part.bytes().all(|byte| byte.is_ascii_digit())
                && (part.len() == 1 || !part.starts_with('0'))
        })
}

fn check_servers(
    root: &Path,
    servers: &BTreeMap<String, Server>,
    packaged: bool,
    report: &mut ValidationReport,
) {
    let expected = ["codegraph", "grep", "osv-scanner", "scope", "semgrep"];
    report.check(
        servers.keys().map(String::as_str).eq(expected),
        "MCP servers must be scope, semgrep, osv-scanner, grep and codegraph",
    );
    let native_scope = matches!(servers.get("scope"), Some(Server::Stdio { command, args })
        if files::native_command(command) && args.as_slice() == ["scope-mcp"]);
    report.check(
        native_scope,
        "mcpServers.scope: native scope-mcp command required",
    );
    for (name, server) in servers {
        match server {
            Server::Http { url } => {
                let valid = url::Url::parse(url).is_ok_and(|url| {
                    matches!(url.scheme(), "http" | "https") && url.host_str().is_some()
                });
                report.check(valid, format!("mcpServers.{name}: valid HTTP URL required"));
            }
            Server::Stdio { command, args } => {
                report.check(
                    !command.trim().is_empty(),
                    format!("mcpServers.{name}: command required"),
                );
                for target in std::iter::once(command).chain(args) {
                    files::reference(root, target, report, packaged);
                }
                if !command.contains("${ZCODE_PLUGIN_ROOT}") && !on_path(command) {
                    report.warnings.push(format!(
                        "mcpServers.{name}: prerequisite '{command}' not found on PATH"
                    ));
                }
            }
        }
    }
}

pub(super) fn on_path(command: &str) -> bool {
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&path).any(|directory| {
        let target = directory.join(command);
        if target.is_file() {
            return true;
        }
        cfg!(windows)
            && ["exe", "cmd", "bat", "com"]
                .iter()
                .any(|extension| target.with_extension(extension).is_file())
    })
}
