use std::{iter::Peekable, str::Chars};

#[derive(Debug, Default, Clone)]
pub(super) struct Word {
    pub text: String,
    pub dynamic: bool,
}

#[derive(Debug, Default)]
pub(super) struct Lexed {
    pub segments: Vec<Vec<Word>>,
    pub substitutions: Vec<String>,
}

#[derive(Debug, Clone, Copy)]
enum Quote {
    None,
    Single,
    Double,
}

struct Lexer<'a> {
    chars: Peekable<Chars<'a>>,
    word: Word,
    words: Vec<Word>,
    output: Lexed,
    quote: Quote,
}

pub(super) fn lex(command: &str) -> Result<Lexed, &'static str> {
    if command.len() > 1_048_576 {
        return Err("command size limit exceeded");
    }
    let mut lexer = Lexer {
        chars: command.chars().peekable(),
        word: Word::default(),
        words: Vec::new(),
        output: Lexed::default(),
        quote: Quote::None,
    };
    while let Some(ch) = lexer.chars.next() {
        lexer.consume(ch)?;
    }
    if !matches!(lexer.quote, Quote::None) {
        return Err("unterminated quote");
    }
    lexer.segment();
    Ok(lexer.output)
}

impl Lexer<'_> {
    fn word(&mut self) {
        if !self.word.text.is_empty() || self.word.dynamic {
            self.words.push(std::mem::take(&mut self.word));
        }
    }

    fn segment(&mut self) {
        self.word();
        if !self.words.is_empty() {
            self.output.segments.push(std::mem::take(&mut self.words));
        }
    }

    fn consume(&mut self, ch: char) -> Result<(), &'static str> {
        match self.quote {
            Quote::Single => {
                if ch == '\'' {
                    self.quote = Quote::None;
                } else {
                    self.word.text.push(ch);
                }
            }
            Quote::Double => self.double(ch)?,
            Quote::None => self.unquoted(ch)?,
        }
        Ok(())
    }

    fn double(&mut self, ch: char) -> Result<(), &'static str> {
        match ch {
            '"' => self.quote = Quote::None,
            '\\' => self.escape()?,
            '$' => self.dollar()?,
            '`' => self.backtick()?,
            _ => self.word.text.push(ch),
        }
        Ok(())
    }

    fn unquoted(&mut self, ch: char) -> Result<(), &'static str> {
        match ch {
            '\'' => {
                self.quote = Quote::Single;
                Ok(())
            }
            '"' => {
                self.quote = Quote::Double;
                Ok(())
            }
            '\\' => self.escape(),
            '$' => self.dollar(),
            '`' => self.backtick(),
            _ => self.separator_or_text(ch),
        }
    }

    fn separator_or_text(&mut self, ch: char) -> Result<(), &'static str> {
        if "\n;|&()".contains(ch) {
            self.segment();
            return Ok(());
        }
        match ch {
            '<' | '>' => {
                self.word();
                self.words.push(Word {
                    text: ch.to_string(),
                    dynamic: false,
                });
            }
            '#' if self.word.text.is_empty() => {
                let _ = self.chars.by_ref().find(|next| *next == '\n');
                self.segment();
            }
            '\0' => return Err("NUL in shell input"),
            _ if ch.is_whitespace() => self.word(),
            _ => self.word.text.push(ch),
        }
        Ok(())
    }

    fn escape(&mut self) -> Result<(), &'static str> {
        if self.literal_backslash() {
            self.word.text.push('\\');
            return Ok(());
        }
        let Some(ch) = self.chars.next() else {
            return Err("trailing escape");
        };
        if ch != '\n' {
            self.word.text.push(ch);
        }
        Ok(())
    }

    fn literal_backslash(&mut self) -> bool {
        if matches!(self.quote, Quote::Double) {
            return self
                .chars
                .peek()
                .is_some_and(|ch| !"$`\"\\\n".contains(*ch));
        }
        self.word.text.ends_with(':')
            || self.word.text.contains('\\')
            || matches!(self.word.text.as_str(), "." | "..")
    }

    fn dollar(&mut self) -> Result<(), &'static str> {
        self.word.dynamic = true;
        match self.chars.peek() {
            Some('(') => {
                self.chars.next();
                let body = self.parenthesized()?;
                self.output.substitutions.push(body);
            }
            Some('{') => {
                self.chars.next();
                let body = self.braced()?;
                self.output.substitutions.push(body);
            }
            _ => {
                while self
                    .chars
                    .peek()
                    .is_some_and(|ch| ch.is_ascii_alphanumeric() || *ch == '_')
                {
                    self.chars.next();
                }
            }
        }
        Ok(())
    }

    fn braced(&mut self) -> Result<String, &'static str> {
        let mut body = String::new();
        let mut depth = 1_u32;
        for ch in self.chars.by_ref() {
            match ch {
                '{' => depth += 1,
                '}' => depth -= 1,
                _ => {}
            }
            if depth == 0 {
                return Ok(body);
            }
            if depth > 32 {
                return Err("parameter nesting limit exceeded");
            }
            body.push(ch);
        }
        Err("unterminated parameter expansion")
    }

    fn backtick(&mut self) -> Result<(), &'static str> {
        let mut body = String::new();
        for ch in self.chars.by_ref() {
            if ch == '`' {
                self.output.substitutions.push(body);
                self.word.dynamic = true;
                return Ok(());
            }
            body.push(ch);
        }
        Err("unterminated command substitution")
    }

    fn parenthesized(&mut self) -> Result<String, &'static str> {
        let mut body = String::new();
        let mut depth = 1_u32;
        let mut quote = Quote::None;
        let mut escaped = false;
        for ch in self.chars.by_ref() {
            if escaped {
                body.push(ch);
                escaped = false;
                continue;
            }
            if ch == '\\' {
                escaped = true;
                body.push(ch);
                continue;
            }
            update_nested(ch, &mut quote, &mut depth);
            if depth == 0 {
                return Ok(body);
            }
            if depth > 32 {
                return Err("command nesting limit exceeded");
            }
            body.push(ch);
        }
        Err("unterminated command substitution")
    }
}

fn update_nested(ch: char, quote: &mut Quote, depth: &mut u32) {
    match (*quote, ch) {
        (Quote::Single, '\'') | (Quote::Double, '"') => *quote = Quote::None,
        (Quote::None, '\'') => *quote = Quote::Single,
        (Quote::None, '"') => *quote = Quote::Double,
        (Quote::None, '(') => *depth += 1,
        (Quote::None, ')') => *depth -= 1,
        _ => {}
    }
}
