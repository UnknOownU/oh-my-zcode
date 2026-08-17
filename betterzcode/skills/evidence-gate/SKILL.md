---
name: evidence-gate
description: Doctrine of the Plan-Critic -> Builder -> Reviewer -> Verifier pipeline for GLM agents, grounded in measurements. Load it when a plan, an approach or a task breakdown is being written, when an implementation task must be seriously verified, when discussing agent code review, role separation, false-OK or over-rejection, or when configuring GLM model routing per role.
---

# evidence-gate: the doctrine

> **An agent that writes is never an agent that judges.**

## The 13 rules, each backed by a measurement

0. **The plan is checked before it is executed.** As soon as a plan, an approach or a task breakdown exists, a separate agent verifies it against the codebase: do the referenced files exist, is the step order workable, is a precondition missing, is the success criterion testable, was anything asked for dropped.
   *Evidence: the plan is the ceiling of the result. On the same code task, no planning phase 48.1% Pass@1, with a plan 60.3%, with a correct plan **74.4%** (arXiv 2303.06689). Grounded plan critique lifts TravelPlanner from 8.3% to 23.89% and NATURAL PLAN from 3.43% to 40% (LLM-Modulo, arXiv 2411.14484); with a strict verifier, 10% to 93.9% (NAACL 2025).*
   *And it must be a SEPARATE agent: intrinsic self-correction drops one model from 75.8% to 41.8%, while the same model with external feedback climbs to 84.3% (Huang et al., ICLR 2024). A critic that merely gives an opinion is worse than none.*
   *Bounded at 3 rounds: 96.5% of plans converge in 3 iterations or fewer (arXiv 2509.02761).*

1. **Strict Builder -> Reviewer -> Verifier sequence per area**, closed loop until both signatures.
   *Evidence: re-labelling an output under an external role gains +23 to +93 points of correction (arXiv 2606.05976); intrinsic self-correction loses up to 37.7 points (Huang et al., ICLR 2024).*

2. **Reviewer in a fresh context.** It receives the spec and the artifact, never the Builder's reasoning.
   *Evidence: three agents of the same model sharing a context produce near-identical representations (cosine 0.888), so their errors are correlated.*

3. **Commit-first verdict.** Acceptance criteria are written BEFORE looking at the code.
   *Evidence: internal measurement, the protocol removes false-rejects on glm-4.5 and glm-4.7 (9.1% -> 0%).*

4. **Re-anchoring.** The specification is repeated in full at the end of the Reviewer's prompt.

5. **Verification by execution.** Reproducer that fails before and passes after; existing suite; linter; types. The signature quotes the raw outputs.
   *Evidence: ranking by executed tests gains 21% relative over ranking by model opinion (MASAI).*

6. **Test-bias guard.** A test written afterwards that never failed proves nothing.
   *Evidence: debugging validated on its own tests degrades performance (ACL 2025, arXiv 2501.12793).*

7. **Confidence gate.** The Builder self-scores; high confidence -> deterministic verification only, low -> full review.

8. **Multi-review aggregation** on critical areas: several independent reviews in fresh contexts, combined by **majority vote** (a finding counts if 2 reviewers out of 3 see it). **Never by union.**
   *Evidence: aggregating 10 reviews gains +43.67% F1 and **+118.83% recall** (SWR-Bench, arXiv 2509.01494, FSE 2026), but absolute F1 caps at 21.91% and precision stays poor (>7 false positives per PR). Aggregation buys recall and pays in precision.*
   *Why vote and not union: our measured weakness is OVER-REJECTION (21-26% false-reject on the 4.x family, 77.8% for glm-4.7 on multi-file code). Uniting findings would amplify exactly that defect. Majority vote filters out isolated alerts.*

9. **No debate between agents.** One-way flow.
   *Evidence: up to 85.5% adoption of the majority error in debate configurations; homogeneous debate underperforms isolated correction.*

10. **Structured findings**: `file:line` + severity + violated criterion. An "LGTM" without evidence is an invalid report.

11. **Agent budget**: 3 roles per area, low global ceiling. **When cutting, sacrifice a producer before a reviewer.**
    *Evidence: 3 optimised agents (70.5%) beat 7 unoptimised ones (69.9%) for 52.9% fewer API calls (DyLAN, COLM 2024, arXiv 2310.02170).*
    *Evidence for the logistic law: it is MacNet (ICLR 2025, arXiv 2406.07155), not DyLAN, that establishes it by testing up to 1000 agents: sigmoid growth, "2^4 nodes appears a reasonable choice", and reverse degradation of 2.27 to 6.24% on some configurations.*
    *Evidence for the producer/reviewer asymmetry (DyLAN, code generation): 4 Writers + 4 Reviewers = 82.9 Pass@1; 3W+3R = 78.0; 4W+2R = 77.4. **Removing reviewers costs more than removing producers.***
    *Against adding agents: Agentless (arXiv 2407.01489) reaches 32.00% on SWE-bench Lite at $0.70 against CodeR's 28.33% at $3.34; MAST (NeurIPS 2025, arXiv 2503.13657) measures 41 to 86.7% failure rates across 7 state-of-the-art multi-agent systems; and the gain is NON-MONOTONIC, since on hard queries more calls degrades the result (NeurIPS 2024, arXiv 2403.02419).*

12. **Mandatory metrics**: correct->incorrect flips, false-OK rate, points consumed, EIR per model.

13. **Honest baseline**: compare the pipeline against "N Builders + majority vote" at equal token budget, never against a lone Builder.

## Model routing (measured on GLM Coding Plan, n=53, HumanEvalFix + QuixBugs)

| Role | Model | Effort | Decisive figure |
|---|---|---|---|
| Builder | `glm-5.3` | max | fastest and most capable of the real lineup |
| Reviewer | `glm-5.3` | high | **6.2% false-reject** against 21-26% for the others |
| Verifier | `glm-5.3` | high | glm-4.7 was **removed from this role**: on real multi-file patches it returns FAIL on 94% of its verdicts, rejects **77.8% of correct code**, and names the actual defect only **11.8%** of the time |
| Forbidden for judging | `glm-5-turbo` | — | **3% false-OK**, the only model to have approved broken code |

**Aliases never to use for diversity**: `glm-5.2`, `glm-5.1`, `glm-5` answer as `glm-5.3`; `glm-4.5-air` answers as `glm-4.7`.

## GLM-specific traps, measured

- **`glm-5.3` cannot disable its reasoning.** `thinking.type: disabled` raises an error. Use `reasoning_effort: low`.
- **A `max_tokens` that is too low produces an EMPTY response**: the reasoning consumes the budget. Floor of 1500 for any call carrying a verdict.
- **`glm-5.3` misses its verdict format in 7.5 to 10.4% of cases.** Require the verdict alone on the last line.
- **The 4.x family is verbose**: ~4500 output tokens for a 290-token prompt. This is the pipeline's leading cost driver.
- **Never write tool-call syntax in plain text inside a system prompt** on the coding endpoint: the application firewall returns a spurious 429.
- **Byte-stable system prompts**: the cache divides the input multiplier by ~4.
