# Oh My Zcode

> **Your agent never had to prove anything before.**
> *Sounds harsh. Let's try again.*
> It still doesn't have to — but now it wants to.

The home of **BetterZcode** — an evidence-gated pipeline plugin for ZCode:

- **16 sealed agents** that explore, write, review, verify and sit on a blind council — no agent ever judges its own work, and the orchestrator never holds the pen
- **6 commands** — `/ohmy-council`, `/ohmy-plan`, `/ohmy-swarm`, `/ohmy-research`, `/ohmy-security`, `/ohmy-redteam`
- **4 mechanical gates** — hooks that block a success verdict no executed test supports, a report citing a page never fetched, a security finding never reproduced, and attack commands fired without an authorized test/dev scope

**This repository builds the Oh My Zcode plugin.** The plugin assets live in [`plugin/`](plugin/README.md); the first-party runtime is Rust. Version **3.0.0** is distributed as precompiled platform packages.

## Install

1. Choose the precompiled package for Windows x64, macOS Intel/Apple Silicon, or Linux x64/ARM64.
2. ZCode → **Settings → Plugins → Create → Add marketplace**, then add that platform's published marketplace URL.
3. Install **`oh-my-zcode`**, restart ZCode, and start a **new session**.

Rust and Node are not required by the bundled hooks or scope server. Codegraph is an optional external server that requires Node. See [installation and platform selection](plugin/docs/distribution.md). The repository checkout is for development; release artifacts must be published before their marketplace URLs can be used.

## What's in here

| Path | What it is |
|---|---|
| [`plugin/`](plugin/README.md) | the plugin — README, agents, commands, skills, hooks |
| `src/` | Rust hooks, scope MCP server, and validator |
| `xtask/` | platform packaging and quality checks |
| `marketplace.json` | the source marketplace entry |
| `test_gate.mjs` | dev tooling — integration tests of all four gates |
| `test_proof_gate*.mjs` | regression tests for results, freshness and artifact identity |
| [`docs/rust-development.md`](docs/rust-development.md) | build, validate, test, and package the native runtime |

## Proof contract 3.0.0

PASS requires a matched successful check and unchanged source/artifact fingerprints before execution, after execution and at verdict. Expected nonzero reproductions and ignored build artifacts use an explicit policy. See [the proof contract](plugin/docs/proof.md) and [supported scoped commands and citation identity](plugin/docs/scoped-execution.md). Upgrade the plugin and start a new ZCode session.

## Versioning

The 1.x line closed; the **2.x MCP era shipped 2026-08-21** — 5 MCP servers (scope, semgrep, osv-scanner, grep.app, codegraph) and invocation arming via `/ohmy-redteam`. Full policy: [`plugin/docs/versioning.md`](plugin/docs/versioning.md), roadmap: [`plugin/docs/ROADMAP.md`](plugin/docs/ROADMAP.md).

---

MIT · Private repository.
