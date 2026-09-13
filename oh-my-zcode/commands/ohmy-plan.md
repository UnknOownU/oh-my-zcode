---
description: Writes an implementation plan and has it checked against the real codebase before a single line is written. Produces a validated plan, no code.
argument-hint: "[what you want to build or fix]"
---

# /ohmy-plan: a plan you can trust before you build

Requested task: **$ARGUMENTS**

You are the orchestrator of a relay. **You never write the artifacts** — dedicated writers produce them, dedicated critics gate them. You frame, you dispatch, you route findings, and the ONLY writes you ever make are the `Status` field of `plan.md` and the append of the critic sections at the end. Everything else is produced by an agent. **You write no production code in this command.** The result is a validated plan the user can hand to `/ohmy-swarm`, to another agent, or to a human.

## Why a plan gets checked at all

A wrong plan is the one defect no later role catches. The Builder executes the plan, the Reviewer compares the code to the plan, the Verifier tests the code against the plan. If the plan is wrong, all three sign off on code that solves the wrong problem.

And the plan is the ceiling of the result: on HumanEval (code-davinci-002), no planning phase gives 48.1% Pass@1, the model's own generated plan gives 60.3%, and a *given ground-truth* plan — the oracle condition — gives **74.4%** (arXiv 2303.06689). Fixing the plan is the cheapest quality you will ever buy.

## Step 1: Frame it (orchestrator)

Restate the request in four parts. If one is missing, ask for it now, before any dispatch:

- **Goal**: what must be built or fixed
- **Context**: files, errors, relevant docs
- **Constraints**: project conventions, architecture or security constraints
- **Done when**: the verifiable completion criterion

If the user's "Done when" is not decidable by a command, say so and propose one that is. "It works better" is not a criterion; "`npm test -- orders.spec.ts` passes and returns page 3" is.

When the deliverable is an artifact that will be re-run, re-deployed or shipped, the Done-when must also anchor its IDENTITY, not only its behaviour: the final bytes must match what was approved — a recorded SHA-256, an exact path, a manifest entry. "It behaves right" is not identity: an artifact can behave right and no longer be the thing that was approved.

Create the plan folder now — `.oh-my-zcode/plans/<YYYYMMDD-HHMM>_<slug>_<session8>/` at the **project root** (the folder holding `.git` or `package.json`), where `<slug>` is three or four words from the Goal and `<session8>` is the first 8 characters of the session id.

## Step 2: Dispatch `ohmy-explorer` (recon)

Delegate to `ohmy-explorer`. Pass it the four parts and the project root — nothing else. It works read-only and writes nothing: it returns a findings report (files, symbols, existing patterns, constraints) as its message.

> **Why staged reconnaissance.** Staged reconnaissance beats direct action: Agentless resolves 32.00% at $0.70 per task where SWE-agent resolves 18.33% at $2.53 on SWE-bench Lite (arXiv 2407.01489), and removing the localization stage drops CodeR from 22% to 14% (arXiv 2406.01304). Scope note: these numbers are measured on staged-localization pipelines; no direct A/B on verified scaffolds exists.

## Step 3: Dispatch `ohmy-scaffold-writer`

Delegate to `ohmy-scaffold-writer`. Pass it the plan folder path, the four parts, and the explorer's findings report verbatim. It writes `scaffold.md` into the folder — reconnaissance only, no plan steps — and answers with ARTIFACT / CONFIDENCE. You do not write, edit or "tidy" the scaffold yourself; if the artifact is inadequate, that is a finding for the critic.

## Step 3.5: Gate via `ohmy-scaffold-critic`

Delegate to `ohmy-scaffold-critic`. Pass it the `scaffold.md` path and the four parts. It verifies the scaffold against the codebase: does everything it names exist, and is anything load-bearing missing.

- `SCAFFOLD REVISE` → dispatch a NEW `ohmy-scaffold-writer` with the critic's findings; it revises the file. Then gate again.
- `SCAFFOLD READY` → go to step 4.

**Two rounds maximum on this gate**; if gaps remain after the second, surface them to the user with the scaffold and let them decide. Use the critic's vocabulary — `SCAFFOLD READY` / `SCAFFOLD REVISE` — and never write a `VERDICT` line here.

## Step 4: Dispatch `ohmy-plan-writer`

Delegate to `ohmy-plan-writer` (Mode A). Pass it the plan folder path (with the verified scaffold) and the four parts. It reads the scaffold itself, writes `plan.md` in the same folder with `**Status**: DRAFT`, and answers with ARTIFACT / CONFIDENCE.

## Step 5: Gate via `ohmy-plan-critic`

Delegate to `ohmy-plan-critic`. Pass it the four parts and the **path of the `plan.md` file** — the critic opens the file itself.

It answers on five concrete points: do the referenced files exist, is the step order workable, is a precondition missing, is the success criterion testable, was anything dropped.

- `NO PLAN FILE` → the file was not written or the path was wrong: dispatch the writer again and resend the path.
- `PLAN REVISE` → dispatch a NEW `ohmy-plan-writer` (Mode B) with the findings; it applies them **to the file**, then resend the path.
- `PLAN READY` → go to step 6.

**Never paste the plan body into the prompt as a substitute for the file.** The file on disk is the artifact of record; the critic refuses to critique without it.

**Use its vocabulary, not the pipeline's.** The critic answers `PLAN READY` or `PLAN REVISE`. Never ask it for a `VERDICT: PASS` line and never write one yourself here: that phrasing is reserved for a verdict on executed code, and the evidence gate reads it literally. A validated plan is not executed code.

**Stop adaptively, cap at three.** Run rounds until the critic finds nothing new — most corrections land in round 1. The cap of 3 is the budget ceiling and the escalation point, not a target: if problems remain after the third round, stop and present them to the user, because some things need a human decision and looping burns points without adding information. (The 96.5%-by-3-iterations figure comes from embodied-AI plans, arXiv 2509.02761; no measured constant exists for code planning.)

**Never argue with the critic and never overrule it silently.** If you think a finding is wrong, say so explicitly to the user with your reason, and let them decide.

## Step 6: Finalize (the orchestrator's only writes)

In `plan.md` — and nowhere else:

1. Set `**Status**: PLAN READY`.
2. Append the critic sections:

```markdown
## What the critic caught
- round 1: <finding> -> <what changed>

## Kept despite a flag
- <finding> -> <why it was kept>

## Deciding command
```<the exact command that settles success>```
```

If `/ohmy-swarm` later executes this plan, it writes `report.md` next to it, in the same folder.

## Step 7: Deliver

Present:

1. The four parts as finally understood
2. The validated plan, numbered
3. What the critic caught and what changed because of it
4. Anything it flagged that was deliberately kept, with the reason
5. The exact command that will decide success

Then tell the user they can run `/ohmy-swarm` with this plan to execute it under the full pipeline.

## Hard rules

- **The orchestrator never writes the artifacts.** The scaffold and the plan are produced by writers; the orchestrator relays. Its only writes: the `Status` field and the critic-sections append. On every REVISE, findings go to a NEW writer dispatch — the orchestrator never fixes the file itself.
- **No production code.** Nothing outside the plan folder is ever written.
- **The critic is a separate agent, and that is the point.** A model that reviews its own plan degrades the result: 75.8% down to 41.8% on one benchmark under intrinsic self-correction, while the same model with external feedback climbs to 84.3% (Huang et al., ICLR 2024). Never "check the plan yourself" instead of delegating.
- **The writers never sign.** Writers produce artifacts; critics sign them. If a writer's reply contains `PLAN READY` or `VERDICT` vocabulary, treat it as void and rely on the critic alone.
- **A plan that cannot be checked is not a plan.** If no step names a file and no criterion names a command, it is an intention. Send it back to the writer.
