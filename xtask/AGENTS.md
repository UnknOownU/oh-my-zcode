# xtask/ — packaging & quality crate

**Score:** 13 (distinct domain: own crate + Cargo.toml; 17 files, 100% code) — earned its own file.

Build tooling: platform packaging, universal 5-target assembly, smoke tests of the shipped runtime, complexity gates. Does NOT depend on the `oh_my_zcode` lib — it consumes the built binary plus the `plugin/` tree.

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Platform package build | `src/package.rs` (`package::run`, `Publication::write`) |
| Marketplace/manifest baking | `src/manifests.rs` (`manifests::bake`) |
| Universal 5-target assembly | `src/universal.rs` + `src/target.rs` (Target enum: win/darwin/linux × x64/arm64) |
| Binary format/arch verify | `src/artifact.rs` (PE/Mach-O/ELF via `object`) |
| Packaged-runtime smoke tests | `src/smoke.rs` + `src/smoke_protocol.rs` (hook + MCP wire, end-to-end) |
| Complexity/quality gate | `src/metrics.rs` (`metrics::check`: cyclomatic 10, module 250 code lines) |
| CLI subcommands & wiring | `src/main.rs` (thin clap surface: Package / Universal / Smoke / Quality) |
| ZIP creation rules | `src/archive.rs` |
| Asset collection | `src/assets.rs` |

## CONVENTIONS (differ from root)
- `unsafe_code = "forbid"` here (root crate uses deny).
- New tooling belongs behind an xtask subcommand, never a standalone script (workspace has no other build scripts).
- Immutable archives: fixed timestamps, fixed entry order, 0755 Unix exec bits, SHA256SUMS, marketplace.json written LAST; an overwrite whose bytes differ is refused.
- Quality SHA-256s every source first and rejects files modified mid-analysis — NEVER edit repo files while `xtask quality` runs.
- Own tests live in `xtask/tests/` (`package.rs` 218 LOC, `package/universal.rs`, `metrics/`, `support/` helpers).

## ANTI-PATTERNS
- Never hand-edit `dist/` output — regenerate via `package` / `universal`.
- Smoke tests exercise the EXACT shipped runtime extracted from the archive: a green `cargo test` does not cover them; run `xtask smoke` per target.
