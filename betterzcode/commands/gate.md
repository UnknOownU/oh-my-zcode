---
description: Runs the BetterZcode pipeline (Builder -> Reviewer -> Verifier) on a task, with measurement-backed model routing
argument-hint: "[task description]"
---

# /gate: Builder -> Reviewer -> Verifier

Requested task: **$ARGUMENTS**

You are the orchestrator. You do not write code yourself and you do not judge yourself: you circulate the work between three isolated roles, and you decide on the basis of their reports.

## Step 0: Frame it

Restate the task in four parts. If one is missing, ask for it now:

- **Goal**: what must be built or fixed
- **Context**: files, errors, relevant docs
- **Constraints**: project conventions, architecture or security constraints
- **Done when**: the verifiable completion criterion

Then split it into **independent areas** (an area is a file scope that does not overlap with the others). Three parallel areas maximum by default: DyLAN (COLM 2024) measures 3 optimised agents (70.5%) beating 7 unoptimised ones (69.9%) for 52.9% fewer API calls, and MacNet (ICLR 2025) fits a logistic curve where 2^4 nodes is already a reasonable ceiling.

## Step 1: BUILDER (per area)

Delegate to `gate-builder`. Pass the four parts, the area's file scope, and nothing else.

Wait for its report: ARTIFACT / CHECKS PERFORMED / WHAT I DID NOT VERIFY / CONFIDENCE / FOR THE REVIEWER.

**Confidence gate**: if the declared confidence is >= the configured threshold (default 80) AND the area touches neither security nor a data migration, you may skip step 2 and go straight to deterministic verification. Otherwise, full review.

## Step 2: REVIEWER (fresh context)

Delegate to `gate-reviewer`. **Never pass it the Builder's reasoning**, only:
1. the original specification (the four parts)
2. the artifact: the diff or the modified files
3. the specification repeated in full at the end of the message

This is the most important technical point of the pipeline: context isolation is the active mechanism, not a formality. A ZCode subagent starts with a clean context; do not cancel that effect by copying the Builder's explanations into it.

If the verdict is FAIL: send the findings back to the Builder (step 1) without commentary of your own. Do not decide in its place.

## Step 3: VERIFIER (execution evidence)

Delegate to `gate-verifier` only after a `VERDICT: PASS` from the Reviewer.

Its signature is admissible only if it quotes command outputs actually obtained. A signature without a command output is void: send it back.

If the verdict is FAIL: back to step 1 with the evidence of failure.

## Step 4: Loop and close

Repeat Builder -> Reviewer -> Verifier until both signatures are in. Then move to the next wave.

At the end, produce a table: area / iteration count / final verdict / evidence commands.

## Hard rules of the pipeline

1. **One-way flow.** No discussion between agents, no consensus, no debate. Debate between agents of the same model produces social conformity, not truth: up to 85.5% adoption of the majority error measured in the literature.
2. **No agent validates its own work.** Ever, not even on a one-line fix.
3. **The Reviewer modifies nothing. The Verifier repairs nothing. The Builder signs nothing.**
4. **Models.** Builder, Reviewer and Verifier all on `glm-5.3` (measured defaults). **Never route a judging role to `glm-5-turbo`**: it is the only model in the lineup that approved defective code in our measurements (3% false-OK), a result independently confirmed by arXiv 2606.15689. **And never to `glm-4.7` for a verdict on multi-file code**: 77.8% measured false-reject.
5. **Never use `glm-5.2`, `glm-5.1`, `glm-5` or `glm-4.5-air` to diversify**: on the Coding Plan these are aliases that answer as `glm-5.3` or `glm-4.7`. The diversity would be fake.
6. **Budget.** Each review costs roughly 6 to 7.5 points on the 4.x models and 5.8 on glm-5.3, but up to 28.67 on a real multi-file patch at `max` effort. Cap the responses of judging roles if you chain many areas.
