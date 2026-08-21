# Versioning — the policy

> **Decision**: owner, 2026-08-19. The plugin lives in the **1.x** line; **2.0.0 is reserved for the MCP release** — the era where the plugin ships its own MCP server (scope service, mechanical disarm, settings panel). Nothing between now and that release may claim 2.x. **Fulfilled 2026-08-21**: the 2.0.0 reservation is taken by the MCP release (`oh-my-zcode`).

---

## Semver, for this plugin

| Bump | Means |
|---|---|
| **major** | new era or breaking behavior (a gate starts blocking something it allowed, or a contract changes) |
| **minor** | new command / agent / gate / skill |
| **patch** | fixes, diagnostics, docs releases |

## Two hard rules, and why

1. **Never downgrade.** ZCode compares the marketplace version against `plugin.json` (semver sorting) to offer updates — a version below an installed one would never be offered, stranding existing installs. Official docs, verified 2026-08-19.
2. **Bump BOTH `plugin.json` and `marketplace.json` on every content change.** The validator (`validate_zcode.mjs`, `checkVersionStamp`) hashes all plugin content except `.oh-my-zcode/` and errors on any change without an agreeing bump in both manifests. Content includes docs — a docs-only change is still a patch.

## GitHub tags

- Format: `vMAJOR.MINOR.PATCH` (`v1.9.2`, not `1.9.2`).
- One tag per shipped version, marking the tree that shipped.
- Note: versions absent from the local cache (**1.3.0**, **1.9.0**) have no tag in the repo history — they were never replayed, and the history is not renumbered.
