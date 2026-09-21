# council — the design of a blind panel

> **A member that judges never meets the members it judges beside.**

`/ohmy-council` evaluates an idea — a raw one-line pitch or the full material of a finished
brainstorm — by submitting it to five isolated agents and aggregating their answers
mechanically. This document is the rationale: every mechanism below exists because a
measurement says so, or is explicitly marked as unmeasured. Nothing here is decoration.

## What problem it solves

The plugin's measured law is that a producer never judges its own work — the Builder builds,
the Reviewer judges in a fresh context. An idea has no such protection anywhere in the lineup:
`/ohmy-plan` critiques a plan for *code that will be written*, and nothing critiques the idea
*before it becomes a plan*. The council is that missing front gate — and since an idea has no
code to execute and no source to fetch, its evidence is the independent judgment itself. So the
design question is entirely: **how do you get five judgments that are worth more than one,
from one model?**

## The five lenses

| | Member | Lens | Output |
|---|---|---|---|
| 🟣 | `council-analyst` | feasibility — can it be built, at what complexity and cost | `COUNCIL: ENDORSE / RESERVE / REJECT` + numbered findings |
| 🟣 | `council-skeptic` | risk — the strongest honest case against, the killing assumption | same chassis, pre-mortem format |
| 🟣 | `council-strategist` | value — should this exist, against which alternatives (including doing nothing) | same chassis, alternatives steel-manned |
| 🔵 | `council-innovator` | novelty ON the idea — recombine, invert, transfer, amplify | 3-7 proposals, feasibility-tagged |
| 🔵 | `council-explorer` | unexplored territory — what nobody in the room imagined, premise challenges included | first principles + proposals, relation-tagged |

Judges judge; creatives propose; nobody does both. That separation is the plugin's core law
(*an agent that writes is never an agent that judges*) transposed from artifacts to ideas: a
member busy inventing cannot impartially condemn, and a member set up to condemn will not
invent.

## The mechanisms, each with its reason

### 1. Blindness — no member knows another exists

Dispatches are parallel, one-shot, and never mention the other members, previous council runs,
or the orchestrator's opinion.

*Evidence: debate between agents of the same model produces sycophantic conformity, not truth — agents adopt the majority answer in up to 85.5% of cases (Bertalanič & Fortuna 2026: small open models, reasoning tasks; evidence-gate rule 9). A panel that discusses
converges on the first confident voice; a panel that answers blind converges on nothing, which
is what the aggregation step is for.*

### 2. Aggregation is majority, never union

A point enters the **Convergence** section only when at least 2 of the 3 judges raise it,
grouped by root cause. Single-judge findings stay as attributed **Minority views**; split
verdicts are reported as splits, both sides verbatim.

*Evidence: evidence-gate rule 8 — multi-review aggregation gains recall (+118.83%, SWR-Bench)
but pays in precision, so the combination rule decides what the panel is worth: a union of
findings amplifies the measured over-rejection of this model family (21-26% false-reject,
77.8% for glm-4.7 on multi-file code), while a 2-of-3 majority filters isolated errors in both
directions. The minority views stay visible because a lone judge seeing what the others missed
is precisely why panels exist.*

### 3. Judges state their criteria BEFORE reading the briefing

Each judge writes what feasibility/risk/value means for an idea of this kind before opening
`briefing.md`, then confronts the material criterion by criterion.

*Evidence: the reviewer mechanism transposed — "a criterion written after seeing the code
is a criterion biased by the code." The same anchoring applies to ideas: criteria written after
reading a pitch bend toward the pitch.*

### 4. The explorer ideates BEFORE reading — anti-anchoring by protocol

The explorer receives only the Idea line, writes 5-7 first-principles directions for the
domain, and only then opens the briefing — marking which of its directions the material
already contains (those are not proposals) and proposing the rest.

*Evidence: by analogy with mechanism 3 — reading a detailed proposal first pulls every
subsequent idea toward it. There is no direct benchmark of "ideate-before-read" for LLM
panels; the protocol is the cheapest structural defense available and is marked as such
(**not proven, and marked as such** — the plugin's own convention for honest design).*

### 5. The briefing is raw material, not an evaluation

`briefing.md` carries the idea verbatim in the user's words (enthusiasm included), context as
file paths or COMPLETE lists, statements attributed — no adjectives, no expectations, no
orchestrator commentary. **A selection is a direction, and direction is forbidden**: if a
brainstorm produced twelve options, the briefing carries twelve options, not "the promising
ones".

*Evidence: this is the council's version of the reviewer's context isolation ("do not cancel
that effect by copying the Builder's explanations into it"). The briefing is the only channel
through which the members see the idea; whatever bias it carries reaches all five
identically — the correlated-error problem below, injected by the orchestrator.*

### 6. Same model, five lenses — diversity is the prompt, never the model

All five members run `glm-5.3`. The routing table below is an **unmeasured default**.

*Evidence: on the Coding Plan, `glm-5.2`/`glm-5.1`/`glm-5` are aliases answering as glm-5.3
and `glm-4.5-air` answers as glm-4.7 — "model diversity" would be the same model under several
names, with correlated errors dressed as independence (README law, source-gate rule 11). What
carries the panel is role diversity, not the personas themselves: a persona alone does not
improve model judgments (Zheng et al. 2024, arXiv 2311.10054), while a same-role panel
degrades ("utilizing the same role description in the prompt can lead to a degradation in
performance" — ChatEval, arXiv 2308.07201). The
honest positions: lenses differ (different criteria, different methods, different outputs —
that separation is real), errors correlate (that is the measured limit, stated below).*

## Routing — disclosed as unmeasured

| Member | Model | Effort | Basis |
|---|---|---|---|
| analyst / skeptic / strategist | `glm-5.3` | `max` | owner setting 2026-09-21 — every seat at max (the reviewer analogy pointed to high, the measured 6.2% false-reject configuration) |
| innovator / explorer | `glm-5.3` | `max` | analogy with builder (producers at max) |

No measurement exists for a council role. The defaults follow the closest measured neighbors
and every member file says so. Never `glm-5-turbo` on a judging seat (3% measured false-OK,
the only model to have approved broken code); never an alias name (fake diversity).

## What the council does NOT do

- **It does not recommend.** The report carries verdicts, convergence, proposals and
  divergence — no overall score, no "recommended next step". The user decides; a panel that
  decides is a committee, and committees are what this design exists to avoid.
- **It signs nothing.** `COUNCIL:` vocabulary is deliberately outside the gate namespace —
  `VERDICT:`, `SOURCES: VERIFIED` and `FINDINGS: VERIFIED` are reserved for executed proof,
  and an opinion panel has none. The council report is advisory by construction.
- **It fetches nothing on the record.** Subagent fetches are invisible to the hooks (measured,
  evidence-gate rule 13); members may open pages for orientation, but anything external in
  their output is marked as a pointer, never as verified fact. The citation gate is not
  involved.
- **It touches no gate, hook or MCP server.** The dispatch gate only routes
  `[ohmy-redteam …]`-tagged prompts; council dispatches pass untouched by design.

## Limits, stated

- **Correlated errors are the known limit of a one-model panel.** The mitigations are
  structural (blindness, majority, criteria-before-reading) and presentational (minority views
  and divergence kept verbatim, so the reader sees the correlation instead of a smoothed
  verdict). What is not claimed: independence in the statistical sense.
- **A verdict is a single sample.** The same judge run twice can answer differently — measured
  inter-sample agreement α = 0.587, below the 0.659 of human annotators with each other
  (Stureborg et al. 2024, arXiv 2405.01724). A split verdict is information about noise as
  much as about the idea; on a high-stakes decision, re-run the council before trusting the
  flip.
- **The briefing is the residual bias surface.** The neutrality contract (verbatim, exhaustive
  or by pointer) is a discipline, not a mechanism — a determined orchestrator could still
  steer through selection. The report's "what the council could not see" section is where that
  residue is declared.
- **Five is a design point, not a measurement.** Three judges make a majority decidable and
  the panel matches the plugin's 3-optimised-agents doctrine (DyLAN: 3 optimised beat 7
  unoptimised for 52.9% fewer calls); no benchmark sizes an idea panel.

## What lands on disk

```
.oh-my-zcode/council/<YYYYMMDD-HHMM>_<slug>_<session8>/
├── briefing.md     the frozen, neutral material the members read
└── report.md       verdicts, convergence, minority views, proposals, divergence
```

The council writes no evidence log — there is nothing to gate. The two files are the run.
