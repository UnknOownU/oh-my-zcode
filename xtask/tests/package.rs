mod support;
#[path = "package/universal.rs"]
mod universal;

use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{fs, io::Read};
use support::{Fixture, LINUX_X64, TestResult, VERSION, WINDOWS};

#[derive(Deserialize)]
struct Marketplace {
    plugins: Vec<Plugin>,
}
#[derive(Deserialize)]
struct Plugin {
    version: String,
    source: Source,
}
#[derive(Deserialize)]
struct Source {
    url: String,
    sha256: String,
    path: String,
}
#[derive(Deserialize)]
struct Manifest {
    #[serde(rename = "mcpServers")]
    servers: std::collections::BTreeMap<String, Server>,
}
#[derive(Deserialize)]
struct Server {
    command: Option<String>,
    args: Option<Vec<String>>,
}

#[test]
fn packages_only_release_assets_when_local_state_exists() -> TestResult {
    let fixture = Fixture::new()?;
    let output = fixture.run(WINDOWS)?;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let archive_path = fixture
        .output(WINDOWS)
        .join(format!("plugins/oh-my-zcode/{VERSION}/plugin.zip"));
    let mut archive = zip::ZipArchive::new(fs::File::open(archive_path)?)?;
    let names: Vec<_> = archive.file_names().collect();
    assert!(names.contains(&"oh-my-zcode/bin/oh-my-zcode.exe"));
    assert!(names.contains(&"oh-my-zcode/README_CN.md"));
    assert!(!names.iter().any(|name| {
        let forbidden_extension = std::path::Path::new(name)
            .extension()
            .is_some_and(|extension| {
                ["mjs", "cmd", "html"]
                    .iter()
                    .any(|blocked| extension.eq_ignore_ascii_case(blocked))
            });
        name.contains("node_modules") || name.contains(".oh-my-zcode/") || forbidden_extension
    }));
    let mut raw = String::new();
    archive
        .by_name("oh-my-zcode/.zcode-plugin/plugin.json")?
        .read_to_string(&mut raw)?;
    let manifest: Manifest = serde_json::from_str(&raw)?;
    let scope = manifest.servers.get("scope").ok_or("missing scope")?;
    assert_eq!(
        scope.command.as_deref(),
        Some("${ZCODE_PLUGIN_ROOT}/bin/oh-my-zcode.exe")
    );
    assert_eq!(
        scope.args.as_deref(),
        Some(["scope-mcp".to_owned()].as_slice())
    );
    Ok(())
}

#[test]
fn preserves_executable_permission_when_packaging_unix() -> TestResult {
    let fixture = Fixture::new()?;
    fs::write(&fixture.binary, support::binaries::linux(62, false)?)?;
    assert!(fixture.run(LINUX_X64)?.status.success());
    let path = fixture
        .output(LINUX_X64)
        .join(format!("plugins/oh-my-zcode/{VERSION}/plugin.zip"));
    let mut archive = zip::ZipArchive::new(fs::File::open(path)?)?;
    let binary = archive.by_name("oh-my-zcode/bin/oh-my-zcode")?;
    assert_eq!(binary.unix_mode().map(|mode| mode & 0o777), Some(0o755));
    Ok(())
}

#[test]
fn binds_marketplace_to_exact_archive_when_packaging() -> TestResult {
    let fixture = Fixture::new()?;
    assert!(fixture.run(WINDOWS)?.status.success());
    let output = fixture.output(WINDOWS);
    let market: Marketplace = serde_json::from_slice(&fs::read(output.join("marketplace.json"))?)?;
    let plugin = market.plugins.first().ok_or("missing plugin")?;
    let bytes = fs::read(output.join(format!("plugins/oh-my-zcode/{VERSION}/plugin.zip")))?;
    assert_eq!(plugin.source.sha256, hex::encode(Sha256::digest(bytes)));
    assert_eq!(plugin.version, VERSION);
    assert_eq!(plugin.source.path, "oh-my-zcode");
    assert_eq!(
        plugin.source.url,
        format!(
            "https://downloads.example.com/releases/{VERSION}/x86_64-pc-windows-msvc/plugins/oh-my-zcode/{VERSION}/plugin.zip"
        )
    );
    Ok(())
}

#[test]
fn rejects_changed_bytes_when_version_already_packaged() -> TestResult {
    let fixture = Fixture::new()?;
    assert!(fixture.run(WINDOWS)?.status.success());
    let archive = fixture
        .output(WINDOWS)
        .join(format!("plugins/oh-my-zcode/{VERSION}/plugin.zip"));
    let original = fs::read(&archive)?;
    fs::write(fixture.plugin.join("README.md"), b"changed asset")?;
    assert!(!fixture.run(WINDOWS)?.status.success());
    assert_eq!(fs::read(archive)?, original);
    Ok(())
}

#[test]
fn repeats_identically_when_source_and_binary_are_unchanged() -> TestResult {
    let fixture = Fixture::new()?;
    assert!(fixture.run(WINDOWS)?.status.success());
    let path = fixture
        .output(WINDOWS)
        .join(format!("plugins/oh-my-zcode/{VERSION}/plugin.zip"));
    let original = fs::read(&path)?;
    assert!(fixture.run(WINDOWS)?.status.success());
    assert_eq!(fs::read(path)?, original);
    Ok(())
}

#[test]
fn restores_missing_checksum_when_identical_package_is_resumed() -> TestResult {
    let fixture = Fixture::new()?;
    assert!(fixture.run(WINDOWS)?.status.success());
    let output = fixture.output(WINDOWS);
    let archive = output.join(format!("plugins/oh-my-zcode/{VERSION}/plugin.zip"));
    let checksum = output.join("SHA256SUMS");
    let original_archive = fs::read(&archive)?;
    let original_modified = fs::metadata(&archive)?.modified()?;
    let original_checksum = fs::read(&checksum)?;
    fs::remove_file(&checksum)?;

    let resumed = fixture.run(WINDOWS)?;

    assert!(
        resumed.status.success(),
        "{}",
        String::from_utf8_lossy(&resumed.stderr)
    );
    assert_eq!(fs::read(&checksum)?, original_checksum);
    assert_eq!(fs::read(&archive)?, original_archive);
    assert_eq!(fs::metadata(&archive)?.modified()?, original_modified);
    Ok(())
}

#[test]
fn rejects_unsupported_target_before_emitting_archive() -> TestResult {
    let fixture = Fixture::new()?;
    assert!(!fixture.run("../../other")?.status.success());
    assert!(!fixture.directory.path().join("dist").exists());
    Ok(())
}

#[test]
fn rejects_renamed_text_when_used_as_runtime_binary() -> TestResult {
    let fixture = Fixture::new()?;
    fs::write(&fixture.binary, b"not a native executable")?;
    assert!(!fixture.run(WINDOWS)?.status.success());
    Ok(())
}

#[test]
fn rejects_wrong_architecture_when_target_label_is_arm64() -> TestResult {
    let fixture = Fixture::new()?;
    fs::write(&fixture.binary, support::binaries::linux(62, false)?)?;
    assert!(!fixture.run("aarch64-unknown-linux-musl")?.status.success());
    Ok(())
}

#[test]
fn rejects_dynamic_interpreter_when_target_requires_static_musl() -> TestResult {
    let fixture = Fixture::new()?;
    fs::write(&fixture.binary, support::binaries::linux(62, true)?)?;
    assert!(!fixture.run(LINUX_X64)?.status.success());
    Ok(())
}

#[test]
fn accepts_matching_arm64_linux_and_macos_headers() -> TestResult {
    let fixture = Fixture::new()?;
    fs::write(&fixture.binary, support::binaries::linux(183, false)?)?;
    assert!(fixture.run("aarch64-unknown-linux-musl")?.status.success());
    fs::write(&fixture.binary, support::binaries::macos(0x0100_000c)?)?;
    assert!(fixture.run("aarch64-apple-darwin")?.status.success());
    Ok(())
}

#[test]
fn rejects_missing_entry_point_when_executable_header_is_present() -> TestResult {
    let fixture = Fixture::new()?;
    let mut bytes = support::binaries::linux(62, false)?;
    bytes
        .get_mut(24..32)
        .ok_or("missing ELF entry field")?
        .fill(0);
    fs::write(&fixture.binary, bytes)?;
    assert!(!fixture.run(LINUX_X64)?.status.success());
    Ok(())
}
