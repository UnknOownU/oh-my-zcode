# BetterZcode

> **An agent that writes is never an agent that judges. A source it never opened is not a source.**
> A Plan Critic → Builder → Reviewer → Verifier pipeline with a hard evidence gate, a research command with a hard citation gate, and GLM model routing **grounded in measurements**, not impressions.

## What it is

Six isolated ZCode subagents, five orchestration commands, three doctrine skills, and hooks that turn the doctrine into something the runtime actually enforces. Every design decision is backed either by a measurement made on a GLM Coding Plan account or by a cited paper.

The fifth command, `/betterredteam`, is authorized impact assessment: it answers what an attacker actually takes — not whether a door is closed.

**The part nothing else does** — four gates that block instead of asking nicely:

- a `Stop` hook refuses to let a turn end on `VERDICT: PASS` when no verification command ran during that turn;
- the same hook refuses `SOURCES: VERIFIED` when the turn cites a page that was never fetched;
- and, for security runs, the same hook refuses `FINDINGS: VERIFIED` when no verification command ran during the turn — a finding that was not reproduced does not exist;
- the fourth gate blocks the action instead of the conclusion: a `PreToolUse` hook refuses the attack command itself unless a test/dev scope has been authorized.

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
Builds a scaffold of the real code and has `gate-scaffold-critic` verify it, writes the plan on top — persisted to disk **before** critique, the critic refuses a plan that has no file — and has `gate-plan-critic` check it. Hands you a validated plan. **Writes no code.**

```
/betterswarm fix the orders API pagination, it skips the last page
```
The full pipeline: frames the task (Goal / Context / Constraints / Done-when), splits it into areas, checks the plan, then runs Builder → Reviewer → Verifier until both signatures are in. If you already ran `/betterplan`, it skips the plan check.

```
/betterresearch does GLM-5.3 actually benefit from chain-of-thought on code tasks?
```
Frames the question, splits it into at most three axes, researches by **fetching pages rather than trusting search snippets**, has `gate-source-verifier` confront every claim with the source it names, then publishes a report and signs `SOURCES: VERIFIED` — which the citation gate checks.

```
/bettersecurity https://our-staging.example.com — full check, we own the staging box
```
Locks the scope in writing before anything is touched, has the plan checked against the doctrine, runs recon then the attackers, and finally an independent `gate-finding-verifier` **re-executes** every candidate finding instead of re-reasoning about it. Only reproduced findings enter the report, which then signs `FINDINGS: VERIFIED` — and the findings gate checks that the signature is backed by a verification command that actually ran this turn.

```
/betterredteam https://staging.ourapp.io — full chain, we own staging
```
The environment gate comes first: test/dev or nothing — the run does not start outside an authorized scope. Beasts then chain foothold → escalation → data with every constraint enforced externally by the scope gate, not by their own restraint. Impact is proven by sample or by controlled callback, and the run ends with a detection report per attack family plus cleanup re-verification.

You do not have to use any of them. The `SessionStart` hook injects the doctrine into every session, so the rules apply even when you just talk to the agent normally.

## The routing, and why

| Role | Model | Effort | Evidence |
|---|---|---|---|
| Plan Critic | `glm-5.3` | max | the plan is the ceiling: **48.1% → 60.3% → 74.4%** Pass@1 — direct / generated plan / ground-truth plan, HumanEval code-davinci-002. `max` is affordable here because a plan is short text |
| Builder | `glm-5.3` | max | fastest and most capable of the real lineup |
| Reviewer | `glm-5.3` | high | **6.2% false-reject** against 21–26% for all the others (n=53) |
| Verifier | `glm-5.3` | high | glm-4.7 was removed after EXP-6: **77.8% false-reject** on real multi-file patches, defect named only **11.8%** of the time |
| Source Verifier | `glm-5.3` | high | the capability floor is not decorative: the same repair protocol scores **90.7%** with a frontier model and **79.3%** with a mid-size one, which its authors call "not yet on-par" |
| Finding Verifier | `glm-5.3` | max | independent reproduction: adversarial verification eliminated 49.5% of candidate findings (OpenAnt); re-execution not re-reasoning, because verification that only re-reasons suppresses 22.25% of true positives (Sifting the Noise) |
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

The same `Stop` hook blocks a conclusion that signs `SOURCES: VERIFIED` while citing a page that was never retrieved.

- **A search is not a source.** A search returns a snippet selected to match your query, so a claim resting on one is a claim about the snippet. Retrievals are recognised by their **input shape** — anything carrying a `url` — so ZCode's `WebFetch` and Z.AI's `webReader` MCP tool both count, while `WebSearch` and `webSearchPrime` are logged and never counted as reading
- **A failed retrieval is not a source either.** A 403 is logged as `fetch_failed`, and citing it is refused
- **Refuse what the log contradicts, never what it is silent about.** A signature citing a page nobody fetched is blocked. A signature that cites nothing while the session fetched pages is not — the citations are in the report file, and the gate reads the message
- **Signing with nothing retrieved all session is still blocked**: that one is a contradiction, and it would be the cheapest way to disarm the gate
- The window is the **session**, not the turn — deliberately unlike the evidence gate. A verdict speaks about the current state of the code so its proof must be fresh; a paper fetched twenty minutes ago still says what it said
- URLs are compared after normalisation, and arXiv `/abs/` and `/pdf/` are treated as one document — fetching the PDF and citing the abstract page is how anyone actually reads a paper
- The marker is **optional** and the gate is silent without it. What gets refused is signing it without having opened the sources

Why it exists: across 58,000 claim/source pairs, **50 to 90% of model citations are not fully supported** by the source they name, and the rate collapses further on open-ended questions (SourceCheckup, *Nature Communications* 2025). Nothing in the field guards against it.

**Refined by a real run, like the evidence gate before it.** On 2026-08-19 a competitive study fetched 30 pages, wrote all 30 URLs into `report.md`, and signed in a chat message that carried none of them. An audit of the two records afterwards found **30 cited for 30 fetched, no gap in either direction** — and the gate had blocked it anyway, because it reads the message and the citations were in the artifact. Three things changed as a result: the silence rule above, the failed-retrieval rule, and the bypass below. All three are frozen as regression tests, replayed against that session's untouched log.

**The anti-loop no longer goes blind.** ZCode caps retries, so the gate never blocks twice in a turn. It used to stop evaluating entirely on the retry, which made a bypassed gate indistinguishable from a satisfied one in the log. It now still evaluates and records `gate_bypassed` — it just does not act on it.

## The findings gate

The same `Stop` hook also blocks a conclusion that signs `FINDINGS: VERIFIED` when no **verification** command ran during the turn. A security run ends with findings or with silence — never with claims nobody reproduced.

- **A finding that was not reproduced does not exist.** Scanners and attackers produce candidates; only the independent verifier's re-execution turns a candidate into a finding
- **Security tools count as verification** for this gate: `nuclei`, `semgrep`, `sqlmap`, `nmap` and friends are verification commands, unlike the evidence gate where only test suites, linters, type checkers and builds count
- Proof must be **fresh**: a scanner run last turn does not sign this turn's findings
- The marker is **optional** and the gate is silent without it — what gets refused is signing it without having run verification

Why it exists: in the OpenAnt adversarial-verification study, independent reproduction eliminated **49.5% of candidate findings**. And verification must be re-execution, not re-reasoning: a verifier that only re-reasons suppressed **22.25% of true positives** in Sifting the Noise, dropping its true-positive rate from 23.0 to 6.3.

## The scope gate

The fourth gate is the plugin's first `PreToolUse` hook: it blocks the attack command itself, not the conclusion. The first three gates refuse a *verdict* that lacks proof; this one refuses the *action* before it runs.

- Attack tools — `nuclei`, `sqlmap`, `nmap`, `semgrep`, `ffuf`, `nikto`, `hydra` and friends — are matched on Bash invocations and refused outright unless `.betterzcode/security/active_scope.json` authorizes them for this session
- A valid scope requires an environment of `dev`, `staging` or `test`, and matching target hosts — **prod is never authorizable**
- A missing session id fails closed: no scope file, no attack commands
- During an active scope, every URL host is confined to the declared targets

The evidence for this shape is the standards themselves: authorization comes *before* testing — PTES states "It is critical that testing does not begin until this document is signed by the customer" — and AWS requires DoS-capable tools to be mechanically disarmed when unauthorized. The gate is that principle made mechanical.

## Changing the routing

Each role's model and thinking level live in one place: the agent's frontmatter, in `agents/*.md`.

```yaml
model: glm-5.3
thoughtLevel: high
```

There is deliberately **no settings panel**. ZCode only substitutes `${user_config.key}` into MCP declarations, and this plugin ships no MCP server, so a settings field would render a knob that turns nothing. One source of truth beats two that can disagree.

`validate_zcode.mjs` fails if the routing table above ever stops matching the agent files, which is a bug this plugin shipped once already.

Two settings are not knobs but rules, and they are enforced in the prompts:

- **Set `max_tokens` to 131072 — the documented ceiling — and never below.** Measured: with a 2500-token ceiling, 100% of unparseable verdicts were responses cut off before the verdict line, dropping apparent accuracy from 97.8% to 77.8%. The ceiling is free: you are billed for the tokens generated, not for the limit you allow.
- **Never route a judging role to `glm-5-turbo`** (3% measured false-OK) **or `glm-4.7` on multi-file code** (77.8% measured false-reject).

## Contents

```
betterzcode/
├── .zcode-plugin/plugin.json   manifest
├── agents/
│   ├── gate-plan-critic.md     glm-5.3 / max  — checks the plan before a line is written
│   ├── gate-scaffold-critic.md glm-5.3 / max  — checks the recon scaffold before the plan exists
│   ├── gate-builder.md         glm-5.3 / max  — implements, never validates itself
│   ├── gate-reviewer.md        glm-5.3 / high — commit-first, read-only, locked verdict
│   ├── gate-verifier.md        glm-5.3 / high — signs on execution evidence
│   ├── gate-source-verifier.md glm-5.3 / high — confronts each claim with its source
│   └── gate-finding-verifier.md glm-5.3 / max — re-executes security findings, never re-reasons
├── commands/
│   ├── betterplan.md           plan, checked against the codebase, no code written
│   ├── betterswarm.md          full Plan Critic → Builder → Reviewer → Verifier run
│   ├── betterresearch.md       research whose citations were actually opened
│   ├── bettersecurity.md       scoped security run with independent finding verification
│   └── betterredteam.md        authorized impact assessment, attack commands gated by scope
├── skills/
│   ├── evidence-gate/          the code doctrine in 15 rules, each sourced
│   ├── source-gate/            the research doctrine in 12 rules, each sourced
│   └── security-gate/          the security doctrine, each rule sourced
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
│       ├── scaffold.md     the verified recon: files, symbols, existing patterns
│       ├── plan.md         the validated plan + what the critic caught
│       ├── report.md       run report: checkboxes, command, raw output, exit code
│       └── evidence.jsonl  frozen copy of the session log at close
└── research/
    └── 20260819-1130_glm-cot-on-code_91ab6d08/
        ├── report.md       answer, findings with verbatim quotes, stated gaps
        └── evidence.jsonl  frozen copy, including every page fetched
└── security/
    ├── active_scope.json   transient scope authorization, read by the gate, deleted at run end
    ├── loot.md             the chain ledger
    └── 20260819-1400_staging-check_91ab6d08/
        ├── scope.json      the written scope lock, before anything was touched
        ├── surface.md      the enumerated attack surface after recon
        ├── report.md       only reproduced findings, each with its re-execution proof
        └── evidence.jsonl  frozen copy, including every verification command
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
node test_gate.mjs          # 88 integration tests of all four gates
```

Both tools are dependency-free and require no build step. `test_gate.mjs` drives the hook over stdin/stdout, so it validates any implementation passed as an argument.

## License

MIT
