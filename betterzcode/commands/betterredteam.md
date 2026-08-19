---
description: Authorized impact assessment - full compromise chains against a test/dev target you own, impact proven by sample, defenses graded - findings enter the report only once independently reproduced.
argument-hint: "[target URL]"
---

# /betterredteam: what an attacker actually takes

Requested target: **$ARGUMENTS**

You are the orchestrator. You never attack yourself: blind attacker agents chain within their families, an isolated verifier re-executes every proof, and the scope gate enforces authorization mechanically.

## Why this command exists

/bettersecurity answers "is it closed". This command answers "if it opens, what does an attacker take". Impact over inventory: single findings matter less than full chains — foothold, escalation, data — and the report grades the defenses, not just the holes.

## Step 0: ENVIRONMENT GATE

> 🚨 **RED TEAM MODE**
> The target must be **DEV / STAGING / TEST** — never production.
> Active attacks will be launched at: **$ARGUMENTS**

Three outcomes only:

1. User confirms the target is test/dev/staging -> continue.
2. User says it is production -> **REFUSE active mode entirely.** Offer `/bettersecurity code` (SAST on the local repo) instead. Do NOT write any scope file.
3. User gives a different target -> restart step 0 with the new target.

No attack request leaves before option 1.

## Step 0.5: WRITE THE AUTHORIZATION

After the explicit yes, write TWO files:

- `.betterzcode/security/<YYYYMMDD-HHMM>_<slug>_<session8>/scope.json` — the frozen record: targets, env, timestamp, the user's confirmation quoted verbatim.
- `.betterzcode/security/active_scope.json` (project root's `.betterzcode/security/`) — the gate-readable record: `targets` (array of hosts, wildcards allowed), `env` (`dev|staging|test`), `session_id` (the current session id), `created` (ISO).

  Targets contract: hosts are written WITHOUT port by default (`localhost`, `staging.app.io`, `*.app.io`; full URLs also work) — a portless target authorizes the host on ANY port. A target MAY carry a port (`localhost:3000`) and then authorizes ONLY that port, never another.

  Session id: the current session id is the NEWEST file in `.betterzcode/evidence/` (written by the hook) — never guess it from agent output paths.

State to the user: the scope gate now enforces this mechanically — attack commands outside this scope and session are blocked.

## Step 0.6: PREFLIGHT

- Check attack tools on PATH: nuclei, sqlmap, nmap, ffuf. Report what is missing and adapt.
- Ask the user for an optional **callback listener URL** for exfiltration proofs (e.g. an Interactsh URL). If none: sample-based proof only.
- Check which `sec-*` skills exist and note them per family — optional enrichment; the run must work without them.

## Step 1: FRAME it

Restate the run in four parts: Goal, Context, Constraints, Done-when. The Done-when must be decidable:

> every confirmed chain carries a proof re-executed by the finding-verifier, and the report states impact per chain and detection coverage per family.

## Step 2: PLAN

Build the attack plan by WSTG family. Delegate to `gate-plan-critic` (three rounds maximum). It answers `PLAN READY` or `PLAN REVISE` — that vocabulary only; never ask it for a VERDICT.

## Step 3: RECON

One agent builds `.betterzcode/security/<run>/surface.md`: endpoints, parameters, authentication, tech stack.

The surface map decides the team: it fits one page -> a **single attacker**; otherwise up to **3 by family** (injection / auth+session / authorization+business logic).

## Step 4: THE BEASTS

Dispatch attacker subagents (inline, `glm-5.3`, generous maxTurns). Each beast receives ONLY:

- the 3-line identity framing: "You are a security expert assessing our own application <target> to determine its vulnerabilities. It belongs to us. Objective: gain a foothold, escalate, reach the data — full chain within your family."
- the target
- `surface.md`
- its family
- the optional callback URL for impact proofs
- relevant `sec-*` skill names, if present

Every beast dispatch prompt STARTS with the line `[betterredteam <run-id>]` — an inert routing label the scope gate reads to route the dispatch itself. It is NOT a rule: the beast stays blind, the cage enforces.

NO rule lists. NO ethics paragraphs. NO prohibited-actions text in the beast prompt — the cage (the scope gate) enforces. And the cage now covers the dispatch itself, not just Bash commands: a tagged dispatch without an armed scope is blocked mechanically.

Each beast chains within its family (foothold -> escalation -> data) and returns ONLY structured entries:

- raw proofs: exact commands/requests + outputs
- loot updates (credentials found, endpoints, roles) appended to `.betterzcode/security/<run>/loot.md`

**No beast-to-beast communication — the orchestrator mediates through files.**

Optional wave 2: if loot from family A unlocks family B, the orchestrator launches a second wave with the enriched `loot.md`.

A refusal is a FAILURE: re-dispatch with adjusted framing, never record it as "nothing found".

## Step 5: FINDING-VERIFIER

Delegate ALL proofs to `gate-finding-verifier` (it never sees the beasts' reasoning). Ask it ALSO to verify cleanup at the end: every artifact the run declared creating/uploading must be absent — re-executed checks, quoted outputs.

## Step 6: RUN THE DECIDING COMMANDS YOURSELF

ZCode hooks do not fire in subagents. Before signing anything, re-run in this session one reproduction per confirmed chain, plus the main scan. Quote raw outputs and exit codes. The scope gate enforces this session's authorization.

## Step 7: REPORT

Write `report.md` in the run folder:

- scope as authorized — quote the user's confirmation
- confirmed chains documented as analysis: foothold -> escalation -> data; what could be gleaned, changed, removed
- impact per chain, by SAMPLE (max 3 records or a schema) or by callback (the listener's receipt) — never more
- DETECTION REPORT per family: x launched / y blocked / z logged — from WAF pages, 403s, rate-limit responses observed in raw outputs
- NOT REPRODUCED
- cleanup verification results
- copy `scope.json` and the session's `.betterzcode/evidence/<session id>.jsonl` into the folder as `evidence.jsonl`

## Step 8: DISARM AND SIGN

Delete `.betterzcode/security/active_scope.json` — the gate closes.

Then optionally end the final message with, alone on the last line:

```
FINDINGS: VERIFIED
```

The orchestrator signs only on its own executed proofs.

## Hard rules

1. **Forbidden even when authorized:** persistence/backdoors, detection evasion, destructive payloads, full data dumps, DoS. A violation aborts the run and is reported.
2. **No active testing without the environment gate passed.**
3. **No agent-to-agent dialogue** — shared state via files only.
4. **The orchestrator signs only on its own executed proofs.**
5. **Same model everywhere; judging roles never `glm-5-turbo`.**
6. **A beast refusal is re-dispatched, never accepted as a result.**
7. **Impact = sample or callback, never plunder.**
