# plugin/ — ZCode plugin assets

**Score:** 15 (own manifests + distinct asset domain: 42 files, 7 subdirs, markdown/JSON) — earned its own file.

Everything ZCode ships: manifest, hook wiring, universal launcher, 17 sealed agent prompts, 6 slash commands, 6 skills, docs. The only executable code is `bin/launch.mjs` (99 LOC Node bridge); all logic lives in the Rust binary it spawns.

## STRUCTURE
```
plugin/
├── .zcode-plugin/plugin.json  # manifest v3.0.0: agents/commands/skills dirs + 5 MCP servers
├── hooks/hooks.json           # 8 lifecycle events, all `node launch.mjs hook <event>` (5-8s timeouts)
├── bin/launch.mjs             # picks bin/<triple>/oh-my-zcode for 5 targets; Node>=22 guard
├── agents/                    # 17 sealed prompts (builder, reviewer, verifier, council-*, plan-*, scaffold-*, source/finding-verifier)
├── commands/                  # 6 slash commands: ohmy-council/plan/redteam/research/security/swarm
├── skills/                    # 6 SKILL.md: ai-security-carry, evidence-gate, git-master, review-by-concern, security-gate, source-gate
├── docs/                      # the real doc tree: routing (310 LOC), ROADMAP, distribution, proof, versioning, scoped-execution
├── vendor/codegraph/          # third-party npm package + win32 binary — NEVER edit; force-included via gitignore negation
└── README.md / README_CN.md   # user-facing install guide
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add an agent | `agents/*.md` (sealed prompt format, 45-94 LOC each) |
| Add a command | `commands/ohmy-*.md` (90-177 LOC prompt files) |
| Add a skill | `skills/<name>/SKILL.md` |
| MCP servers | `.zcode-plugin/plugin.json` mcpServers: scope (launch.mjs), semgrep, osv-scanner (external), grep.app (HTTP), vendored codegraph |
| Hook wiring | `hooks/hooks.json`: SessionStart→session_start; Pre(Bash)→scope+dispatch; Pre(Agent\|Task)→proof_start; Post(Bash)→evidence; Post(web)→sources; Stop→stop |
| Distribution / install docs | `docs/distribution.md`, `README.md` |
| Model routing policy | `docs/routing.md`, `docs/models/frontmatter-model-pinning.md` |

## CONVENTIONS (differ from root)
- `src/validator` is the contract authority for this tree: after ANY change here run `cargo run --locked -- validate plugin`.
- Version lives in `.zcode-plugin/plugin.json` + root `Cargo.toml` + READMEs — keep in sync. 3.0.0 is a repair release: equal version does not auto-update; reinstall is required.
- Docs for plugin users live here (`plugin/docs/`), not in root `docs/` (which holds the single Rust dev guide).

## ANTI-PATTERNS
- NEVER route `glm-5-turbo` as Reviewer — the only model that approves defective code (3% false-OK, measured; `docs/routing.md:32-34`).
- A scanner hit is an ALLEGATION to confirm in context, never a finding by itself (`skills/ai-security-carry/SKILL.md:17`).
- `vendor/codegraph/` contains twin duplicated dist trees + nested node_modules — third-party noise; never refactor or document its internals.
- `.oh-my-zcode/` inside plugin/ (evidence, plans, research) is session junk — never shipped, never source.
