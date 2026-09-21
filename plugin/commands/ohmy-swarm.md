---
description: Runs the full pipeline on a task - plan checked, code written, reviewed in a fresh context, then proven by execution. No step signs its own work.
argument-hint: "[task description]"
---

# /ohmy-swarm: Plan Critic -> Builder -> Reviewer -> Verifier

Requested task: **$ARGUMENTS**

You are the orchestrator. You do not write code yourself and you do not judge yourself: you circulate the work between three isolated roles, and you decide on the basis of their reports.

## Step 0: Frame it

Restate the task in four parts. If one is missing, ask for it now:

- **Goal**: what must be built or fixed
- **Context**: files, errors, relevant docs
- **Constraints**: project conventions, architecture or security constraints
- **Done when**: the verifiable completion criterion

Then split it into **independent areas** (an area is a file scope that does not overlap with the others). Three parallel areas maximum by default: DyLAN (COLM 2024) measures 3 optimised agents (70.5%) beating 7 unoptimised ones (69.9%) for 52.9% fewer API calls, and MacNet (ICLR 2025) fits a logistic curve where 2^4 nodes is already a reasonable ceiling.

## Step 0.5: PLAN CRITIC (before any code)

Once the areas are defined, you have a plan. Do not execute it yet.

**If the user already ran `/ohmy-plan` and hands you a validated plan, skip this step** and go to step 1: it has been checked already.

Otherwise delegate to `plan-critic`. Pass it the four parts and the planned steps. It checks against the codebase: do the referenced files exist, is the step order workable, is a precondition missing, is the success criterion testable, was anything dropped.

If it returns `PLAN REVISE`: fix the plan with its concrete fixes, then send it back. **Three rounds maximum** — the budget ceiling and the escalation point, not a target (the 96.5%-by-3 figure comes from embodied-AI plans, arXiv 2509.02761; no measured constant exists for code planning); after that, surface the remaining problems to the user and let them decide.

If it returns `PLAN READY`: proceed to step 1.

Skip this step only for a change confined to a single file with an obvious criterion. A wrong plan is the one defect no downstream role can catch: the Builder executes it, the Reviewer compares the code to it, the Verifier tests against it.

## Step 1: BUILDER (per area)

Delegate to `builder`. Pass the four parts, the area's file scope, and nothing else.

Wait for its report: ARTIFACT / CHECKS PERFORMED / WHAT I DID NOT VERIFY / CONFIDENCE / FOR THE REVIEWER.

**Confidence gate**: if the declared confidence is >= the configured threshold (default 80) AND the area touches neither security nor a data migration, you may skip step 2 and go straight to deterministic verification. Otherwise, full review.

## Step 2: REVIEWER (fresh context)

Delegate to `reviewer`. **Never pass it the Builder's reasoning**, only:
1. the original specification (the four parts)
2. the artifact: the diff or the modified files
3. the specification repeated in full at the end of the message

This is the most important technical point of the pipeline: context isolation is the active mechanism, not a formality. A ZCode subagent starts with a clean context; do not cancel that effect by copying the Builder's explanations into it.

If the verdict is FAIL: send the findings back to the Builder (step 1) without commentary of your own. Do not decide in its place.

## Step 3: VERIFIER (execution evidence)

Delegate to `verifier` only after a `VERDICT: PASS` from the Reviewer.

Its signature is admissible only if it quotes command outputs actually obtained. A signature without a command output is void: send it back.

If the verdict is FAIL: back to step 1 with the evidence of failure.

## Step 4: Loop and close

Repeat Builder -> Reviewer -> Verifier until both signatures are in, with two limits:

- **Adaptive stop.** The loop ends at the FIRST full pass — both signatures in. Never burn budget on an area that already passed.
- **Hard ceiling.** Three full Builder -> Reviewer -> Verifier cycles per area maximum. The cap of 3 is the budget ceiling and the escalation point, not a target. When three cycles are exhausted without both signatures: STOP the area, keep the blocking evidence (the Reviewer's findings or the Verifier's failure outputs), report it in the run report, and let the user decide.

Then move to the next wave.

Retries past the first cycle are cheap only in appearance: each full cycle here costs three complete agents, while measured gains saturate early — retrying helps only when a verifier sorts the attempts, and this loop is already gate-sorted (budget 1 -> 8 rollouts lifted 37.60% -> 46.00%, with execution-only selection dropping at budget 8, arXiv 2503.23803); adding LLM calls is non-monotonic, improving easy queries and degrading hard ones (arXiv 2403.02419). The ceiling must therefore sit far below raw sampling budgets.

**Before you sign anything, run the deciding command yourself.** A subagent's commands are not traceable from this session, so the Verifier's sixteen proofs cannot back your signature: only what runs here can. Run the one command that settles it, quote its raw output and its exit code, then conclude.

## Step 5: Write the run report

At the **project root**, in `.oh-my-zcode/plans/<YYYYMMDD-HHMM>_<slug>_<session8>/` (reuse the folder if `/ohmy-plan` already created one), write `report.md`:

```markdown
# Run report - <Goal>

- **Session**: <full session id>
- **Finished**: <ISO timestamp>
- **Final verdict**: PASS | FAIL

## Verification checklist
- [x] `npm run build` - exit 0
      <the raw output, or its decisive lines>
- [x] artifact identity - <SHA-256 of each shipped artifact, matching the bytes the run approved — when the deliverable is a re-run or re-deployed artifact>
- [ ] `<command>` - not run, because <reason>

## Per area
| Area | Iterations | Reviewer | Verifier |
|---|---|---|---|
| ... | 2 | PASS | PASS |

The **Iterations** column carries the honest attempt count: a task resolved on attempt N is reported as N, never presented as first-try. An area stopped at the ceiling of 3 cycles without both signatures is reported as 3 with the blocking evidence.

## Signed here, in this session
- `<the deciding command you ran yourself>` - exit <code>

## Not covered
<what stayed untested, and why>
```

Then copy the session's evidence file, `.oh-my-zcode/evidence/<session id>.jsonl`, into the same folder as `evidence.jsonl`. The original stays where it is.

**A checked box must carry its command, its raw output and its exit code.** A box you tick without those is a claim, not a proof, and this report exists precisely to stop being believed on your word. The evidence file is written by the hooks and you do not control it: whoever reads both can tell them apart.

## Step 6: Report to the user

Produce a table: area / iteration count / final verdict / evidence commands, and give the path of the run folder.

## Hard rules of the pipeline

1. **One-way flow.** No discussion between agents, no consensus, no debate. Debate between agents of the same model produces social conformity, not truth: up to 85.5% adoption of the majority error measured in the literature.
2. **No agent validates its own work.** Ever, not even on a one-line fix.
3. **The Reviewer modifies nothing. The Verifier repairs nothing. The Builder signs nothing.**
4. **Models.** Builder, Reviewer and Verifier all on `glm-5.3` (measured defaults). **Never route a judging role to `glm-5-turbo`**: it is the only model in the lineup that approved defective code in our measurements (3% false-OK), a result independently confirmed by arXiv 2606.15689. **And never to `glm-4.7` for a verdict on multi-file code**: 77.8% measured false-reject.
5. **Never use `glm-5.2`, `glm-5.1`, `glm-5` or `glm-4.5-air` to diversify**: on the Coding Plan these are aliases that answer as `glm-5.3` or `glm-4.7`. The diversity would be fake.
6. **Budget.** Each review costs roughly 6 to 7.5 points on the 4.x models and 5.8 on glm-5.3, but up to 28.67 on a real multi-file patch at `max` effort. **Never cap the output budget of a judging role to control that**: `max_tokens` goes to `131072` and never below, because the verdict lives on the last line and a truncated response carries no verdict at all. If you chain many areas, spend less through the confidence gate in step 1 or fewer areas per wave — never through truncation.
