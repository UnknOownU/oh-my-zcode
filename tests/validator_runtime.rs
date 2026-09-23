use std::{fs, path::Path};

use oh_my_zcode::validator::validate;
use serde_json::Value;
use tempfile::TempDir;

const LAUNCHER: &str = "${ZCODE_PLUGIN_ROOT}/bin/launch.mjs";
const PAYLOADS: &[&str] = &[
    "bin/x86_64-pc-windows-msvc/oh-my-zcode.exe",
    "bin/x86_64-apple-darwin/oh-my-zcode",
    "bin/aarch64-apple-darwin/oh-my-zcode",
    "bin/x86_64-unknown-linux-musl/oh-my-zcode",
    "bin/aarch64-unknown-linux-musl/oh-my-zcode",
];

fn copy_tree(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        if ["node_modules", "bin", ".oh-my-zcode"]
            .iter()
            .any(|skip| entry.file_name() == *skip)
        {
            continue;
        }
        if entry.file_type()?.is_dir() {
            copy_tree(&entry.path(), &destination.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), destination.join(entry.file_name()))?;
        }
    }
    Ok(())
}

fn rewrite_runtime(value: &mut Value) -> std::io::Result<()> {
    match value {
        Value::Array(values) => {
            for value in values {
                rewrite_runtime(value)?;
            }
        }
        Value::Object(object) => {
            if object.get("command").and_then(Value::as_str)
                == Some("${ZCODE_PLUGIN_ROOT}/bin/oh-my-zcode")
            {
                object.insert("command".to_owned(), Value::String("node".to_owned()));
                let args = object
                    .get_mut("args")
                    .and_then(Value::as_array_mut)
                    .ok_or_else(|| std::io::Error::other("native invocation args missing"))?;
                args.insert(0, Value::String(LAUNCHER.to_owned()));
            }
            for value in object.values_mut() {
                rewrite_runtime(value)?;
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {}
    }
    Ok(())
}

fn universal_fixture() -> Result<TempDir, Box<dyn std::error::Error>> {
    let temp = TempDir::new()?;
    copy_tree(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("plugin"),
        temp.path(),
    )?;
    for relative in [".zcode-plugin/plugin.json", "hooks/hooks.json"] {
        let path = temp.path().join(relative);
        let mut document: Value = serde_json::from_str(&fs::read_to_string(&path)?)?;
        rewrite_runtime(&mut document)?;
        fs::write(path, serde_json::to_vec(&document)?)?;
    }
    let launcher = temp.path().join("bin/launch.mjs");
    fs::create_dir_all(temp.path().join("bin"))?;
    fs::write(launcher, "// fixture launcher\n")?;
    Ok(temp)
}

fn write_payloads(root: &Path) -> std::io::Result<()> {
    for relative in PAYLOADS {
        let path = root.join(relative);
        let parent = path
            .parent()
            .ok_or_else(|| std::io::Error::other("payload parent missing"))?;
        fs::create_dir_all(parent)?;
        fs::write(path, [0xff, 0xfe, 0])?;
    }
    Ok(())
}

#[test]
fn source_validation_accepts_exact_universal_runtime() -> Result<(), Box<dyn std::error::Error>> {
    // Given the official node launcher invocation without packaged payloads.
    let temp = universal_fixture()?;
    // When source validation runs.
    let report = validate(temp.path(), false)?;
    // Then the universal source contract is valid before packaging.
    assert!(report.is_valid(), "{report}");
    Ok(())
}

#[test]
fn packaged_universal_runtime_accepts_all_five_payloads() -> Result<(), Box<dyn std::error::Error>>
{
    // Given a universal package with its launcher and every supported target.
    let temp = universal_fixture()?;
    write_payloads(temp.path())?;
    // When packaged validation runs.
    let report = validate(temp.path(), true)?;
    // Then binary bytes are accepted without being decoded as text.
    assert!(report.is_valid(), "{report}");
    Ok(())
}

#[test]
fn packaged_universal_runtime_requires_each_payload() -> Result<(), Box<dyn std::error::Error>> {
    for missing in PAYLOADS {
        // Given an otherwise complete universal package missing one target payload.
        let temp = universal_fixture()?;
        write_payloads(temp.path())?;
        fs::remove_file(temp.path().join(missing))?;
        // When packaged validation runs.
        let report = validate(temp.path(), true)?;
        // Then the exact omitted target is reported.
        assert!(
            report.errors.iter().any(|error| error.contains(missing)),
            "missing {missing} was not reported: {report}"
        );
    }
    Ok(())
}

#[test]
fn universal_runtime_rejects_arbitrary_node_script() -> Result<(), Box<dyn std::error::Error>> {
    // Given a real but untrusted script substituted for the launcher.
    let temp = universal_fixture()?;
    fs::write(temp.path().join("bin/other.mjs"), "// other\n")?;
    let manifest_path = temp.path().join(".zcode-plugin/plugin.json");
    let manifest =
        fs::read_to_string(&manifest_path)?.replace(LAUNCHER, "${ZCODE_PLUGIN_ROOT}/bin/other.mjs");
    fs::write(manifest_path, manifest)?;
    // When source validation runs.
    let report = validate(temp.path(), false)?;
    // Then only the official launcher shape is accepted.
    assert!(
        report
            .errors
            .iter()
            .any(|error| error.contains("mcpServers.scope")),
        "arbitrary node script was accepted: {report}"
    );
    Ok(())
}

#[test]
fn universal_runtime_rejects_argument_substitution() -> Result<(), Box<dyn std::error::Error>> {
    // Given the launcher after, rather than before, the native arguments.
    let temp = universal_fixture()?;
    let manifest_path = temp.path().join(".zcode-plugin/plugin.json");
    let mut manifest: Value = serde_json::from_str(&fs::read_to_string(&manifest_path)?)?;
    let args = manifest
        .pointer_mut("/mcpServers/scope/args")
        .ok_or_else(|| std::io::Error::other("scope args missing"))?;
    *args = serde_json::json!(["scope-mcp", LAUNCHER]);
    fs::write(manifest_path, serde_json::to_vec(&manifest)?)?;
    // When source validation runs.
    let report = validate(temp.path(), false)?;
    // Then argument position is part of the strict runtime contract.
    assert!(!report.is_valid(), "substituted arguments were accepted");
    Ok(())
}

#[test]
fn hooks_must_match_the_manifest_runtime() -> Result<(), Box<dyn std::error::Error>> {
    // Given a universal manifest with one hook changed back to the native command.
    let temp = universal_fixture()?;
    let hooks_path = temp.path().join("hooks/hooks.json");
    let mut hooks: Value = serde_json::from_str(&fs::read_to_string(&hooks_path)?)?;
    let hook = hooks
        .pointer_mut("/hooks/SessionStart/0/hooks/0")
        .ok_or_else(|| std::io::Error::other("session-start hook missing"))?;
    let command = hook
        .get_mut("command")
        .ok_or_else(|| std::io::Error::other("session-start command missing"))?;
    *command = Value::String("${ZCODE_PLUGIN_ROOT}/bin/oh-my-zcode".to_owned());
    let args = hook
        .get_mut("args")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| std::io::Error::other("session-start args missing"))?;
    if args.is_empty() {
        return Err(std::io::Error::other("session-start args empty").into());
    }
    args.remove(0);
    fs::write(hooks_path, serde_json::to_vec(&hooks)?)?;
    // When source validation runs.
    let report = validate(temp.path(), false)?;
    // Then mixed runtime shapes are rejected.
    assert!(
        report
            .errors
            .iter()
            .any(|error| error.contains("manifest runtime")),
        "mixed native and universal runtime was accepted: {report}"
    );
    Ok(())
}
