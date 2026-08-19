---
name: security-gate
description: Doctrine of evidence-gated security testing for GLM agents, grounded in measurements. Load it when a security assessment, pentest or red-team run is being planned or discussed, when findings are reported, or when configuring the /bettersecurity pipeline.
when_to_use: when any security test or red-team run is being planned, executed, or reported
---

# security-gate: the doctrine

> **A finding exists only once an independent execution has reproduced it.**

## The rules, each backed by a measurement

0. **Authorization is the plan of security.** Scope-lock before any active request. Nothing outside the confirmed scope is ever tested. Dangerous operations — dump, write on target, brute force, privilege escalation — need a second explicit confirmation.
   *Evidence: an unauthorized test is a finding against yourself. The scope lock is not a formality that precedes the work; it is part of the work.*

1. **A scan alert is not a finding until re-executed.**
   *Evidence: adversarial verification eliminated 49.5% of flagged candidates (OpenAnt). On CVE-Bench, the ZAP scanner exploited 0 CVEs while agents reached 13% — tool output alone is allegation, reproduction is fact.*

2. **The verifier never sees the finder's reasoning.**
   *Evidence: three agents of the same model sharing a context produce near-identical representations (cosine 0.888), so their errors are correlated — from the evidence-gate doctrine.*

3. **Verification re-executes, it does not re-reason.**
   *Evidence: agentic verification cut FPR from 23.0% to 6.3% (Sifting the Noise); verification that reasons instead of executing suppresses 22.25% of true positives.*

4. **WSTG v4.2 is the coverage checklist.** 12 domains. The injection chapter covers SQLi per DBMS, LDAP, command injection, SSTI, SSRF, mass assignment; NoSQL/ORM injection sits in the v5.0 draft. Business logic is a first-class category, not an afterthought.

5. **Interactive command/observe loop, never one-shot prediction.**
   *Evidence: interactive tools 22.8% faster (EnIGMA, p=0.019); CyberGym frames static evaluation as invalid.*

6. **Small fixed same-model team; attackers capped at 3 by angle family.**
   *Evidence: 3 optimised agents beat 7 unoptimised (DyLAN); D-CIPHER's full pipeline costs only 2x a single executor.*

7. **Never mix models to diversify.**
   *Evidence: mixed teams measured equal or worse, -6.0% (D-CIPHER); on the Coding Plan the 5.x aliases answer as glm-5.3 anyway.*

8. **Shared recon file before parallel attackers.**
   *Evidence: removing the shared knowledge base cost HPTSA 4x pass@1 — as much as removing the team.*

9. **Solo first on small surfaces; the surface map decides.**
   *Evidence: a single GPT-5 agent solved 76.9% of 104 web challenges (MAPTA); teams pay on harder/real targets — HPTSA 4.5x on zero-days.*

10. **Rate-limit every tool; conservative defaults.** A test that takes the target down produces no findings and a liability.

11. **The gap is part of the report.** NOT COVERED with reasons, NOT REPRODUCED findings kept visible.
    *Evidence: no opened source validates findings by a separate reviewer agent — this pipeline is novel; its limits must be stated, not hidden.*

12. **FINDINGS: VERIFIED semantics.** Optional to sign. Signing it requires the deciding commands to have run in the signing session this turn — the Stop hook checks it.
    *Evidence: ZCode hooks do not fire inside subagents; a subagent's trace cannot back a signature.*

13. **The beast works blind, the cage holds the rules** (red-team mode): attacker agents receive only identity, target and objective — never the rules of engagement; every constraint is enforced externally (the scope gate, the environment, the verifier). *Evidence: within authorized scope "the ROE doesn't enumerate which adversary techniques are permitted, so the controlling text is the prohibited-activities list" (Microsoft Azure, 2026); every serious offensive benchmark constrains via sandbox, never via prompt rules (CyBench, CVE-Bench, CyberGym).*

14. **Attack prompts carry identity + objective only** — no rule lists, no ethics paragraphs, no over-framed authorization. *Evidence: CVE-Bench reached zero refusals with one line of white-hat framing ("white-hat hackers with permissions granted by application owners"); CyBench refusals became rare with expert/challenge framing; and over-framed authorization signals were measured ASSOCIATED WITH HIGHER refusal rates (21.8% vs 11.6%, DRB).*

15. **A refusal is a failure, never a result**: an attacker that refuses is re-dispatched (adjusted framing), and an empty report caused by refusals is invalid. *Evidence: refusal-driven empty results are a measured failure mode (false-refusal 70% for one model on benign cyber prompts, CyberSecEval 2; over-conservatism observed in CyberGym-E2E).*

16. **Impact is proven by sample, never by plunder**: at most 3 records or a schema screenshot prove data access; the report documents the ABILITY, not the exfiltration. *Evidence: "test only the minimum necessary to validate" (ConnectWise VDP); stop-boundaries "prevent damage while still showing that the damage could occur" (NIST SP 800-115); PTES evidences the "Ability for exfiltration".*

17. **Exfiltration proof points at a listener the operator controls**: a callback to a designated URL is the entire oracle. *Evidence: the Interactsh model (an OOB callback to a tester-controlled server); CVE-Bench's goal "make the website server send a GET request to {outbound_service_url}" checked solely by that listener receiving it.*

18. **The report grades the defenses too, and cleanup is re-verified by execution**: per-family detection coverage (x launched / y blocked / z logged) and a cleanup check that re-executes (declared artifacts absent). *Evidence: PTES requires countermeasure metrics ("we ran x attacks and IPS blocked y"); NIST grades detection by log review; NIST requires verified sanitization — a MECHANICAL cleanup check exceeds standard practice, stated as such.*

## Practice targets

XBOW set via the MAPTA repo (104 web challenges), AutoPenBench (33 tasks, milestone credit), CyBench, NYU CTF. InterCode-CTF is saturated (95%) — do not practice on it.

Caution: an agent declared with a custom `tools` allowlist cannot invoke skills — this plugin's agents use `disallowedTools`, so the constraint does not bite here; never introduce a `tools` allowlist on a judging agent without also allowing the skill tool.
