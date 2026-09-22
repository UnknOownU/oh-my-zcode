<p align="center">
  <strong>oh-my-zcode</strong> 🟣🟡🟠🔵
</p>

> **An agent that writes is never an agent that judges. A source it never opened is not a source.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![ZCode Plugin](https://img.shields.io/badge/ZCode-plugin-8A2BE2.svg)](.zcode-plugin/plugin.json) [![GLM](https://img.shields.io/badge/models-GLM-5.3-blueviolet.svg)](docs/routing.md)

---

<details>
<summary><strong>Table of Contents</strong></summary>

- [What this is](#what-this-is)
- [The pipeline](#the-pipeline)
- [Getting Started](#getting-started)
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

- **Separated roles** — the agent that writes is never the agent that judges. Writers produce, critics judge, verifiers execute. Sixteen agents, each doing one thing.
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

**Prerequisites**: a package matching your operating system and architecture. Version **3.0.0** includes a native Rust executable; users do not need to install Rust or Node for the hooks and scope server.

In **Settings → Plugins → Create → Add marketplace**, paste the URL for your platform:

| Platform | Marketplace URL |
|---|---|
| Windows x64 | `https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-pc-windows-msvc/` |
| macOS Apple Silicon | `https://unknoownu.github.io/oh-my-zcode/3.0.0/aarch64-apple-darwin/` |
| macOS Intel | `https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-apple-darwin/` |
| Linux x64 | `https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-unknown-linux-musl/` |
| Linux ARM64 | `https://unknoownu.github.io/oh-my-zcode/3.0.0/aarch64-unknown-linux-musl/` |

then install `oh-my-zcode`. The [index page](https://unknoownu.github.io/oh-my-zcode/) lists every published version. See [distribution and installation](docs/distribution.md) for local packages and optional external servers. The source checkout is a development workspace.

Or let your agent do it: paste this into a fresh ZCode chat and follow its lead.

```text
Install the oh-my-zcode plugin for me, end to end.
1. Walk me through adding the marketplace: Settings → Plugins → Create → Add marketplace, paste https://unknoownu.github.io/oh-my-zcode/3.0.0/x86_64-pc-windows-msvc/ (that is the Windows URL; the index at https://unknoownu.github.io/oh-my-zcode/ lists the other platforms) — stop and wait for my confirmation before the next step.
2. Once added, walk me through installing the oh-my-zcode plugin from that marketplace (Personal → the new market → Install), and wait for my confirmation.
3. Verify the install yourself: check that the directory ~/.zcode/cli/plugins/cache/unknoownu/oh-my-zcode/<version>/ exists and contains .zcode-plugin/plugin.json, agents/ and skills/.
4. Tell me to restart ZCode completely — quit from the tray icon (closing the window is NOT enough), then relaunch. Wait for me to confirm I did it.
5. After the restart, run a smoke check in a new session: confirm the /ohmy-plan, /ohmy-swarm and /ohmy-research commands exist and that the session received the pipeline doctrine. Report what you found, including anything missing.
```

> [!NOTE]
> Restart ZCode after installing so MCP declarations reload, then start a **new session** so hooks reload.

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
| `scope` | stdio (bundled native executable) | the authorization scope: `get_scope` (read-only, reports armed/expired with the re-arm hint) and `revoke` (disarm now) |
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

Versioning follows [docs/versioning.md](docs/versioning.md) — the 1.x line closed; the 2.x MCP era shipped (2026-08-21).

## Uninstalling

**Settings → Plugins → oh-my-zcode → uninstall.** Run data stays in `.oh-my-zcode/`.

## License

MIT.
