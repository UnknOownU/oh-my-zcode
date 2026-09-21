use super::{
    shell_lexer::{self, Word},
    shell_wrappers as wrappers,
};

#[derive(Debug)]
pub(super) struct Invocation {
    pub program: String,
    pub arguments: Vec<Word>,
    pub redirected: bool,
}

impl Invocation {
    pub(super) fn is_attack(&self) -> bool {
        attack_tool(&self.program)
    }
}

pub(super) fn analyze(command: &str) -> Result<Vec<Invocation>, &'static str> {
    inspect(command, 0)
}

fn inspect(command: &str, depth: usize) -> Result<Vec<Invocation>, &'static str> {
    if depth > 32 {
        return Err("command nesting limit exceeded");
    }
    let lexed = shell_lexer::lex(command)?;
    let mut invocations = Vec::new();
    for substitution in lexed.substitutions {
        invocations.extend(inspect(&substitution, depth + 1)?);
    }
    for segment in lexed.segments {
        let redirected = segment
            .iter()
            .any(|word| matches!(word.text.as_str(), "<" | ">"));
        let mut parsed = head(&segment, depth)?;
        for invocation in &mut parsed {
            invocation.redirected |= redirected;
        }
        invocations.extend(parsed);
    }
    Ok(invocations)
}

fn head(mut words: &[Word], depth: usize) -> Result<Vec<Invocation>, &'static str> {
    while let Some(word) = words.first() {
        if wrappers::assignment(&word.text) {
            words = words.get(1..).unwrap_or_default();
            continue;
        }
        if word.dynamic || word.text.contains(['{', '}', '[', ']', '*', '?', '%', '^']) {
            return Err("dynamic executable cannot be authorized statically");
        }
        let lower = word.text.to_ascii_lowercase();
        let command = wrappers::basename(&lower);
        words = words.get(1..).unwrap_or_default();
        if command.chars().all(|ch| ch.is_ascii_digit())
            && words
                .first()
                .is_some_and(|word| word.text == ">" || word.text == "<")
        {
            words = words.get(2..).unwrap_or_default();
            continue;
        }
        if wrappers::wrapper(command) {
            words = unwrap_wrapper(command, words)?;
            continue;
        }
        return executable(command, words, depth);
    }
    Ok(Vec::new())
}

fn unwrap_wrapper<'a>(command: &str, words: &'a [Word]) -> Result<&'a [Word], &'static str> {
    if command == "command"
        && words
            .first()
            .is_some_and(|word| matches!(word.text.as_str(), "-v" | "-V"))
    {
        return Ok(&[]);
    }
    if command == "xargs" {
        return Err("stdin-driven xargs execution is unsupported");
    }
    let skip = wrappers::skip_flags(words, command)? + usize::from(command == "timeout");
    Ok(words.get(skip..).unwrap_or_default())
}

fn executable(
    command: &str,
    words: &[Word],
    depth: usize,
) -> Result<Vec<Invocation>, &'static str> {
    if [
        "source",
        ".",
        "coproc",
        "invoke-expression",
        "iex",
        "start-process",
        "saps",
        "start-job",
    ]
    .contains(&command)
    {
        return Err("indirect shell execution is unsupported");
    }
    if wrappers::interpreter(command) {
        return interpreter(command, words, depth);
    }
    match command {
        "if" | "then" | "else" | "elif" | "while" | "until" | "do" | "!" | "{" => {
            head(words, depth)
        }
        "<" | ">" => head(words.get(1..).unwrap_or_default(), depth),
        "python" | "python3" => python_module(command, words),
        _ => Ok(vec![Invocation {
            program: command.to_owned(),
            arguments: words.to_vec(),
            redirected: false,
        }]),
    }
}

fn interpreter(
    command: &str,
    words: &[Word],
    depth: usize,
) -> Result<Vec<Invocation>, &'static str> {
    let payload = if command == "eval" {
        Some(words)
    } else {
        words
            .iter()
            .position(|word| command_flag(command, &word.text))
            .and_then(|index| words.get(index + 1..))
    };
    let Some(payload) = payload else {
        return Err(
            "interpreter requires an inspectable command payload; encoded/file modes are unsupported",
        );
    };
    if payload.iter().any(|word| word.dynamic) {
        return Err("dynamic interpreter payload");
    }
    let text = payload
        .iter()
        .map(|word| word.text.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    if command == "cmd" && text.contains('^') {
        return Err("cmd escape expansion is unsupported");
    }
    inspect(&text, depth + 1)
}

fn python_module(command: &str, words: &[Word]) -> Result<Vec<Invocation>, &'static str> {
    if words.first().is_some_and(|word| word.text == "-c") {
        return Err("inline language execution is not statically inspectable");
    }
    let program = words
        .windows(2)
        .find_map(|pair| {
            let (flag, module) = (pair.first()?, pair.get(1)?);
            (flag.text == "-m").then_some(module.text.as_str())
        })
        .unwrap_or(command);
    let program = program.split('.').next().unwrap_or(program);
    Ok(vec![Invocation {
        program: program.to_owned(),
        arguments: words.to_vec(),
        redirected: false,
    }])
}

fn command_flag(command: &str, flag: &str) -> bool {
    match command {
        "powershell" | "pwsh" => {
            flag.eq_ignore_ascii_case("-command") || flag.eq_ignore_ascii_case("-c")
        }
        "cmd" => flag.eq_ignore_ascii_case("/c"),
        _ => wrappers::run_flag(flag),
    }
}

fn attack_tool(command: &str) -> bool {
    matches!(
        command,
        "nuclei"
            | "semgrep"
            | "sqlmap"
            | "nmap"
            | "ffuf"
            | "nikto"
            | "naabu"
            | "subfinder"
            | "katana"
            | "hydra"
            | "zap-baseline"
            | "zap.sh"
    )
}
