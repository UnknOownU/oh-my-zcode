<p align="center">
  <strong>oh-my-zcode</strong> 🟣🟡🟠🔵
</p>

> Your agent never had to prove anything before. *Sounds harsh. Let's try again.* It still doesn't have to — but now it wants to.
>
> **An agent that writes is never an agent that judges. A source it never opened is not a source.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![ZCode Plugin](https://img.shields.io/badge/ZCode-plugin-8A2BE2.svg)](.zcode-plugin/plugin.json) [![GLM](https://img.shields.io/badge/models-GLM-5.3-blueviolet.svg)](docs/routing.md)

---

<details>
<summary><strong>Table of Contents</strong></summary>

- [Getting Started](#getting-started)
- [The five commands](#the-five-commands)
  - [/betterplan](#betterplan)
  - [/betterswarm](#betterswarm)
  - [/betterresearch](#betterresearch)
  - [/bettersecurity](#bettersecurity)
  - [/betterredteam](#betterredteam)
- [The four gates — they block, they don't ask](#the-four-gates--they-block-they-dont-ask)
- [Who does what](#who-does-what)
- [Advanced Topics](#advanced-topics)
- [Uninstalling](#uninstalling)
- [License](#license)

</details>

## Getting Started

**Prerequisites**: `node` on the PATH.

| Method | How |
|---|---|
| Local marketplace | **Settings → Plugins → Create → Add marketplace**, point it at the folder containing `marketplace.json` (the parent of this one), then install `betterzcode` from the **Personal** tab |
| GitHub | Push the folder to a repository (ours: <https://github.com/UnknOownU/oh-my-zcode>), then **Add marketplace** with the repository URL |

> [!NOTE]
> Start a **new session** after installing — hooks are snapshotted at session start.

## The five commands

### /betterplan

Builds a scaffold of the real code — files, symbols, existing patterns — and has 🟣 `gate-scaffold-critic` verify it before any plan exists. Writes the plan on top, persisted to disk **before** critique (the critic refuses a plan that has no file). Then 🟣 `gate-plan-critic` checks the plan against the doctrine and the codebase. Hands you a validated plan, marked **PLAN READY**. Writes no code.

```
/betterplan  add a login page, sessions must survive a refresh
```

### /betterswarm

The full pipeline. Frames the task (Goal / Context / Constraints / Done-when), splits it into areas, checks the plan, then runs 🔵 `gate-builder` → 🟡 `gate-reviewer` (fresh context, criteria-first, commit-first verdicts) → 🟠 `gate-verifier` (executes the deciding command) in a loop until both signatures are in. If you already ran `/betterplan`, the plan check is skipped. The orchestrator runs the deciding command itself — delegate the work, own the verdict.

```
/betterswarm fix the orders API pagination, it skips the last page
```

### /betterresearch

Frames the question, splits it into at most three axes, and dispatches research agents that fetch pages rather than trusting search snippets — a snippet is never a source. 🟠 `gate-source-verifier` then confronts every claim with the source it names, blind to what the researcher concluded. Publishes a report and signs `SOURCES: VERIFIED` — which the citation gate checks against what was actually fetched this session.

```
/betterresearch does GLM-5.3 actually benefit from chain-of-thought on code tasks?
```

### /bettersecurity

Locks the scope in writing before anything is touched (`scope.json`). Runs recon and writes the enumerated attack surface to `surface.md`. Dispatches attackers by family — the scope gate blocks attack commands mechanically unless a test/dev scope is armed. 🟠 `gate-finding-verifier` then **re-executes** every candidate finding blind instead of re-reasoning about it. Only reproduced findings enter the report, which signs `FINDINGS: VERIFIED` — gate-checked.

```
/bettersecurity https://our-staging.example.com — full check, we own the staging box
```

### /betterredteam

The environment gate comes first: test/dev or nothing — the run does not start outside an authorized scope. 🟣 `gate-plan-critic` checks the attack plan against the doctrine before anything is dispatched. The beasts are dispatched attackers that receive target and objective only — the cage (the `PreToolUse` scope gate, token-matched attack commands and tagged red-team subagent dispatches via Agent/Task: env ≠ prod, matching session, matching hosts) enforces every constraint, not their own restraint. Impact is proven by sample or by controlled callback. 🟠 `gate-finding-verifier` re-executes each demonstrated impact blind and re-verifies cleanup. The run ends with a detection report per attack family (x detected / y suspicious / z clean). The cage is a guardrail, not an authorization oracle — hooks see main-session commands and dispatches, not subagent internals, and the agent could write `active_scope.json` itself; it raises the bar mechanically, it does not replace the operator's judgment.

```
/betterredteam https://staging.ourapp.io — full chain, we own staging
```

You do not have to use any of them. The `SessionStart` hook injects the doctrine into every session, so the rules apply even when you just talk to the agent normally.

## The four gates — they block, they don't ask

| Gate | Event | Refuses |
|---|---|---|
| **Evidence** | `Stop` | `VERDICT: PASS` without a verification command executed this turn |
| **Citation** | `Stop` | `SOURCES: VERIFIED` citing a URL never fetched this session (failed fetches never count) |
| **Findings** | `Stop` | `FINDINGS: VERIFIED` without a verification command this turn |
| **Scope** | `PreToolUse` | attack commands (token-matched — quotes, wrappers, pipes and `$(…)` cannot hide the tool word) without an armed test/dev scope (env ≠ prod, matching session, matching hosts — and tagged red-team subagent dispatches, Agent/Task) |

## Who does what

| | Agent | Role | Model / Effort |
|---|---|---|---|
| 🟣 | `gate-plan-critic` | checks the plan before a line is written | `glm-5.3` / max |
| 🟣 | `gate-scaffold-critic` | checks the recon scaffold before the plan exists | `glm-5.3` / max |
| 🔵 | `gate-builder` | implements, never validates itself | `glm-5.3` / max |
| 🟡 | `gate-reviewer` | commit-first, read-only, locked verdict | `glm-5.3` / high |
| 🟠 | `gate-verifier` | signs on execution evidence | `glm-5.3` / high |
| 🟠 | `gate-source-verifier` | confronts each claim with its source | `glm-5.3` / high |
| 🟠 | `gate-finding-verifier` | re-executes security findings, never re-reasons | `glm-5.3` / max |

Measured routing:

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
.betterzcode/
├── evidence/<session id>.jsonl     written by the hooks — proof
├── plans/<run>/                    scaffold.md, plan.md, report.md, evidence.jsonl
├── research/<run>/                 report.md, evidence.jsonl
└── security/
    ├── active_scope.json           transient scope authorization, deleted at run end
    ├── loot.md                     the chain ledger
    └── <run>/                      scope.json, surface.md, report.md, evidence.jsonl
```

The evidence log carries `kind: "evidence"` for a command that ran, `kind: "source"` for a page fetched, `kind: "search"` for a query — logged, never counted as reading. The gate reads only the hook log, never the report.

### Changing the routing

Each role's model and thinking level live in one place: the agent's frontmatter in `agents/*.md`.

```yaml
model: glm-5.3
thoughtLevel: high
```

Full evidence for every routing decision: [docs/routing.md](docs/routing.md). `validate_zcode.mjs` fails if the routing table stops matching the agent files.

### Development

```bash
node test_gate.mjs         # 121 integration tests of all four gates
node validate_zcode.mjs    # structural checks against the ZCode spec
```

Both tools are dependency-free and require no build step.

### Versioning

Versioning follows [docs/versioning.md](docs/versioning.md) — the 1.x line continues; 2.0.0 is reserved for the MCP release.

## Uninstalling

**Settings → Plugins → betterzcode → uninstall.** Run data stays in `.betterzcode/`.

## License

MIT.
