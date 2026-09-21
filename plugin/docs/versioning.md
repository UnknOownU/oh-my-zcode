# Versioning — the policy

> **Current release line: 3.0.0.** The owner confirmed on 2026-09-21 that the native Rust rewrite and stronger proof contracts belong to this release. Development edits before its publication do not require a new version.

---

## Semver, for this plugin

| Bump | Means |
|---|---|
| **major** | new era or breaking behavior (a gate starts blocking something it allowed, or a contract changes) |
| **minor** | new command / agent / gate / skill |
| **patch** | fixes, diagnostics, docs releases |

## Release rules

1. **Never downgrade.** ZCode compares the marketplace version against `plugin.json` (semver sorting) to offer updates — a version below an installed one would never be offered, stranding existing installs. Official docs, verified 2026-08-19.
2. **Version each published release, not each validation run.** `Cargo.toml`, `plugin.json`, and every platform marketplace must agree. Once published, an archive is immutable: changing any shipped bytes, including documentation, requires a new release version.
3. **Bind release evidence to the archive.** Packaging records the target platform and the SHA-256 of the release archive. Tests and release checks must identify the binary and package they actually exercised.
4. **Validation is read-only.** `oh-my-zcode validate` checks source declarations; `--packaged` additionally requires their native executable targets. It never writes a mutable content stamp or rewrites versions. Source work stays on `3.0.0` until that release is published.
5. **No compatibility layer.** Version 3 uses its current native commands and state contracts. Obsolete runtime paths are removed instead of retained through fallbacks or migrations.

## GitHub tags

- Format: `vMAJOR.MINOR.PATCH` (`v1.9.2`, not `1.9.2`).
- One tag per shipped version, marking the tree that shipped.
- Note: versions absent from the local cache (**1.3.0**, **1.9.0**) have no tag in the repo history — they were never replayed, and the history is not renumbered.
