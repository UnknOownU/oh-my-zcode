# Versioning — the policy

> **Current source version: 3.0.0.** The installation repair stays on this exact version. It replaces the broken distributions, adds the universal package and corrects marketplace metadata and documentation. Build evidence records the source commit and archive checksums. The [published marketplace](https://unknoownu.github.io/oh-my-zcode/marketplace.json) activates with the **next release** and will identify the available universal package; today use the per-platform URLs in [distribution and installation](distribution.md).

---

## Semver, for this plugin

| Bump | Means |
|---|---|
| **major** | new era or breaking behavior (a gate starts blocking something it allowed, or a contract changes) |
| **minor** | new command / agent / gate / skill |
| **patch** | fixes, diagnostics, docs releases |

## Release rules

1. **Never downgrade.** ZCode compares the marketplace version against `plugin.json` (semver sorting) to offer updates — a version below an installed one would never be offered, stranding existing installs. Official docs, verified 2026-08-19.
2. **Keep versions consistent.** Both workspace Cargo manifests, `plugin.json`, and the generated marketplaces must agree. The owner requested that this installation repair replace the 3.0.0 distributions without a version bump. Existing 3.0.0 installations therefore require a clean reinstall; equal versions do not produce an update notice. Future changes follow the semver policy above.
3. **Bind release evidence to the archive.** Packaging records the target platform and the SHA-256 of the release archive. Tests and release checks must identify the binary and package they actually exercised.
4. **Validation is read-only.** `oh-my-zcode validate` checks source declarations; `--packaged` additionally requires the runtime files for the declared package form. It never writes a mutable content stamp or rewrites versions.
5. **No compatibility layer.** Version 3 uses its current native commands and state contracts. Obsolete runtime paths are removed instead of retained through fallbacks or migrations.

## GitHub tags

- Format: `vMAJOR.MINOR.PATCH` (`v1.9.2`, not `1.9.2`).
- One tag per shipped version. For the corrected 3.0.0 assets, `oh-my-zcode-3.0.0-build.json` in the release records their exact source commit, workflow run and ZIP checksums. Use that commit to reproduce the correction; the original tag is not rewritten.
- Note: versions absent from the local cache (**1.3.0**, **1.9.0**) have no tag in the repo history — they were never replayed, and the history is not renumbered.
