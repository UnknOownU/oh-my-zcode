# glm-5.3

> **Assigned roles: BUILDER (effort max) + REVIEWER (effort high, fresh context) + VERIFIER (effort high)**
> Measured on 2026-08-17 on the Coding Plan. `[M]` = measured by us · `[P]` = published (source cited).

## Identity
| Field | Value | Source |
|---|---|---|
| API ID | `glm-5.3`, answers under its own name | `[M]` `model` field of the response |
| Released | 2026-08-14 | `[P]` z.ai/blog/glm-5.3 |
| Max context / output | 1 M / 128 K | `[P]` docs.z.ai/guides/llm/glm-5.3 |
| Availability | **Coding Plan only**, per-token API "coming soon", weights announced around 08/28 | `[P]` official docs |
| Point multipliers | in 6.9 / cached 1.7 / **out 24** | `[P]` docs.z.ai/devpack/overview |
| Aliases pointing here | `glm-5`, `glm-5.1`, `glm-5.2` | `[M]` redirection test |

## Thinking: the structural constraint
- **Thinking cannot be disabled.** `thinking.type: "disabled"` returns an **error**. `[P]` GLM-5.3 doc
- The only lever is `reasoning_effort` ∈ `low | high | max` (default `max`). Any other value errors. `[P]`
- Coding Plan mapping: `none/minimal/low` → **low**, `medium/high` → **high**, `xhigh/max` → **max**. `[P]`
- In ZCode: the frontmatter field is **`thoughtLevel`** (not `reasoningEffort`), and it only takes effect when `model` is explicit. `[P]` zcode.z.ai/en/docs/subagents
- `[M]` The reasoning spends the same budget as the answer, so a `max_tokens` set too low returns an **empty response** — or one cut off before its verdict line.
- **Set `max_tokens` to `131072` and never below.** `[P]` documented default **65536**, ceiling **131072**, and Z.AI recommends never going under 1024. The ceiling is free: you are billed for the tokens actually generated, not for the limit you allow. A budget you never reach costs nothing; a verdict truncated at its last line costs the whole run.

## Measurements in the Reviewer role (n=53, HumanEvalFix + QuixBugs)
| Metric | Value | Comparison |
|---|---|---|
| Accuracy | 90.6% [CI 79.7–95.9] | tied with the other four |
| **False-OK** | **0%** | same as 4.x, better than 5-turbo (3%) |
| **False-reject** | **5.0% / 6.2%** | **3.5 to 4.3× better** than all the others (21–26%) |
| Bug identification | 60.6% | weaker than 4.x (75-79%) on isolated functions |
| Unparseable verdicts | 7.5 – 10.4% | ⚠️ **its weakness**, lock the format |
| Latency | 26.2 – 27.8 s | **2.5× faster** than 4.x |
| Tokens/review | 2270 – 2343 | half of 4.x |
| Estimated cost | ~5.8 points/review | against 6.8–7.5 for 4.x |

## Published benchmarks
| Benchmark | Score | Source |
|---|---|---|
| Z.ai Code Bench (effort max) | 34.5% @ ~75 K tokens/task | `[P]` GLM-5.3 blog |
| Z.ai Code Bench (effort high) | 31.4% @ ~50 K tokens/task | `[P]` same |
| Token efficiency | ~75 K/task against 96 K for GLM-5.2 | `[P]` same |
| τ²-bench (GLM-5.x family) | 97.4 – 99.1% (top of a 143-model board) | `[P]` Artificial Analysis |

## ⚠️ Effort and action: a measured caveat

`max` is the official recommendation for code, and it is what the Builder uses. But that recommendation was set on generation and judgment tasks, not on **agentic** ones.

`[M]` On SWE-bench Verified, driving an agent loop with tools, higher effort delays action: at `max` the first file edit lands around step 9 to 16 out of 20, and some runs finish with an empty patch. At `low`, the first edit lands around step 3 to 7.

`[P]` The published literature says the same thing from another angle: on τ²-bench telecom, **GLM-4.6 without reasoning (76.9%) beats GLM-4.6 with reasoning (70.5%)**.

Read this as a caution, not a verdict: patches produced is not issues resolved, and on a first small sample `low` and `high` resolved the same number. What is established is that more effort costs more time and acts later. Whether it fixes more is not settled here.

## When to use it, when not to
✅ **Builder**: official Z.AI recommendation for code is effort `max`, with the caveat above.
✅ **Reviewer**: the only model in the lineup combining 0% false-OK with low over-rejection.
✅ **Verifier**: retained after glm-4.7 was disqualified on multi-file code (see glm-4.7.md).
✅ Long tasks: 1 M of context, the only one in the lineup.
❌ Not for high-frequency micro-checks: an output multiplier of 24 makes it the most expensive.
❌ Do not count on `thinking: disabled`, it is impossible here; use `low` instead.

## Prompting: measured constraints
1. **Lock the verdict format.** 7.5 to 10.4% of its responses contain no parseable verdict. Require: last line, alone, `VERDICT: PASS` or `VERDICT: FAIL`.
2. **Do not stack a verbose protocol** (full commit-first) without raising `max_tokens`: `[M]` at 2500 tokens the final verdict was truncated in 66% of cases.
3. Keep the system prompt **byte-stable** between calls so the cache applies (multiplier 1.7 instead of 6.9). `[P]` Z.AI cache doc
