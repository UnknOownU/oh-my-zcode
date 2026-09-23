# Rust development

Version **3.0.0** uses a Rust executable for hooks, the scope MCP server, and validation. A native package contains one target's executable; the universal package contains all five plus a dependency-free Node launcher. Markdown and JSON remain the plugin's declarative assets. The checkout is for development and does not contain prebuilt binaries.

Install the Rust toolchain pinned in `rust-toolchain.toml`. Node 22+ runs the development contract suites and the universal launcher. The platform-native packages invoke Rust directly and do not need Node for the first-party runtime.

```sh
cargo build --locked
cargo test --workspace --locked
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo run --locked -- validate plugin
```

The workspace's `xtask quality` command uses Mozilla's AST-based `rust-code-analysis-cli` to limit each production Rust function to cyclomatic complexity 10, cognitive complexity 15, and 50 code lines. Modules are limited to 250 code lines. The report includes source SHA-256 hashes and rejects files changed during analysis. Clippy checks cognitive complexity independently too.

```sh
cargo install rust-code-analysis-cli --version 0.0.25 --locked
cargo run --locked -p xtask -- quality --analyzer rust-code-analysis-cli --root .
cargo deny check
cargo machete
```

## Build an installable package

Build the runtime for the intended machine, then provide that exact binary to the packager. It verifies the PE, Mach-O, or ELF format and CPU architecture using the `object` parser. Linux packages require a static ELF executable with no dynamic interpreter or shared-library dependencies. This metadata check complements the extracted executable smoke test. The packager does not download or compile a replacement binary. For Windows x64:

```sh
cargo build --release --locked --target x86_64-pc-windows-msvc
cargo run --locked -p xtask -- package --target x86_64-pc-windows-msvc --binary target/x86_64-pc-windows-msvc/release/oh-my-zcode.exe --output dist --base-url https://unknoownu.github.io/oh-my-zcode/3.0.0/
cargo run --locked -p xtask -- smoke --target x86_64-pc-windows-msvc --archive dist/x86_64-pc-windows-msvc/plugins/oh-my-zcode/3.0.0/plugin.zip
```

The base URL ends at the **version directory**, not the target directory. The packager appends the target exactly once. Output is `dist/<target>/marketplace.json`, `SHA256SUMS`, and `plugins/oh-my-zcode/3.0.0/plugin.zip`. Publishing is a separate step; a local package command does not upload anything. The marketplace checksum binds installation to the exact ZIP bytes.

## Build the universal package

Collect the five release binaries from the same source version under `binaries/<target>/oh-my-zcode` (`oh-my-zcode.exe` for Windows). Targets are `x86_64-pc-windows-msvc`, `x86_64-apple-darwin`, `aarch64-apple-darwin`, `x86_64-unknown-linux-musl`, and `aarch64-unknown-linux-musl`.

```sh
cargo run --locked -p xtask -- universal --binaries binaries --output dist --base-url https://unknoownu.github.io/oh-my-zcode/3.0.0/
cargo run --locked -p xtask -- smoke --universal --target x86_64-pc-windows-msvc --archive dist/universal/plugins/oh-my-zcode/3.0.0/plugin.zip
```

The second command requires Node 22+ and must use the target of the machine executing it. The output marketplace is `dist/universal/marketplace.json`. Both package forms identify the plugin as `oh-my-zcode`; universal launch declarations use `node`, `${ZCODE_PLUGIN_ROOT}/bin/launch.mjs`, then the native command arguments. Native packaging rewrites these to direct executable invocations.

The archive has stable entry ordering, fixed timestamps, and explicit file permissions. The Unix executable has mode `0755`. Repeating a package command with unchanged inputs gives identical archive bytes. The local packager refuses to overwrite different bytes at the same output path. Each output file is fully written and synced before publication; the marketplace is written last. Choose a fresh output directory for each changed build. The explicitly requested 3.0.0 repair replaces the published distributions only after all checks pass.

The executable metadata check proves format, architecture, an entry point, and Linux static linkage. It cannot prove which libc produced a static binary; the locked CI build with its explicit Rust musl target provides that provenance. Runnable behavior is established separately by executing the exact extracted archive.

Only plugin assets, the selected native binary or five universal binaries, and Codegraph's dependency manifests are packaged. The universal package additionally contains the explicitly allowed launcher. Local session evidence, development tools, `node_modules`, and unrelated JavaScript are not release assets. The English and Chinese READMEs ship together.

## Verification and CI

The CI matrix builds and tests on each supported architecture, extracts each native ZIP, and drives its executable through the hook, MCP, and validator interfaces. Universal assembly combines those binaries into one archive; the same universal archive is then exercised on all five native runners through its launcher. Publication must wait for quality checks and both smoke matrices.

Pages publishes JSON endpoints and exact archive bytes from the complete, verified release artifact set. It does not rebuild binaries or restore the obsolete publication layout. The root `marketplace.json` selects the universal package; `latest/<target>/marketplace.json` selects an active native package. Each catalog carries the checksum of its exact ZIP. The 3.0.0 correction requires reinstalling existing copies because its version number is unchanged.

The official ZAI marketplace builds its own ZIP from the submitted plugin tree and currently sets all ZIP member permissions to `0644`. The universal launcher restores owner-execute on the selected Unix binary, so testing the official builder's output is required as well as testing the native packager's output.

Always test the extracted executable before publishing. A source build passing tests does not establish that a packaged binary or its rewritten manifests work. Record the archive SHA-256 with the verification result.

See [distribution and installation](../plugin/docs/distribution.md) for target selection and optional external tools.
