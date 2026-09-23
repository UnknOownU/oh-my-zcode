<p align="center">
  <img src="plugin/docs/brand/banner.svg" alt="Oh My Zcode — Build. Challenge. Prove." width="960">
</p>

# Oh My Zcode

> **Your agent never had to prove anything before.**
> *Sounds harsh. Let's try again.*
> It still doesn't have to — but now it wants to.

[Plugin guide](plugin/README.md) · [简体中文](plugin/README_CN.md) · [MIT License](LICENSE)

<details>
<summary>Table of Contents</summary>

- [About](#about)
- [Installation](#installation)
- [Updating](#updating)
- [Using Oh My Zcode](#using-oh-my-zcode)
  - [Proof contract 3.0.0](#proof-contract-300)
- [Development](#development)
  - [Repository map](#repository-map)
  - [Versioning](#versioning)
- [Uninstalling](#uninstalling)
- [License](#license)

</details>

## About

The home of **BetterZcode** — an evidence-gated pipeline plugin for ZCode:

- **17 sealed agents** that explore, write, review, verify and sit on a blind council — no agent ever judges its own work, and the orchestrator never holds the pen
- **6 commands** — `/ohmy-council`, `/ohmy-plan`, `/ohmy-swarm`, `/ohmy-research`, `/ohmy-security`, `/ohmy-redteam`
- **4 mechanical gates** — hooks that block a success verdict no executed test supports, a report citing a page never fetched, a security finding never reproduced, and attack commands fired without an authorized test/dev scope

**This repository builds the Oh My Zcode plugin.** The plugin assets live in [`plugin/`](plugin/README.md). Version **3.0.0** ships one native package per platform — no Node.js, compiler, or npm install required. The universal package is also live, with one marketplace URL for all supported machines and a Node.js 22+ requirement.

## Installation

1. If another copy is installed, uninstall it in **Settings → Plugins** first. Keep only one installation of `oh-my-zcode`.
2. In **Settings → Plugins → Create → Add marketplace**, paste `https://unknoownu.github.io/oh-my-zcode/marketplace.json` for the recommended universal package (Node.js 22+), or choose one native URL for your machine:

   | Machine | Marketplace JSON URL |
   |---|---|
   | Windows x64 | `https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-pc-windows-msvc/marketplace.json` |
   | macOS Apple Silicon (M1–M4) | `https://unknoownu.github.io/oh-my-zcode/3.0.0/aarch64-apple-darwin/marketplace.json` |
   | macOS Intel | `https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-apple-darwin/marketplace.json` |
   | Linux x64 | `https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-unknown-linux-musl/marketplace.json` |
   | Linux ARM64 | `https://unknoownu.github.io/oh-my-zcode/3.0.0/aarch64-unknown-linux-musl/marketplace.json` |

   On a Mac, **Apple menu → About This Mac** tells the chip: Apple M1–M4 is Apple Silicon; an Intel processor listing is Intel.
3. Open the added marketplace, install **`oh-my-zcode`**, quit ZCode completely, relaunch, and start a **new session**. On Windows, quit from the tray if the app remains running; on macOS, use **ZCode → Quit ZCode** or **⌘Q**.

Today's live **3.0.0** native and universal marketplaces all use **`unknoownu`**, keeping the plugin identity `oh-my-zcode@unknoownu` stable. Earlier native distributions used `oh-my-zcode-<target>`; existing installations from those sources still have the old identity. Adding another `unknoownu` URL replaces the registered source, not the installed files; keep one source for your machine. Uninstall an old target-named or local copy before removing its marketplace and installing from `unknoownu`.

Stable native aliases at `https://unknoownu.github.io/oh-my-zcode/latest/<target>/marketplace.json` are also live; the versioned URLs above remain valid. The [installation guide](plugin/docs/distribution.md) covers these URLs, manual ZIP installs, and updates. A ZIP download URL and the HTML download page are **not marketplace inputs**.

## Updating

This correction remains **3.0.0**: uninstall an existing copy and install the corrected package from the JSON URL above. An equal version does not trigger a version-based update. For future releases, refresh the marketplace in ZCode's Plugins settings and install the offered update. Fully quit and relaunch ZCode, then open a new session. The session-start notice **only announces updates**; it does not install them. See [updates and reinstalling](plugin/docs/distribution.md#updates-and-reinstalling).

## Using Oh My Zcode

Start with a task, not a configuration file. Each command can run independently:

| You want to… | Command |
|---|---|
| Test an idea with a blind council | `/ohmy-council` |
| Turn a goal into a verified plan | `/ohmy-plan` |
| Build, review, and verify a change | `/ohmy-swarm` |
| Research with checked sources | `/ohmy-research` |
| Review an authorized app's security | `/ohmy-security` |
| Exercise an authorized test/dev target | `/ohmy-redteam` |

See the [plugin guide](plugin/README.md#using-oh-my-zcode) for the pipeline, command examples, and mechanical gates.

### Proof contract 3.0.0

PASS requires a matched successful check and unchanged source/artifact fingerprints before execution, after execution and at verdict. Expected nonzero reproductions and ignored build artifacts use an explicit policy. See [the proof contract](plugin/docs/proof.md) and [supported scoped commands and citation identity](plugin/docs/scoped-execution.md). Upgrade the plugin and start a new ZCode session.

## Development

### Repository map

| Path | What it is |
|---|---|
| [`plugin/`](plugin/README.md) | the plugin — README, agents, commands, skills, hooks |
| `src/` | Rust hooks, scope MCP server, and validator |
| `xtask/` | platform packaging and quality checks |
| `marketplace.json` | the source marketplace entry |
| `test_gate.mjs` | dev tooling — integration tests of all four gates |
| `test_proof_gate*.mjs` | regression tests for results, freshness and artifact identity |
| [`docs/rust-development.md`](docs/rust-development.md) | build, validate, test, and package the native runtime |

### Versioning

The 1.x line closed; the **2.x MCP era shipped 2026-08-21** — 5 MCP servers (scope, semgrep, osv-scanner, grep.app, codegraph) and invocation arming via `/ohmy-redteam`. Full policy: [`plugin/docs/versioning.md`](plugin/docs/versioning.md), roadmap: [`plugin/docs/ROADMAP.md`](plugin/docs/ROADMAP.md).

## Uninstalling

**Settings → Plugins → oh-my-zcode → uninstall.** Project run data stays in `.oh-my-zcode/`. Remove an existing copy before reinstalling or switching an old marketplace identity.

## License

MIT · Public source repository.
