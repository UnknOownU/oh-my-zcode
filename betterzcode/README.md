# BetterZcode

> **An agent that writes is never an agent that judges. A source it never opened is not a source.**
> A Plan Critic → Builder → Reviewer → Verifier pipeline with a hard evidence gate, a research command with a hard citation gate, and GLM model routing **grounded in measurements**, not impressions.

## What it is

Five isolated ZCode subagents, three orchestration commands, two doctrine skills, and hooks that turn the doctrine into something the runtime actually enforces. Every design decision is backed either by a measurement made on a GLM Coding Plan account or by a cited paper.

**The part nothing else does** — two gates that block instead of asking nicely:

- a `Stop` hook refuses to let a turn end on `VERDICT: PASS` when no verification command ran during that turn;
- the same hook refuses `SOURCES: VERIFIED` when the turn cites a page that was never fetched.

The second one appears to be unique. Read at source level, no production research harness — LangChain's `open_deep_research`, GPT-Researcher, STORM, smolagents, `deep-research` — verifies that a cited source supports the claim. They state citation rules in a prompt and check none of them.

## Install (local test)

1. Open a workspace in ZCode
2. **Settings → Plugins → Create → Add marketplace**
3. Local path: the folder containing `marketplace.json` (the parent of this one)
4. In the **Personal** tab, install `betterzcode`
5. Start a **new session** — hooks are snapshotted at session start

Team distribution: push this folder to GitHub, then **Add marketplace** with the repository URL.

> Requires `node` on the PATH. `validate_zcode.mjs` warns you if it is missing.

## Use

Type `/better` in the input box to see the three commands.

```
/betterplan  add a login page, sessions must survive a refresh
```
Writes a plan, has `gate-plan-critic` check it against the real code, iterates at most three times, and hands you a validated plan. **Writes no code.**

```
/betterswarm fix the orders API pagination, it skips the last page
```
The full pipeline: frames the task (Goal / Context / Constraints / Done-when), splits it into areas, checks the plan, then runs Builder → Reviewer → Verifier until both signatures are in. If you already ran `/betterplan`, it skips the plan check.

```
/betterresearch does GLM-5.3 actually benefit from chain-of-thought on code tasks?
```
Frames the question, splits it into at most three axes, researches by **fetching pages rather than trusting search snippets**, has `gate-source-verifier` confront every claim with the source it names, then publishes a report and signs `SOURCES: VERIFIED` — which the citation gate checks.

You do not have to use any of them. The `SessionStart` hook injects the doctrine into every session, so the rules apply even when you just talk to the agent normally.

## The routing, and why

| Role | Model | Effort | Evidence |
|---|---|---|---|
| Plan Critic | `glm-5.3` | max | the plan is the ceiling: **48.1% → 74.4%** Pass@1 from plan quality alone. `max` is affordable here because a plan is short text |
| Builder | `glm-5.3` | max | fastest and most capable of the real lineup |
| Reviewer | `glm-5.3` | high | **6.2% false-reject** against 21–26% for all the others (n=53) |
| Verifier | `glm-5.3` | high | glm-4.7 was removed after EXP-6: **77.8% false-reject** on real multi-file patches, defect named only **11.8%** of the time |
| Source Verifier | `glm-5.3` | high | the capability floor is not decorative: the same repair protocol scores **90.7%** with a frontier model and **79.3%** with a mid-size one, which its authors call "not yet on-par" |
| ⛔ Forbidden for judging | `glm-5-turbo` | — | **3% false-OK**, the only model to have approved broken code |

**Never route a role to `glm-5.2`, `glm-5.1`, `glm-5` or `glm-4.5-air`**: on the Coding Plan these are **aliases** answering as `glm-5.3` or `glm-4.7`. The "model diversity" would be fake. (Verified by reading the `model` field of the HTTP responses across 3 endpoints.)

## The evidence gate

The `Stop` hook blocks a conclusion that claims `VERDICT: PASS` when no **verification** command ran during the turn.

- Listing files is not proof: `ls`, `cat`, `find`, `grep`, `git status` do not count
- Only what verifies counts: test suites, linters, type checkers, builds
- Proof must be **fresh**: a test run two turns ago does not sign today's verdict
- `VERDICT: FAIL` is never blocked, and the gate blocks at most once per turn

Both refinements come from real sessions, not theory. The first version counted any command, so the agent's opening `ls` disarmed it for the whole session. The second matched the phrase `VERDICT: PASS` anywhere in the text, so it blocked an agent that was correctly *refusing* to sign. Both cases are now frozen as regression tests.

## The citation gate

The same `Stop` hook blocks a conclusion that signs `SOURCES: VERIFIED` while citing a page that was never fetched.

- **A search is not a source.** A search returns a snippet selected to match your query, so a claim resting on one is a claim about the snippet. Only `WebFetch` counts; `WebSearch` is logged, never as proof of reading
- **Signing over nothing is also blocked**: a marker with no citation at all would be the cheapest way to disarm the gate
- The window is the **session**, not the turn — deliberately unlike the evidence gate. A verdict speaks about the current state of the code so its proof must be fresh; a paper fetched twenty minutes ago still says what it said
- URLs are compared after normalisation, and arXiv `/abs/` and `/pdf/` are treated as one document — fetching the PDF and citing the abstract page is how anyone actually reads a paper
- The marker is **optional** and the gate is silent without it. What gets refused is signing it without having opened the sources

Why it exists: across 58,000 claim/source pairs, **50 to 90% of model citations are not fully supported** by the source they name, and the rate collapses further on open-ended questions (SourceCheckup, *Nature Communications* 2025). Nothing in the field guards against it.

## Changing the routing

Each role's model and thinking level live in one place: the agent's frontmatter, in `agents/*.md`.

```yaml
model: glm-5.3
thoughtLevel: high
```

There is deliberately **no settings panel**. ZCode only substitutes `${user_config.key}` into MCP declarations, and this plugin ships no MCP server, so a settings field would render a knob that turns nothing. One source of truth beats two that can disagree.

`validate_zcode.mjs` fails if the routing table above ever stops matching the agent files, which is a bug this plugin shipped once already.

Two settings are not knobs but rules, and they are enforced in the prompts:

- **Never lower the output budget.** Measured: with a 2500-token ceiling, 100% of unparseable verdicts were responses cut off before the verdict line, dropping apparent accuracy from 97.8% to 77.8%.
- **Never route a judging role to `glm-5-turbo`** (3% measured false-OK) **or `glm-4.7` on multi-file code** (77.8% measured false-reject).

## Contents

```
betterzcode/
├── .zcode-plugin/plugin.json   manifest + userConfig
├── agents/
│   ├── gate-plan-critic.md     glm-5.3 / max  — checks the plan before a line is written
│   ├── gate-builder.md         glm-5.3 / max  — implements, never validates itself
│   ├── gate-reviewer.md        glm-5.3 / high — commit-first, read-only, locked verdict
│   ├── gate-verifier.md        glm-5.3 / high — signs on execution evidence
│   └── gate-source-verifier.md glm-5.3 / high — confronts each claim with its source
├── commands/
│   ├── betterplan.md           plan, checked against the codebase, no code written
│   ├── betterswarm.md          full Plan Critic → Builder → Reviewer → Verifier run
│   └── betterresearch.md       research whose citations were actually opened
├── skills/
│   ├── evidence-gate/          the code doctrine in 15 rules, each sourced
│   └── source-gate/            the research doctrine in 12 rules, each sourced
├── hooks/                      doctrine injection + evidence log + source log + both gates
└── docs/                       routing.md + one sheet per model
```

## What lands on disk

```
.betterzcode/
├── evidence/
│   └── <session id>.jsonl                    written by the HOOKS - proof
├── plans/
│   └── 20260818-0020_login-page_91ab6d08/
│       ├── plan.md         the validated plan + what the critic caught
│       ├── report.md       run report: checkboxes, command, raw output, exit code
│       └── evidence.jsonl  frozen copy of the session log at close
└── research/
    └── 20260819-1130_glm-cot-on-code_91ab6d08/
        ├── report.md       answer, findings with verbatim quotes, stated gaps
        └── evidence.jsonl  frozen copy, including every page fetched
```

The evidence log carries both kinds of proof: `kind: "evidence"` for a command that ran, `kind: "source"` for a page that was fetched, and `kind: "search"` for a query — logged, but never counted as reading.

**Two records, two levels of trust.** The hook log is written by the runtime and the model cannot touch it: that is proof. The report is written by the agent: it is readable and structured, but it is testimony. **The gate reads only the hook log.**

Keeping both is the point: the report claims a command ran, the hook log says whether it did. That gap is measurable, and it is what makes rule 12 (mandatory metrics) real rather than aspirational.

The log is anchored to the **project root**, not the current directory, so a proof written from a subfolder is still visible from the top. Add `.betterzcode/` to your `.gitignore` unless you want the runs in version control.

### One limitation, stated plainly

**ZCode hooks do not fire inside subagents.** Measured on a real run: a Verifier executed 16 verification commands — docker, build, a full curl scenario — and not one reached the log. So the doctrine requires the main agent to run the deciding command itself before signing. Delegate the work, own the verdict.

## Development

```bash
node validate_zcode.mjs     # structural checks against the ZCode spec
node test_gate.mjs          # 45 integration tests of both gates
```

Both tools are dependency-free and require no build step. `test_gate.mjs` drives the hook over stdin/stdout, so it validates any implementation passed as an argument.

## License

MIT
