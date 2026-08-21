# glm-4.7

> **Assigned role: none that carries a verdict on real code.**
> It held the Verifier seat until EXP-6 removed it. Kept in the fallback chain for
> the Builder role and for explaining defects in isolated code.
> `[M]` = measured by us on 2026-08-17 · `[P]` = published.

## ⛔ The result that removed it (EXP-6)

**SWE-bench Verified**: real repositories, multi-file patches, one whole piece removed from the reference patch. The reviewer must accept the complete patch and reject the amputated one. An independent judge (`glm-4.6`, no reasoning) then checks whether the review named **the actually missing piece**.

| Configuration | Successful calls | FAIL verdicts returned | False-reject | **Defect actually identified** |
|---|---|---|---|---|
| glm-4.7 without reasoning | 36/36 | **34 of 36 (94%)** | **77.8%** | **11.8%** |

It rejects almost everything. Its 89% "detection" on amputated patches is therefore not skill: rejecting systematically catches all the broken ones mechanically. The judge settles it, since it names the missing piece only 11.8% of the time. **It rejects for the wrong reasons**, and in production it would block four valid fixes out of five.

## ⚡ And the result that had put it there (EXP-5)

Compared against glm-5.3 across **8 thinking modes each**, same task, unconstrained output budget, on **isolated functions**:

| Configuration | Accuracy | False-OK | **Defect identified** | Latency | Points |
|---|---|---|---|---|---|
| **glm-4.7 `nothink`** | **100%** | 0% | **79.2%** 🏆 | **6.4 s** | **0.42** 🏆 |
| glm-4.7 @max | 100% | 0% | 75.0% | 38.5 s | 3.95 |
| glm-5.3 @xhigh *(its best)* | 100% | 0% | 54.2% | 15.9 s | 3.25 |
| glm-5.3 `nothink` | 100% | 0% | 37.5% | 5.0 s | 0.65 |

On isolated functions its worst mode matched glm-5.3's best, it produced no false-OK in any of its 8 modes, and turning reasoning off made it 6× faster and 9.4× cheaper while *improving* defect identification.

**Same model, same prompt, same metric: 79.2% on isolated functions, 11.8% on real code.** The lesson is not about glm-4.7, it is about the benchmark: a ranking established on isolated functions can invert on a real repository. This project shipped that mistake once.

## Identity
| Field | Value | Source |
|---|---|---|
| API ID | `glm-4.7`, answers under its own name | `[M]` |
| Released | 2025-12-22 | `[P]` |
| Max context / output | 200 K / 128 K | `[P]` docs.z.ai |
| Standard API price | $0.60 / $0.11 / $2.20 per M | `[P]` pricing |
| Point multipliers | **in 4.6 / cached 1.2 / out 16**, the lowest in the plan | `[P]` devpack |
| Thinking | **forced** (like 5.3), with reasoning retained and "think before acting" | `[P]` GLM-4.7 doc |
| Incoming alias | `glm-4.5-air` redirects here | `[M]` |
| Official role in the plan | the "budget" model, offered as `ANTHROPIC_DEFAULT_HAIKU_MODEL` | `[P]` devpack |

## Measurements in the Reviewer role (n=53, isolated functions)
| Metric | Value | Rank |
|---|---|---|
| Accuracy | **92.3%** [CI 81.8–97.0] | **best of the lineup**, but overlapping CIs |
| False-OK | 0% | ✅ |
| False-reject | 21.4% [11.7–35.9] | ⚠️ 3.4× worse than 5.3, and it gets far worse on real code |
| Bug identification | **78.8%** | tied best with 4.6 |
| Unparseable verdicts | **0%** | ✅ better than 5.3 (7.5-10.4%) |
| Latency | 51.9 – 70.7 s | slow |
| Tokens/review | 3450 – 4137 | verbose |
| Estimated cost | ~6.8 points/review | cheapest of the large ones |

**Commit-first effect `[M]`** (local bench): accuracy 92.3% → **100%**, false-reject 9.1% → **0%**. It is the model that benefits most from the protocol.

## Published benchmarks
| Benchmark | Score | Source |
|---|---|---|
| τ²-bench telecom | 94.2 – 95.9% | `[P]` Artificial Analysis |
| SWE-bench Verified | 73.8% | `[P]` GitHub zai-org/GLM-4.7 |
| Terminal-Bench 2.0 | 41% | `[P]` same |
| **AACR-Bench (code review)** | F1 **16.03** without context, **best non-Claude**; recall 27.57%, precision 11.30% | `[P]` arXiv 2601.19494 (2026) |

Worth noting: the published benchmarks already said this. SWE-bench Verified 73.8% against 77.8%, Terminal-Bench 41% against 56.2%, both in favour of glm-5.3. Our isolated-function measurements contradicted them, and on realistic tasks the published numbers were right.

## Where it is still the right choice
✅ **Builder fallback** when glm-5.3 is saturated: it writes code perfectly well, and the over-rejection problem does not apply to a role that produces rather than judges.
✅ **Explaining a defect in isolated code**: 78.8% identification, 0% unparseable, and by far the cheapest of the capable models.
✅ **Independent judge** on a narrow question with a fixed output format.

## Where it must not go
❌ **Never a verdict on multi-file code**: 77.8% measured false-reject.
❌ Never a judging role where over-rejection is expensive: it blocks valid work.
❌ Not in an interactive loop: 52-71 s.
❌ Verbose (4137 tokens/review) — **but never cap `max_tokens` to fix that**: this model uses forced thinking too `[P]`, so a tight budget returns an empty or truncated response. Set `131072` like everywhere else. Its verbosity is a reason to route elsewhere, never a reason to truncate it.
