use crate::support::{Fixture, LINUX_ARM64, MACOS_X64, TARGETS, TestResult, VERSION};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, io::Read, path::Path};

#[derive(Deserialize)]
struct Marketplace {
    name: String,
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
    description_i18n: BTreeMap<String, String>,
    #[serde(rename = "mcpServers")]
    servers: BTreeMap<String, Server>,
}

#[derive(Deserialize)]
struct Server {
    command: Option<String>,
    args: Option<Vec<String>>,
}

fn assert_archive(path: &Path) -> TestResult {
    let mut archive = zip::ZipArchive::new(fs::File::open(path)?)?;
    assert_runtime_entries(&mut archive)?;
    let mut raw = String::new();
    archive
        .by_name("oh-my-zcode/.zcode-plugin/plugin.json")?
        .read_to_string(&mut raw)?;
    let manifest: Manifest = serde_json::from_str(&raw)?;
    assert_eq!(
        manifest.description_i18n.get("en").map(String::as_str),
        Some("fixture")
    );
    assert_eq!(
        manifest.description_i18n.get("zh-CN").map(String::as_str),
        Some("fixture zh")
    );
    let scope = manifest.servers.get("scope").ok_or("missing scope")?;
    assert_eq!(scope.command.as_deref(), Some("node"));
    assert_eq!(
        scope.args.as_deref(),
        Some(
            ["${ZCODE_PLUGIN_ROOT}/bin/launch.mjs", "scope-mcp"]
                .map(str::to_owned)
                .as_slice()
        )
    );
    Ok(())
}

fn assert_runtime_entries(archive: &mut zip::ZipArchive<fs::File>) -> TestResult {
    let names: Vec<_> = archive.file_names().map(str::to_owned).collect();
    for (target, executable) in TARGETS {
        let name = format!("oh-my-zcode/bin/{target}/{executable}");
        assert!(names.contains(&name), "missing {name}");
        let binary = archive.by_name(&name)?;
        assert_eq!(binary.unix_mode().map(|mode| mode & 0o777), Some(0o755));
    }
    assert!(names.contains(&"oh-my-zcode/bin/launch.mjs".to_owned()));
    assert!(names.contains(&"oh-my-zcode/README_CN.md".to_owned()));
    let scripts: Vec<_> = names
        .iter()
        .filter(|name| {
            Path::new(name.as_str())
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("mjs"))
        })
        .collect();
    assert_eq!(scripts, ["oh-my-zcode/bin/launch.mjs"]);
    Ok(())
}

fn assert_marketplace(fixture: &Fixture, archive: &[u8]) -> TestResult {
    let marketplace: Marketplace = serde_json::from_slice(&fs::read(
        fixture.universal_output().join("marketplace.json"),
    )?)?;
    assert_eq!(marketplace.name, "unknoownu");
    let plugin = marketplace.plugins.first().ok_or("missing plugin")?;
    assert_eq!(plugin.version, VERSION);
    assert_eq!(plugin.source.path, "oh-my-zcode");
    assert_eq!(plugin.source.sha256, hex::encode(Sha256::digest(archive)));
    assert_eq!(
        plugin.source.url,
        format!(
            "https://downloads.example.com/releases/{VERSION}/universal/plugins/oh-my-zcode/{VERSION}/plugin.zip"
        )
    );
    Ok(())
}

#[test]
fn builds_one_deterministic_archive_with_all_supported_runtimes() -> TestResult {
    let fixture = Fixture::new()?;
    let output = fixture.run_universal()?;
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let archive_path = fixture.universal_archive();
    let original = fs::read(&archive_path)?;
    assert_archive(&archive_path)?;
    assert_marketplace(&fixture, &original)?;
    assert!(fixture.run_universal()?.status.success());
    assert_eq!(fs::read(archive_path)?, original);
    Ok(())
}

#[test]
fn rejects_missing_runtime_before_publishing_universal_output() -> TestResult {
    let fixture = Fixture::new()?;
    fs::remove_file(fixture.binaries.join(MACOS_X64).join("oh-my-zcode"))?;

    let output = fixture.run_universal()?;
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains(MACOS_X64));
    assert!(!fixture.universal_output().exists());
    Ok(())
}

#[test]
fn rejects_malformed_runtime_before_publishing_universal_output() -> TestResult {
    let fixture = Fixture::new()?;
    fs::write(
        fixture.binaries.join(MACOS_X64).join("oh-my-zcode"),
        b"renamed text is not an executable",
    )?;

    let output = fixture.run_universal()?;
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains(MACOS_X64));
    assert!(!fixture.universal_output().exists());
    Ok(())
}

#[test]
fn rejects_runtime_with_wrong_architecture_before_publishing() -> TestResult {
    let fixture = Fixture::new()?;
    fs::write(
        fixture.binaries.join(LINUX_ARM64).join("oh-my-zcode"),
        crate::support::binaries::linux(62, false)?,
    )?;

    let output = fixture.run_universal()?;
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains(LINUX_ARM64));
    assert!(!fixture.universal_output().exists());
    Ok(())
}

#[test]
fn rejects_changed_universal_bytes_for_an_existing_version() -> TestResult {
    let fixture = Fixture::new()?;
    assert!(fixture.run_universal()?.status.success());
    let archive = fixture.universal_archive();
    let original = fs::read(&archive)?;
    fs::write(fixture.plugin.join("README.md"), b"changed asset")?;

    assert!(!fixture.run_universal()?.status.success());
    assert_eq!(fs::read(archive)?, original);
    Ok(())
}
