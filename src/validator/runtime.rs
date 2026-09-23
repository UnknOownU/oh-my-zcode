use std::path::Path;

use super::{ValidationReport, files};

const LAUNCHER: &str = "${ZCODE_PLUGIN_ROOT}/bin/launch.mjs";
const UNIVERSAL_PAYLOADS: &[&str] = &[
    "bin/x86_64-pc-windows-msvc/oh-my-zcode.exe",
    "bin/x86_64-apple-darwin/oh-my-zcode",
    "bin/aarch64-apple-darwin/oh-my-zcode",
    "bin/x86_64-unknown-linux-musl/oh-my-zcode",
    "bin/aarch64-unknown-linux-musl/oh-my-zcode",
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Runtime {
    Native,
    Universal,
}

pub(super) fn parse(command: &str, args: &[String], native_args: &[&str]) -> Option<Runtime> {
    if files::native_command(command) && exact_args(args, native_args) {
        return Some(Runtime::Native);
    }
    if command == "node" {
        let (launcher, forwarded) = args.split_first()?;
        if launcher == LAUNCHER && exact_args(forwarded, native_args) {
            return Some(Runtime::Universal);
        }
    }
    None
}

pub(super) fn check_package(
    root: &Path,
    selected: Option<Runtime>,
    packaged: bool,
    report: &mut ValidationReport,
) {
    if packaged && selected == Some(Runtime::Universal) {
        files::required_file(root, "bin/launch.mjs", report);
        for payload in UNIVERSAL_PAYLOADS {
            files::required_file(root, payload, report);
        }
    }
}

fn exact_args(args: &[String], expected: &[&str]) -> bool {
    args.iter().map(String::as_str).eq(expected.iter().copied())
}
