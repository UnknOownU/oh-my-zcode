# glm-4.5

> **Assigned role: last resort / offline analysis — not recommended on the hot path**
> `[M]` = measured by us on 2026-08-17 · `[P]` = published.

## Identity
| Field | Value | Source |
|---|---|---|
| API ID | `glm-4.5`, answers under its own name though absent from the plan's official list | `[M]` |
| Released | 2025-07-28 | `[P]` |
| Architecture | 355 B total / 32 B active (MoE) | `[P]` |
| Max context / output | **128 K / 96 K**, smallest of the lineup | `[P]` docs.z.ai |
| Standard API price | $0.60 / $0.11 / $2.20 per M | `[P]` pricing |
| Thinking | hybrid, can be disabled | `[P]` |
| Default temperature | **0.6** (against 1.0 for the 5.x family) | `[P]` concept-param |

## Measurements in the Reviewer role (n=53)
| Metric | Value | Rank |
|---|---|---|
| Accuracy | 90.6% [79.7–95.9] | tied |
| False-OK | 0% | ✅ |
| **False-reject** | **26.4%** [16.4–39.6] | ❌ **worst of the lineup** |
| Bug identification | 75.8% | decent |
| Unparseable verdicts | 0% | ✅ |
| Latency | 56.9 – 76.9 s | slow |
| **Tokens/review** | **3616 – 4591** | ❌ **most verbose** (×15 the prompt) |
| Estimated cost | **~7.5 points/review** | ❌ most expensive |
| Commit-first effect | 96.2% → **100%**, false-reject 9.1% → **0%** | ✅ strong improvement |

## Published benchmarks
| Benchmark | Score | Source |
|---|---|---|
| τ-bench (average) | 70.1% (retail 79.7 / airline 60.4), *with an optimised user simulator* | `[P]` GLM-4.5 technical report (arXiv 2508.06471) |
| BFCL v3 | 77.8% | `[P]` same |
| Terminal-Bench | 37.5% | `[P]` same |
| BrowseComp | 26.4% | `[P]` same |
| **WebDevJudge (as a JUDGE)** | pairwise 68.65 / single 55.81, against GPT-4.1 70.34 and human 84.56 | `[P]` arXiv 2510.18560 |
| **CodeCriticBench** (GLM-4-Plus variant) | 61.55% against GPT-4o 68.06, Claude-3.5 68.79 | `[P]` arXiv 2502.16614 |

## Verdict

GLM-4.5 is the **slowest and most expensive** model of the lineup for the **worst** false-reject rate: the losing trio. Its only strengths are 0% unparseable verdicts, decent defect identification (75.8%), and a strong response to commit-first.

✅ Usable for **offline analysis** (batch code audit, no latency constraint) with commit-first enabled.
✅ Usable as a **third opinion** in a multi-review aggregation, but only under majority vote. Aggregating ten reviews raises F1 by +43.67% and recall by +118.83% (arXiv 2509.01494), while precision stays poor: adding a model that over-rejects 26.4% of the time to a union of findings makes the pipeline worse, not better.
❌ Keep off the critical path: 77 s of latency, 4591 tokens, 26.4% over-rejection.
❌ Only 128 K of context: not enough for large diffs, where 5.3 offers 1 M.

## Note on the ecosystem

`[P]` A trained verifier exists on a GLM-4-9B-Chat base: **xVerify-9B-C** (arXiv 2504.10481). It shows a distilled GLM can hold a binary-verifier role, but it has to be trained for it. In raw prompting, the 4.x family over-rejects.
