mod archive;
mod artifact;
mod assets;
mod manifests;
mod metrics;
mod package;
mod smoke;
mod smoke_protocol;
mod target;
mod universal;

use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(about = "Build and verify Oh My Zcode distributions", version)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Create one immutable platform distribution.
    Package(package::Options),
    Universal(universal::Options),
    #[command(about = "Extract and exercise the exact packaged runtime")]
    Smoke {
        #[arg(long)]
        archive: PathBuf,
        #[arg(long, value_enum)]
        target: target::Target,
        #[arg(long)]
        universal: bool,
    },
    /// Check AST-based Rust complexity and module size.
    Quality {
        #[arg(long)]
        analyzer: PathBuf,
        #[arg(long, default_value = ".")]
        root: PathBuf,
    },
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    match Cli::parse().command {
        Command::Package(options) => package::run(&options)?,
        Command::Universal(options) => universal::run(&options)?,
        Command::Smoke {
            archive,
            target,
            universal,
        } => smoke::run(&archive, target, universal)?,
        Command::Quality { analyzer, root } => metrics::check(&root, &analyzer)?,
    }
    Ok(())
}
