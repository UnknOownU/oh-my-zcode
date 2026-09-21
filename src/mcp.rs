//! Line-delimited MCP transport; stdout contains protocol messages only.
mod catalog;
mod dispatch;
mod wire;

use std::{
    env,
    io::{self, BufRead, Read, Write},
    path::{Path, PathBuf},
};
use thiserror::Error;
use wire::{Incoming, Response};

const MAX_FRAME_BYTES: u64 = 1_048_576;

#[derive(Debug, Error)]
pub enum McpError {
    #[error("MCP I/O failed: {0}")]
    Io(#[from] io::Error),
    #[error("MCP serialization failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Scope(#[from] crate::scope::ScopeError),
}

/// Serve MCP frames on stdin until EOF, flushing each response immediately.
///
/// # Errors
/// Returns transport, root-resolution or serialization failures.
pub fn run() -> Result<(), McpError> {
    let root = resolve_root()?;
    let stdin = io::stdin();
    let stdout = io::stdout();
    serve(stdin.lock(), stdout.lock(), root.as_deref())
}

fn resolve_root() -> io::Result<Option<PathBuf>> {
    match env::var_os("SCOPE_ROOT").filter(|path| !path.is_empty()) {
        Some(root) => crate::workspace::canonical_path(Path::new(&root)).map(Some),
        None => crate::workspace::resolve_read_root(&env::current_dir()?),
    }
}

fn serve(
    mut input: impl BufRead,
    mut output: impl Write,
    root: Option<&Path>,
) -> Result<(), McpError> {
    let mut bytes = Vec::new();
    while let Some(incoming) = next_frame(&mut input, &mut bytes)? {
        let response = match incoming {
            Incoming::Request(request) => dispatch::respond(request, root),
            Incoming::Notification => continue,
            Incoming::Invalid(code, message) => Response::error(None, code, message),
        };
        serde_json::to_writer(&mut output, &response)?;
        output.write_all(b"\n")?;
        output.flush()?;
    }
    Ok(())
}

fn next_frame(input: &mut impl BufRead, bytes: &mut Vec<u8>) -> io::Result<Option<Incoming>> {
    bytes.clear();
    if input.take(MAX_FRAME_BYTES + 1).read_until(b'\n', bytes)? == 0 {
        return Ok(None);
    }
    let incoming = if bytes.len() as u64 > MAX_FRAME_BYTES {
        discard_remainder(input, bytes)?;
        Incoming::Invalid(-32600, "Request frame exceeds 1 MiB")
    } else {
        parse_frame(bytes)
    };
    Ok(Some(incoming))
}

fn parse_frame(bytes: &[u8]) -> Incoming {
    let Ok(line) = std::str::from_utf8(bytes) else {
        return Incoming::Invalid(-32700, "Invalid UTF-8");
    };
    let line = line.trim();
    if line.is_empty() {
        Incoming::Notification
    } else {
        wire::parse(line)
    }
}

fn discard_remainder(input: &mut impl BufRead, bytes: &[u8]) -> io::Result<()> {
    if bytes.last() == Some(&b'\n') {
        return Ok(());
    }
    loop {
        let buffer = input.fill_buf()?;
        if buffer.is_empty() {
            return Ok(());
        }
        let newline = buffer.iter().position(|byte| *byte == b'\n');
        let consumed = newline.map_or(buffer.len(), |index| index + 1);
        input.consume(consumed);
        if newline.is_some() {
            return Ok(());
        }
    }
}

#[cfg(test)]
#[path = "mcp/frame_tests.rs"]
mod frame_tests;
