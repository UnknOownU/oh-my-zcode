# BetterZcode

> **An agent that writes is never an agent that judges.**
> A Builder → Reviewer → Verifier pipeline with a hard evidence gate, and GLM model routing **grounded in measurements**, not impressions.

## What it is

Three isolated ZCode subagents, an orchestration command, a doctrine skill, and hooks that turn the doctrine into something the runtime actually enforces. Every design decision is backed either by a measurement made on a GLM Coding Plan account or by a cited paper.

**The part nothing else does**: a `Stop` hook refuses to let a turn end on `VERDICT: PASS` when no verification command ran during that turn. Not a prompt asking nicely — a gate.

## Install (local test)

1. Open a workspace in ZCode
2. **Settings → Plugins → Create → Add marketplace**
3. Local path: the folder containing `marketplace.json` (the parent of this one)
4. In the **Personal** tab, install `betterzcode`
5. Start a **new session** — hooks are snapshotted at session start

Team distribution: push this folder to GitHub, then **Add marketplace** with the repository URL.

> Requires `node` on the PATH. `validate_zcode.mjs` warns you if it is missing.

## Use

```
/gate fix the orders API pagination, it skips the last page
```

The orchestrator frames the task (Goal / Context / Constraints / Done-when), splits it into areas, then runs Builder → Reviewer → Verifier until both signatures are in.

## The routing, and why

| Role | Model | Effort | Evidence |
|---|---|---|---|
| Builder | `glm-5.3` | max | fastest and most capable of the real lineup |
| Reviewer | `glm-5.3` | high | **6.2% false-reject** against 21–26% for all the others (n=53) |
| Verifier | `glm-5.3` | high | glm-4.7 was removed after EXP-6: **77.8% false-reject** on real multi-file patches, defect named only **11.8%** of the time |
| ⛔ Forbidden for judging | `glm-5-turbo` | — | **3% false-OK**, the only model to have approved broken code |

**Never route a role to `glm-5.2`, `glm-5.1`, `glm-5` or `glm-4.5-air`**: on the Coding Plan these are **aliases** answering as `glm-5.3` or `glm-4.7`. The "model diversity" would be fake. (Verified by reading the `model` field of the HTTP responses across 3 endpoints.)

## The evidence gate

The `Stop` hook blocks a conclusion that claims `VERDICT: PASS` when no **verification** command ran during the turn.

- Listing files is not proof: `ls`, `cat`, `find`, `grep`, `git status` do not count
- Only what verifies counts: test suites, linters, type checkers, builds
- Proof must be **fresh**: a test run two turns ago does not sign today's verdict
- `VERDICT: FAIL` is never blocked, and the gate blocks at most once per turn

Both refinements come from real sessions, not theory. The first version counted any command, so the agent's opening `ls` disarmed it for the whole session. The second matched the phrase `VERDICT: PASS` anywhere in the text, so it blocked an agent that was correctly *refusing* to sign. Both cases are now frozen as regression tests.

## Configuration

In **Settings → Plugins → betterzcode → Advanced info → Configuration**:

| Key | Default | Effect |
|---|---|---|
| `builderModel` / `builderThought` | `glm-5.3` / `max` | Builder model and effort |
| `reviewerModel` / `reviewerThought` | `glm-5.3` / `high` | Reviewer model and effort |
| `verifierModel` / `verifierThought` | `glm-5.3` / `high` | Verifier model and effort |
| `confidenceGate` | 80 | above: deterministic verification only; below: full review |
| `maxAgents` | 9 | ceiling on concurrent agents |
| `aggregateReviews` | 1 | independent reviews to aggregate on critical areas, by majority vote |
| `maxOutputTokens` | 65536 | **do not lower**: a tight budget cuts the response before the verdict line |

## Contents

```
betterzcode/
├── .zcode-plugin/plugin.json   manifest + userConfig
├── agents/
│   ├── gate-builder.md         glm-5.3 / max  — implements, never validates itself
│   ├── gate-reviewer.md        glm-5.3 / high — commit-first, read-only, locked verdict
│   └── gate-verifier.md        glm-5.3 / high — signs on execution evidence
├── commands/gate.md            Builder → Reviewer → Verifier orchestration
├── skills/evidence-gate/       the doctrine in 13 rules, each sourced
├── hooks/                      doctrine injection + evidence log + the gate
└── docs/                       routing.md + one sheet per model
```

## Evidence log

The hooks write every executed shell command and its exit code to `.betterzcode/evidence.jsonl` in the workspace. That is what lets you cross-check a Verifier signature against what actually happened — rule 12 of the doctrine (mandatory metrics), and what the gate itself reads to decide.

## Development

```bash
node validate_zcode.mjs     # 14 structural checks against the ZCode spec
node test_gate.mjs          # 22 integration tests of the gate
```

Both tools are dependency-free and require no build step. `test_gate.mjs` drives the hook over stdin/stdout, so it validates any implementation passed as an argument.

## License

MIT
