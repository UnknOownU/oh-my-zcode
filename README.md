# Oh My Zcode

> **Your agent never had to prove anything before.**
> *Sounds harsh. Let's try again.*
> It still doesn't have to — but now it wants to.

The home of **BetterZcode** — an evidence-gated pipeline plugin for ZCode:

- **17 sealed agents** that explore, write, review, verify and sit on a blind council — no agent ever judges its own work, and the orchestrator never holds the pen
- **6 commands** — `/ohmy-council`, `/ohmy-plan`, `/ohmy-swarm`, `/ohmy-research`, `/ohmy-security`, `/ohmy-redteam`
- **4 mechanical gates** — hooks that block a success verdict no executed test supports, a report citing a page never fetched, a security finding never reproduced, and attack commands fired without an authorized test/dev scope

**This repository builds the Oh My Zcode plugin.** The plugin assets live in [`plugin/`](plugin/README.md). Version **3.0.0** adds a universal package: a small Node launcher selects the bundled Rust executable for Windows x64, macOS Apple Silicon/Intel, or Linux x64/ARM64. No compiler is needed.

## Install

1. Install **Node.js 22 or newer**, with `node` available on `PATH`. Check with `node --version`, then fully restart ZCode if Node was just installed.
2. If another copy is installed, uninstall it in **Settings → Plugins** first. Keep only one installation of `oh-my-zcode`.
3. In **Settings → Plugins → Create → Add marketplace**, paste this exact JSON URL on **all supported platforms**:

   ```text
   https://unknoownu.github.io/oh-my-zcode/marketplace.json
   ```

4. Open the added marketplace, install **`oh-my-zcode`**, quit ZCode completely, relaunch, and start a **new session**. On Windows, quit from the tray if the app remains running; on macOS, use **ZCode → Quit ZCode** or **⌘Q**.

The [download page](https://unknoownu.github.io/oh-my-zcode/) also lists native packages that do not need Node for the hooks or scope server. The [installation guide](plugin/docs/distribution.md) explains which JSON URL or extracted folder to use. A ZIP download URL and the HTML download page are **not marketplace inputs**.

## Update

This correction remains **3.0.0**: uninstall an existing copy and install the corrected package from the JSON URL above. An equal version does not trigger a version-based update. For future releases, refresh the marketplace in ZCode's Plugins settings and install the offered update. Fully quit and relaunch ZCode, then open a new session. The session-start notice **only announces updates**; it does not install them. See [updates and reinstalling](plugin/docs/distribution.md#updates-and-reinstalling).

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

MIT · Public source repository.
