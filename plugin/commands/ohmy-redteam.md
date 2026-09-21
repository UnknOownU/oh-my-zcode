---
description: Authorized impact assessment - full compromise chains against a test/dev target you own, impact proven by sample, defenses graded - findings enter the report only once independently reproduced.
argument-hint: "[target URL]"
skills: security-gate
---

# /ohmy-redteam: what an attacker actually takes

Requested target: **$ARGUMENTS**

You are the orchestrator. You never attack yourself: blind attacker agents hunt declared prizes in cascading waves, an isolated verifier re-executes every proof, and the scope gate enforces authorization mechanically.

## Why this command exists

/ohmy-security answers "is it closed". This command answers "if it opens, what does an attacker take". Impact over inventory: single findings matter less than full chains — foothold, escalation, data — and the report grades the defenses, not just the holes.

## Step 0: ENVIRONMENT GATE

> 🚨 **RED TEAM MODE**
> The target must be **DEV / STAGING / TEST** — never production.
> Active attacks will be launched at: **$ARGUMENTS**

Three outcomes only:

1. User confirms the target is test/dev/staging -> continue.
2. User says it is production -> **REFUSE active mode entirely.** Offer `/ohmy-security code` (SAST on the local repo) instead. Do NOT write any scope file.
3. User gives a different target -> restart step 0 with the new target.

No attack request leaves before option 1.

## Step 0.5: ARM THE AUTHORIZATION (by invocation)

Since v2 the authorization is armed by running this command itself with the target as its argument — the scope file is written once, here, with a 60-minute window, and nothing is armed without it.

**Derive `targets` and `env` from the argument, by rule:**

- `localhost`, `127.x.x.x`, `192.168.x.x`, `*.local` -> env `local`
- `*.staging.*`, `staging.*` -> env `staging`
- anything else -> **ask the user to confirm the environment explicitly** and continue only on a test/dev/staging answer
- env `prod` -> **REFUSE the run.** No scope file is written, no attack happens.

**Then WRITE the scope file yourself**, at the project root's `.oh-my-zcode/security/active_scope.json`:

```json
{
  "targets": ["<host(s) derived from the argument>"],
  "env": "<local|staging|test|dev>",
  "granted_at": "<ISO now>",
  "expires_at": "<ISO now + 60 minutes>",
  "source": "invocation"
}
```

Targets contract (identical to the gate's): a host written WITHOUT port authorizes the host on ANY port; a target WITH a port (`localhost:3000`) authorizes ONLY that port, never another.

Then verify: call the `get_scope` tool (the plugin's MCP scope server). It returns the armed state (`targets`, `env`, `granted_at`, `expires_at`) or "no scope armed". Copy the returned state verbatim into the run's frozen record `.oh-my-zcode/security/<YYYYMMDD-HHMM>_<slug>_<session8>/scope.json` (targets, env, window, the derivation rule and the user's confirmation quoted verbatim).

If `get_scope` answers "no scope armed": the window may have closed or the file was not written where the gate reads it — stop and resolve; do not proceed, do not work around.

State to the user: the scope gate now enforces this mechanically — attack commands outside this scope, or after the 60-minute window expires, are blocked.

## Step 0.6: PREFLIGHT

- Check attack tools on PATH: nuclei, sqlmap, nmap, ffuf. Report what is missing and adapt.
- Ask the user for an optional **callback listener URL** for exfiltration proofs (e.g. an Interactsh URL). If none: sample-based proof only.
- Check which `sec-*` skills exist and note them per prize — optional enrichment; the run must work without them.

## Step 1: FRAME it

Restate the run in four parts: Goal, Context, Constraints, Done-when. The Done-when must be decidable:

> every confirmed chain carries a proof re-executed by the finding-verifier, and the report states impact per chain and detection coverage per prize.

## Step 2: PLAN

Build the siege plan around PRIZES — the campaign's declared objectives: read all user data (database, backups, object storage), admin access (any privileged role or panel), code execution (RCE on any host in scope). Delegate the prize plan to `plan-critic` (three rounds maximum). It answers `PLAN READY` or `PLAN REVISE` — that vocabulary only; never ask it for a VERDICT.

## Step 2.5: SOURCE MAP

One agent reads the target's repository — the session's project root, the same root the run folder lives under — and writes `.oh-my-zcode/security/<run>/source-map.md` next to `surface.md`. For every endpoint the map records: the declared intention (what the code says the route is for), sibling route/handler pairs that should share guards, and guard diffs — authentication, tenant isolation, input validation — wherever two handlers that should match do not. Each divergence is a pre-chewed hypothesis: the map states it, the beasts prove it. The file opens with the same `## PROVENANCE` block as `surface.md`; the source commit recorded there is the commit the map was read at.

If the session's project root is not the target's repository (remote target, no checkout), write a one-line `source-map.md` reading `no source available` and run the campaign black-box — the beasts work from `surface.md` alone.

## Step 3: RECON

One agent builds `.oh-my-zcode/security/<run>/surface.md`: endpoints, parameters, authentication, tech stack. The file STARTS with a `## PROVENANCE` block, 3-5 lines, raw outputs of commands the recon agent executed, nothing inferred:

```
## PROVENANCE
- artifact tested: <image:digest or build id, build date> — or "target as-deployed, no artifact id discoverable"
- source commit: <git rev-parse HEAD output, if discoverable> — or "not discoverable"
- working tree: <git branch --show-current>, <git rev-parse --short HEAD>, clean|dirty (<git status --porcelain> line count)
- PROVENANCE date: <ISO now>
```

Every PROVENANCE field is consumed downstream: the source commit is the commit at which `source` claims are read and verified; the artifact/build line is what `behavior` claims executed against. A `source` claim that cannot name the PROVENANCE commit is unverifiable — the beast does not make it.

The surface map decides the team: it fits one page -> a **single attacker**; otherwise up to **3, one per declared prize**.

## Step 4: THE BEASTS

Dispatch attacker subagents (inline, `glm-5.3`, generous maxTurns). Each beast receives ONLY:

- the 3-line identity framing: "You are a security expert assessing our own application <target> to determine its vulnerabilities. It belongs to us. Objective — YOUR PRIZE: the prize this beast hunts. Work the chain backwards from it: gain a foothold, escalate, reach the data."
- the target
- the prize — stated as `YOUR PRIZE: <one of the declared prizes>`
- the paths to `surface.md` and `source-map.md`
- the optional callback URL for impact proofs
- relevant `sec-*` skill names, if present

Every beast dispatch prompt STARTS with the line `[ohmy-redteam <run-id>]` — an inert routing label the scope gate reads to route the dispatch itself. It is NOT a rule: the beast stays blind, the cage enforces.

NO rule lists. NO ethics paragraphs. NO prohibited-actions text in the beast prompt — the cage (the scope gate) enforces. NO clocks: never mention minutes, budgets or deadlines in a beast prompt — the beast has no chronometer, so a time budget is not a constraint it can honor, only pressure that cuts the chain before the data; the ceiling is the maxTurns the orchestrator sets, invisible to the beast, and depth over breadth is decided by what the responses show, not by a timer. And the cage now covers the dispatch itself, not just Bash commands: a tagged dispatch without an armed scope is blocked mechanically.

After the routing tag and the freeze lines, the dispatch guidance is: work backwards from the prize — list what stands between the beast and it, and attack each obstacle by ANY means in scope. Every capability obtained is a tool — a credential, a role, an endpoint, a leaked parameter — and the only question after each is: what does this unlock?

Each beast chains towards the prize (foothold -> escalation -> data) and returns ONLY structured entries:

- claim type per entry: `behavior` (proven by executing the attached command/request against the target) or `source` (a claim about the code itself — proven only by git state + reading code at the PROVENANCE commit, never by a request's outcome)
- raw proofs: exact commands/requests + outputs
- loot updates (credentials found, endpoints, roles) appended to `.oh-my-zcode/security/<run>/loot.md`

**No beast-to-beast communication — the orchestrator mediates through files.**

Mandatory cascade: after every wave the orchestrator consolidates the loot and re-dispatches the beasts with the enriched `loot.md` — "these tools, combined, lead where?". Every wave's findings are the next wave's hypotheses: a credential becomes an admin panel, an endpoint becomes a tenant boundary, a leaked parameter becomes a query.

Stopping rule: the campaign ends when a prize is PROVEN — impact demonstrated by sample or callback — or when two consecutive waves add no new capability to the loot. No other signal ends the run.

Expiry pause: if the scope gate blocks a command mid-campaign with the `expired` reason, pause. Tell the user the authorization window closed and that re-running the arming invocation (`/ohmy-redteam <target>`) resumes the campaign from the existing loot — the run folder, `surface.md`, `source-map.md` and `loot.md` persist. Never re-arm by any other means.

A refusal is a FAILURE: re-dispatch with adjusted framing, never record it as "nothing found".

## Step 5: FINDING-VERIFIER

Delegate ALL proofs to `finding-verifier` (it never sees the beasts' reasoning). Ask it ALSO to verify cleanup at the end: every artifact the run declared creating/uploading must be absent — re-executed checks, quoted outputs.

## Step 6: RUN THE DECIDING COMMANDS YOURSELF

ZCode hooks do not fire in subagents. Before signing anything, re-run in this session one reproduction per confirmed chain, plus the main scan. Quote raw outputs and exit codes. The scope gate enforces this session's authorization.

## Step 7: REPORT

Write `report.md` in the run folder:

- scope as authorized — quote the derivation rule and the user's confirmation
- ROOT-CAUSE TABLE first: findings grouped by root cause — consequences of one root are ONE finding with multiple impacts, never separate vulnerabilities
- confirmed chains documented as analysis: foothold -> escalation -> data; what could be gleaned, changed, removed
- impact per chain, by SAMPLE (max 3 records or a schema) or by callback (the listener's receipt) — never more
- execution findings NAME their plane: the exact process, container and credentials used — a generic label like RCE is not a report line
- DETECTION REPORT per prize: x launched / y blocked / z logged — from WAF pages, 403s, rate-limit responses observed in raw outputs
- NOT REPRODUCED
- cleanup verification results
- copy `scope.json` and the session's `.oh-my-zcode/evidence/<session id>.jsonl` into the folder as `evidence.jsonl`

The run's audit trail lives durably in the TARGET project's `.oh-my-zcode/evidence/` — not the plugin's. In it, the `scope_attack_pass` kind marks attack commands the gate saw pass under an armed scope; commands inside dispatched beasts are invisible to hooks by design (their cage is the dispatch gate).

## Step 8: DISARM AND SIGN

Disarm by calling the `revoke` tool (the MCP scope server deletes the armed scope — the gate closes immediately). If the run simply ends without a revoke, the window expires on its own after 60 minutes. Never rewrite `active_scope.json` by hand.

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
