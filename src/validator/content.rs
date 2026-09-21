use std::path::Path;

use serde::Deserialize;

use super::{ValidationReport, files};

#[derive(Debug, Deserialize)]
struct Command {
    description: String,
}

#[derive(Debug, Deserialize)]
struct Skill {
    name: String,
    description: String,
}

pub(super) fn check(root: &Path, report: &mut ValidationReport) {
    check_commands(root, report);
    check_skills(root, report);
}

fn check_commands(root: &Path, report: &mut ValidationReport) {
    let Some(paths) = report.record(files::entries(&root.join("commands"))) else {
        return;
    };
    for path in paths
        .iter()
        .filter(|path| path.extension().is_some_and(|extension| extension == "md"))
    {
        if let Some(command) = files::frontmatter::<Command>(path, report) {
            report.check(
                !command.description.trim().is_empty(),
                format!("{}: description required", path.display()),
            );
        }
    }
}

fn check_skills(root: &Path, report: &mut ValidationReport) {
    let Some(paths) = report.record(files::entries(&root.join("skills"))) else {
        return;
    };
    for path in paths.iter().filter(|path| path.is_dir()) {
        if let Some(skill) = files::frontmatter::<Skill>(&path.join("SKILL.md"), report) {
            report.check(
                path.file_name()
                    .is_some_and(|name| name == skill.name.as_str()),
                format!("{}: skill name must match its directory", path.display()),
            );
            report.check(
                !skill.description.trim().is_empty(),
                format!("{}: description required", path.display()),
            );
        }
    }
}
