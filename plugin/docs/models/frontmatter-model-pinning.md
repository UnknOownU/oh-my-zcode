# frontmatter model pinning — the parser contract, verified at source

ZCode went open source on 2026-09-21 (github.com/zai-org/ZCode, Apache-2.0). The agent
frontmatter contract is no longer folklore — it is readable, and this file records what the
source says, with the paths. Verified against the repository on 2026-09-21.

## The law

**A bare model name in agent frontmatter is silently dropped.** The chain:

1. `packages/shared/src/subagent-markdown-selection.ts` — `parseSubagentMarkdownSelection()`
   catches the parse failure and `return undefined`: no selection.
2. `packages/shared/src/model-selection.ts` — `parseModelPickerValue()` throws
   (`模型选择缺少 Provider`) when the value contains no `/`.
3. `apps/zcode-cli/packages/core/src/subagent/runner.ts` — `model: profile.modelSelection ? … : undefined`:
   no selection means the agent inherits the SESSION model.

**thoughtLevel dies with it.** The reasoning level is only attached to a valid model selection
(`parseSubagentMarkdownSelection` reads `thoughtLevel` after the model parses; the serializer
`packages/services/src/subagents/subagentMarkdown.ts` writes `thoughtLevel` only
`if (config.modelSelection)`). A dropped model drops the effort with it — silently.

Until 2.3.0 included, all 16 agent files carried `model: glm-5.3` (bare). They were never
pinned: they answered as the session model — correct on this plan only by coincidence.

## The correct format

`providerId/modelId` — the picker format. `oh-my-zcode validate` rejects bare names since 2.3.1.

Picker values measured on this host (ListModels, 2026-09-21):

- `account:zai-individual-coding-plan/GLM-5.3` — levels low/high/max (default max) [current session]
- `account:zai-individual-coding-plan/GLM-5.3-Flash` — levels low/high/max
- `account:zai-offpeak-idle-plan/GLM-5.3` — the off-peak provider is a SEPARATE providerId
- `account:zai-offpeak-idle-plan/GLM-5.3-Flash`

The 16 agents are pinned to `account:zai-individual-coding-plan/GLM-5.3` since 2.3.1 — the
plan-level remap keeps the pin valid for every subscriber of that plan. `GLM-5.3-Flash` is
confirmed plan-listed and picker-addressable (multimodality remains to be proven by a live
image dispatch — the locker's open premise).

## Adjacent contracts read at the same time

- **Inherit names**: `inherit`, `main`, `sonnet`, `opus`, `haiku` mean "session model" explicitly.
- **Colors**: exactly 8 valid — `red, blue, green, yellow, purple, orange, pink, cyan`
  (`VALID_COLORS`, subagentMarkdown.ts). Invalid values are silently dropped — the measured law.
- **Plugin updates**: a version-string equality check (`plugins-command.ts`,
  `version === previousVersion` → "already up to date") — two different contents claiming the
  same version can never both ship. The 2.3.0 locker/council collision was this law, live.
- **Hooks**: the subagent runner wires no configured hooks — consistent with evidence-gate
  rule 13 (subagent fetches/commands are invisible to the gates).
- **Full frontmatter schema** (subagentMarkdown.ts): name, description (required), color,
  model, thoughtLevel, permissionMode (`auto`|`plan`), maxTurns, tools, disallowedTools,
  skills, background, injectAgentsMd, mcpServers.
