# glm-4.6

> **Assigned role: Builder fallback / second opinion in cross-review**
> `[M]` = measured by us on 2026-08-17 · `[P]` = published.

## Identity
| Field | Value | Source |
|---|---|---|
| API ID | `glm-4.6`, answers under its own name even though the official docs do not list it in the plan | `[M]` |
| Released | 2025-09-30 | `[P]` |
| Max context / output | 200 K / 128 K | `[P]` docs.z.ai |
| Standard API price | $0.60 / $0.11 / $2.20 per M | `[P]` pricing |
| Thinking | **hybrid**, auto-decided, **can be disabled** | `[P]` concept-param |
| Particularity | first model with `tool_stream` (streaming of tool-call arguments) | `[P]` |

## Measurements in the Reviewer role (n=53)
| Metric | Value |
|---|---|
| Accuracy | 90.6% [CI 79.7–95.9] |
| False-OK | 0% ✅ |
| False-reject | **25.0%** [15.2–38.2] ⚠️ |
| Bug identification | **78.8%** (tied best) |
| Unparseable verdicts | 0% ✅ |
| Latency | 59.0 – 80.2 s (**slowest of the lineup**) |
| Tokens/review | 3841 – 4510 |
| Estimated cost | ~7.4 points/review |
| Commit-first effect | **none** (96.2% → 96.2%, false-reject unchanged) |

## Published benchmarks
| Benchmark | Score | Source |
|---|---|---|
| **τ²-bench telecom (without reasoning)** | **76.9%** | `[P]` Artificial Analysis |
| **τ²-bench telecom (with reasoning)** | **70.5%** | `[P]` same |
| BFCL (function calling) | 72.38% | `[P]` official 2025-09-30 |
| Terminal-Bench | 40.5% (Hard 25.0%) | `[P]` |
| BrowseComp | 45.1% (against 26.4% for 4.5) | `[P]` |
| **IF-RewardBench (as a JUDGE)** | 0.270 against Gemini-3-Flash 0.513, GPT-5-mini 0.456 → **weak-to-average judge** | `[P]` arXiv 2603.04738 (2026) |

## 🔍 The most useful fact on this sheet

**On τ²-bench, disabling reasoning IMPROVES the score by 6.4 points (76.9% against 70.5%).** `[P]`

This is the published proof that **thinking is not always beneficial**, and 4.6 is precisely one of the two models in the lineup (with 4.5) where it can be turned off.

`[M]` We have since seen the same effect from another angle. Driving an agent loop on SWE-bench Verified, higher effort delays action: at `max`, the first file edit lands around step 9 to 16 out of 20, against step 3 to 7 at `low`. Whether that changes how many issues actually get fixed is a separate question, and a small first sample put the two level. What is established is that more thinking acts later and costs more.

## When to use it
✅ **Second opinion in cross-review**: it is an *architecturally different* model from 5.3, so its errors are less correlated (model diversity is the strongest lever in the literature: +18.1 pp in cross-review, arXiv 2607.21656).
✅ Builder fallback when 5.3 is saturated.
✅ Tool-heavy tasks with thinking disabled (see τ²-bench).
✅ **Independent judge** in an evaluation harness: it is the model we use to grade whether a review named the actual defect, precisely because it is not the model being graded.
❌ Not as primary Reviewer: 25% false-reject, and commit-first does not fix it.
❌ Not in an interactive loop: slowest measured, up to 80 s.
