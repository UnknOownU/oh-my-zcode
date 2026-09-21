"use strict";
/**
 * Claude Code target. Writes:
 *
 *   - MCP server entry to `~/.claude.json` (global = user scope, loads
 *     in every project) or `./.mcp.json` (local = project scope, the
 *     file Claude Code actually reads for a single project). See the
 *     scope table at https://code.claude.com/docs/en/mcp.
 *   - Permissions to `~/.claude/settings.json` (global) or
 *     `./.claude/settings.json` (local), gated on `autoAllow`.
 *   - Instructions to `~/.claude/CLAUDE.md` (global) or
 *     `./.claude/CLAUDE.md` (local).
 *
 * Earlier versions wrote the local MCP entry to `./.claude.json` — a
 * file Claude Code never reads — so the server silently never loaded
 * until the user manually renamed it to `.mcp.json` (issue #207). We
 * now write `./.mcp.json` and migrate any stale `./.claude.json` entry
 * out of the way on install and uninstall.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.claudeTarget = void 0;
exports.writeMcpEntry = writeMcpEntry;
exports.cleanupLegacyHooks = cleanupLegacyHooks;
exports.removePromptHookEntry = removePromptHookEntry;
exports.writePermissionsEntry = writePermissionsEntry;
exports.writePromptHookEntry = writePromptHookEntry;
exports.removeInstructionsEntry = removeInstructionsEntry;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const shared_1 = require("./shared");
const instructions_template_1 = require("../instructions-template");
function configDir(loc) {
    return loc === 'global'
        ? path.join(os.homedir(), '.claude')
        : path.join(process.cwd(), '.claude');
}
function mcpJsonPath(loc) {
    // global → ~/.claude.json (user scope: visible in every project).
    // local  → ./.mcp.json (project scope: the ONLY project-level MCP
    // file Claude Code reads — NOT ./.claude.json, which it ignores).
    return loc === 'global'
        ? path.join(os.homedir(), '.claude.json')
        : path.join(process.cwd(), '.mcp.json');
}
/**
 * Where pre-#207 installers wrote the local MCP entry. Claude Code
 * never reads a project-level `./.claude.json`, so we migrate the
 * codegraph entry out of it on install and strip it on uninstall.
 * Only the project-local path is legacy — global `~/.claude.json` is
 * the correct user-scope location and is left untouched.
 */
function legacyLocalMcpPath() {
    return path.join(process.cwd(), '.claude.json');
}
function settingsJsonPath(loc) {
    return path.join(configDir(loc), 'settings.json');
}
function instructionsPath(loc) {
    return path.join(configDir(loc), 'CLAUDE.md');
}
class ClaudeCodeTarget {
    id = 'claude';
    displayName = 'Claude Code';
    docsUrl = 'https://docs.claude.com/en/docs/claude-code';
    supportsLocation(_loc) {
        return true;
    }
    detect(loc) {
        const mcpPath = mcpJsonPath(loc);
        const config = (0, shared_1.readJsonFile)(mcpPath);
        const alreadyConfigured = !!config.mcpServers?.codegraph;
        // For "installed" we infer from the existence of either the dir
        // (global) or the project marker file (local). Cheap and avoids
        // shelling out to `claude --version`.
        const installed = loc === 'global'
            ? fs.existsSync(configDir(loc)) || fs.existsSync(mcpPath)
            : fs.existsSync(mcpPath) || fs.existsSync(configDir(loc));
        return { installed, alreadyConfigured, configPath: mcpPath };
    }
    install(loc, opts) {
        const files = [];
        // 1. MCP server entry
        files.push(writeMcpEntry(loc));
        // 1b. Migrate away any stale ./.claude.json left by a pre-#207
        // local install, so the project isn't left with two competing
        // (one dead) MCP configs.
        if (loc === 'local') {
            const migrated = cleanupLegacyLocalMcp();
            if (migrated)
                files.push(migrated);
        }
        // 2. Permissions (only when autoAllow)
        if (opts.autoAllow) {
            files.push(writePermissionsEntry(loc));
        }
        // 2b. Strip stale auto-sync hooks left by a pre-0.8 install. Those
        // versions wrote `codegraph mark-dirty` / `sync-if-dirty` hooks to
        // settings.json; both subcommands are gone from the CLI, so the
        // Stop hook now fails every turn with "unknown command
        // 'sync-if-dirty'". Cleaning up on install makes an upgrade
        // self-healing. Only surfaced when something was actually removed.
        const hookCleanup = cleanupLegacyHooks(loc);
        if (hookCleanup.action === 'removed')
            files.push(hookCleanup);
        // 2c. Front-load prompt hook (Claude UserPromptSubmit). Opt-in via the
        // installer prompt (default-yes): `promptHook === true` writes it;
        // `=== false` strips any a prior install wrote so opting out round-trips
        // (and an upgrade re-run honors the new choice); `undefined` leaves it
        // untouched for callers that don't manage it.
        if (opts.promptHook === true) {
            files.push(writePromptHookEntry(loc));
        }
        else if (opts.promptHook === false) {
            const removed = removePromptHookEntry(loc);
            if (removed.action === 'removed')
                files.push(removed);
        }
        // 3. CLAUDE.md instructions — the short marker-fenced CodeGraph
        // block (#704). The MCP initialize instructions reach only the main
        // agent; CLAUDE.md is what Task-tool subagents (and non-MCP
        // harnesses) actually see, so the block carries the codegraph
        // pointers there. Upsert self-heals a stale pre-#529 long block.
        files.push((0, shared_1.upsertInstructionsEntry)(instructionsPath(loc)));
        return { files };
    }
    uninstall(loc) {
        const files = [];
        // 1. MCP server entry
        const mcpPath = mcpJsonPath(loc);
        const config = (0, shared_1.readJsonFile)(mcpPath);
        if (config.mcpServers?.codegraph) {
            delete config.mcpServers.codegraph;
            if (Object.keys(config.mcpServers).length === 0) {
                delete config.mcpServers;
            }
            (0, shared_1.writeJsonFile)(mcpPath, config);
            files.push({ path: mcpPath, action: 'removed' });
        }
        else {
            files.push({ path: mcpPath, action: 'not-found' });
        }
        // 1b. Also strip the codegraph entry from a legacy ./.claude.json
        // so uninstall fully reverses a pre-#207 local install.
        if (loc === 'local') {
            const migrated = cleanupLegacyLocalMcp();
            if (migrated)
                files.push(migrated);
        }
        // 2. Permissions
        const settingsPath = settingsJsonPath(loc);
        const settings = (0, shared_1.readJsonFile)(settingsPath);
        if (Array.isArray(settings.permissions?.allow)) {
            const before = settings.permissions.allow.length;
            settings.permissions.allow = settings.permissions.allow.filter((p) => !p.startsWith('mcp__codegraph__'));
            if (settings.permissions.allow.length !== before) {
                if (settings.permissions.allow.length === 0) {
                    delete settings.permissions.allow;
                }
                if (Object.keys(settings.permissions).length === 0) {
                    delete settings.permissions;
                }
                (0, shared_1.writeJsonFile)(settingsPath, settings);
                files.push({ path: settingsPath, action: 'removed' });
            }
            else {
                files.push({ path: settingsPath, action: 'not-found' });
            }
        }
        else {
            files.push({ path: settingsPath, action: 'not-found' });
        }
        // 2b. Strip any stale auto-sync hooks a pre-0.8 install left in
        // settings.json. The hook-cleanup step was lost when the installer
        // moved to the per-target architecture; restoring it here means
        // uninstall — and the npm `preuninstall` hook that drives it — fully
        // reverses a legacy install.
        const hookCleanup = cleanupLegacyHooks(loc);
        if (hookCleanup.action === 'removed')
            files.push(hookCleanup);
        // 2c. Remove the front-load prompt hook this installer may have written.
        const promptHookCleanup = removePromptHookEntry(loc);
        if (promptHookCleanup.action === 'removed')
            files.push(promptHookCleanup);
        // 3. Instructions — strip the legacy CodeGraph block if present.
        files.push(removeInstructionsEntry(loc));
        return { files };
    }
    printConfig(loc) {
        const target = mcpJsonPath(loc);
        const snippet = JSON.stringify({ mcpServers: { codegraph: (0, shared_1.getMcpServerConfig)() } }, null, 2);
        return `# Add to ${target}\n\n${snippet}\n`;
    }
    describePaths(loc) {
        return [mcpJsonPath(loc), settingsJsonPath(loc), instructionsPath(loc)];
    }
}
/**
 * Per-file write helpers, exported so the legacy `config-writer.ts`
 * shim can call only the named operation (writeMcpConfig writes ONLY
 * the MCP entry, etc.) instead of `claudeTarget.install()` which
 * writes all three files. Without this split the shims silently
 * cause side effects callers don't expect.
 */
function writeMcpEntry(loc) {
    const file = mcpJsonPath(loc);
    const existing = (0, shared_1.readJsonFile)(file);
    const before = existing.mcpServers?.codegraph;
    const after = (0, shared_1.getMcpServerConfig)();
    if ((0, shared_1.jsonDeepEqual)(before, after)) {
        // Already exactly what we'd write — preserve byte-identical file.
        return { path: file, action: 'unchanged' };
    }
    // 'created' here means: the file itself did not exist before this
    // write. A pre-existing MCP JSON file (`~/.claude.json` globally,
    // `./.mcp.json` locally) containing other MCP servers (no
    // `codegraph` key) is 'updated', not 'created' — we're adding an
    // entry to a file that was already there. Codex uses a different
    // idiom (empty-content => 'created') because its config.toml is
    // ours alone to manage.
    const action = before ? 'updated' : (fs.existsSync(file) ? 'updated' : 'created');
    if (!existing.mcpServers)
        existing.mcpServers = {};
    existing.mcpServers.codegraph = after;
    (0, shared_1.writeJsonFile)(file, existing);
    return { path: file, action };
}
/**
 * Strip the codegraph entry from a legacy project-local
 * `./.claude.json` (written by pre-#207 installers, which Claude Code
 * never read). Surgical: only our `codegraph` key is removed; sibling
 * MCP servers and any unrelated keys are preserved, and the file is
 * deleted only when removal leaves it completely empty. Returns the
 * file action for reporting, or `null` when there's nothing to migrate.
 */
function cleanupLegacyLocalMcp() {
    const file = legacyLocalMcpPath();
    if (!fs.existsSync(file))
        return null;
    const config = (0, shared_1.readJsonFile)(file);
    if (!config.mcpServers?.codegraph)
        return null;
    delete config.mcpServers.codegraph;
    if (Object.keys(config.mcpServers).length === 0)
        delete config.mcpServers;
    if (Object.keys(config).length === 0) {
        try {
            fs.unlinkSync(file);
        }
        catch { /* ignore */ }
    }
    else {
        (0, shared_1.writeJsonFile)(file, config);
    }
    return { path: file, action: 'removed' };
}
/**
 * True when a Claude Code hook `command` is one of the auto-sync hooks
 * a pre-0.8 install wrote. Those installers added
 * `PostToolUse(Edit|Write) → codegraph mark-dirty` and
 * `Stop → codegraph sync-if-dirty` (local builds used the
 * `npx @colbymchenry/codegraph …` form, which still contains the
 * `codegraph <subcommand>` substring). Both subcommands were later
 * removed from the CLI, so the Stop hook fails every turn with
 * "unknown command 'sync-if-dirty'". Matching on the codegraph-scoped
 * subcommand keeps unrelated user hooks (e.g. GitKraken's
 * `gk ai hook run`) untouched.
 */
function isLegacyCodegraphHookCommand(command) {
    if (typeof command !== 'string')
        return false;
    return (command.includes('codegraph mark-dirty') ||
        command.includes('codegraph sync-if-dirty'));
}
/**
 * The front-load prompt-hook command the installer writes into Claude's
 * `UserPromptSubmit` (see writePromptHookEntry). Matched by substring so an
 * `npx @colbymchenry/codegraph prompt-hook` form is recognized too.
 */
const PROMPT_HOOK_COMMAND = 'codegraph prompt-hook';
function isPromptHookCommand(command) {
    return typeof command === 'string' && command.includes(PROMPT_HOOK_COMMAND);
}
/**
 * Remove stale codegraph auto-sync hooks from Claude `settings.json`.
 *
 * Surgical at the individual-command level: only entries matching
 * `isLegacyCodegraphHookCommand` are dropped, so a sibling hook sharing
 * a matcher group (or the Stop event) with ours survives. We prune a
 * matcher group only once its `hooks` array is empty, an event only
 * once it has no groups left, and `hooks` itself only once every event
 * is gone — and none of that runs unless we actually removed a
 * codegraph command, so a settings.json with no legacy hooks is left
 * byte-for-byte untouched and reported `unchanged`.
 *
 * Exported so it can be unit-tested directly and reused by both
 * `install` (an upgrade self-heals) and `uninstall`.
 */
function removeHookCommandsMatching(loc, match) {
    const file = settingsJsonPath(loc);
    if (!fs.existsSync(file))
        return { path: file, action: 'not-found' };
    const settings = (0, shared_1.readJsonFile)(file);
    const hooks = settings.hooks;
    if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) {
        return { path: file, action: 'unchanged' };
    }
    // Pass 1: drop matching command(s) from inside every matcher group.
    let removedAny = false;
    for (const event of Object.keys(hooks)) {
        const groups = hooks[event];
        if (!Array.isArray(groups))
            continue;
        for (const group of groups) {
            if (!group || !Array.isArray(group.hooks))
                continue;
            const before = group.hooks.length;
            group.hooks = group.hooks.filter((h) => !match(h?.command));
            if (group.hooks.length !== before)
                removedAny = true;
        }
    }
    if (!removedAny)
        return { path: file, action: 'unchanged' };
    // Pass 2: prune empty matcher groups, then events with no groups left,
    // then an empty top-level `hooks`. Guarded by `removedAny` so we never
    // restructure a settings.json that had no matching hooks. Sibling hooks
    // (a different command in the group, or a different event) survive.
    for (const event of Object.keys(hooks)) {
        const groups = hooks[event];
        if (!Array.isArray(groups))
            continue;
        hooks[event] = groups.filter((g) => !(g && Array.isArray(g.hooks) && g.hooks.length === 0));
        if (hooks[event].length === 0)
            delete hooks[event];
    }
    if (Object.keys(hooks).length === 0)
        delete settings.hooks;
    (0, shared_1.writeJsonFile)(file, settings);
    return { path: file, action: 'removed' };
}
/**
 * Remove stale codegraph auto-sync hooks (`mark-dirty` / `sync-if-dirty`) that a
 * pre-0.8 install wrote. Exported for direct unit-testing; reused by both
 * `install` (an upgrade self-heals) and `uninstall`.
 */
function cleanupLegacyHooks(loc) {
    return removeHookCommandsMatching(loc, isLegacyCodegraphHookCommand);
}
/**
 * Remove the front-load `UserPromptSubmit` hook this installer writes (see
 * writePromptHookEntry). Used by `uninstall`, and by `install` when the user
 * opts out, so the choice round-trips.
 */
function removePromptHookEntry(loc) {
    return removeHookCommandsMatching(loc, isPromptHookCommand);
}
function writePermissionsEntry(loc) {
    const file = settingsJsonPath(loc);
    const settings = (0, shared_1.readJsonFile)(file);
    const created = !fs.existsSync(file);
    if (!settings.permissions)
        settings.permissions = {};
    if (!Array.isArray(settings.permissions.allow))
        settings.permissions.allow = [];
    const want = (0, shared_1.getCodeGraphPermissions)();
    const before = [...settings.permissions.allow];
    for (const perm of want) {
        if (!settings.permissions.allow.includes(perm)) {
            settings.permissions.allow.push(perm);
        }
    }
    if ((0, shared_1.jsonDeepEqual)(before, settings.permissions.allow) && !created) {
        return { path: file, action: 'unchanged' };
    }
    (0, shared_1.writeJsonFile)(file, settings);
    return { path: file, action: created ? 'created' : 'updated' };
}
/**
 * Write the front-load `UserPromptSubmit` hook into Claude `settings.json` —
 * a `command` hook that runs `codegraph prompt-hook`, which injects
 * codegraph_explore context for structural prompts so the agent reliably uses
 * the graph. Idempotent: if our command is already wired under UserPromptSubmit
 * the file is left byte-for-byte untouched and reported `unchanged`. Sibling
 * hooks (the user's own, or other events) are preserved. Opt-in — the installer
 * only calls this when the user accepts the prompt (default-yes).
 */
function writePromptHookEntry(loc) {
    const file = settingsJsonPath(loc);
    const created = !fs.existsSync(file);
    const settings = (0, shared_1.readJsonFile)(file);
    if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) {
        settings.hooks = {};
    }
    if (!Array.isArray(settings.hooks.UserPromptSubmit))
        settings.hooks.UserPromptSubmit = [];
    const already = settings.hooks.UserPromptSubmit.some((g) => g && Array.isArray(g.hooks) && g.hooks.some((h) => isPromptHookCommand(h?.command)));
    if (already)
        return { path: file, action: 'unchanged' };
    settings.hooks.UserPromptSubmit.push({
        hooks: [{ type: 'command', command: PROMPT_HOOK_COMMAND }],
    });
    (0, shared_1.writeJsonFile)(file, settings);
    return { path: file, action: created ? 'created' : 'updated' };
}
/**
 * Strip the marker-delimited CodeGraph block from CLAUDE.md if a prior
 * install wrote one. Codegraph no longer maintains an instructions file
 * (issue #529) — the MCP server's `initialize` instructions are the
 * single source of truth — so both install (self-heal on upgrade) and
 * uninstall call this. `removeMarkedSection` returns `not-found`/`kept`
 * when there's nothing to strip; the install caller drops those from
 * the report so a fresh install stays quiet.
 */
function removeInstructionsEntry(loc) {
    const file = instructionsPath(loc);
    const action = (0, shared_1.removeMarkedSection)(file, instructions_template_1.CODEGRAPH_SECTION_START, instructions_template_1.CODEGRAPH_SECTION_END);
    return { path: file, action };
}
exports.claudeTarget = new ClaudeCodeTarget();
//# sourceMappingURL=claude.js.map