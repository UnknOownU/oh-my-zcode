use super::policy::{ClaimScope, Contract};
use crate::workspace::canonical_path;
use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

struct Selection {
    root: PathBuf,
    cwd: PathBuf,
    targets: BTreeSet<String>,
}

impl Selection {
    fn local(&mut self, value: &str) -> bool {
        if value.is_empty()
            || value.starts_with('-')
            || value.contains(['*', '?', '[', ']', '{', '}'])
        {
            return false;
        }
        let Ok(path) = canonical_path(&self.cwd.join(value)) else {
            return false;
        };
        let Ok(relative) = path.strip_prefix(&self.root) else {
            return false;
        };
        self.targets
            .insert(relative.to_string_lossy().replace('\\', "/"));
        true
    }

    fn paths(&mut self, args: &[String], flags: &[&str]) -> bool {
        args.iter()
            .all(|arg| flags.contains(&arg.as_str()) || self.local(arg))
    }
}

pub(super) fn automatic(command: &str, root: &Path, cwd: &Path) -> Option<Contract> {
    if command.contains(['\r', '\n', '$', '`', '|', ';', '&', '(', ')', '<', '>', '#']) {
        return None;
    }
    let words = shlex::split(command)?;
    let (head, args) = words.split_first()?;
    let head = head
        .replace('\\', "/")
        .rsplit('/')
        .next()?
        .to_ascii_lowercase();
    let head = head
        .strip_suffix(".exe")
        .or_else(|| head.strip_suffix(".cmd"))
        .unwrap_or(&head);
    let root = canonical_path(root).ok()?;
    let cwd = canonical_path(cwd).ok()?;
    let relative = cwd
        .strip_prefix(&root)
        .ok()?
        .to_string_lossy()
        .replace('\\', "/");
    let mut selection = Selection {
        root,
        cwd,
        targets: BTreeSet::new(),
    };
    if !relative.is_empty() {
        selection.targets.insert(relative);
    }
    if !recognized(head, args, &mut selection) {
        return None;
    }
    Some(Contract {
        command: command.into(),
        claim: ClaimScope::Both,
        expected_exit: 0,
        output_includes: Vec::new(),
        targets: selection.targets.into_iter().collect(),
    })
}

fn target(value: &str) -> bool {
    let (base, suffix) = value
        .split_once(':')
        .map_or((value, None), |(base, suffix)| (base, Some(suffix)));
    ["test", "build", "lint", "typecheck", "check", "verify"].contains(&base)
        && suffix.is_none_or(|suffix| {
            !suffix.is_empty()
                && suffix
                    .chars()
                    .all(|c| c.is_alphanumeric() || "_.-".contains(c))
        })
}

fn recognized(head: &str, args: &[String], selection: &mut Selection) -> bool {
    match head {
        "npm" | "yarn" | "pnpm" | "bun" | "deno" => package_script(args),
        "node" => subcommand(args, &["--test"], &[], selection),
        "pytest" | "nosetests" => selection.paths(args, &["-q", "-v", "-vv", "--verbose", "-x"]),
        "jest" | "mocha" | "rspec" | "phpunit" | "pest" => {
            selection.paths(args, &["--ci", "--runInBand"])
        }
        "vitest" => subcommand(args, &["run"], &[], selection),
        "go" => go(args, selection),
        "cargo" => cargo(args),
        "dotnet" => subcommand(args, &["test", "build"], &["--no-restore"], selection),
        _ => recognize_other(head, args, selection),
    }
}

fn recognize_other(head: &str, args: &[String], selection: &mut Selection) -> bool {
    match head {
        "mvn" | "make" | "gradle" | "gradlew" => matches!(args, [name] if target(name)),
        "cmake" => cmake(args, selection),
        "tsc" => args.iter().all(|arg| arg == "--noEmit"),
        "eslint" | "flake8" | "pylint" | "mypy" | "pyright" | "basedpyright" | "shellcheck" => {
            selection.paths(args, &[])
        }
        "ctest" => args.iter().all(|arg| arg == "--output-on-failure"),
        "semgrep" => semgrep(args, selection),
        "nuclei" => nuclei(args, selection),
        _ => recognize_subcommands(head, args, selection),
    }
}

fn package_script(args: &[String]) -> bool {
    let args = args.strip_prefix(&["run".into()]).unwrap_or(args);
    matches!(args, [name] if target(name))
}

fn cmake(args: &[String], selection: &mut Selection) -> bool {
    matches!(args, [flag, path] if flag == "--build" && selection.local(path))
}

fn recognize_subcommands(head: &str, args: &[String], selection: &mut Selection) -> bool {
    match head {
        "ruff" => subcommand(args, &["check"], &[], selection),
        "biome" => subcommand(args, &["check", "lint", "ci"], &[], selection),
        "golangci-lint" | "cypress" => subcommand(args, &["run"], &[], selection),
        "pre-commit" => subcommand(args, &["run"], &["--all-files"], selection),
        _ => python(head, args, selection),
    }
}

fn subcommand(args: &[String], names: &[&str], flags: &[&str], selection: &mut Selection) -> bool {
    args.split_first().is_some_and(|(first, rest)| {
        names.contains(&first.as_str()) && selection.paths(rest, flags)
    })
}

fn python(head: &str, args: &[String], selection: &mut Selection) -> bool {
    let Some(version) = head.strip_prefix("python") else {
        return false;
    };
    if !version.chars().all(|c| c.is_ascii_digit() || c == '.') {
        return false;
    }
    let Some(rest) = args.strip_prefix(&["-m".into()]) else {
        return false;
    };
    subcommand(
        rest,
        &["pytest", "unittest"],
        &["-q", "-v", "-vv", "--verbose"],
        selection,
    )
}

fn cargo(args: &[String]) -> bool {
    let Some((first, rest)) = args.split_first() else {
        return false;
    };
    ["test", "build", "check", "clippy"].contains(&first.as_str())
        && rest.iter().all(|arg| {
            [
                "--workspace",
                "--all-targets",
                "--all-features",
                "--locked",
                "--offline",
            ]
            .contains(&arg.as_str())
        })
}

fn go(args: &[String], selection: &mut Selection) -> bool {
    let Some((first, rest)) = args.split_first() else {
        return false;
    };
    ["test", "vet", "build"].contains(&first.as_str())
        && rest.iter().all(|arg| {
            ["-v", "-race"].contains(&arg.as_str())
                || selection.local(if arg == "./..." { "." } else { arg })
        })
}

fn semgrep(args: &[String], selection: &mut Selection) -> bool {
    let Some(rest) = args.strip_prefix(&["scan".into()]) else {
        return false;
    };
    let selected = match rest {
        [flag, config, tail @ ..] if flag == "--config" && valid_semgrep_config(config) => tail,
        _ => rest,
    };
    selection.paths(selected, &[])
}

fn valid_semgrep_config(config: &str) -> bool {
    config.strip_prefix("p/").is_some_and(|name| {
        !name.is_empty()
            && name
                .chars()
                .all(|c| c.is_alphanumeric() || "_.-".contains(c))
    })
}

fn nuclei(args: &[String], selection: &mut Selection) -> bool {
    match args {
        [flag, target, rest @ ..] => {
            flag == "-l" && selection.local(target) && rest.iter().all(|arg| arg == "-silent")
        }
        _ => false,
    }
}
