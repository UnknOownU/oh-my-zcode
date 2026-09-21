use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use serde::Serialize;

#[derive(Debug, Parser)]
#[command(version, about = "Native evidence and scope gates for ZCode")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Handle one JSON hook request on stdin.
    Hook { event: String },
    /// Serve the scope tools using newline-delimited JSON-RPC on stdio.
    ScopeMcp,
    /// Validate a plugin source tree or an extracted platform package.
    Validate {
        #[arg(default_value = "plugin")]
        plugin_root: PathBuf,
        #[arg(long)]
        packaged: bool,
        #[arg(long)]
        json: bool,
    },
}

#[derive(Debug, thiserror::Error)]
enum Error {
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Mcp(#[from] oh_my_zcode::mcp::McpError),
    #[error(transparent)]
    Validation(#[from] oh_my_zcode::validator::ValidationError),
}

#[derive(Serialize)]
struct BlockResponse {
    decision: &'static str,
    reason: String,
}

fn hook(event: &str) -> Result<ExitCode, Error> {
    let mut input = Vec::new();
    io::stdin()
        .take(8 * 1024 * 1024 + 1)
        .read_to_end(&mut input)?;
    let result = if input.len() > 8 * 1024 * 1024 {
        Err("Hook request exceeds 8 MiB".to_owned())
    } else {
        oh_my_zcode::hook::run(event, &input).map_err(|error| error.to_string())
    };
    let output = match result {
        Ok(output) => output,
        Err(reason) => {
            writeln!(io::stderr(), "{reason}")?;
            Some(serde_json::to_string(&BlockResponse {
                decision: "block",
                reason,
            })?)
        }
    };
    if let Some(output) = output {
        io::stdout().write_all(output.as_bytes())?;
    }
    Ok(ExitCode::SUCCESS)
}

fn run(command: Command) -> Result<ExitCode, Error> {
    match command {
        Command::Hook { event } => hook(&event),
        Command::ScopeMcp => {
            oh_my_zcode::mcp::run()?;
            Ok(ExitCode::SUCCESS)
        }
        Command::Validate {
            plugin_root,
            packaged,
            json,
        } => {
            let report = oh_my_zcode::validator::validate(&plugin_root, packaged)?;
            let output = if json {
                serde_json::to_string_pretty(&report)?
            } else {
                report.to_string()
            };
            writeln!(io::stdout(), "{output}")?;
            Ok(if report.is_valid() {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            })
        }
    }
}

fn main() -> ExitCode {
    match run(Cli::parse().command) {
        Ok(status) => status,
        Err(error) => {
            let _ = writeln!(io::stderr(), "{error}");
            ExitCode::FAILURE
        }
    }
}
