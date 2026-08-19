# Roadmap

> Committed line, moved out of session memory 2026-08-19. The versioning rules behind every entry are in [versioning.md](versioning.md) — the 1.x line continues; **2.0.0 is reserved for the MCP release**.

---

**1.9.2 — this release.** The versioning policy and this roadmap land as in-repo docs, and the README is restyled. One invalid measurement is retired: the latency figure (claiming most max-effort calls exceed four minutes) came from a buggy script and is owner-invalidated (2026-08-19); it is removed from every surface. The cost figures are kept — they were measured by a different script and are not invalidated. No code changes: a docs release is a patch.

**1.9.3 — dispatch gate.** A `PreToolUse` hook on the `Agent|Task` matcher: a subagent dispatch whose prompt carries attack intent requires a valid armed scope. This closes the measured hole — ZCode hooks do not fire inside subagents, so the current scope gate never sees what a dispatched agent is about to do (our measurement, 16 verification commands in a real Verifier run, none reached the log). The `Agent|Task` matcher itself is doc-backed (research 20260819-1927).

**1.9.4 — command `skills` auto-mount.** `/bettersecurity` and `/betterredteam` mount the `security-gate` skill themselves, so the doctrine loads without relying on the session hook. Adds `when_to_use` frontmatter on the three skills, and handles the skill-in-subagent caveat for tool-restricted agents (doc-backed, research 20260819-1927).

**1.9.x (polish).** Known edges from the v1.9.1 run report: default-port target normalization (a scope targeting `example.com:443` does not match URLs whose 443 is implicit), a distinct block message when the refusal comes from a missing session id rather than a missing scope, and IPv6 target support.

**2.0.0 — the MCP release (RESERVED).** The plugin ships its own MCP server: a scope service (`get_scope` / `authorize` / `revoke`), mechanical disarm via `updatedInput` on PreToolUse, and a `userConfig` settings panel — the settings become real knobs because MCP declarations are where ZCode substitutes `${user_config.key}`. All doc-backed (research 20260819-1927, `.betterzcode/research/20260819-1927_zcode-capabilities-validation_0848e5b7/report.md`).

---

## Notes

- The GitHub repository is [`UnknOownU/oh-my-zcode`](https://github.com/UnknOownU/oh-my-zcode) (private).
- Renaming the plugin to "oh-my-zcode" is a **candidate for 2.0** — an option, not a promise.
- **Re-measure max-vs-high for judging roles before 2.0.** The latency justification for `high` was retired with the invalid script; the routing decision stays `high` until re-measured, not because the old figure still holds.
