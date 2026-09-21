use super::{shell::Invocation, sources};
use crate::scope::ValidatedScope;
use regex::Regex;

#[derive(Debug, thiserror::Error)]
pub(super) enum TargetError {
    #[error("host not in scope targets: {0}")]
    Outside(String),
    #[error("unsupported target syntax: {0}")]
    Unsupported(&'static str),
    #[error("target inspection failed: {0}")]
    Inspection(#[from] super::HookError),
}

#[derive(Debug, Clone, Copy)]
enum TargetKind {
    Url,
    Host,
}

pub(super) fn confine(scope: &ValidatedScope, commands: &[Invocation]) -> Result<(), TargetError> {
    for command in commands {
        if command.is_attack() {
            if commands.len() != 1 || command.redirected {
                return Err(TargetError::Unsupported(
                    "attack commands require one invocation without pipes, redirections or substitutions",
                ));
            }
            attack(scope, command)?;
        }
        literal_urls(scope, command)?;
    }
    Ok(())
}

fn literal_urls(scope: &ValidatedScope, command: &Invocation) -> Result<(), TargetError> {
    for argument in &command.arguments {
        if argument.dynamic {
            return Err(TargetError::Unsupported(
                "dynamic arguments under an armed scope",
            ));
        }
        for url in sources::urls(&argument.text)? {
            if !scope.permits_url(url) {
                return Err(TargetError::Outside(url.to_owned()));
            }
        }
    }
    Ok(())
}

fn attack(scope: &ValidatedScope, command: &Invocation) -> Result<(), TargetError> {
    if command.program == "nmap" {
        return nmap(scope, command);
    }
    let (flag, alternate, kind) = target_flag(&command.program)?;
    let mut arguments = command.arguments.iter();
    let mut count = 0;
    while let Some(argument) = arguments.next() {
        if argument.text == flag || argument.text == alternate {
            permits(scope, kind, explicit_target(&mut arguments)?)?;
            count += 1;
        } else if !safe_switch(&command.program, &argument.text) {
            return Err(TargetError::Unsupported(
                "only documented explicit target flags and output-only switches are accepted; target files are not accepted",
            ));
        }
    }
    if count == 0 {
        return Err(TargetError::Unsupported("an explicit target is required"));
    }
    Ok(())
}

fn explicit_target<'a>(
    arguments: &mut impl Iterator<Item = &'a super::shell_lexer::Word>,
) -> Result<&'a str, TargetError> {
    let target = arguments
        .next()
        .ok_or(TargetError::Unsupported("missing explicit target"))?;
    if target.dynamic {
        return Err(TargetError::Unsupported("dynamic attack target"));
    }
    Ok(&target.text)
}

fn target_flag(program: &str) -> Result<(&'static str, &'static str, TargetKind), TargetError> {
    let flags = [
        ("nuclei", "-u", "-target", TargetKind::Url),
        ("sqlmap", "-u", "--url", TargetKind::Url),
        ("ffuf", "-u", "-u", TargetKind::Url),
        ("nikto", "-h", "-host", TargetKind::Url),
        ("naabu", "-host", "-host", TargetKind::Host),
        ("subfinder", "-d", "-domain", TargetKind::Host),
        ("katana", "-u", "-u", TargetKind::Url),
        ("zap-baseline", "-t", "-t", TargetKind::Url),
        ("zap.sh", "-quickurl", "-quickurl", TargetKind::Url),
    ];
    flags
        .into_iter()
        .find(|(name, ..)| *name == program)
        .map(|(_, flag, alternate, kind)| (flag, alternate, kind))
        .ok_or(TargetError::Unsupported(
            "this attack tool has no supported explicit target grammar",
        ))
}

fn safe_switch(program: &str, flag: &str) -> bool {
    let flags: &[&str] = match program {
        "nuclei" | "naabu" | "subfinder" | "katana" => {
            &["-silent", "-json", "-jsonl", "-nc", "-no-color"]
        }
        "sqlmap" => &["--batch"],
        "ffuf" => &["-s", "-json", "-noninteractive"],
        "zap-baseline" => &["-I", "-i"],
        _ => &[],
    };
    flags.contains(&flag)
}

fn permits(scope: &ValidatedScope, kind: TargetKind, target: &str) -> Result<(), TargetError> {
    let allowed = match kind {
        TargetKind::Url => scope.permits_url(target),
        TargetKind::Host => scope.permits_host(target),
    };
    if allowed {
        Ok(())
    } else {
        Err(TargetError::Outside(target.to_owned()))
    }
}

fn nmap(scope: &ValidatedScope, command: &Invocation) -> Result<(), TargetError> {
    let mut count = 0;
    for argument in &command.arguments {
        if argument.dynamic {
            return Err(TargetError::Unsupported("dynamic host"));
        }
        if ["-sV", "-sT", "-sS", "-sn", "-Pn", "-n"].contains(&argument.text.as_str()) {
            continue;
        }
        permits(scope, TargetKind::Host, &argument.text)?;
        count += 1;
    }
    if count == 0 {
        return Err(TargetError::Unsupported(
            "nmap requires explicit hostname/IP targets; ranges, CIDR and target files are unsupported",
        ));
    }
    Ok(())
}

pub(super) fn dispatch(scope: &ValidatedScope, prompt: &str) -> Result<(), TargetError> {
    let pattern = sources::url_pattern()?;
    let mut found_target = false;
    for target in pattern.find_iter(prompt) {
        permits(scope, TargetKind::Url, target.as_str())?;
        found_target = true;
    }
    if !found_target {
        return Err(TargetError::Unsupported(
            "tagged dispatch requires an explicit HTTP(S) target URL",
        ));
    }
    let remainder = pattern.replace_all(prompt, " ");
    let host = Regex::new(
        r"(?i)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}|\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b",
    )
    .map_err(super::HookError::from)?;
    if let Some(found) = host.find(&remainder) {
        return Err(TargetError::Outside(found.as_str().to_owned()));
    }
    Ok(())
}
