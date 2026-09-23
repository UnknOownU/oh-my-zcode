# PROJECT KNOWLEDGE BASE

**Generated:** 2026-09-23
**Commit:** 5b4b74cf
**Branch:** codex/install-universal-marketplace

## OVERVIEW
Evidence-gated pipeline plugin for ZCode ("BetterZcode"): 17 sealed agents, 6 commands, 4 mechanical gates (proof, sources, security/scope, stop). Rust workspace (edition 2024, toolchain 1.96.0) + markdown plugin assets + Node contract tests at root + uv-managed Python publish pipeline.

## STRUCTURE
```
./
├── src/        # Rust runtime: hook gates, scope MCP server, proof engine, plugin validator
├── plugin/     # shipped plugin assets: manifest, hooks wiring, launcher, agents/commands/skills/docs
├── xtask/      # packaging & quality crate (package/universal/smoke/quality)
├── tests/      # cargo integration tests against the lib (per module)
├── scripts/    # uv Python: Pages marketplace assembly + verification
├── docs/       # rust-development.md — the dev command guide (single file)
├── test_*.mjs  # Node contract suites: spawn the compiled binary (10 files)
└── marketplace.json  # source marketplace entry → ./plugin
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Change gate/hook behavior | `src/hook/` | dispatch in `src/hook.rs`; wire events in `plugin/hooks/hooks.json` |
| Proof/receipt logic | `src/proof/` | pairing + snapshot invariants in `test_proof_gate*.mjs` |
| Scope model & MCP server | `src/scope/`, `src/mcp/` | |
| Plugin tree validation | `src/validator/` | run via `cargo run --locked -- validate plugin` |
| Agents / commands / skills | `plugin/{agents,commands,skills}/` | markdown prompt assets |
| Packaging & smoke | `xtask/src/` | per-target archives; `smoke` exercises the shipped runtime |
| Release/Pages pipeline | `scripts/*.py` + `.github/workflows/pages.yml` | uv-managed |
| CI | `.github/workflows/native.yml` | quality → package matrix → universal → smokes → publish |
| Dev commands | `docs/rust-development.md` | canonical list, matches CI |

## CODE MAP
Refs measured via rust-analyzer (LSP) or ripgrep counts across src/xtask/tests.

| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|
| `hook::run` | fn | src/hook.rs:54 | ~10 | sole hook entry; dispatches all 8 lifecycle events |
| `HookError` | enum | src/hook.rs:17 | 41 | error union threading through hook submodules |
| `security::{scope, dispatch}` | fn | src/hook/security.rs:57,133 | ~21 | PreToolUse gates: Bash scope + agent dispatch confinement |
| `shell::analyze` | fn | src/hook/shell.rs:19 | ~15 | parses shell into invocations; detects wrapper attacks |
| `ValidatedScope` | struct | src/scope.rs:59 | 18 | authorization grant: targets/env/expiry; `permits_host/url` |
| `read_scope` | fn | src/scope.rs:113 | ~17 | loads/validates scope file; used by hook + MCP + tests |
| `mcp::run` | fn | src/mcp.rs:30 | ~5 | line-delimited JSON-RPC stdio server |
| `mcp::wire::parse` | fn | src/mcp/wire.rs:44 | ~10 | frame parsing; 1 MiB frame cap |
| `ProofContext` | struct | src/proof.rs:21 | 20 | per-tool identity driving receipt lifecycle |
| `ProofError` | enum | src/proof.rs:31 | 63 | most-referenced type in src/ |
| `proof::evaluate` | fn | src/proof/evaluation.rs:93 | ~54 | verifies a Claim against journal + snapshots |
| `proof::Claim`/`Policy` | enum | src/proof/policy.rs:8,60 | ~53 | claim taxonomy; defines what PASS requires |
| `proof::records::{start,finish,fail,close_turn}` | fn | src/proof/records.rs:10-140 | ~17 | receipt lifecycle |
| `proof::Fingerprint` | struct | src/proof/snapshot.rs:26 | in 53 grp | source/artifact fingerprint; unchanged = PASS condition |
| `validator::validate` | fn | src/validator.rs:93 | 34 | validates plugin tree/archive; entry for CLI + 4 test files |
| `workspace::{resolve_read_root, session_key, …}` | fn | src/workspace.rs:10-81 | 39 | root resolution + session keying |
| `launch.mjs` `main()`/`runtimeTarget()` | fn | plugin/bin/launch.mjs:50,14 | 9 sites | Node bridge: picks platform binary, spawns Rust exe |
| `xtask package::run`/`manifests::bake` | fn | xtask/src/package.rs:55, manifests.rs:77 | ~30 | bakes manifests + binary into immutable archive |
| `xtask smoke::run` | fn | xtask/src/smoke.rs:29 | ~9 | re-exercises shipped runtime end-to-end |
| `xtask::Target`/`metrics::check` | enum/fn | xtask/src/target.rs:4, metrics.rs:206 | ~55 | 5 platform triples; complexity gate |

## CONVENTIONS
- Every cargo invocation carries `--locked` (Cargo.lock committed).
- Toolchain pinned 1.96.0 (rustfmt/clippy/rust-analyzer components); edition 2024, resolver 3.
- Clippy `all = deny` + pedantic warn; `unwrap/expect/panic/todo/indexing_slicing` denied outside tests; max_width 100 with LF newlines on Windows too.
- Three test stacks, all blocking in CI: cargo (`tests/` + inline `*_tests.rs`), Node contract suites at ROOT spawning the built binary, xtask smoke of packaged archives.
- Python tooling runs only through `uv run --project scripts --locked` (pydantic/typer pinned, Python ≥3.11); scripts are PEP-723.
- Node 22+ required for dev tests and the universal launcher; native packages run the Rust binary directly.

## ANTI-PATTERNS (THIS PROJECT)
- Attack tools (nuclei/nmap/sqlmap/ffuf/hydra/semgrep…) must be blocked without armed `.oh-my-zcode/security/active_scope.json`; wrappers (exec, bash -c, timeout, env -C, powershell -ec, python -m…) must not launder it (`test_hook_security.mjs`).
- Scope is per-host, not per-command; blocked scope output never echoes `updatedInput`.
- Cited URLs must byte-match fetched URLs after canonicalization; PASS requires paired Pre/PostToolUse with exact command + tool-use ID; snapshots deny ANY source change except `.oh-my-zcode/runtime.log`; selective/non-executing test runs (`--no-run`, `-k`, `--skipTests`, `--list-tests`) prove nothing.
- NEVER route `glm-5-turbo` as Reviewer (3% false-OK, measured — `plugin/docs/routing.md:32-34`).
- Junk dirs are local session state, never source: `.oh-my-zcode/`, `.betterzcode/`, `.omo/`, `.task-evidence/`, `exa-results/`, `dist/`, `target/`.

## UNIQUE STYLES
- Plugin ↔ runtime chokepoint: `plugin.json` + `hooks.json` → `node launch.mjs` → platform Rust binary → `src/main.rs` (exactly 3 subcommands: hook/scope-mcp/validate). No logic in Node.
- Sealed-agent doctrine: no agent judges its own work; the orchestrator never holds the pen (see `plugin/README.md`).
- Versioning: 3.0.0 is a repair release — equal version does not auto-update; publication base URL embeds the version (`.../oh-my-zcode/3.0.0/`).

## COMMANDS
```bash
cargo build --locked                                   # build
cargo test --workspace --locked                        # cargo tests
cargo fmt --all -- --check && cargo clippy --workspace --all-targets --locked -- -D warnings
cargo run --locked -- validate plugin                  # validate plugin tree
cargo run --locked -p xtask -- quality --analyzer rust-code-analysis-cli --root .
node test_gate.mjs                                     # gate integration tests
node --test test_proof_gate.mjs test_proof_gate_events.mjs test_proof_gate_policy.mjs \
     test_proof_gate_adversarial.mjs test_native_protocol.mjs test_workspace_boundary.mjs test_hook_security.mjs
cargo run --locked -p xtask -- package --target <triple> --binary <bin> --output dist \
  --base-url https://unknoownu.github.io/oh-my-zcode/3.0.0/   # per-target package
uv run --project scripts --locked python scripts/publish_pages.py assemble --releases releases --output site \
  --base-url https://unknoownu.github.io/oh-my-zcode/          # Pages assembly
```

## NOTES
- `OHMY_ZCODE_BIN` env var overrides the binary path used by the .mjs suites.
- `test_gate.mjs` is a 1304-LOC sequential monolith — a failure can cascade; read section numbers (22.x, 25.x) before assuming the labeled check is the culprit. Legacy assertion at :613 (scope_attack_pass logging).
- Security-critical chain: `shell.rs` → `shell_wrappers.rs` → `shell_lexer.rs` → `targets.rs`; `test_hook_security.mjs:24-29` enumerates the evasion corpus any change must survive.
- `plugin/vendor/codegraph/node_modules` is force-included via gitignore negation — do not prune.
- Version lives in three places (root `Cargo.toml`, `plugin/.zcode-plugin/plugin.json`, READMEs) — keep in sync.
