# Rust development

Version **3.0.0** uses one native executable for hooks, the scope MCP server, and plugin validation. Markdown and JSON remain the plugin's declarative assets. The source checkout is a development workspace; users install a platform package.

Install the Rust toolchain pinned in `rust-toolchain.toml`. Node is a development dependency for the black-box contract suites. It is not required by the first-party runtime.

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
cargo run --locked -p xtask -- package --target x86_64-pc-windows-msvc --binary target/x86_64-pc-windows-msvc/release/oh-my-zcode.exe --output dist --base-url https://downloads.example.com/oh-my-zcode/v3.0.0/
cargo run --locked -p xtask -- smoke --target x86_64-pc-windows-msvc --archive dist/x86_64-pc-windows-msvc/plugins/oh-my-zcode/3.0.0/plugin.zip
```

Use a real HTTPS distribution URL when publishing; the example host is only suitable for a local build. The output is `dist/<target>/marketplace.json`, `SHA256SUMS`, and `plugins/oh-my-zcode/3.0.0/plugin.zip`. The marketplace checksum binds installation to the exact ZIP bytes. Upload the complete directory tree to the same base URL used while packaging.

The archive has stable entry ordering, fixed timestamps, and explicit file permissions. The Unix executable has mode `0755`. Repeating a package command with unchanged inputs gives identical archive bytes. A different artifact cannot overwrite an existing version at the same output path. Each output file is fully written and synced before atomic publication without replacement; the marketplace is published last. An interrupted generation can be resumed with identical inputs. For an unpublished development rebuild, choose a fresh output directory; published versions must remain immutable.

The executable metadata check proves format, architecture, an entry point, and Linux static linkage. It cannot prove which libc produced a static binary; the locked CI build with its explicit Rust musl target provides that provenance. Runnable behavior is established separately by executing the exact extracted archive.

Only plugin assets, the selected binary, and Codegraph's dependency manifests are packaged. Local session evidence, development tools, `node_modules`, and first-party JavaScript are not release assets.

## Verification and CI

The CI matrix builds and tests on each supported architecture, extracts each generated ZIP, and drives its executable through the hook, MCP, and validator interfaces. Artifact upload preserves the generated distribution tree. This workflow does not publish a marketplace or create a release.

Always test the extracted executable before publishing. A source build passing tests does not establish that a packaged binary or its rewritten manifests work. Record the archive SHA-256 with the verification result.

See [distribution and installation](../plugin/docs/distribution.md) for target selection and optional external tools.
