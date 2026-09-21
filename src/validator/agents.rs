use std::{collections::BTreeMap, path::Path};

use serde::{Deserialize, de::IgnoredAny};

use super::{ValidationReport, files, routing};

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Agent {
    pub(super) name: String,
    description: String,
    pub(super) model: Option<String>,
    pub(super) thought_level: Option<String>,
    #[serde(rename = "color")]
    _color: Option<String>,
    tools: Option<String>,
    disallowed_tools: Option<String>,
    skills: Option<String>,
    max_turns: Option<u32>,
    #[serde(rename = "injectAgentsMd")]
    _inject_agents_md: Option<bool>,
    #[serde(rename = "mcpServers")]
    _mcp_servers: Option<IgnoredAny>,
}

const MODELS: &[&str] = &["glm-4.5", "glm-4.6", "glm-4.7", "glm-5-turbo", "glm-5.3", "glm-5.3-flash"];
const ALIASES: &[&str] = &["glm-5", "glm-5.1", "glm-5.2", "glm-4.5-air"];
const TOOLS: &[&str] = &[
    "Read",
    "Grep",
    "Glob",
    "Bash",
    "Edit",
    "Write",
    "WebFetch",
    "WebSearch",
    "TodoWrite",
];

pub(super) fn check(root: &Path, report: &mut ValidationReport) {
    let Some(paths) = report.record(files::entries(&root.join("agents"))) else {
        return;
    };
    let mut agents = BTreeMap::new();
    for path in paths
        .iter()
        .filter(|path| path.extension().is_some_and(|extension| extension == "md"))
    {
        let Some(agent) = files::frontmatter::<Agent>(path, report) else {
            continue;
        };
        let name = path
            .file_name()
            .map_or_else(String::new, |name| name.to_string_lossy().into_owned());
        check_agent(&name, &agent, root, report);
        report.check(
            path.file_stem()
                .is_some_and(|stem| stem == agent.name.as_str()),
            format!("{name}: agent name must match its filename"),
        );
        if agents.insert(agent.name.clone(), agent).is_some() {
            report.errors.push(format!("{name}: duplicate agent name"));
        }
    }
    report.check(
        !agents.is_empty(),
        "agents/: at least one valid agent required",
    );
    routing::check(root, &agents, report);
}

fn check_agent(name: &str, agent: &Agent, root: &Path, report: &mut ValidationReport) {
    report.check(
        !agent.name.trim().is_empty(),
        format!("{name}: name required"),
    );
    report.check(
        !agent.description.trim().is_empty(),
        format!("{name}: description required"),
    );
    check_model(name, agent, report);
    if let Some(skills) = &agent.skills {
        let invalid = skills
            .split(',')
            .map(str::trim)
            .filter(|skill| !skill.is_empty())
            .filter(|skill| {
                !root
                    .join("skills")
                    .join(skill)
                    .join("SKILL.md")
                    .is_file()
            })
            .collect::<Vec<_>>();
        report.check(
            invalid.is_empty(),
            format!("{name}: skills references unknown skill directories {invalid:?}"),
        );
    }
    for (field, tools) in [
        ("tools", &agent.tools),
        ("disallowedTools", &agent.disallowed_tools),
    ] {
        if let Some(tools) = tools {
            let invalid = tools
                .split(',')
                .map(str::trim)
                .filter(|tool| !tool.is_empty())
                .filter(|tool| !valid_tool(tool))
                .collect::<Vec<_>>();
            report.check(
                invalid.is_empty(),
                format!("{name}: {field} references unknown tools {invalid:?}"),
            );
        }
    }
    if let Some(turns) = agent.max_turns {
        report.check(turns > 0, format!("{name}: maxTurns must be positive"));
    }
}

fn check_model(name: &str, agent: &Agent, report: &mut ValidationReport) {
    if agent.thought_level.is_some() {
        report.check(
            agent
                .model
                .as_deref()
                .is_some_and(|model| model != "inherit" && !model.is_empty()),
            format!("{name}: thoughtLevel requires an explicit model"),
        );
    }
    let Some(model) = agent.model.as_deref().filter(|model| *model != "inherit") else {
        return;
    };
    let Some((provider, identifier)) = model.split_once('/') else {
        report.errors.push(format!(
            "{name}: model '{model}' requires providerId/modelId"
        ));
        return;
    };
    report.check(
        !provider.is_empty() && !identifier.is_empty(),
        format!("{name}: model provider and identifier must not be empty"),
    );
    let identifier = identifier.to_ascii_lowercase();
    if ALIASES.contains(&identifier.as_str()) {
        report.errors.push(format!(
            "{name}: alias model '{identifier}' must use its real identifier"
        ));
    } else if !MODELS.contains(&identifier.as_str()) {
        report.warnings.push(format!(
            "{name}: model '{identifier}' outside the measured lineup"
        ));
    } else {
        report
            .checks
            .push(format!("{name}: explicit model '{model}'"));
    }
}

fn valid_tool(tool: &str) -> bool {
    TOOLS.contains(&tool)
        || tool == "*"
        || tool
            .strip_prefix("mcp__")
            .is_some_and(|suffix| !suffix.is_empty())
}
