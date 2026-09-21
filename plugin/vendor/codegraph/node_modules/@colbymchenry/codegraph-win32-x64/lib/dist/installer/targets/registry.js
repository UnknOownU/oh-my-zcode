"use strict";
/**
 * Registry of all known agent targets.
 *
 * Adding a new target = create `targets/<id>.ts` exporting an
 * `AgentTarget`, then add it to the array below. Order here is the
 * order they appear in the multiselect prompt, in `--target=all`,
 * and in `--print-config`'s help listing — keep it stable.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_TARGETS = void 0;
exports.getTarget = getTarget;
exports.listTargetIds = listTargetIds;
exports.detectAll = detectAll;
exports.resolveTargetFlag = resolveTargetFlag;
const claude_1 = require("./claude");
const cursor_1 = require("./cursor");
const codex_1 = require("./codex");
const opencode_1 = require("./opencode");
const hermes_1 = require("./hermes");
const gemini_1 = require("./gemini");
const antigravity_1 = require("./antigravity");
const kiro_1 = require("./kiro");
exports.ALL_TARGETS = Object.freeze([
    claude_1.claudeTarget,
    cursor_1.cursorTarget,
    codex_1.codexTarget,
    opencode_1.opencodeTarget,
    hermes_1.hermesTarget,
    gemini_1.geminiTarget,
    antigravity_1.antigravityTarget,
    kiro_1.kiroTarget,
]);
function getTarget(id) {
    return exports.ALL_TARGETS.find((t) => t.id === id);
}
function listTargetIds() {
    return exports.ALL_TARGETS.map((t) => t.id);
}
/**
 * Run `detect()` for every target at the given location. Returns the
 * full registry zipped with detection results — orchestrator uses
 * this to seed the multiselect prompt with installed agents
 * pre-checked.
 */
function detectAll(loc) {
    return exports.ALL_TARGETS.map((target) => ({
        target,
        detection: target.detect(loc),
    }));
}
/**
 * Resolve a `--target=` flag value to a list of `AgentTarget`
 * instances. Accepts:
 *
 *   - `auto` — return all targets whose `detect().installed` is true,
 *     or `['claude']` as a fallback if none detected (least-surprise
 *     for existing users).
 *   - `all` — every target in the registry.
 *   - `none` — empty list (caller skips agent writes entirely).
 *   - csv list — `'claude,cursor'` etc. Unknown ids throw.
 */
function resolveTargetFlag(value, loc) {
    if (value === 'none')
        return [];
    if (value === 'all')
        return [...exports.ALL_TARGETS];
    if (value === 'auto') {
        const detected = detectAll(loc).filter(({ detection }) => detection.installed);
        if (detected.length > 0)
            return detected.map(({ target }) => target);
        const fallback = getTarget('claude');
        return fallback ? [fallback] : [];
    }
    const ids = value.split(',').map((s) => s.trim()).filter(Boolean);
    const resolved = [];
    const unknown = [];
    for (const id of ids) {
        const t = getTarget(id);
        if (t)
            resolved.push(t);
        else
            unknown.push(id);
    }
    if (unknown.length > 0) {
        const known = listTargetIds().join(', ');
        throw new Error(`Unknown --target id(s): ${unknown.join(', ')}. Known: ${known}, plus 'auto' / 'all' / 'none'.`);
    }
    return resolved;
}
//# sourceMappingURL=registry.js.map