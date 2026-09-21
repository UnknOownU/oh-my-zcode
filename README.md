# Oh My Zcode

> **Your agent never had to prove anything before.**
> *Sounds harsh. Let's try again.*
> It still doesn't have to — but now it wants to.

The home of **BetterZcode** — an evidence-gated pipeline plugin for ZCode:

- **16 sealed agents** that explore, write, review, verify and sit on a blind council — no agent ever judges its own work, and the orchestrator never holds the pen
- **6 commands** — `/ohmy-council`, `/ohmy-plan`, `/ohmy-swarm`, `/ohmy-research`, `/ohmy-security`, `/ohmy-redteam`
- **4 mechanical gates** — hooks that block a success verdict no executed test supports, a report citing a page never fetched, a security finding never reproduced, and attack commands fired without an authorized test/dev scope

**This repository is a ZCode marketplace.** The plugin source lives in [`oh-my-zcode/`](oh-my-zcode/README.md) — that's where the full README, the commands, the agents and the doctrine skills are.

## Install

1. ZCode → **Settings → Plugins → Create → Add marketplace**
2. Use this repository's URL (or a local path to this folder)
3. Install **`oh-my-zcode`** from the Personal tab (migration from 1.x: uninstall `betterzcode` first — breaking rename)
4. Start a **NEW session** — hooks are snapshotted at session start

> Requires `node` on the PATH.

## What's in here

| Path | What it is |
|---|---|
| [`oh-my-zcode/`](oh-my-zcode/README.md) | the plugin — README, agents, commands, skills, hooks |
| `marketplace.json` | the marketplace entry |
| `test_gate.mjs` | dev tooling — 92 integration tests of all four gates |
| `validate_zcode.mjs` | dev tooling — structural validator (manifest, hooks, agents, versions) |

## Versioning

The 1.x line closed; the **2.x MCP era shipped 2026-08-21** — 4 MCP servers (scope, semgrep, osv-scanner, grep.app) and invocation arming via `/ohmy-redteam`. Full policy: [`oh-my-zcode/docs/versioning.md`](oh-my-zcode/docs/versioning.md), roadmap: [`oh-my-zcode/docs/ROADMAP.md`](oh-my-zcode/docs/ROADMAP.md).

---

MIT · Private repository.
