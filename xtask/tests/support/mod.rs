pub mod binaries;

use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Output},
};

pub type TestResult = Result<(), Box<dyn std::error::Error>>;
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const WINDOWS: &str = "x86_64-pc-windows-msvc";
pub const MACOS_X64: &str = "x86_64-apple-darwin";
pub const MACOS_ARM64: &str = "aarch64-apple-darwin";
pub const LINUX_X64: &str = "x86_64-unknown-linux-musl";
pub const LINUX_ARM64: &str = "aarch64-unknown-linux-musl";
pub const TARGETS: [(&str, &str); 5] = [
    (WINDOWS, "oh-my-zcode.exe"),
    (MACOS_X64, "oh-my-zcode"),
    (MACOS_ARM64, "oh-my-zcode"),
    (LINUX_X64, "oh-my-zcode"),
    (LINUX_ARM64, "oh-my-zcode"),
];

pub struct Fixture {
    pub directory: tempfile::TempDir,
    pub plugin: PathBuf,
    pub binary: PathBuf,
    pub binaries: PathBuf,
}

impl Fixture {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let directory = tempfile::tempdir()?;
        let plugin = directory.path().join("source");
        create_plugin(&plugin)?;
        let binaries = directory.path().join("binaries");
        create_binaries(&binaries)?;
        let binary = binaries.join(WINDOWS).join("oh-my-zcode.exe");
        Ok(Self {
            directory,
            plugin,
            binary,
            binaries,
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
                &format!("https://downloads.example.com/releases/{VERSION}/"),
            ])
            .output()
    }

    pub fn run_universal(&self) -> std::io::Result<Output> {
        Command::new(env!("CARGO_BIN_EXE_xtask"))
            .args(["universal", "--binaries"])
            .arg(&self.binaries)
            .arg("--plugin-root")
            .arg(&self.plugin)
            .arg("--output")
            .arg(self.directory.path().join("dist"))
            .args([
                "--base-url",
                &format!("https://downloads.example.com/releases/{VERSION}/"),
            ])
            .output()
    }

    pub fn output(&self, target: &str) -> PathBuf {
        self.directory.path().join("dist").join(target)
    }

    pub fn universal_output(&self) -> PathBuf {
        self.directory.path().join("dist/universal")
    }

    pub fn universal_archive(&self) -> PathBuf {
        self.universal_output()
            .join(format!("plugins/oh-my-zcode/{VERSION}/plugin.zip"))
    }
}

fn create_plugin(plugin: &Path) -> TestResult {
    for child in [
        ".zcode-plugin",
        "hooks",
        "agents",
        "commands",
        "skills/a",
        "docs",
        "docs/brand",
        "bin",
        "mcp",
        ".oh-my-zcode",
        "vendor/codegraph/node_modules",
        "tools",
    ] {
        fs::create_dir_all(plugin.join(child))?;
    }
    write_manifests(plugin)?;
    for child in [
        "agents/a.md",
        "commands/a.md",
        "skills/a/SKILL.md",
        "docs/proof.md",
        "README.md",
        "README_CN.md",
        "README_FR.md",
        "docs/brand/banner.png",
        "docs/brand/icon.png",
        "LICENSE",
        "vendor/codegraph/package.json",
        "vendor/codegraph/package-lock.json",
    ] {
        fs::write(plugin.join(child), "fixture\n")?;
    }
    fs::write(plugin.join("bin/launch.mjs"), "// fixture launcher\n")?;
    add_local_only_files(plugin)?;
    Ok(())
}

fn write_manifests(plugin: &Path) -> TestResult {
    let launcher = "${ZCODE_PLUGIN_ROOT}/bin/launch.mjs";
    let manifest = serde_json::json!({
        "name": "oh-my-zcode",
        "version": VERSION,
        "description": "fixture",
        "description_i18n": {"en": "fixture", "zh-CN": "fixture zh"},
        "agents": "agents",
        "mcpServers": {
            "scope": {"type": "stdio", "command": "node", "args": [launcher, "scope-mcp"]},
            "grep": {"type": "http", "url": "https://mcp.grep.app"}
        }
    });
    fs::write(
        plugin.join(".zcode-plugin/plugin.json"),
        serde_json::to_vec(&manifest)?,
    )?;
    let hooks = serde_json::json!({
        "hooks": {"SessionStart": [{
            "matcher": "startup",
            "hooks": [{"type": "process", "command": "node", "args": [launcher, "hook", "session_start"], "timeoutMs": 5000}]
        }]}
    });
    fs::write(plugin.join("hooks/hooks.json"), serde_json::to_vec(&hooks)?)?;
    Ok(())
}

fn create_binaries(root: &Path) -> TestResult {
    write_binary(root, WINDOWS, "oh-my-zcode.exe", binaries::windows()?)?;
    write_binary(
        root,
        MACOS_X64,
        "oh-my-zcode",
        binaries::macos(0x0100_0007)?,
    )?;
    write_binary(
        root,
        MACOS_ARM64,
        "oh-my-zcode",
        binaries::macos(0x0100_000c)?,
    )?;
    write_binary(root, LINUX_X64, "oh-my-zcode", binaries::linux(62, false)?)?;
    write_binary(
        root,
        LINUX_ARM64,
        "oh-my-zcode",
        binaries::linux(183, false)?,
    )?;
    Ok(())
}

fn write_binary(root: &Path, target: &str, name: &str, bytes: Vec<u8>) -> std::io::Result<()> {
    let directory = root.join(target);
    fs::create_dir_all(&directory)?;
    fs::write(directory.join(name), bytes)
}

fn add_local_only_files(plugin: &Path) -> std::io::Result<()> {
    for child in [
        "hooks/gate_hook.mjs",
        "bin/private.mjs",
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
