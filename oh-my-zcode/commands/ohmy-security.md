---
description: Evidence-gated security assessment - findings only enter the report once reproduced by an independent verifier that never sees the attacker's reasoning.
argument-hint: "[target URL | 'code' for SAST on the local repo]"
skills: security-gate
---

# /ohmy-security: an assessment whose findings were actually reproduced

Requested target: **$ARGUMENTS**

You are the orchestrator. You do not attack yourself and you do not confirm findings yourself: attackers produce candidates, an isolated verifier re-executes them, and only what reproduces enters the report.

## Why this command exists

False positives are the plague of security tooling. Adversarial verification eliminated **49.5%** of flagged candidates (OpenAnt); on CVE-Bench the ZAP scanner exploited **0 CVEs** while agents reached 13% — tool output alone is allegation, reproduction is fact. Conversely, verification that merely re-reasons suppresses **22.25%** of true positives (Sifting the Noise: FPR 23.0% -> 6.3% when verification actually executes). So this pipeline re-executes, and separates the finder from the verifier.

## Step 0: MODE

- Argument `code`, or empty: **SAST on the local repo** (semgrep + targeted code reading). Zero network. No scope confirmation needed.
- Anything else: **ACTIVE mode** — step 0.5 applies.

## Step 0.5: SCOPE-LOCK (active mode only)

Before ANY request to the target, present the authorization block — targets, type of test, owner confirmation, testing type — and REQUIRE the user's explicit authorization.

Freeze the scope to `.oh-my-zcode/security/<run>/scope.json`. Anything discovered outside the scope is documented, never tested. Dangerous operations (dump, write on target, brute force, privilege escalation) require a second explicit confirmation. When in doubt, STOP and ASK.

## Step 0.6: PREFLIGHT

Check which of the security tools are on PATH: nuclei, semgrep, sqlmap, nmap, ffuf. Report exactly what is missing and adapt: no sqlmap -> manual injection payloads via curl; nothing active available -> SAST-only, and say so.

## Step 1: FRAME it

Restate the run in four parts: Goal, Context, Constraints, Done-when. The Done-when must be decidable, e.g. "every confirmed finding carries a re-executed proof, and the report states coverage per WSTG category in scope".

## Step 2: PLAN

Build the attack plan by WSTG angle families. Delegate to `ohmy-plan-critic` (three rounds maximum). It answers `PLAN READY` or `PLAN REVISE` — that vocabulary only; never ask it for a VERDICT.

## Step 3: RECON

One agent builds `.oh-my-zcode/security/<YYYYMMDD-HHMM>_<slug>_<session8>/surface.md`: endpoints, parameters, authentication, tech stack.

The surface map decides the team: it fits one page -> a **single attacker**; otherwise up to **3 attackers by family** (injection / auth+session / authorization+business logic).

## Step 4: ATTACKERS

Subagents. Each receives the four parts + `surface.md` + its family ONLY — never another attacker's output.

Interactive command/observe loop, real tools, rate-limited. Each returns **candidate findings only**, as structured entries: title, severity, location, the exact command or HTTP request, the expected evidence. No narrative.

## Step 5: FINDING-VERIFIER

Delegate the candidates to `ohmy-finding-verifier` WITHOUT the attacker's reasoning. You get per finding CONFIRMED / NOT REPRODUCED / OUT OF SCOPE, each with the raw output of the re-execution.

## Step 6: RUN THE DECIDING COMMANDS YOURSELF

ZCode hooks do not fire in subagents. Before signing anything, re-run in this session one reproduction per confirmed finding, plus the main scan. Quote raw outputs and exit codes.

## Step 7: REPORT

Write `report.md` in the run folder:

- scope as authorized
- confirmed findings: severity, location, raw request/response, reproduction steps, remediation
- NOT REPRODUCED section
- WSTG coverage checklist
- NOT COVERED, with reasons

Copy `scope.json` and the session's `.oh-my-zcode/evidence/<session id>.jsonl` into the folder as `evidence.jsonl`.

## Step 8: SIGN

Optionally end your final message with, alone on the last line:

```
FINDINGS: VERIFIED
```

The findings gate checks that a verification command ran this turn; signing without it is refused. Not signing is always allowed.

## Hard rules

1. **Scope-lock is absolute.** Nothing outside the frozen scope is ever tested.
2. **One-way flow.** No debate between agents.
3. **The attacker never confirms its own findings.**
4. **Same model everywhere**; judging roles never on `glm-5-turbo` (3% measured false-OK).
5. **Never sign on a subagent's trace.** Only commands run in this session count.
6. **Rate limits on every tool, always.**
7. **A finding without executed proof does not exist.**
