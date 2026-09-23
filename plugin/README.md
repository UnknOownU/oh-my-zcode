<p align="center">
  <strong>oh-my-zcode</strong> 🟣🟡🟠🔵
</p>

> **An agent that writes is never an agent that judges. A source it never opened is not a source.**

[English](README.md) · [简体中文](README_CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![ZCode Plugin](https://img.shields.io/badge/ZCode-plugin-8A2BE2.svg)](.zcode-plugin/plugin.json) [![GLM](https://img.shields.io/badge/models-GLM-5.3-blueviolet.svg)](docs/routing.md)

---

<details>
<summary><strong>Table of Contents</strong></summary>

- [What this is](#what-this-is)
- [The pipeline](#the-pipeline)
- [Getting Started](#getting-started)
- [Dependencies and network](#dependencies-and-network)
- [Files and side effects](#files-and-side-effects)
- [Hooks](#hooks)
- [The six commands](#the-six-commands)
  - [/ohmy-council](#ohmy-council)
  - [/ohmy-plan](#ohmy-plan)
  - [/ohmy-swarm](#ohmy-swarm)
  - [/ohmy-research](#ohmy-research)
  - [/ohmy-security](#ohmy-security)
  - [/ohmy-redteam](#ohmy-redteam)
- [The four gates — they block, they don't ask](#the-four-gates--they-block-they-dont-ask)
- [The MCP servers](#the-mcp-servers)
- [Who does what](#who-does-what)
- [Advanced Topics](#advanced-topics)
- [Uninstalling](#uninstalling)
- [License](#license)

</details>

## What this is

An agent writes "done" and you believe it. This plugin makes it prove it instead:

- **Separated roles** — the agent that writes is never the agent that judges. Writers produce, critics judge, verifiers execute. Seventeen agents, each doing one thing.
- **Native gates** — four Rust hooks intercept the session. An unproven `VERDICT: PASS`, a citation for a page never fetched, a security finding never reproduced, an attack command outside scope: **blocked, mechanically**. The gates read what actually ran, never what the agent claims.
- **Everything on disk** — every run leaves its evidence: plans, reports, proof logs. A claim is checkable after the fact, by anyone.

It covers the whole life of a task: judging an idea, planning it, building it, researching it, and attacking it — each with its own pipeline and its own gate.

## The pipeline

```
 an idea
    │
    ▼
 /ohmy-council        five blind agents judge it — pursue, reshape, or drop it
    │
    ▼
 /ohmy-plan           recon the real code → scaffold → plan, verified against reality
    │
    ▼
 /ohmy-swarm          build → review → verify, looped until both signatures
    │
    ▼
 done — code shipped, PASS signed on executed evidence
```

Three independent tracks, when you need them:

- `/ohmy-research` — a cited answer, every source actually opened
- `/ohmy-security` — a scoped check on an app you own
- `/ohmy-redteam` — a full attack chain on an app you own

Each command works alone; the chain above is the natural flow. The `SessionStart` hook injects the doctrine into every session, so the rules hold even when you use none of the commands.

## Getting Started

The current public release is **3.0.0**: a universal package and one native package per platform. Native packages need no Node.js for the hooks or the scope server. To install a native package, in **Settings → Plugins → Create → Add marketplace**, paste the JSON URL for the machine that runs ZCode — choose exactly one:

```text
Windows x64          https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-pc-windows-msvc/marketplace.json
macOS Apple Silicon  https://unknoownu.github.io/oh-my-zcode/3.0.0/aarch64-apple-darwin/marketplace.json
macOS Intel          https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-apple-darwin/marketplace.json
Linux x64            https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-unknown-linux-musl/marketplace.json
Linux ARM64          https://unknoownu.github.io/oh-my-zcode/3.0.0/aarch64-unknown-linux-musl/marketplace.json
```

On a Mac, **Apple menu → About This Mac** identifies the chip (Apple M1–M4 is Apple Silicon; an Intel processor listing is Intel). The recommended universal package — a small Node launcher over five native binaries — is live at `https://unknoownu.github.io/oh-my-zcode/marketplace.json` and requires **Node.js 22+**. Stable native aliases at `https://unknoownu.github.io/oh-my-zcode/latest/<target>/marketplace.json` are also live; the versioned URLs above remain valid. See [distribution and installation](docs/distribution.md).

Today's live **3.0.0** native and universal marketplaces all use **`unknoownu`**, keeping the plugin identity `oh-my-zcode@unknoownu` stable. Earlier native distributions used `oh-my-zcode-<target>`; existing installations from those sources still have the old identity. Adding another `unknoownu` URL replaces the registered source, not the installed files; keep one source for your machine. Old target-named and local marketplaces remain separate identities.

### Install 3.0.0

1. If BetterZcode or another `oh-my-zcode` copy is installed from an older marketplace or a local folder, uninstall that copy first. Duplicate plugin identities can prevent installation.
2. Open **Settings → Plugins → Create → Add marketplace** and paste the universal JSON URL (Node.js 22+), or one native JSON URL for your machine from the table above.
3. Open the added marketplace and install `oh-my-zcode` once.
4. Fully quit and relaunch ZCode, then start a **new session**. On Windows, quit from the tray when the process remains there; on macOS, use **ZCode → Quit ZCode** or **⌘Q**.

For a manual local marketplace, **Add marketplace** takes a folder containing `marketplace.json`; it does not take the extracted plugin root. A ZIP download URL and the HTML download page are not marketplace sources. The [distribution guide](docs/distribution.md) documents the local wrapper and package layout. Keep one installed copy.

### Update

When moving from an old target-named or local marketplace to the live `unknoownu` marketplace, uninstall the old plugin before removing its marketplace, then add the desired new source and install once. After that, refresh `unknoownu` in ZCode's Plugins settings and choose the plugin update when offered. Fully quit and relaunch ZCode and start a new session after updating. The session-start notice only announces a newer version; it never installs or applies updates automatically. A same-version correction, including switching between the universal and native 3.0.0 packages, requires uninstalling the existing copy and performing a clean install once from the desired marketplace. See [distribution and installation](docs/distribution.md) for the published-pages endpoint and local package details.

### Agent-assisted install prompt

Paste this into a fresh ZCode chat if you want the agent to guide the same sequence:

```text
Install the oh-my-zcode plugin for me, end to end.
1. Ask me which machine runs ZCode, then open Settings → Plugins → Create → Add marketplace and add this exact JSON URL for that machine — Windows x64: https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-pc-windows-msvc/marketplace.json · macOS Apple Silicon: https://unknoownu.github.io/oh-my-zcode/3.0.0/aarch64-apple-darwin/marketplace.json · macOS Intel: https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-apple-darwin/marketplace.json · Linux x64: https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-unknown-linux-musl/marketplace.json · Linux ARM64: https://unknoownu.github.io/oh-my-zcode/3.0.0/aarch64-unknown-linux-musl/marketplace.json — stop and wait for my confirmation before the next step.
2. If BetterZcode or another oh-my-zcode installation from an older marketplace or local folder exists, have me uninstall it first; duplicate identities can block installation. Then install oh-my-zcode once from the marketplace you added.
3. Verify the installation by locating the host's actual installed_plugins.json, reading the oh-my-zcode entry's installPath, and checking that path for .zcode-plugin/plugin.json, agents/, commands/, and skills/. Do not assume an operating system, owner, or cache path.
4. Ask me to fully quit and relaunch ZCode using the host OS's full-quit action, then start a new session.
5. In the new session, confirm that /ohmy-plan, /ohmy-swarm, and /ohmy-research are available and that the session received the pipeline doctrine. Report any missing item.
```

> [!NOTE]
> Restart ZCode after installing so MCP declarations reload, then start a **new session** so hooks reload.

## Dependencies and network

The required runtime is a ZCode host and **Node.js 22+ on `PATH`**. Agent frontmatter routes the bundled roles to the ZAI Coding Plan models `account:zai-individual-coding-plan/GLM-5.3` and `account:zai-individual-coding-plan/GLM-5.3-Flash`, with the declared effort level. Model availability, account limits, and provider traffic follow the ZAI Coding Plan and ZCode host. Rust, Cargo, and a compiler are development-only requirements; the universal archive does not need them.

The following integrations are optional and run only when their MCP server or command is used:

- `grep` connects to `https://mcp.grep.app` for public code search.
- `semgrep` needs the `semgrep` executable on `PATH` and starts `semgrep mcp`.
- `osv-scanner` needs the `osv-scanner` executable on `PATH` and starts `osv-scanner experimental-mcp`.
- `codegraph` needs Node and npm. From the installed plugin directory, opt in with `npm --prefix vendor/codegraph ci --omit=dev --no-audit --no-fund`; this can download the locked package and its platform dependency from npm. The lockfile records `@colbymchenry/codegraph` 1.5.0 as MIT. Its source repository is not asserted because it is not available in this checkout; use the [npm registry record](https://registry.npmjs.org/@colbymchenry%2Fcodegraph) rather than a guessed source link.

The update notice makes at most one anonymous `curl` GET per 24 hours, with a 2-second cap, against the published-pages marketplace endpoint (`https://unknoownu.github.io/oh-my-zcode/marketplace.json`). It sends no payload or identifier and fails open when the request or manifest cannot be read. The check only announces a newer version; it never downloads or installs one. Its state is stored per user at `~/.zcode/cli/plugins/data/oh-my-zcode@unknoownu/update-check.json`; set `"disabled": true` there to disable the check. `OH_MY_ZCODE_UPDATE_URL` and `OH_MY_ZCODE_UPDATE_STATE` are configuration/test overrides. See [distribution and installation](docs/distribution.md) for the authoritative behavior.

Agents can also use the ZCode-provided WebFetch/WebSearch tools when a command asks for research. Those requests, the ZAI model calls, optional grep.app traffic, optional npm install, and configured Semgrep/OSV traffic are external network activity. The universal launcher itself never downloads a binary at runtime.

## Files and side effects

The installed plugin contains these public surfaces:

| Path | Purpose |
|---|---|
| `.zcode-plugin/plugin.json` | plugin metadata and MCP declarations |
| `agents/` | 17 role definitions and their ZAI Coding Plan frontmatter |
| `commands/` | six slash-command definitions |
| `skills/` | six pipeline and review skill definitions |
| `hooks/hooks.json` | host hook matchers and launcher invocations |
| `bin/` | the Node launcher and five bundled platform binaries in the 3.0.0 archive |
| `vendor/codegraph/` | optional npm package manifest and lockfile |

Commands and hooks write project-local `.oh-my-zcode/` state. Depending on the command, this includes `evidence/`, `plans/`, `research/`, `council/`, and `security/` records; the security commands may also write scope and loot files. The update notice writes its rate-limit/disable state to the per-user ZCode plugin-data directory described above.

Agent work can execute shell commands through the ZCode delegated scope. The host shows those commands to the session, and the evidence/proof hooks record the results. `/ohmy-security` and `/ohmy-redteam` require an authorized test/dev scope for recognized attack commands; the scope gate blocks unsupported or out-of-scope requests. Review [scoped execution](docs/scoped-execution.md) before granting a target.

## Hooks

The host reads hook declarations when ZCode starts. Install or update the plugin, fully quit and relaunch ZCode, and start a new session so both MCP declarations and hooks reload.

| Event and matcher | Effect |
|---|---|
| `SessionStart` (`startup`, `clear`, `compact`) | injects the pipeline doctrine |
| `PostToolUse` (`Bash`) | records executed evidence |
| `PostToolUse` (web fetch/search matchers) | records fetched sources |
| `PreToolUse` (`Bash`) | checks scope and starts proof capture |
| `PreToolUse` (`Agent`, `Task`) | records delegated dispatches |
| `Stop` | applies evidence, citation, and finding gates before a conclusion |
| `PostToolUseFailure` (`Bash`) | records failed command evidence |

The launcher restores the executable bit with `chmod +x` for the selected POSIX binary when an official packager has stripped it. It only changes that local file mode; it does not download a replacement binary.

## The six commands

### /ohmy-council

**What it does:** submits an idea to five blind agents in parallel. Three judges — feasibility, risk, value — state their criteria BEFORE reading the briefing; two creatives — novel angles on the idea, unexplored territories — extend it (the explorer ideates from first principles before reading at all). No member knows another exists, no debate; aggregation is mechanical majority (≥ 2 of 3 judges), minority views stay verbatim.

**When:** before anything is built — a raw one-liner or a full brainstorm.

**You get:** three verdicts (`ENDORSE / RESERVE / REJECT`), convergence points, minority views, and proposals from both creatives — in `.oh-my-zcode/council/<run>/`. The report never recommends: the council informs, you decide.

```
/ohmy-council  let players export montages of their best runs
```

Design rationale, mechanism by mechanism: [docs/council.md](docs/council.md).

### /ohmy-plan

**What it does:** read-only reconnaissance of the real code (explorer) → `scaffold.md` (scaffold-writer) → the scaffold checked against the codebase (scaffold-critic) → `plan.md` (plan-writer, persisted before critique) → the plan checked against doctrine and codebase (plan-critic), findings routed back to the writer. The orchestrator never writes.

**When:** before any code is written.

**You get:** a validated plan marked **PLAN READY** in `.oh-my-zcode/plans/<run>/` — or blocked with concrete findings. No code is written.

```
/ohmy-plan  add a login page, sessions must survive a refresh
```

### /ohmy-swarm

**What it does:** the build loop. The builder implements, the reviewer judges in a fresh context (criteria first, commit-first verdicts), the verifier executes the deciding command — looping until both signatures are in. The orchestrator runs the deciding command itself: delegate the work, own the verdict.

**When:** to implement a task. If `/ohmy-plan` already ran, the plan check is skipped.

**You get:** shipped code and a `VERDICT: PASS` signed on executed evidence.

```
/ohmy-swarm fix the orders API pagination, it skips the last page
```

### /ohmy-research

**What it does:** frames the question, splits it into at most three axes, dispatches researchers that **fetch** the pages — a search snippet is never a source. The draft-writer turns the notes into `report.md`; the source-verifier confronts every claim with the source it names, blind to what the researcher concluded.

**When:** any question whose answer cites external sources.

**You get:** `report.md` and `SOURCES: VERIFIED` in `.oh-my-zcode/research/<run>/` — signed only after the orchestrator opened the sources itself, and the citation gate checks that signature against what was actually fetched this session.

```
/ohmy-research does GLM-5.3 actually benefit from chain-of-thought on code tasks?
```

### /ohmy-security

**What it does:** locks the scope in writing first (`scope.json`), enumerates the attack surface (`surface.md`), dispatches attackers by family — the scope gate blocks attack commands mechanically unless a test/dev scope is armed. The finding-verifier **re-executes** every candidate finding blind; a proof that cannot decide its claim's type (behavior vs. source) is rejected.

**When:** a structured security check on an app you own.

**You get:** a report where only reproduced findings enter, signed `FINDINGS: VERIFIED` — gate-checked.

```
/ohmy-security https://our-staging.example.com — full check, we own the staging box
```

### /ohmy-redteam

**What it does:** arms the scope by invocation — targets and environment derived from your argument, written to `active_scope.json` with a 60-minute expiry, `prod` refused outright. Then it hunts **prizes** (read all user data, admin access, code execution) instead of walking checklists: a white-box `source-map.md` from the target's own repo when available, attackers dispatched with target and objective only, waves cascading from each wave's loot until a prize is proven or two consecutive waves add no new capability.

**When:** a full attack chain on an app you own.

**You get:** proven prizes — impact demonstrated by sample or controlled callback, re-executed blind by the finding-verifier, cleanup re-verified — plus a detection report per prize, with every entry typed `behavior` or `source` and a `PROVENANCE` block for what was actually tested.

```
/ohmy-redteam https://staging.ourapp.io — full chain, we own staging
```

The cage is a guardrail, not an authorization oracle: hooks see main-session commands and dispatches, not subagent internals. It raises the bar mechanically; it does not replace the operator's judgment.

## The four gates — they block, they don't ask

| Gate | Event | Refuses |
|---|---|---|
| **Evidence** | `Stop` | `VERDICT: PASS` without a successful matched check and fresh artifact fingerprint this turn |
| **Citation** | `Stop` | `SOURCES: VERIFIED` citing a URL never fetched this session (failed fetches never count) |
| **Findings** | `Stop` | `FINDINGS: VERIFIED` without a matched expected result and fresh artifact fingerprint this turn |
| **Scope** | `PreToolUse` | recognized attack invocations without valid scope; unsupported execution or target forms; declared out-of-scope targets; tagged dispatches without explicit authorized URLs |

Proof details, expected output assertions, built artifacts and host limits: [proof contract](docs/proof.md). Exact supported command forms and citation resource identity: [scoped execution](docs/scoped-execution.md).

## The MCP servers

The plugin ships **five** MCP servers, declared in [`.zcode-plugin/plugin.json`](.zcode-plugin/plugin.json) — the official ZCode nomenclature, measured registering at cold start (2026-08-21). Measured law: the host reads plugin MCP declarations **only at app start** — install or update the plugin, then restart ZCode, or the servers will not appear in the session.

| Server | Transport | What it is |
|---|---|---|
| `scope` | stdio (`node ${ZCODE_PLUGIN_ROOT}/bin/launch.mjs scope-mcp`) | the authorization scope: `get_scope` (read-only, reports armed/expired with the re-arm hint) and `revoke` (disarm now) |
| `semgrep` | stdio (`semgrep mcp`) | static analysis — needs the `semgrep` binary: `pip install semgrep` |
| `osv-scanner` | stdio (`osv-scanner experimental-mcp`) | dependency CVE scanning — needs the `osv-scanner` binary: `scoop install osv-scanner` |
| `grep` | http (`https://mcp.grep.app`) | code search across public repositories, no binary needed |
| `codegraph` | stdio (external Node package) | local code indexing; install its locked dependencies as described in [distribution](docs/distribution.md#optional-external-servers) |

An unavailable external server is isolated: the bundled `scope` server and gates remain independent. Codegraph requires Node; the first-party runtime does not.

## Who does what

The writer family exists so no orchestrator holds the pen: 🔵 `explorer` reads, 🔵 the writers produce artifacts, 🟣 the critics judge them.

| | Agent | Role | Model / Effort |
|---|---|---|---|
| 🟣 | `plan-critic` | checks the plan before a line is written | `glm-5.3` / max |
| 🟣 | `scaffold-critic` | checks the recon scaffold before the plan exists | `glm-5.3` / max |
| 🔵 | `explorer` | read-only reconnaissance before any scaffold | `glm-5.3-flash` / max |
| 🔵 | `scaffold-writer` | writes `scaffold.md` from explorer findings — never a verdict | `glm-5.3` / max |
| 🔵 | `plan-writer` | writes/revises `plan.md` — never a verdict | `glm-5.3` / max |
| 🔵 | `draft-writer` | writes the research `report.md` — never a signature | `glm-5.3` / max |
| 🔵 | `builder` | implements, never validates itself | `glm-5.3` / max |
| 🟡 | `reviewer` | commit-first, read-only, locked verdict | `glm-5.3` / max |
| 🟠 | `verifier` | signs on execution evidence | `glm-5.3-flash` / max |
| 🟠 | `source-verifier` | confronts each claim with its source | `glm-5.3-flash` / max |
| 🟠 | `finding-verifier` | re-executes security findings, never re-reasons | `glm-5.3-flash` / max |
| 🟣 | `council-analyst` | council judge — feasibility lens, blind, criteria before reading | `glm-5.3` / max |
| 🟣 | `council-skeptic` | council judge — risk lens, strongest honest case against | `glm-5.3` / max |
| 🟣 | `council-strategist` | council judge — value lens, should this exist at all | `glm-5.3` / max |
| 🔵 | `council-innovator` | council creative — novel angles ON the idea | `glm-5.3-flash` / max |
| 🔵 | `council-explorer` | council creative — unexplored territories, ideates before reading | `glm-5.3-flash` / max |
| 🟢 | `vision` | the session's eyes — read-only description of one image, never a verdict | `glm-5.3-flash` / max |

Measured routing (all seats run `max` by owner setting since 3.0.0; the measurements below are what the lineup knows):

| Role | Model | Effort | Measured |
|---|---|---|---|
| Worker (plan, build) | `glm-5.3` | max | plan quality is the ceiling: 48.1% → 74.4% Pass@1, direct vs generated plan (arXiv 2303.06689) |
| Reviewer | `glm-5.3` | high | 6.2% false-reject vs 21–26% for all the others (n=53) |
| Verifier | `glm-5.3` | high | glm-4.7 removed: 77.8% false-reject on real multi-file patches, defect identified only 11.8% of the time |
| Source Verifier | `glm-5.3` | high | 0% false-OK + 0% false-reject, n=45; capability floor 90.7% vs 79.3% (published) |
| Finding Verifier | `glm-5.3` | max | adversarial verification eliminates 49.5% of candidates (OpenAnt); re-reasoning-only suppresses 22.25% TP (Sifting the Noise); max cost accepted at 28.67 pts/review |
| ⛔ Forbidden for judging | `glm-5-turbo` | — | 3% false-OK, the only model to have approved broken code |

Never route a role to `glm-5.2`, `glm-5.1`, `glm-5` or `glm-4.5-air`: on the Coding Plan these are **aliases** answering as `glm-5.3` or `glm-4.7` — the "model diversity" would be fake.

Set `max_tokens` to **131072** — the documented ceiling — and never below. You are billed for the tokens generated, not for the limit you allow, and a cut-off response cannot carry a verdict.

## Advanced Topics

### What lands on disk

```
.oh-my-zcode/
├── evidence/<session id>.jsonl     written by the hooks — proof
├── plans/<run>/                    scaffold.md, plan.md, report.md, evidence.jsonl
├── research/<run>/                 report.md, evidence.jsonl
├── council/<run>/                  briefing.md, report.md
└── security/
    ├── active_scope.json           written by /ohmy-redteam at invocation; expires in 60 minutes
    ├── loot.md                     the chain ledger
    └── <run>/                      scope.json, surface.md, report.md, evidence.jsonl
```

The evidence log carries `kind: "evidence"` for a command that ran, `kind: "source"` for a page fetched, `kind: "search"` for a query — logged, never counted as reading. The gate reads only the hook log, never the report.

### Changing the routing

Each role's model and thinking level live in one place: the agent's frontmatter in `agents/*.md`.

```yaml
model: account:zai-individual-coding-plan/GLM-5.3
thoughtLevel: max
```

Full evidence for every routing decision: [docs/routing.md](docs/routing.md). The native validator checks routing declarations against the agent files.

### Development

```bash
cargo build --locked
cargo test --workspace --locked
cargo run --locked -- validate plugin
node test_gate.mjs
```

Run these commands from the repository root. Development requires Rust; the process contract tests require Node. End users install precompiled packages. See the repository's `docs/rust-development.md` for quality checks and packaging.

### Versioning

Versioning follows [docs/versioning.md](docs/versioning.md) — the 1.x line closed and the 2.x MCP era shipped (2026-08-21). The current 3.0.0 release has the universal marketplace as its primary package and five active native per-platform packages as the no-Node alternative. Same-version corrections require a clean reinstall with one copy.

## Uninstalling

**Settings → Plugins → oh-my-zcode → uninstall.** Run data stays in `.oh-my-zcode/`.

## License

[MIT License](LICENSE).
