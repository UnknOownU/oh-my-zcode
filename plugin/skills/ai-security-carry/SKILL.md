---
name: ai-security-carry
description: Doctrine for the security pass over AI-generated diffs — what generated code measurably carries and how to gate it, grounded in measurements. Load it when verifying a built artifact or diff, when closing a swarm build, or when a generated change touches a trust boundary.
when_to_use: when a generated diff or artifact is being verified or gated before it ships
---

# ai-security-carry: the doctrine

> **Generated code is measurably simpler, more repetitive, and more vulnerable than human code — the security pass on a generated diff is not optional, and it is not generic.**

## The carrier, measured

AI-generated code contains more high-risk security vulnerabilities, more unused constructs, and more hardcoded debug than human code on the same tasks (Cotroneo et al. 2025, 500k+ Python/Java samples, arXiv:2508.21634). The checklist below hunts exactly that carrier — nothing else. It is a probe on a dated weakness, not eternal truth.

## The rules, each backed by a measurement or an incident

1. **Deterministic checks first, judgment second.** Grep/AST for each pattern below before reasoning about it; a scanner hit is an ALLEGATION to confirm in context, never a finding by itself.
   *Evidence: aislop scans with "50+ deterministic rules across 10 language targets — Regex + AST + standard tooling. No LLMs, no API calls"; tool output is allegation, reading is fact (evidence-gate rule 1).*

2. **Unused constructs.** Imports, functions, variables, parameters added by the diff and referenced nowhere — grep the call sites, list each with its reference count.

3. **Hardcoded debug and leftover scaffolding.** Debug prints, commented-out code, test credentials, fixtures shipped in production paths, TODO comments presented as finished work.

4. **Secrets in the diff.** Keys, tokens, passwords, connection strings — one hit is critical (score 95+). A committed database superuser password shipped RCE in a real application this very pipeline tested (kithapp, run 2, 2026-08-22).

5. **Trust boundaries: validation added or REMOVED.** Compare the boundary before and after the diff: endpoints, parsers, env and file loads, deserialization. Error handling that would lose data, catches that swallow the failure, fallbacks nobody asked for — each is a finding, not a style note.
   *Evidence: the measured AI carrier includes dropped guards — a naive "write one-liners" instruction dropped a safety guard where a structured ruleset kept every one (ponytail's adversarial tier, 2026); the boundary is where generated minimalism bites.*

6. **Injection surfaces the diff touches.** SQL built by string concatenation, command execution, path joins on user input, template rendering, deserialization of external data. Touched = walked, named in the verdict.

7. **Auth/authz deltas state the previous behavior.** If the diff touches middleware, guards, or session handling, it says what the behavior was before — a silent change to an authorization default is a finding even when the new behavior is defensible.

8. **The verdict names the checklist.** PASS names every entry walked. Issues are CONFIRMED with file:line, the quoted line, and why it is wrong, each scored — only ≥80 reported (review-by-concern gating). "Looks fine" is not a verdict.
   *Evidence: the only measured injection that worked was the enforced mechanism, not the suggestion — lazy skill loading self-activated "zero times. Not rarely. Never." while the wired hook produced the effect (JetBrains, 2026-07); a pass that cannot say what it checked cannot be trusted to have checked it.*

## Assumption, dated

2026-09, GLM-5.x era: the measured carrier is high-risk vulnerabilities + unused constructs + debug leftovers (Cotroneo). Replay on each model upgrade — if the carrier changes, this checklist changes with it; a stale carrier checklist is pure context overhead.
