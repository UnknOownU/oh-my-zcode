---
name: review-by-concern
description: Doctrine for reviewing generated code one concern per pass with confidence gating, grounded in measured evidence. Load it when reviewing a diff or an artifact in the build pipeline, when deciding what a review should report, or when wiring review dispatches in the swarm.
when_to_use: when a code review of generated changes is being written, dispatched or gated
---

# review-by-concern: the doctrine

> **A review that looks at everything at once sees nothing. One concern per pass; every finding carries a confidence; only ≥80 gets reported.**

## The rules, each backed by a measurement

1. **One concern per pass.** The standing concerns, each walked separately (or dispatched separately):
   - dead code & unused constructs — added by the diff, referenced nowhere (grep the call sites);
   - swallowed errors & silent fallbacks — catches that hide failures, fallbacks nobody asked for;
   - security of the diff — if `ai-security-carry` is wired to the verifier, this pass defers to it and says so;
   - tests & done-when — the tests load the shipped artifact, not a copy; the done-when is the plan's, not a paraphrase;
   - duplication — the fourth-caller rule (rule 4);
   - complexity drift — CC and SLOC reported separately, never a threshold verdict (rule 5).
   *Evidence: Anthropic's own pr-review-toolkit ships six review agents, one concern each; a pass that mixes concerns buries the two findings that matter under fifteen that don't.*

2. **Rate every candidate 0-100. Report only ≥80.** 91-100 = critical bug or explicit violation of the plan; 80-90 = real, act on it; below 80 = hold it, never pad the report with it.
   *Evidence: "Rate each issue from 0-100" and "Only report issues with confidence ≥ 80" — the confidence gating of Anthropic's own code-reviewer agent; a reviewer without a gate reports its mood, not the risk.*

3. **Every finding is third-party-checkable: file, line, quoted evidence, why it matters, minimal fix.** A finding the builder could not re-derive from your message alone is an opinion, not a finding.
   *Evidence: self-declared rituals die — the `ponytail:` shortcut comments were applied once in 80 trials with the ruleset demonstrably in context (JetBrains, 2026-07); anything that relies on the author marking its own shortcuts is decoration. Only what another party can verify survives.*

4. **The fourth-caller rule.** When the diff is about to add the fourth caller of the same copied block, flag the refactor — the shortest-diff instinct hands you a fifth copy instead.
   *Evidence: "If you are about to add the fourth caller of the same copied block, 'shortest diff' hands you a fifth copy" (SSD Nodes, 2026-08); AI code is measurably MORE repetitive than human code, not less (Cotroneo et al. 2025, 500k+ samples, arXiv:2508.21634).*

5. **Complexity: report CC and SLOC separately; never a threshold verdict.** Complexity is a drift signal — a function's band moving to D-F across a diff — not an absolute sin; the number 10 is a confessed management convention, and metrics die once size is controlled.
   *Evidence: "a reasonable, but not magical, upper limit" — McCabe 1976 himself; after controlling for size, none of the OO metrics studied still predicted fault-proneness (El Emam, NRC 1999 / IEEE TSE 2001); CC and SLOC correlate only moderately, so report both (Landman 2016, 17.6M methods / 6.3M functions).*

6. **Do not flag** style without consequence, a threshold crossed without drift, an isolated duplicated block with no trend, or code that is merely short. Silence on a walked concern is a result — the review names every concern it walked, clean or not.
   *Evidence: the measured cut of a minimalism ruleset is near zero "where the code is already minimal" and exists only where there was room to over-build (JetBrains, 2026-07); a probe that stays quiet when its drift is absent is working as designed.*

## Assumption, dated

2026-09, GLM-5.x era: reviewers pad reports with everything they notice, and unprompted reviews do not gate themselves. Replay a 10-pair check on each model upgrade — if unprompted reports already arrive gated and concern-split, this skill has depreciated and should be retired rather than carried as overhead.
