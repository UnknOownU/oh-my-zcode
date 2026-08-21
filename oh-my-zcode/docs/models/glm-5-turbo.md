# glm-5-turbo

> **Assigned role: fast triage and recon — FORBIDDEN as Reviewer and as signatory of compliance**
> `[M]` = measured by us on 2026-08-17 · `[P]` = published.

## Identity
| Field | Value | Source |
|---|---|---|
| API ID | `glm-5-turbo`, answers under its own name | `[M]` |
| Released | 2026-03-16 | `[P]` tech press |
| Max context / output | 200 K / 128 K | `[P]` docs.z.ai |
| Open weights | **No**, proprietary model | `[P]` |
| Standard API price | $1.20 / $0.24 / $4.00 per M tokens | `[P]` docs.z.ai/guides/overview/pricing |
| Point multipliers | in 5.7 / cached 1.5 / out 21 | `[P]` devpack |
| Official positioning | tuned for OpenClaw, scheduled tasks, long chains | `[P]` |

## ⛔ The result that disqualifies it from the Reviewer role
Two **independent** methods converge:

| Source | Result |
|---|---|
| `[M]` Our measurements (n=53, HumanEvalFix+QuixBugs) | **The only model in the lineup to approve defective code: 3.0% false-OK.** Weakest bug identification: **45.5%** (against 60-79% for the others). False-reject 22.6%. |
| `[P]` arXiv 2606.15689 (2026), "Bigger Isn't Always Better" | **Last of 5 models** at code review: F1 **0.310** (n=150) and **F1 0.008 on real PRs** (a collapse). Highest verbosity (841 tokens), lowest quality (2.37/5). |

➡️ A reviewer that lets 3% of broken code through **and** describes defects poorly cannot carry a compliance signature.

## Where it excels
| Metric | Value | Comparison |
|---|---|---|
| Latency on a trivial task | **1.58 s** | **fastest** in the lineup |
| Tokens on a trivial task | 47 | most frugal |
| Tokens/review | 1497 – 1838 | **2.4× fewer** than 4.x |
| Estimated cost | **~4.0 points/review** | cheapest |
| Overall accuracy | 90.6% [79.7–95.9] | tied with the others |

## Validated uses
✅ **Fast probes**: "does this file compile?", "what is the entry point?", classification, triage.
✅ **High-frequency loops** where cost dominates and **a human or a test validates behind it**.
✅ Long scheduled chains (its official positioning).
❌ **Never** as Reviewer, never as signing Verifier, never sole judge of a merge.
❌ Avoid on tasks where explaining the defect matters (45.5% identification).

## Prompting: measured constraints
1. `[M]` 1.9 to 7.5% unparseable verdicts. If you use it for triage, demand an ultra-short format (`OK` / `KO` alone).
2. `[M]` With a low `max_tokens` it returns an **empty response** (the reasoning eats the budget). **Set `131072`, the documented ceiling, and never below** `[P]` (default 65536). You pay for tokens generated, not for the limit allowed.
3. `[P]` Thinking can be disabled on this model, unlike 5.3: `thinking: {"type": "disabled"}`, which is useful for latency probes.
