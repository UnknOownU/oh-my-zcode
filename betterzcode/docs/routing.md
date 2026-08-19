# GLM Routing — which model for which role

> **Source of truth for this document**: measurements taken on 2026-08-17 on the user's GLM Coding Plan account
> (endpoint `https://api.z.ai/api/coding/paas/v4`), cross-referenced with the 2024–2026 literature.
> Every figure marked **[MEASURED]** comes from our own runs (raw data in `exp/`).
> Every figure marked **[PUBLISHED]** comes from a paper or a leaderboard, with its reference.

---

## 0. TL;DR — the routing matrix

| Role | Model | Effort | Why (evidence) |
|---|---|---|---|
| **WORKER** (writes the code) | `glm-5.3` | `max` | Best model of the lineup on agentic benchmarks **[PUBLISHED]**; official Z.AI recommendation for code |
| **REVIEWER** (reviews, does not code) | `glm-5.3` in a **fresh context** | `high` | **0% false-OK and 6.2% false-reject vs 21–26% for all the others [MEASURED]**; 2.5× faster |
| **QA** (executes, proves) | `glm-5.3` | `high` | ⚠️ **Changed after EXP-6**: on real multi-file patches, glm-4.7 rejects 78% of correct code and identifies the real defect only 11.8% of the time **[MEASURED]** (see §3quater) |
| **SOURCE VERIFIER** (confronts a claim with its source) | `glm-5.3` | `high` | Same 0% false-OK / 0% false-reject configuration as the other judging roles **[MEASURED]**; and the capability floor is load-bearing: the same citation-repair protocol scores 90.7% with a frontier model against 79.3% with a mid-size one, called "not yet on-par" by its authors **[PUBLISHED]** |
| **FINDING VERIFIER** (re-executes security findings) | `glm-5.3` | `max` | Judged-role floor (0% false-OK config family) **[MEASURED]**; `max` is the owner's call (2026-08-19) — security runs are rare and every confirmed finding triggers human remediation, so the 28.67-point/review cost that disqualified max for the code Verifier is accepted here; never glm-5-turbo (3% false-OK) **[MEASURED]** |
| **Fallback QA / fast recon** | `glm-5-turbo` | `low` | Cheapest in tokens **[MEASURED]** — but **never as Reviewer** (see §3) |
| **NEVER Reviewer** | `glm-5-turbo` | — | Only model that approves defective code (3% false-OK) **[MEASURED]** + worst reviewer of 5 models in arXiv 2606.15689 **[PUBLISHED]** |

---

## 1. The real lineup (and why it is not the one in the docs)

**[MEASURED]** By querying each ID then reading the `model` field of the HTTP response:

| ID requested | Actually answers | Status |
|---|---|---|
| `glm-4.5` | `glm-4.5` | ✅ real model |
| `glm-4.6` | `glm-4.6` | ✅ real model |
| `glm-4.7` | `glm-4.7` | ✅ real model |
| `glm-5-turbo` | `glm-5-turbo` | ✅ real model |
| `glm-5.3` | `glm-5.3` | ✅ real model |
| `glm-4.5-air` | `glm-4.7` | 🔀 alias |
| `glm-5` | `glm-5.3` | 🔀 alias |
| `glm-5.1` | `glm-5.3` | 🔀 alias |
| `glm-5.2` | `glm-5.3` | 🔀 alias |
| `glm-5.2-highspeed` | HTTP 429 / code 1311 | ⛔ exists, off-plan |
| `glm-5.3[1m]` | HTTP 400 / code 1214 | ⛔ ZCode convention, not an API ID |
| `glm-4.7-flash` | HTTP 429 / code 1305 | ⛔ off-plan |

**Three sources contradict each other, only one tells the truth:**
- `GET /models` announces **9 models** → false (4 are aliases)
- The official docs announce **3 models** (5.3, 5-turbo, 4.7) → also false (4.5 and 4.6 do answer under their own names)
- **The measurement says 5 distinct models** → that is the only usable truth

⚠️ **Critical consequence for the plugin**: writing `model: glm-5.2` in a ZCode subagent does NOT give GLM-5.2, it gives GLM-5.3. Any routing config that "diversifies" with 5.1/5.2 is an illusion: it is the same model. Real diversity only exists between **{4.5, 4.6, 4.7} × {5-turbo} × {5.3}**.

**To unlock the real 5.1/5.2**: you must credit the standard API (`api.z.ai/api/paas/v4`, today at `1113 Insufficient balance`) — 5.2 and 5.1 are there at $1.40/$4.40 per M tokens **[PUBLISHED]**.

---

## 2. The REVIEWER role — the best-supported decision

**Protocol [MEASURED]**: 53 tasks from **HumanEvalFix** (OctoPack, ICLR 2024) and **QuixBugs** (SPLASH 2017), labels re-proven by executing the official tests on the machine (164/164 HumanEvalFix reproduced). Each model returns a PASS/FAIL verdict. Temperature 0, `max_tokens` 5000.

### 2.1 On defective + correct code (n=53, 33 defective / 20 correct)

| Model | Accuracy | 95% CI | False-OK | False-reject | Bug identified | Unparseable | Latency | Tokens |
|---|---|---|---|---|---|---|---|---|
| glm-4.5 | 90.6% | [79.7–95.9] | 0% | 25.0% | 75.8% | 0% | 56.9 s | 3616 |
| glm-4.6 | 90.6% | [79.7–95.9] | 0% | 25.0% | 78.8% | 0% | 59.0 s | 3841 |
| glm-4.7 | 92.3% | [81.8–97.0] | 0% | 21.1% | **78.8%** | 0% | 51.9 s | 3450 |
| glm-5-turbo | 90.6% | [79.7–95.9] | **3.0%** ⛔ | 15.0% | 45.5% | 1.9% | 40.7 s | **1497** |
| **glm-5.3** | 90.6% | [79.7–95.9] | **0%** | **5.0%** | 60.6% | 7.5% | **26.2 s** | 2270 |

### 2.2 On exclusively correct code (n=53) — the over-rejection test

| Model | **False-reject** | 95% CI | Output tokens/review | Latency |
|---|---|---|---|---|
| glm-4.5 | 26.4% | [16.4–39.6] | 4591 | 76.9 s |
| glm-4.6 | 25.0% | [15.2–38.2] | 4510 | 80.2 s |
| glm-5-turbo | 22.6% | [13–36] | 1838 | 68.7 s |
| glm-4.7 | 21.4% | [11.7–35.9] | 4137 | 70.7 s |
| **glm-5.3** | **6.2%** | [2–17] | 2343 | **27.8 s** |

**Reading:** accuracy discriminates nothing (all at 90–92%, overlapping CIs). **The discriminant is the failure mode.** The 4.x family rejects correct code **1 time out of 4**. glm-5.3: 1 time out of 16. Factor **3.5 to 4.3×**.

**Consistent with the literature**: over-correction is the dominant failure mode of LLM reviewers (FNR up to 73.2% with rich prompts, arXiv 2508.12358) **[PUBLISHED]** — not rubber-stamping. Our GLMs confirm it: **0% false-OK everywhere except 5-turbo**, whereas the literature measures 31–44% false-OK on GPT-4o/Gemini (Cihan et al. 2025) **[PUBLISHED]**. **The GLMs are conservative reviewers, not complacent ones.**

### 2.3 External cross-validation of excluding glm-5-turbo

| Source | Verdict on GLM-5-Turbo as reviewer |
|---|---|
| **[MEASURED]** us | Only model with a false-OK (3%), lowest bug identification (45.5%) |
| **[PUBLISHED]** arXiv 2606.15689 (2026) | Last of 5 models: F1 0.310 (n=150), **F1 0.008 on real PRs**, highest verbosity (841 tokens), lowest quality (2.37) |

Two independent methodologies, same conclusion → **firm exclusion from the Reviewer and QA-signature role.**

---

## 3. The prompt protocol (commit-first) — tested, real but modest effect

**[MEASURED]** on the local bench (26 tasks), naive vs commit-first (acceptance criteria stated BEFORE seeing the code + spec repeated at the end of the prompt):

| Model | Accuracy naive → commit-first | False-reject naive → commit-first |
|---|---|---|
| glm-4.5 | 96.2% → **100%** | 9.1% → **0%** |
| glm-4.7 | 92.3% → **100%** | 9.1% → **0%** |
| glm-4.6 | 96.2% → 96.2% | 9.1% → 9.1% |
| glm-5-turbo | 96.2% → 96.2% | 9.1% → 9.1% |
| glm-5.3 | 100% → 92.3% | 0% → 0% (but 7.7% unparseable verdicts) |

**Honest conclusion**: commit-first **removes the false-rejects on 4.5 and 4.7** (9.1 → 0%), has no effect on 4.6/5-turbo, and **degrades 5.3 through output-format non-compliance** (verdict drowned in a long response). The gaps are within measurement noise (±12.5 pp measured on n=26).

➡️ **Plugin decision**: commit-first enabled for the roles running on 4.x; for 5.3, keep the structure but **lock the output format** (the verdict must be the last line, alone on its line) because that is its measured weakness (7.5–10.4% unparseable).

---

## 3bis. The thinking level — measured, and counter-intuitive

> ⚠️ **This table was measured with a throttled output budget (a 2500-token ceiling bug).** It is kept for traceability, but **its conclusions about `max` are false**: the 22.2% "unparseable verdicts" were responses **cut off before the verdict line**, not a model defect. After the fix (EXP-4, budget 131072), `high` **and** `max` both climb to 97.8% accuracy with 0% false-OK and 0% unparseable. See the corrected decision at the end of the section.

**[MEASURED]** glm-5.3 on 45 tasks of the standard bench, same prompt, only `reasoning_effort` varies:

| Effort | Accuracy | 95% CI | **False-OK** | **False-reject** | **Unparseable verdicts** | Latency | Points/review |
|---|---|---|---|---|---|---|---|
| `low` | **91.1%** | [79.3–96.5] | **6.7%** ⛔ | 13.3% | **0%** | **5.6 s** | **0.77** |
| **`high`** | 86.7% | [73.8–93.7] | **0%** ✅ | **0%** ✅ | 13.3% | 18.5 s | 3.62 |
| `max` | 75.6% | [61.3–85.8] | 3.3% | 0% | **22.2%** ⚠️ | 19.1 s | 3.66 |

### Three lessons

1. **`max` is the worst of the three.** Lowest accuracy, 22.2% unparseable verdicts, highest cost. Mechanism identified: the more the model thinks, the longer it writes, and the more the final verdict line gets drowned. **The official Z.AI recommendation (`max` for code) is unsuited to a role that must return a structured verdict** — it holds for code generation, not for judgment.

2. **`low` is a speed trap.** It is 3.3× faster and 4.7× cheaper, with 0% unparseable… but **6.7% false-OK**: it lets broken code through. On a first n=16 sample it showed 0% false-OK — that was sampling luck. **Methodological lesson: never conclude on n=16.**

3. **`high` is the only level at 0% false-OK AND 0% false-reject.** Its only weakness (13.3% unparseable) is **fixable by the prompt** — a 400-word budget and a last-line constraint. A false-OK, on the other hand, is not fixable.

### Decision

| Role | Effort | Reason |
|---|---|---|
| **Reviewer / QA** (carry a verdict) | **`high`** | at an unthrottled budget, `high` and `max` tie (97.8%, 0% false-OK); **EXP-6 breaks the tie on real code**: `max` there costs 28.67 points/review (its latency is under re-measurement) |
| **Worker** (produces code) | **`max`** | the format problem does not concern it: it returns code, not a verdict |
| **Triage / fast recon** | `low` | 4.7× cheaper, 3.3× faster — **forbidden to sign** |

**Cross-model comparison at default effort** (n=16, same task):

| Configuration | Accuracy | False-OK | Latency | Points |
|---|---|---|---|---|
| glm-5.3 @low | 100% | 0% | 5.5 s | 0.84 |
| glm-5-turbo (default) | 100% | 0% | 18.7 s | 1.78 |
| glm-5-turbo **nothink** | 93.8% | **6.2%** ⛔ | 3.1 s | 0.25 |
| glm-4.7 (default) | 100% | 0% | **44.2 s** | **4.82** |

➡️ **glm-4.7 costs 5.7× more and is 8× slower than glm-5.3@low at equal accuracy.** It stays in QA for its defect-identification quality (78.8%) and its 0% unparseable, but that is a deliberate choice of descriptive reliability, not efficiency.
➡️ **`glm-5-turbo` without thinking reproduces exactly the `low` trap**: fast, near-free, and it rubber-stamps (6.2% false-OK).

---

## 3ter. EXP-5 — the QA duel: glm-5.3 against glm-4.7 across **all** modes

**[MEASURED]** 2 models × 8 thinking modes × 24 tasks (HumanEvalFix + QuixBugs), unconstrained output budget.

| Configuration | Accuracy | False-OK | False-reject | **Defect identified** | Latency | Points |
|---|---|---|---|---|---|---|
| **glm-4.7 nothink** | **100%** | 0% | 0% | **79.2%** 🏆 | **6.4 s** | **0.42** 🏆 |
| glm-4.7 @minimal | 100% | 0% | 0% | 75.0% | 37.9 s | 3.85 |
| glm-4.7 @max | 100% | 0% | 0% | 75.0% | 38.5 s | 3.95 |
| glm-4.7 @high | 100% | 0% | 0% | 70.8% | 38.7 s | 3.87 |
| glm-5.3 @xhigh | 100% | 0% | 0% | 54.2% | 15.9 s | 3.25 |
| glm-5.3 @max | 100% | 0% | 0% | 45.8% | 19.5 s | 4.17 |
| glm-5.3 @medium | 100% | 0% | 0% | 41.7% | 7.2 s | 1.33 |
| glm-5.3 nothink | 100% | 0% | 0% | 37.5% | 5.0 s | 0.65 |
| glm-5.3 @minimal | 91.7% | **8.3%** ⛔ | 0% | 45.8% | 4.9 s | 0.65 |
| glm-5.3 @low | 95.8% | **4.2%** ⛔ | 0% | 29.2% | 5.0 s | 0.62 |

### Three conclusions

1. **glm-4.7 dominates glm-5.3 on defect identification across ALL its modes.** Its worst mode (54.2% @low) matches glm-5.3's best mode (54.2% @xhigh). Gap at each one's best setting: **+41.7 points**. For a QA role whose mission is to **explain what breaks**, that is decisive.

2. **Thinking is pure cost on this task.** glm-4.7 scores 100% with or without — but without, it is **6× faster and 9.4× cheaper**, and it identifies the defect *better* (79.2% vs 75.0%). Internal reasoning substitutes for the explicit report instead of enriching it.

3. **glm-5.3's low modes are dangerous**: `@minimal` produces 8.3% false-OK, `@low` 4.2%. glm-4.7 produces none in **any** of its 8 modes.

### Methodological caveat

n=24 and **all configurations saturate at 100%** accuracy (CI [86.2–100] everywhere). Accuracy therefore discriminates nothing here. What discriminates is **defect identification, latency and cost** — three metrics with massive (up to ×9.4) and unambiguous gaps.

---

## 3quater. EXP-6 — the moment of truth: real patches, real repositories

The previous sections all rest on **isolated functions** (HumanEvalFix, QuixBugs). That is limitation #3 of this study. EXP-6 lifts it.

**Protocol [MEASURED]**: **SWE-bench Verified** (500 human-validated instances from real repositories: Django, SymPy, scikit-learn…). The reference patch (`gold`) is presented as-is, or **amputated of a whole piece** (a complete file, or a hunk if the patch is single-file). The reviewer must say PASS on the complete patch and FAIL on the amputated one. An **independent judge** (`glm-4.6` without reasoning) then checks whether the review named **the actually missing piece** — this metric replaces keyword counting, which is biased by verbosity (r = +0.604).

> ⚠️ **SWE-bench Lite is unusable here**: its 300 instances are *filtered to be single-file* by construction. Out of 300, **0 multi-file patches**. Hence the move to Verified.

### Result (n=18 correct patches + 18 amputated, 2 to 4 pieces per patch)

| Configuration | Successful calls | Accuracy | **False-OK** | **False-reject** | **Defect identified** *(judge)* | Latency | Points |
|---|---|---|---|---|---|---|---|
| **glm-4.7 without reasoning** | **36/36** | 55.6% | 11.1% | **77.8%** ⛔ | **11.8%** ⛔ | 16.7 s | 1.72 |
| glm-5.3 effort max | **10/36** ⚠️ | 70.0% | 50.0% | 16.7% | 50.0% | 148.6 s | 28.67 |

### What it overturns

1. **glm-4.7 without reasoning is a rejection machine.** It returns **FAIL on 34 of its 36 verdicts (94%)**. Its 89% "detection" on the amputated patches is therefore not skill — it is a bias: systematically rejecting mechanically catches all the broken ones. The independent judge confirms it: it names the actually missing piece only **11.8%** of the time. **It rejects for the wrong reasons.**

2. **The order reverses relative to EXP-5.** On isolated functions, glm-4.7 identified the defect at 79.2% vs 45.8% for glm-5.3. On real multi-file code: **11.8% vs 50.0%**. glm-4.7's superiority in description **does not generalize** to real code.

3. **This gap was announced by the public benchmarks** — which our isolated-function measurements contradicted: Terminal-Bench 41% (4.7) vs 56.2% (5.3), SWE-bench Verified 73.8% vs 77.8% **[PUBLISHED]**. **On realistic tasks, the public benchmarks were right and our micro-bench was wrong.**

4. **glm-5.3 @max is operationally impractical on this format**: it costs **28.67 points per review**, i.e. 17× glm-4.7. (A latency-based exclusion was retired in 1.9.2 — the timing measurement was invalid; re-measurement pending.) Its metrics above rest on n=10 and **are not conclusive** — they are shown for transparency, not as proof.

### Decision

- **glm-4.7 is removed from any role carrying a verdict on multi-file code.**
- **QA moves to `glm-5.3` @high** — the only effort measured at 0% false-OK *and* 0% false-reject (EXP-4, n=45), and a tenable latency/cost trade-off against the more expensive `max`.
- **Plan for a timeout of at least 900 s** on the client side for any verdict on a realistic patch: a shorter timeout risks cutting off long reviews.

### Honest caveat

The injected defect is **an amputation** (a piece removed), not a subtle semantic bug. It is a defect *detectable by structural reading*, which **favors** an attentive reviewer. That glm-4.7 fails on this easy case is all the more telling; but one cannot infer its behavior on a fine logic bug from it. And n=10 on the glm-5.3 side forbids any quantified conclusion about that model.

---

## 4. Real cost per role (Coding Plan points)

Official multipliers **[PUBLISHED]** (`points = (in×M_in + cached×M_cached + out×M_out)/10 000`):

| Model | M_in | M_cached | M_out |
|---|---|---|---|
| glm-5.3 | 6.9 | 1.7 | 24 |
| glm-5-turbo | 5.7 | 1.5 | 21 |
| glm-4.7 | 4.6 | 1.2 | 16 |

**[MEASURED]** real tokens per review (prompt ≈ 290 tokens):

| Model | Output tokens/review | **Points/review** | Latency |
|---|---|---|---|
| glm-4.5 | 4591 | ~7.5 | 76.9 s |
| glm-4.6 | 4510 | ~7.4 | 80.2 s |
| glm-4.7 | 4137 | **~6.8** | 70.7 s |
| glm-5-turbo | 1838 | ~4.0 | 68.7 s |
| glm-5.3 | 2343 | ~5.8 | **27.8 s** |

⚠️ **The real cost driver is verbosity**: the 4.x models spit out ~4500 output tokens for a 290-token prompt (**ratio ×15**). On an output multiplier of 16–24, that is where the points go.

**Measurable reduction levers:**
1. ⛔ **NOT `max_tokens`.** Capping the Reviewer roles at ~1200 does cut 4.x verbosity by about 70% **[MEASURED]** — that is why this lever was listed first, back when the judging roles ran on the 4.x family. Every role now runs `glm-5.3`, and on that model the lever is **forbidden**: it "always operates with reasoning enabled… Disabling reasoning is no longer supported" **[PUBLISHED]**, its documented default `max_tokens` is **65536** (ceiling 131072) and Z.AI recommends never going below **1024** **[PUBLISHED]**. A 1200 cap is **50× under the model's own default**, and the reasoning spends that budget before the answer begins. We measured empty responses below **1500 [MEASURED]** — that is the failure threshold, not a target — and §3bis shows a 2500-token ceiling alone dropping apparent accuracy from **97.8% to 77.8%**. Truncation is not a cost lever, it is a silent failure mode — and it does not even save what it looks like it saves, since you are billed for tokens generated, not for the limit you allow. **Set `max_tokens` to `131072`, the documented ceiling, and never below** (`glm-4.5` and `glm-4.5-air` top out at 98304 **[PUBLISHED]**). Real savings come from levers 2 to 4.
2. **Off-peak**: ×0.5 on everything, outside 2pm–6pm UTC+8 on weekdays **[PUBLISHED]**
3. **Prompt cache**: cached multiplier 3.5 to 4× lower than input → **keep the agents' system prompts strictly identical from one call to the next** (official Z.AI recommendation: formatting differences break the cache)
4. **Route by confidence**: trigger the full Reviewer only on low-confidence artifacts

---

## 5. What the literature says about GLM as a judge (and what it does not)

| Benchmark | GLM present? | Result |
|---|---|---|
| **IF-RewardBench** (2603.04738, 2026) | ✅ GLM-4.6, GLM-4.5-Air | GLM-4.6: 0.270 vs Gemini-3-Flash 0.513, GPT-5-mini 0.456 → **weak-to-medium judge** |
| **WebDevJudge** (2510.18560) | ✅ GLM-4.5 | pairwise 68.65 vs GPT-4.1 70.34, human 84.56 → mid-pack |
| **CodeCriticBench** (2502.16614) | ✅ GLM-4-Plus | 61.55% vs GPT-4o 68.06 / Claude-3.5 68.79 |
| **AACR-Bench** (2601.19494, 2026) | ✅ GLM-4.7 | F1 16.03 without context (best non-Claude), recall 27.57%, precision 11.30% |
| **arXiv 2606.15689** (2026) | ✅ GLM-5-Turbo | last of 5, F1 0.008 on real PRs |
| ProcessBench, CriticBench, JudgeBench, RewardBench/2, RM-Bench, JETTS | ❌ **no GLM** | gray zones filled by our measurements |
| **Sycophancy** (SycEval, SYCON, ELEPHANT, Beacon...) | ❌ **no GLM** | **total gray zone** — not measured here either |

**Calibration [PUBLISHED]**: arXiv 2505.14489 compares GLM-Z1-0414 (reasoner) to GLM-4-0414 → reasoning models express their confidence better (33/36 configurations). Consistent with our choice of a 5.3 as Reviewer.

**Important agentic nuance [PUBLISHED]**: on τ²-bench telecom, **GLM-4.6 WITHOUT reasoning (76.9%) beats GLM-4.6 WITH reasoning (70.5%)**. Thinking is not systematically beneficial — hence the per-role effort setting rather than a global `max`.

---

## 6. Fallback chains

```
WORKER    : glm-5.3 (max)      → glm-4.7 (high)     → glm-4.6 (high)
REVIEWER  : glm-5.3 (high)     → glm-4.6 (high, +commit-first)  → glm-4.5
QA        : glm-5.3 (high)     → glm-4.6 (high)     → glm-5-turbo (low, no signing rights)
```

**Hard rules:**
- `glm-5-turbo` never signs a compliance verdict (measured false-OK)
- **`glm-4.7` never carries a verdict on multi-file code** (78% measured false-reject, §3quater) — it stays excellent as Worker and for explaining an isolated function
- If a verdict role runs on 4.x → enable commit-first (removes its false-rejects on isolated functions)
- If a verdict role runs on 5.3 → lock the verdict format (its measured weakness)
- Never route a role to `glm-5.2`/`glm-5.1`/`glm-5`/`glm-4.5-air`: these are aliases, the diversity would be fictitious

⚠️ **All three roles run on glm-5.3.** Model diversity was *tested* (EXP-5 then EXP-6) and **rejected by the measurements**: the only credible candidate to diversify (glm-4.7) collapses on real code. The pipeline's real diversity therefore comes from **fresh context** and **distinct efforts**, not from the model.

---

## 7. Limits of this study (methodological honesty)

1. **n=53 per model**: the CIs stay wide. The accuracy gaps (90.6 vs 92.3%) are **not** significant; only the false-reject (6.2% vs 21–26%) and latency/cost gaps are.
2. **Measurement noise established at ±12.5 pp** on n=26 (measured accidentally by querying 4 aliases of the same model) → any gap below ~25 pp at this size is noise.
3. ~~**Python algorithmic bugs**: generalization to a real repository remains to be established.~~ → **Partially lifted by EXP-6** (SWE-bench Verified, real repositories, multi-file patches), which **invalidated the QA conclusion drawn from isolated functions**. Still uncovered: concurrency, I/O and security bugs.
   ➡️ **Major methodological lesson of this study**: a micro-benchmark on isolated functions can produce a ranking **inverted** relative to real code. Our EXP-1 to EXP-5 designated glm-4.7 as the best QA; EXP-6 disqualified it. Never route a production role on the sole faith of an isolated-function bench.
4. **A single run per cell** (no repetitions) — intra-model variance is not measured on the standard bench.
5. **Not tested for lack of budget**: EIR (error-introduction rate in review), cross worker→reviewer review, sycophancy under author pressure.
6. **Temperatures at 0**: results may differ in real use (ZCode does not fix the temperature).
