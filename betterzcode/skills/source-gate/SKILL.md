---
name: source-gate
description: Doctrine of evidence-gated research for GLM agents, grounded in measurements. Load it when researching a question against external sources, when writing or reviewing a report that cites anything, when deciding how many research agents to run or when to stop searching, or when a claim must be confronted with the source it names.
---

# source-gate: the doctrine

> **A source you have not opened is not a source.**

## The 12 rules, each backed by a measurement

1. **A fetched page is a source. A search result is not.**
   A search returns a snippet selected to match the query, so a claim resting on one is a claim about the snippet, not about the document.
   *Evidence: across 58,000 claim/source pairs, 50 to 90% of model citations are not fully supported by the source they name, and the rate collapses further on open-ended, multi-domain questions (SourceCheckup, Nature Communications 2025, s41467-025-58551-6).*

2. **Read the full text, not the abstract.**
   *Evidence: judging citation support from abstracts alone caps recall at 16-17%; the full text reaches 36-38% at precision 1.0 (CiteGuard). Half of what a citation gets wrong is invisible from the abstract.*

3. **Confront claim by claim, never globally.** For each claim, quote verbatim the passage that carries it. No quote, no claim.
   *Evidence: a global opinion verdict is unstable — 13.6% of verdicts flip on an identical rerun, and model judges underperform human ones by 12 to 23% on code. Per-item confrontation against a fixed text removes the instability the judge introduces.*

4. **Repair, do not delete.** For an unsupported claim, write the strongest statement the source actually licenses.
   *Evidence: a terminal repair pass of this shape fixes 90.7% of unsupported statements rather than discarding them (SourceCleanup). It requires a frontier model: the same protocol on a mid-size one scores 79.3%, which its authors call "not yet on-par".*

5. **Scope drift, not invention, is the dominant defect.** A figure averaged over one model family, reported without that qualifier, is the error that survives review: the number is real, the claim is not. Check numbers digit by digit and scopes word by word.

6. **Whoever publishes opens the sources.** A subagent's fetches are invisible to the runtime that signs.
   *Same mechanism as rule 13 of the code pipeline: ZCode hooks do not fire inside subagents. A verifier that read forty papers proves nothing from the publishing session.*

7. **Decompose once, then go deep.** At most three axes, and no second layer.
   *Evidence: breadth saturates after a single decomposition, while depth keeps returning. A question split into sub-questions gains; sub-questions split again do not.*

8. **Stop on a signal, not on a counter.** An axis is done when the last two sources opened produced no claim that was not already in the notes.
   *Evidence: every production harness stops on a fixed counter — six iterations, ten tool calls, twenty steps, a depth countdown — and not one measures whether the question got answered. One stops when the model emits a set phrase. A counter set low also truncates a run that was still producing.*

9. **A refutation travels immediately. A positive claim waits for its source.**
   *The asymmetry is the point: a false refutation costs one abandoned path, a false premise costs the whole report. Broadcasting an unverified finding early turns one agent's mistake into everyone's premise.*

10. **Agent ceiling: three, and expect less.**
    *Evidence: above roughly 45% single-agent performance, the multi-agent gain is measured at zero or negative, with the sign correctly predicted in 94% of 16 configurations. At an equalised token budget, a single agent matches or beats every multi-agent system tested. Homogeneous agents duplicate rather than add: eight of them behave like fewer than two independent readers.*

11. **Do not try to buy diversity on this platform.** `glm-5.2`, `glm-5.1` and `glm-5` are aliases answering as `glm-5.3`; `glm-4.5-air` answers as `glm-4.7`. Running "different models" gives you the same model under several names, and correlated errors are exactly what a second reader is supposed to remove. Rule 10 therefore binds harder here than the literature suggests.

12. **The gap is part of the answer.** A report with no stated gap claims a completeness nobody has measured.
    *Evidence: the best research agents recover 42.5% of the relevant material on an encyclopedic corpus and 29.2% on a technical one — and cannot estimate that gap themselves. No benchmark in the field grades a report; they grade short answers.*

## What the field actually does

Read at source level, not from documentation:

| Harness | Verifies that the source supports the claim? | Stops on |
|---|---|---|
| LangChain `open_deep_research` | No — citation rules live in the prompt, no code checks them | iteration and tool-call counters |
| GPT-Researcher | No — ranks sources by credibility, never links a claim to one | fixed sub-query count, depth countdown |
| Stanford STORM | No — re-indexes bracket numbers and strips out-of-range refs: bookkeeping | turn counter, plus a set closing phrase |
| smolagents | Not applicable (short answers) | hard step caps |
| dzhng `deep-research` | No — flat URL list, learnings carry no per-claim source | depth countdown |

**Nobody verifies citations. Nobody measures coverage.** That is the hole this doctrine and the citation gate exist to fill.

## The gate

The `Stop` hook enforces rules 1 and 6 mechanically. A turn ending on `SOURCES: VERIFIED` is refused when a cited URL was never retrieved in that session.

- Only a retrieval counts, and it is recognised by its **input shape** — anything carrying a `url`. ZCode's `WebFetch` and Z.AI's `webReader` MCP tool both qualify; `WebSearch` and `webSearchPrime` are logged and never counted as reading.
- **A failed retrieval is not a retrieval.** A 403 is recorded as `fetch_failed`, and citing it is refused.
- **The gate refuses what the log contradicts, never what it is silent about.** Citing an unfetched page is a contradiction. Signing without citing anything, in a session that did fetch pages, is a silence — the citations are in the report file, and the hook only sees the message. Signing when the session retrieved nothing at all is a contradiction again, and stays blocked.
- The window is the **session**, not the turn — unlike the evidence gate. A verdict speaks about the current state of the code, so its proof must be fresh; a paper fetched twenty minutes ago still says what it said.
- The signature is optional and the gate is silent without it. Signing it without having opened the sources is what gets refused.

*The silence rule is not a softening: it comes from a real run (2026-08-19) where an agent fetched 30 pages, cited all 30 in `report.md`, and was blocked because its closing message carried none of them. A later audit of the two records found 30 cited for 30 fetched, with no gap either way. A gate that punishes a compliant run teaches agents to stop signing, which costs you the signal entirely.*

## Operational notes for GLM

- **`glm-5.3` carries a 1M-token context.** Fetched pages can stay in context in full rather than being summarised at every hop, which is what the harnesses above do to fit a smaller window. Prefer keeping the page: a summary of a source is one more layer between the claim and the text.
- **A `max_tokens` that is too low produces an EMPTY response**: the reasoning consumes the budget. **Set `131072`, the documented ceiling, and never below** — the ceiling is free, since you pay for tokens generated, not for the limit allowed.
- **`low` and `minimal` are forbidden for the verifying role**: 4.2 to 8.3% measured false-OK.
