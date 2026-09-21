use std::{collections::BTreeMap, path::Path};

use super::{ValidationReport, agents::Agent, files};

pub(super) fn check(root: &Path, agents: &BTreeMap<String, Agent>, report: &mut ValidationReport) {
    let path = root.join("README.md");
    if !path.is_file() {
        report
            .warnings
            .push("README.md missing: routing documentation was not checked".to_owned());
        return;
    }
    let result = files::text(&path, report);
    let Some(readme) = report.record(result) else {
        return;
    };
    let mut checked = 0;
    for line in readme.lines().filter(|line| line.starts_with('|')) {
        let columns = line.split('|').map(str::trim).collect::<Vec<_>>();
        let Some((documented_model, effort)) =
            columns.iter().find_map(|column| model_effort(column))
        else {
            continue;
        };
        let Some(name) = columns.iter().find_map(|column| {
            let bare = column.strip_prefix('`')?.strip_suffix('`')?;
            agents.get(bare).map(|_| bare.to_owned())
        }) else {
            report
                .errors
                .push("README routing row has model / effort but no known agent name".to_owned());
            continue;
        };
        let Some(agent) = agents.get(&name) else {
            report
                .errors
                .push(format!("README routing references missing agent '{name}'"));
            continue;
        };
        check_row(agent, documented_model, effort, report);
        checked += 1;
    }
    if checked == 0 {
        report
            .warnings
            .push("README.md: no agent routing rows matched".to_owned());
    } else {
        report
            .checks
            .push(format!("README routing: {checked} agent rows checked"));
    }
}

fn model_effort(column: &str) -> Option<(&str, &str)> {
    let column = column.strip_prefix('`')?;
    let (model, remaining) = column.split_once('`')?;
    let effort = remaining.trim().strip_prefix('/')?.trim();
    Some((model, effort))
}

fn check_row(agent: &Agent, documented_model: &str, effort: &str, report: &mut ValidationReport) {
    let actual_model = agent
        .model
        .as_deref()
        .and_then(|model| model.split_once('/'))
        .map(|(_, identifier)| identifier);
    report.check(
        actual_model.is_some_and(|model| model.eq_ignore_ascii_case(documented_model)),
        format!(
            "README routing drift: {} model must match '{documented_model}'",
            agent.name
        ),
    );
    report.check(
        agent.thought_level.as_deref() == Some(effort),
        format!(
            "README routing drift: {} thoughtLevel must match '{effort}'",
            agent.name
        ),
    );
}
