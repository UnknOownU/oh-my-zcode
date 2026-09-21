use std::{fs, path::Path};

use oh_my_zcode::validator::validate;
use tempfile::TempDir;

fn write(root: &Path, relative: &str, content: &str) -> std::io::Result<()> {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content)
}

fn fixture() -> Result<TempDir, Box<dyn std::error::Error>> {
    let temp = TempDir::new()?;
    write(
        temp.path(),
        ".zcode-plugin/plugin.json",
        r#"{
      "name":"oh-my-zcode", "version":"3.0.0", "description":"Test plugin",
      "agents":"agents", "commands":"commands", "skills":"skills",
      "mcpServers":{
        "scope":{"type":"stdio","command":"${ZCODE_PLUGIN_ROOT}/bin/oh-my-zcode","args":["scope-mcp"]},
        "semgrep":{"type":"stdio","command":"semgrep","args":["mcp"]},
        "osv-scanner":{"type":"stdio","command":"osv-scanner","args":["experimental-mcp"]},
        "grep":{"type":"http","url":"https://mcp.grep.app"},
        "codegraph":{"type":"stdio","command":"node","args":["${ZCODE_PLUGIN_ROOT}/vendor/codegraph/node_modules/@colbymchenry/codegraph/npm-shim.js","serve","--mcp"]}
      }}"#,
    )?;
    write(
        temp.path(),
        "hooks/hooks.json",
        r#"{"hooks":{
      "SessionStart":[{"matcher":"startup|clear|compact","hooks":[{"type":"process","command":"${ZCODE_PLUGIN_ROOT}/bin/oh-my-zcode","args":["hook","session_start"],"timeoutMs":5000}]}],
      "PreToolUse":[{"matcher":"Bash","hooks":[{"type":"process","command":"${ZCODE_PLUGIN_ROOT}/bin/oh-my-zcode","args":["hook","scope"],"timeoutMs":5000},{"type":"process","command":"${ZCODE_PLUGIN_ROOT}/bin/oh-my-zcode","args":["hook","proof_start"],"timeoutMs":5000}]},{"matcher":"Agent|Task","hooks":[{"type":"process","command":"${ZCODE_PLUGIN_ROOT}/bin/oh-my-zcode","args":["hook","dispatch"],"timeoutMs":5000}]}],
      "PostToolUse":[{"matcher":"Bash","hooks":[{"type":"process","command":"${ZCODE_PLUGIN_ROOT}/bin/oh-my-zcode","args":["hook","evidence"],"timeoutMs":5000}]},{"matcher":"WebFetch|WebSearch|webReader|webSearchPrime|web_reader|web_search_prime","hooks":[{"type":"process","command":"${ZCODE_PLUGIN_ROOT}/bin/oh-my-zcode","args":["hook","sources"],"timeoutMs":5000}]}],
      "PostToolUseFailure":[{"matcher":"Bash","hooks":[{"type":"process","command":"${ZCODE_PLUGIN_ROOT}/bin/oh-my-zcode","args":["hook","evidence_failure"],"timeoutMs":5000}]}],
      "Stop":[{"hooks":[{"type":"process","command":"${ZCODE_PLUGIN_ROOT}/bin/oh-my-zcode","args":["hook","stop"],"timeoutMs":8000}]}]
    }}"#,
    )?;
    write(
        temp.path(),
        "agents/ohmy-builder.md",
        "---\nname: ohmy-builder\ndescription: |\n  Builds tested artifacts.\n  Keeps evidence.\nmodel: account:test/GLM-5.3\nthoughtLevel: max\nmaxTurns: 40\n---\nBody\n",
    )?;
    write(
        temp.path(),
        "commands/build.md",
        "---\ndescription: Build\n---\nBody\n",
    )?;
    write(
        temp.path(),
        "skills/build/SKILL.md",
        "---\nname: build\ndescription: Build\n---\nBody\n",
    )?;
    write(
        temp.path(),
        "README.md",
        "| | Agent | Role | Model / Effort |\n|---|---|---|---|\n| B | `ohmy-builder` | builds | `glm-5.3` / max |\n",
    )?;
    Ok(temp)
}

#[test]
fn source_validation_accepts_multiline_yaml_and_compares_picker_model_ids()
-> Result<(), Box<dyn std::error::Error>> {
    // Given a source tree without compiled binaries and a full model picker identifier.
    let temp = fixture()?;
    // When the source tree is validated.
    let report = validate(temp.path(), false)?;
    // Then semantic routing agrees without requiring generated native artifacts.
    assert!(report.is_valid(), "{report}");
    Ok(())
}

#[test]
fn package_validation_rejects_missing_native_executable() -> Result<(), Box<dyn std::error::Error>>
{
    // Given a package whose runtime binary was omitted.
    let temp = fixture()?;
    // When package validation runs.
    let report = validate(temp.path(), true)?;
    // Then the missing binary fails the package contract.
    assert!(!report.is_valid());
    assert!(
        report
            .errors
            .iter()
            .any(|error| error.contains("bin/oh-my-zcode"))
    );
    Ok(())
}

#[test]
fn agent_validation_rejects_duplicate_yaml_keys() -> Result<(), Box<dyn std::error::Error>> {
    // Given ambiguous model routing in a duplicate YAML field.
    let temp = fixture()?;
    write(
        temp.path(),
        "agents/ohmy-builder.md",
        "---\nname: ohmy-builder\ndescription: Build\nmodel: account:test/GLM-5.3\nmodel: account:test/GLM-4.7\n---\n",
    )?;
    // When agent metadata is parsed.
    let report = validate(temp.path(), false)?;
    // Then duplicate fields cannot silently override routing.
    assert!(
        report
            .errors
            .iter()
            .any(|error| error.contains("duplicate field"))
    );
    Ok(())
}

#[test]
fn agent_validation_rejects_bare_model_and_unknown_fields() -> Result<(), Box<dyn std::error::Error>>
{
    // Given unsupported metadata and a model without its provider.
    let temp = fixture()?;
    write(
        temp.path(),
        "agents/ohmy-builder.md",
        "---\nname: ohmy-builder\ndescription: Build\nmodel: glm-5.3\nreasoningEffort: high\n---\n",
    )?;
    // When metadata is validated.
    let report = validate(temp.path(), false)?;
    // Then unknown agent fields fail rather than being silently ignored.
    assert!(
        report
            .errors
            .iter()
            .any(|error| error.contains("unknown field"))
    );
    Ok(())
}

#[test]
fn hooks_reject_async_gating() -> Result<(), Box<dyn std::error::Error>> {
    // Given a Stop hook configured asynchronously.
    let temp = fixture()?;
    let path = temp.path().join("hooks/hooks.json");
    let text = fs::read_to_string(&path)?
        .replace("\"timeoutMs\":8000", "\"timeoutMs\":8000,\"async\":true");
    fs::write(path, text)?;
    // When hooks are validated.
    let report = validate(temp.path(), false)?;
    // Then a hook that cannot block the conclusion is rejected.
    assert!(report.errors.iter().any(|error| error.contains("async")));
    Ok(())
}

#[test]
fn plugin_references_reject_parent_escape() -> Result<(), Box<dyn std::error::Error>> {
    // Given a hook command outside the plugin package.
    let temp = fixture()?;
    let path = temp.path().join("hooks/hooks.json");
    let text = fs::read_to_string(&path)?.replace("/bin/oh-my-zcode", "/../outside");
    fs::write(path, text)?;
    // When plugin references are checked.
    let report = validate(temp.path(), false)?;
    // Then path traversal is not accepted as a local dependency.
    assert!(report.errors.iter().any(|error| error.contains("escapes")));
    Ok(())
}

#[test]
fn validation_does_not_mutate_version_stamp() -> Result<(), Box<dyn std::error::Error>> {
    // Given an obsolete stamp belonging to an earlier validator.
    let temp = fixture()?;
    let plugin = temp.path().join("oh-my-zcode");
    fs::create_dir(&plugin)?;
    for entry in fs::read_dir(temp.path())? {
        let entry = entry?;
        if entry.path() != plugin {
            fs::rename(entry.path(), plugin.join(entry.file_name()))?;
        }
    }
    let stamp = temp.path().join(".version-stamp.json");
    write(temp.path(), ".version-stamp.json", "unchanged")?;
    let stamp_before = fs::metadata(&stamp)?.modified()?;
    // When current validation runs.
    let report = validate(&plugin, false)?;
    // Then validation remains read-only and the development version is unchanged.
    assert!(report.is_valid(), "{report}");
    assert_eq!(fs::read_to_string(&stamp)?, "unchanged");
    assert_eq!(fs::metadata(&stamp)?.modified()?, stamp_before);
    Ok(())
}

#[test]
fn obsolete_javascript_hook_is_rejected() -> Result<(), Box<dyn std::error::Error>> {
    let temp = fixture()?;
    let path = temp.path().join("hooks/hooks.json");
    let text = fs::read_to_string(&path)?.replace("${ZCODE_PLUGIN_ROOT}/bin/oh-my-zcode", "node");
    fs::write(path, text)?;
    let report = validate(temp.path(), false)?;
    assert!(!report.is_valid());
    Ok(())
}

#[test]
fn unsupported_native_handler_is_rejected() -> Result<(), Box<dyn std::error::Error>> {
    let temp = fixture()?;
    let path = temp.path().join("hooks/hooks.json");
    let text = fs::read_to_string(&path)?.replace("session_start", "unknown_handler");
    fs::write(path, text)?;
    let report = validate(temp.path(), false)?;
    assert!(!report.is_valid());
    Ok(())
}

#[test]
fn documented_model_drift_is_rejected() -> Result<(), Box<dyn std::error::Error>> {
    let temp = fixture()?;
    let path = temp.path().join("README.md");
    let text = fs::read_to_string(&path)?.replace("glm-5.3", "glm-4.7");
    fs::write(path, text)?;
    let report = validate(temp.path(), false)?;
    assert!(
        report
            .errors
            .iter()
            .any(|error| error.contains("routing drift"))
    );
    Ok(())
}

#[test]
fn native_executable_bytes_are_not_treated_as_utf8_content()
-> Result<(), Box<dyn std::error::Error>> {
    let temp = fixture()?;
    fs::create_dir(temp.path().join("bin"))?;
    fs::write(temp.path().join("bin/oh-my-zcode"), [0xff, 0xfe, 0])?;
    let report = validate(temp.path(), true)?;
    assert!(report.is_valid(), "{report}");
    Ok(())
}
