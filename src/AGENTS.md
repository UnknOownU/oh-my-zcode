# src/ — Rust runtime crate

**Score:** 28 (file count, code ratio, module boundary, symbol density, reference centrality all high) — earned its own file.

Workspace root package: lib `oh_my_zcode` + bin `oh-my-zcode`. Implements all four gates (proof, sources, security/scope, stop), the scope MCP server, and the plugin validator.

## STRUCTURE
```
src/
├── main.rs           # clap CLI: hook <event> | scope-mcp | validate [path]; stdin capped 8 MiB
├── lib.rs            # public API: declares hook, mcp, proof, scope, validator, workspace (+ windows_metadata, feature-gated)
├── workspace.rs      # workspace root resolution (.oh-my-zcode/.git/Cargo.toml markers), read/evidence roots, session keys
├── hook.rs + hook/   # dispatch for all 8 lifecycle events
├── proof.rs + proof/ # evidence gate: receipts, snapshots, policy, evaluation
├── scope.rs + scope/ # scope model: ValidatedScope, read_scope, host/target rules
├── mcp.rs + mcp/     # stdio JSON-RPC scope server (MAX_FRAME_BYTES cap)
└── validator.rs + validator/  # plugin tree/archive validation
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add/change a hook event | `hook.rs` dispatch + `hook/events.rs` parsers; wire in `plugin/hooks/hooks.json` too |
| Scope / attack-command blocking | `hook/security.rs` → `hook/targets.rs` → `hook/shell.rs` |
| Shell parsing / wrapper evasion | `hook/shell_lexer.rs` (12-method state machine), `hook/shell_wrappers.rs` |
| Proof receipts & PASS verdicts | `proof/records.rs`, `proof/evaluation.rs`, `proof/policy.rs` |
| Source/artifact fingerprints | `proof/snapshot.rs`, `proof/snapshot_entries.rs`, `proof/snapshot_selection.rs` |
| Citation tracking | `hook/sources.rs`, `hook/source_identity.rs` |
| Stop gate | `hook/stop.rs` |
| MCP scope server | `mcp/wire.rs`, `mcp/catalog.rs`, `mcp/dispatch.rs` |
| Plugin validation | `validator/*.rs` (manifest, agents, hooks, marketplace, routing, runtime) |
| Session-start update notice | `hook/update.rs`; audit log `hook/audit.rs` |

## KEY SYMBOLS (refs across src/xtask/tests)
`ProofError` (63), `proof::{evaluate, Claim, Policy}` (~54 group), `validator::validate` (34, LSP-measured), `HookError` (41), `workspace::*` helpers (39), `ProofContext` (20), `ValidatedScope` (18), `read_scope` (17), `shell::analyze` (15), `hook::run` (10) — sole hook entry; `mcp::run` (5).

## CONVENTIONS (differ from root)
- Flat mod file + submodule dir: `src/hook.rs` + `src/hook/*.rs` — NEVER `mod.rs`.
- Submodules are `pub(super)` (86 items); only module roots (`hook.rs`, `proof.rs`, …) export publicly via `lib.rs`.
- Unit tests live inline as `*_tests.rs` siblings (`mcp/frame_tests.rs`, `scope/host_tests.rs`, `scope/target_tests.rs`); heavier integration tests go to root `tests/`.
- Denied everywhere outside tests: `unwrap_used`, `expect_used`, `panic`, `todo`, `unimplemented`, `unreachable`, `indexing_slicing`. Cognitive complexity 15, 50-line fn, 4-arg max (clippy.toml).

## ANTI-PATTERNS
- A `shell_lexer.rs` misparse is a gate bypass: any change must survive the evasion corpus in `test_hook_security.mjs:24-29` (exec, bash -c, timeout, env -C, powershell -ec, brace expansion, quote-splitting hosts).
- `proof/snapshot_entries.rs` is tamper-evidence core: source modify/add/delete/restore-bytes/mtime-only, during OR after execution, must all deny; only `.oh-my-zcode/runtime.log` changes are exempt.
- PASS never rests on a nonzero exit or unpaired Pre/PostToolUse events — full pairing invariants live in `test_proof_gate.mjs`.
