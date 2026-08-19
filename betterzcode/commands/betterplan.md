---
description: Writes an implementation plan and has it checked against the real codebase before a single line is written. Produces a validated plan, no code.
argument-hint: "[what you want to build or fix]"
---

# /betterplan: a plan you can trust before you build

Requested task: **$ARGUMENTS**

You produce a plan and you get it checked. **You write no production code in this command.** The result is a validated plan the user can hand to `/betterswarm`, to another agent, or to a human.

## Why a plan gets checked at all

A wrong plan is the one defect no later role catches. The Builder executes the plan, the Reviewer compares the code to the plan, the Verifier tests the code against the plan. If the plan is wrong, all three sign off on code that solves the wrong problem.

And the plan is the ceiling of the result: on HumanEval (code-davinci-002), no planning phase gives 48.1% Pass@1, the model's own generated plan gives 60.3%, and a *given ground-truth* plan — the oracle condition — gives **74.4%** (arXiv 2303.06689). Fixing the plan is the cheapest quality you will ever buy.

## Step 1: Frame it

Restate the request in four parts. If one is missing, ask for it now, before writing any plan:

- **Goal**: what must be built or fixed
- **Context**: files, errors, relevant docs
- **Constraints**: project conventions, architecture or security constraints
- **Done when**: the verifiable completion criterion

If the user's "Done when" is not decidable by a command, say so and propose one that is. "It works better" is not a criterion; "`npm test -- orders.spec.ts` passes and returns page 3" is.

## Step 2: Build the scaffold, persist it

Read before you plan. Create the plan folder now — `.betterzcode/plans/<YYYYMMDD-HHMM>_<slug>_<session8>/` at the **project root** (the folder holding `.git` or `package.json`), where `<slug>` is three or four words from the Goal and `<session8>` is the first 8 characters of the session id.

In that folder, write `scaffold.md`: the reconnaissance, nothing else.

- relevant files, with their concrete paths
- the symbols you intend to call
- how the project already solves similar problems
- constraints detected in the code

No plan steps inside the scaffold. A plan written from memory of what a project usually looks like is the plan that fails on step one.

> **Why a scaffold first.** Staged reconnaissance beats direct action: Agentless resolves 32.00% at $0.70 per task where SWE-agent resolves 18.33% at $2.53 on SWE-bench Lite (arXiv 2407.01489), and removing the localization stage drops CodeR from 22% to 14% (arXiv 2406.01304). Scope note: these numbers are measured on staged-localization pipelines; no direct A/B on verified scaffolds exists.

## Step 2.5: Gate the scaffold

Delegate to `gate-scaffold-critic`. Pass it the `scaffold.md` path and the four parts. It verifies the scaffold against the codebase: does everything it names exist, and is anything load-bearing missing.

- `SCAFFOLD REVISE` → fix the `scaffold.md` file itself, then send the file back.
- `SCAFFOLD READY` → go to step 3.

Two rounds maximum on this gate; if gaps remain after the second, surface them to the user with the scaffold and let them decide. Use the critic's vocabulary — `SCAFFOLD READY` / `SCAFFOLD REVISE` — and never write a `VERDICT` line here.

## Step 3: Write the plan, persist it

Write the plan on top of the verified scaffold. Numbered steps, each stating:

- **what changes**, with the concrete file path
- **why**, tied to one of the four parts above
- **how it is checked**, when the step is checkable on its own

Keep it to the smallest plan that satisfies the Goal. Extra steps nobody asked for are a defect, not generosity.

**Persist it now, before any critique.** Save it as `plan.md` in the same folder as the `scaffold.md`, with `**Status**: DRAFT`:

```markdown
# <Goal in one line>

- **Session**: <full session id>
- **Created**: <ISO timestamp>
- **Status**: DRAFT

## Goal / Context / Constraints / Done when
...

## Plan
1. ...
```

A plan that only exists in a chat scroll is lost the moment the session ends — and a critique of an unsaved plan critiques nothing. The file is the artifact of record.

## Step 4: Send the file to the critic

Delegate to `gate-plan-critic`. Pass it the four parts and the **path of the `plan.md` file** — the critic opens the file itself.

It answers on five concrete points: do the referenced files exist, is the step order workable, is a precondition missing, is the success criterion testable, was anything dropped.

- `NO PLAN FILE` → the file was not written or the path was wrong: write the file and resend the path.
- `PLAN REVISE` → apply its fixes **to the file**, then resend the path.
- `PLAN READY` → go to step 5.

**Never paste the plan body into the prompt as a substitute for the file.** The file on disk is the artifact of record; the critic refuses to critique without it.

**Use its vocabulary, not the pipeline's.** The critic answers `PLAN READY` or `PLAN REVISE`. Never ask it for a `VERDICT: PASS` line and never write one yourself here: that phrasing is reserved for a verdict on executed code, and the evidence gate reads it literally. A validated plan is not executed code.

**Stop adaptively, cap at three.** Run rounds until the critic finds nothing new — most corrections land in round 1. The cap of 3 is the budget ceiling and the escalation point, not a target: if problems remain after the third round, stop and present them to the user, because some things need a human decision and looping burns points without adding information. (The 96.5%-by-3-iterations figure comes from embodied-AI plans, arXiv 2509.02761; no measured constant exists for code planning.)

**Never argue with the critic and never overrule it silently.** If you think a finding is wrong, say so explicitly to the user with your reason, and let them decide.

## Step 5: Finalize the file

The file already exists — nothing is created here anymore. In `plan.md`:

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

If `/betterswarm` later executes this plan, it writes `report.md` next to it, in the same folder.

## Step 6: Deliver

Present:

1. The four parts as finally understood
2. The validated plan, numbered
3. What the critic caught and what you changed because of it
4. Anything it flagged that you deliberately kept, with your reason
5. The exact command that will decide success

Then tell the user they can run `/betterswarm` with this plan to execute it under the full pipeline.

## Hard rules

- **No production code.** You may read anything; you write nothing outside the plan itself.
- **The critic is a separate agent, and that is the point.** A model that reviews its own plan degrades the result: 75.8% down to 41.8% on one benchmark under intrinsic self-correction, while the same model with external feedback climbs to 84.3% (Huang et al., ICLR 2024). Never "check the plan yourself" instead of delegating.
- **A plan that cannot be checked is not a plan.** If no step names a file and no criterion names a command, you have written an intention. Rewrite it.
