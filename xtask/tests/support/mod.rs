pub mod binaries;

use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Output},
};

pub type TestResult = Result<(), Box<dyn std::error::Error>>;

pub struct Fixture {
    pub directory: tempfile::TempDir,
    pub plugin: PathBuf,
    pub binary: PathBuf,
}

impl Fixture {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let directory = tempfile::tempdir()?;
        let plugin = directory.path().join("source");
        for child in [
            ".zcode-plugin",
            "hooks",
            "agents",
            "commands",
            "skills/a",
            "docs",
            "mcp",
            ".oh-my-zcode",
            "vendor/codegraph/node_modules",
            "tools",
        ] {
            fs::create_dir_all(plugin.join(child))?;
        }
        fs::write(
            plugin.join(".zcode-plugin/plugin.json"),
            r#"{"name":"oh-my-zcode","version":"3.0.0","description":"fixture","agents":"agents","mcpServers":{"scope":{"type":"stdio","command":"oh-my-zcode","args":["scope-mcp"]},"grep":{"type":"http","url":"https://mcp.grep.app"}}}"#,
        )?;
        fs::write(
            plugin.join("hooks/hooks.json"),
            r#"{"hooks":{"SessionStart":[{"matcher":"startup","hooks":[{"type":"process","command":"oh-my-zcode","args":["hook","session_start"],"timeoutMs":5000}]}]}}"#,
        )?;
        for child in [
            "agents/a.md",
            "commands/a.md",
            "skills/a/SKILL.md",
            "docs/proof.md",
            "README.md",
            "LICENSE",
            "vendor/codegraph/package.json",
            "vendor/codegraph/package-lock.json",
        ] {
            fs::write(plugin.join(child), "fixture\n")?;
        }
        add_local_only_files(&plugin)?;
        let binary = directory.path().join("binary");
        fs::write(&binary, binaries::windows()?)?;
        Ok(Self {
            directory,
            plugin,
            binary,
        })
    }

    pub fn run(&self, target: &str) -> std::io::Result<Output> {
        Command::new(env!("CARGO_BIN_EXE_xtask"))
            .args(["package", "--target", target, "--binary"])
            .arg(&self.binary)
            .arg("--plugin-root")
            .arg(&self.plugin)
            .arg("--output")
            .arg(self.directory.path().join("dist"))
            .args([
                "--base-url",
                "https://downloads.example.com/releases/v3.0.0/",
            ])
            .output()
    }

    pub fn output(&self, target: &str) -> PathBuf {
        self.directory.path().join("dist").join(target)
    }
}

fn add_local_only_files(plugin: &Path) -> std::io::Result<()> {
    for child in [
        "hooks/gate_hook.mjs",
        "mcp/scope-server.mjs",
        ".oh-my-zcode/private.json",
        "vendor/codegraph/node_modules/private.js",
        "tools/setup-codegraph.cmd",
        "gw.html",
    ] {
        fs::write(plugin.join(child), "must not ship")?;
    }
    Ok(())
}
