---
description: Writes an implementation plan and has it checked against the real codebase before a single line is written. Produces a validated plan, no code.
argument-hint: "[what you want to build or fix]"
---

# /betterplan: a plan you can trust before you build

Requested task: **$ARGUMENTS**

You produce a plan and you get it checked. **You write no production code in this command.** The result is a validated plan the user can hand to `/betterswarm`, to another agent, or to a human.

## Why a plan gets checked at all

A wrong plan is the one defect no later role catches. The Builder executes the plan, the Reviewer compares the code to the plan, the Verifier tests the code against the plan. If the plan is wrong, all three sign off on code that solves the wrong problem.

And the plan is the ceiling of the result: on the same code task, no planning phase gives 48.1% Pass@1, a plan gives 60.3%, and a *correct* plan gives **74.4%** (arXiv 2303.06689). Fixing the plan is the cheapest quality you will ever buy.

## Step 1: Frame it

Restate the request in four parts. If one is missing, ask for it now, before writing any plan:

- **Goal**: what must be built or fixed
- **Context**: files, errors, relevant docs
- **Constraints**: project conventions, architecture or security constraints
- **Done when**: the verifiable completion criterion

If the user's "Done when" is not decidable by a command, say so and propose one that is. "It works better" is not a criterion; "`npm test -- orders.spec.ts` passes and returns page 3" is.

## Step 2: Ground the plan in the actual code

Read before you plan. Open the files you intend to touch, check the symbols you intend to call, look at how the project already solves similar problems. A plan written from memory of what a project usually looks like is the plan that fails on step one.

## Step 3: Write the plan

Numbered steps. Each step states:

- **what changes**, with the concrete file path
- **why**, tied to one of the four parts above
- **how it is checked**, when the step is checkable on its own

Keep it to the smallest plan that satisfies the Goal. Extra steps nobody asked for are a defect, not generosity.

## Step 4: Send it to the critic

Delegate to `gate-plan-critic`. Pass it the four parts and the numbered plan.

It answers on five concrete points: do the referenced files exist, is the step order workable, is a precondition missing, is the success criterion testable, was anything dropped.

- `PLAN REVISE` → apply its fixes, then send it back.
- `PLAN READY` → go to step 5.

**Three rounds maximum.** 96.5% of plans converge in three iterations or fewer (arXiv 2509.02761). If problems remain after the third, stop and present them to the user: some things need a human decision, and looping burns points without adding information.

**Never argue with the critic and never overrule it silently.** If you think a finding is wrong, say so explicitly to the user with your reason, and let them decide.

## Step 5: Deliver

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
