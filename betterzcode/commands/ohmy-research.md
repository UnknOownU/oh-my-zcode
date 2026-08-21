---
description: Researches a question against real sources, has every claim confronted with the source it names, and publishes a report whose citations were actually opened. No claim survives on a search snippet.
argument-hint: "[the question you want answered]"
---

# /ohmy-research: a report whose citations you can trust

Question: **$ARGUMENTS**

You are the orchestrator. **You never write the report** — a dedicated draft writer produces it from the notes — but you lead the research, you do not believe a source you have not opened, and you do not sign for someone else's reading. The signature stays yours and it is earned in this session.

## Why this command exists

A search result is not a source. A search returns a snippet selected to match your query, so a claim resting on one is a claim about the snippet, not about the document. This is not a theoretical risk: across 58,000 claim/source pairs, **50 to 90% of model citations are not fully supported** by the source they name, and the rate collapses further on open-ended questions (SourceCheckup, Nature Communications 2025).

Nothing in the field guards against it. Read at source level, the production research harnesses — LangChain's open_deep_research, GPT-Researcher, STORM — state citation rules in a prompt and verify none of them. This command closes that hole, and the `Stop` hook enforces the closing.

## Step 1: Frame it

Restate the request in four parts. If one is missing, ask for it now:

- **Question**: what must be answered, in one sentence
- **Scope**: what counts as in and out — period, domain, language, what kind of source is admissible
- **Constraints**: what the answer must be usable for
- **Answered when**: the condition under which you stop. It must be checkable by someone else.

"Answered when" is the part people skip and the one that decides the cost. "I understand the landscape" is not a condition; "each of the three sub-questions has an answer backed by at least one source I opened, or is explicitly marked unanswered" is.

## Step 2: Decompose ONCE

Split the question into **independent axes** — at most three. Then stop decomposing.

Breadth saturates after a single decomposition: splitting a question into sub-questions helps, splitting the sub-questions again buys nothing measurable and multiplies cost. Depth is where the returns are. If an axis turns out to be two questions, note it and go deep on the one that answers the user, rather than spawning a second layer.

**Three axes is a ceiling, not a target.** Most questions have two. Some have one, and one axis researched properly beats three researched shallowly.

## Step 3: Research each axis

Delegate one agent per axis, or do it yourself when there is a single axis. Whoever researches follows the same discipline:

**Search to find, fetch to read.** A search tells you a document exists. Only fetching it tells you what it says. A claim may enter the notes only from a page that was actually retrieved.

**Read the full text, not the abstract.** Judging what a paper supports from its abstract alone caps recall at 16-17%; the full text reaches 36-38% at precision 1.0 (CiteGuard). Half of what a citation gets wrong is invisible from the abstract.

**Note the claim with its source and a verbatim quote.** A note that records a conclusion without the sentence that carries it is a note you cannot check later, and you will not remember which it was.

### When to stop an axis

Not on a budget. On a signal: **stop when the last two sources you opened produced no claim that was not already in your notes.**

A fixed cap is the wrong instrument in both directions. Every harness in the field stops on a counter — six iterations, ten tool calls, twenty steps — and none of them measures whether the question got answered. But a cap set low also truncates the run that was still producing: on real questions, the finding that overturns the answer often arrives late. Let the signal decide, and keep a hard ceiling only as a backstop against a loop that never converges.

### Propagating findings between axes

**A refutation travels immediately. A positive claim waits for its source.**

If an axis discovers that a premise is false, a path is a dead end, or a constraint exists, tell the others at once: the cost of them not knowing is wasted work. If an axis discovers a *finding*, it travels only once the source has been opened and the claim confronted with it. An unverified claim broadcast early becomes everyone's premise, and the whole run inherits one agent's mistake.

The asymmetry is deliberate: a false refutation costs one abandoned path, a false premise costs the entire report.

## Step 4: Dispatch `ohmy-draft-writer`

At the **project root**, create `.betterzcode/research/<YYYYMMDD-HHMM>_<slug>_<session8>/` (where `<slug>` is three or four words from the Question and `<session8>` is the first 8 characters of the session id). Then delegate to `ohmy-draft-writer`: pass it the folder path, the four framing parts, and the axes' notes — each claim with its source URL and a verbatim quote. It writes `report.md` there and answers with ARTIFACT / CONFIDENCE.

**You never write or edit the report yourself.** If the draft is wrong, that is a finding for the verifier (step 5) or a new draft-writer dispatch with the corrections to apply.

## Step 5: Confront the claims with their sources

Delegate to `ohmy-source-verifier`. Pass it the draft and nothing else — it opens every source itself, because the draft's summary of a source is exactly what it was called to check.

It answers per claim: `SUPPORTED`, `NARROWER`, `UNSUPPORTED`, `UNVERIFIABLE`, each with a verbatim quote, and proposes corrected wording rather than deletion.

- `CITATIONS REVISE` → dispatch a NEW `ohmy-draft-writer` with the corrections to apply to the file, then send it back. **Three rounds maximum.**
- `CITATIONS CLEAN` → go to step 6.

**Most defects here are scope drift, not invention.** A figure averaged over one model family, reported without that qualifier, is wrong in the way that survives review: the number is real, the claim is not.

## Step 6: Open the sources YOURSELF before you sign

**ZCode hooks do not fire inside a subagent.** The pages the verifier fetched are invisible from this session, so its reading cannot back your signature — the same rule that governs the code pipeline, for the same reason.

So: **fetch every source you cite in the final report yourself, here, in this session.** Then cite the exact URL you fetched.

This is not bureaucracy. It is the difference between "an agent told me it read the paper" and "the paper was retrieved". Only the second one is a fact about the world.

**This rule is yours and it is non-delegable.** No writer, no verifier, no subagent can open the sources on your behalf: the orchestrator signs only on pages this session retrieved.

Then copy `.betterzcode/evidence/<session id>.jsonl` into the report folder as `evidence.jsonl`. The original stays where it is.

## Step 7: Sign

End your final message with, alone on the last line:

```
SOURCES: VERIFIED
```

The citation gate then checks every URL you cited against the pages this session actually fetched, and refuses the turn if one is missing.

**The signature is optional. Signing it without having opened the sources is not.** If a source could not be retrieved, keep the claim only if it is marked explicitly unverified in the report, and do not sign.

## Hard rules

1. **A search result is never a source.** Only a fetched page enters the notes.
2. **No claim without a verbatim quote.** If you cannot quote the sentence, you do not have the finding.
3. **Whoever publishes opens the sources.** A subagent's reading cannot sign your report — and you never sign on pages you did not fetch yourself.
4. **The orchestrator never writes the report.** The draft is produced by `ohmy-draft-writer`; corrections are routed back to a new writer dispatch, never applied by hand.
5. **Three axes, three agents, ceiling.** Below roughly 45% single-agent performance a second agent helps; above it the gain is measured at zero or negative, and homogeneous agents duplicate each other rather than adding coverage.
6. **Do not try to buy model diversity here.** On the Coding Plan, `glm-5.2`, `glm-5.1` and `glm-5` are aliases answering as `glm-5.3`, and `glm-4.5-air` answers as `glm-4.7`. Running "different models" would give you the same model under three names, and correlated errors are exactly what a second reader is supposed to remove. The agent ceiling therefore binds harder here than the literature suggests.
7. **The gap is part of the answer.** An unanswered sub-question stated plainly is worth more than a confident paragraph nobody can check.
