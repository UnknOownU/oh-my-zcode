use oh_my_zcode::hook;
use proptest::prelude::*;
use serde_json::json;

fn scope(command: &str) -> Result<Option<String>, Box<dyn std::error::Error>> {
    let workspace = tempfile::tempdir()?;
    let input = json!({"session_id":"scope-test","cwd":workspace.path(),
        "tool_input":{"command":command}});
    Ok(hook::run("scope", &serde_json::to_vec(&input)?)?)
}

#[test]
fn blocks_attack_command_positions_when_scope_is_absent() {
    // Given shell command positions, quoted concatenation, wrappers and nested execution.
    let commands = [
        "nuclei -u https://x.test",
        "nucl\"ei\" -u https://x.test",
        "sudo -u root nuclei",
        "env -u VAR nuclei",
        "nice -n 5 nuclei",
        "echo x | nuclei",
        "echo $(nuclei)",
        "echo \"$(nuclei)\"",
        "echo `nuclei`",
        "bash -c 'nuclei'",
        "powershell -Command \"nuclei\"",
        "cmd /c nuclei",
        "FOO=1 /usr/bin/nuclei",
        "nuclei ${",
        "echo ${FALLBACK:-$(nuclei)}",
        "env -S 'nuclei -u https://x.test'",
        "2>log.txt nuclei",
        "echo x; nuclei",
        "eval 'nuclei'",
        "$TOOL args",
        "sudo -Eu root nuclei",
        "xargs -rn 2 nuclei",
        "env -iS 'nuclei'",
        "C:\\tools\\NUCLEI.EXE",
        "\"C:\\tools\\nuclei.exe\"",
    ];
    for command in commands {
        // When the scope hook sees the command.
        let output = scope(command).expect("scope hook");
        // Then it denies execution, independent of spelling or wrapping.
        assert!(
            output.is_some_and(|text| text.contains("\"decision\":\"block\"")),
            "{command}"
        );
    }
}

#[test]
fn allows_inert_attack_names_when_scope_is_absent() {
    // Given names appearing as data or comments rather than executable positions.
    for command in [
        "grep nuclei README.md",
        "cat file | grep nuclei",
        "# nuclei",
        "command -v nuclei",
        "command -V nuclei",
        "sudo -u root grep nuclei README.md",
    ] {
        // When the command is checked.
        let output = scope(command).expect("scope hook");
        // Then ordinary development is unaffected.
        assert!(output.is_none(), "{command}: {output:?}");
    }
}

#[test]
fn denies_attack_when_scope_path_cannot_be_read() {
    let workspace = tempfile::tempdir().expect("workspace");
    std::fs::create_dir_all(
        workspace
            .path()
            .join(".oh-my-zcode/security/active_scope.json"),
    )
    .expect("unreadable scope");
    let input = json!({"session_id":"session","cwd":workspace.path(),
        "tool_input":{"command":"nuclei"}});
    let output =
        hook::run("scope", &serde_json::to_vec(&input).expect("input")).expect("hook output");
    assert!(output.is_some_and(|text| text.contains("\"decision\":\"block\"")));
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(32))]

    #[test]
    fn quoted_word_fragments_cannot_hide_attack_tool(tool in prop::sample::select(vec!["nuclei", "nmap", "semgrep", "ffuf"]), split in 0_usize..12) {
        let split = split % (tool.len() + 1);
        let (left, right) = tool.split_at(split);
        let command = format!("'{left}'\"{right}\"");
        prop_assert!(scope(&command).expect("scope hook").is_some());
    }
}
