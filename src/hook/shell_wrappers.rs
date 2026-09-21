use super::shell_lexer::Word;

pub(super) fn basename(word: &str) -> &str {
    word.rsplit(['/', '\\'])
        .next()
        .unwrap_or(word)
        .trim_end_matches(".exe")
}

pub(super) fn assignment(word: &str) -> bool {
    let Some((name, _)) = word.split_once('=') else {
        return false;
    };
    let mut chars = name.chars();
    chars
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic() || first == '_')
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

pub(super) fn wrapper(word: &str) -> bool {
    matches!(
        word,
        "env"
            | "nice"
            | "nohup"
            | "time"
            | "sudo"
            | "command"
            | "stdbuf"
            | "xargs"
            | "exec"
            | "builtin"
            | "call"
            | "timeout"
    )
}

pub(super) fn interpreter(word: &str) -> bool {
    matches!(
        word,
        "bash" | "sh" | "zsh" | "dash" | "ksh" | "powershell" | "pwsh" | "cmd" | "eval"
    )
}

pub(super) fn run_flag(flag: &str) -> bool {
    let lower = flag.to_ascii_lowercase();
    matches!(lower.as_str(), "--command" | "-command" | "/c")
        || (flag.starts_with('-') && flag.ends_with('c'))
}

pub(super) fn skip_flags(words: &[Word], wrapper: &str) -> Result<usize, &'static str> {
    let mut cursor = 0;
    while let Some(word) = words.get(cursor).filter(|word| word.text.starts_with('-')) {
        if word.dynamic {
            return Err("dynamic wrapper option");
        }
        if wrapper == "env"
            && (word.text.starts_with("-S") || word.text.starts_with("--split-string"))
        {
            return Err("env split-string execution is not supported");
        }
        if word.text == "--" {
            return Ok(cursor + 1);
        }
        let takes_value = takes_value(wrapper, &word.text)?;
        cursor += if takes_value { 2 } else { 1 };
        if cursor > words.len() {
            return Err("missing wrapper option value");
        }
    }
    Ok(cursor)
}

fn takes_value(wrapper: &str, flag: &str) -> Result<bool, &'static str> {
    if flag.contains('=') {
        return Ok(false);
    }
    if flag.starts_with("--") {
        return long_value(wrapper, flag);
    }
    let flags = [
        ("sudo", "ugphCUDTtrR"),
        ("env", "uSC"),
        ("nice", "n"),
        ("stdbuf", "oei"),
        ("xargs", "ILnPsjJadE"),
        ("time", "fo"),
        ("exec", "a"),
        ("timeout", "ks"),
    ];
    let value_flags = flags
        .iter()
        .find(|(name, _)| *name == wrapper)
        .map_or("", |(_, flags)| *flags);
    short_value(wrapper, flag, value_flags)
}

fn short_value(wrapper: &str, flag: &str, values: &str) -> Result<bool, &'static str> {
    let mut flags = flag.chars().skip(1).peekable();
    while let Some(character) = flags.next() {
        if !values.contains(character) {
            continue;
        }
        if wrapper == "env" && character == 'S' {
            return Err("env split-string execution is not supported");
        }
        return Ok(flags.peek().is_none());
    }
    Ok(false)
}

fn long_value(wrapper: &str, flag: &str) -> Result<bool, &'static str> {
    if matches!(
        flag,
        "--help"
            | "--version"
            | "--verbose"
            | "--null"
            | "--no-run-if-empty"
            | "--ignore-environment"
            | "--preserve-environment"
            | "--login"
            | "--non-interactive"
    ) {
        return Ok(false);
    }
    let flags: &[&str] = match wrapper {
        "sudo" => &[
            "--user",
            "--group",
            "--host",
            "--prompt",
            "--chdir",
            "--chroot",
            "--close-from",
            "--command-timeout",
            "--role",
            "--type",
        ],
        "env" => &["--unset", "--split-string", "--chdir"],
        "nice" => &["--adjustment"],
        "stdbuf" => &["--input", "--output", "--error"],
        "xargs" => &[
            "--arg-file",
            "--delimiter",
            "--eof",
            "--replace",
            "--max-lines",
            "--max-args",
            "--max-procs",
            "--max-chars",
        ],
        "time" => &["--format", "--output"],
        _ => &[],
    };
    if flags.contains(&flag) {
        Ok(true)
    } else {
        Err("unsupported wrapper option")
    }
}
