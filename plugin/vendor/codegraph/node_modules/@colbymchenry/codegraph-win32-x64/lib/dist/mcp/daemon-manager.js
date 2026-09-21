"use strict";
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
exports.CANCEL = exports.STOP_ALL = void 0;
exports.formatUptime = formatUptime;
exports.buildPickItems = buildPickItems;
exports.runDaemonPicker = runDaemonPicker;
/**
 * Interactive daemon manager — the logic behind `codegraph daemon` / `daemons`.
 *
 * Kept separate from the CLI (which owns the @clack/prompts wiring) so the
 * selection/stop loop is unit-testable with a fake `select`: no TTY, no clack,
 * no real daemons. The CLI passes the real clack `select`/`isCancel` plus the
 * registry's list/stop functions.
 */
const path = __importStar(require("path"));
/** Sentinel option values (not real roots, so they can't collide with a project path). */
exports.STOP_ALL = '__stop_all__';
exports.CANCEL = '__cancel__';
/** Compact uptime: `45s`, `12m`, `3h 5m`. */
function formatUptime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60)
        return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60)
        return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
}
/**
 * Build the ordered, UI-ready option list: the current project's daemon first
 * (so it's the auto-selected default), the rest newest-first, then "Stop all"
 * (only when there's more than one) and "Cancel".
 */
function buildPickItems(daemons, cwdRoot, now) {
    const cwd = cwdRoot != null ? path.resolve(cwdRoot) : null;
    const ordered = [...daemons].sort((a, b) => {
        if (cwd) {
            const aCur = path.resolve(a.root) === cwd;
            const bCur = path.resolve(b.root) === cwd;
            if (aCur && !bCur)
                return -1;
            if (bCur && !aCur)
                return 1;
        }
        return b.startedAt - a.startedAt; // newest first
    });
    const items = ordered.map((d) => {
        const current = cwd != null && path.resolve(d.root) === cwd;
        return {
            value: d.root,
            label: current ? `${d.root}  (current project)` : d.root,
            hint: `pid ${d.pid} · up ${formatUptime(now - d.startedAt)} · Running`,
        };
    });
    if (items.length > 1)
        items.push({ value: exports.STOP_ALL, label: 'Stop all', hint: '' });
    items.push({ value: exports.CANCEL, label: 'Cancel', hint: '' });
    return items;
}
/**
 * Pick a daemon → stop it → re-prompt with what's left, until the user cancels
 * (Esc / Ctrl-C / "Cancel"), picks "Stop all", or nothing remains.
 */
async function runDaemonPicker(deps) {
    for (;;) {
        const daemons = deps.list();
        if (daemons.length === 0) {
            deps.done('All daemons stopped.');
            return;
        }
        const items = buildPickItems(daemons, deps.cwdRoot, deps.now());
        const choice = await deps.select({
            message: 'Select a daemon to stop',
            options: items,
            initialValue: items[0]?.value ?? exports.CANCEL, // daemons.length > 0 here, so items[0] is a daemon
        });
        if (deps.isCancel(choice) || choice === exports.CANCEL) {
            deps.done('Cancelled.');
            return;
        }
        if (choice === exports.STOP_ALL) {
            const results = await deps.stopAll();
            const n = results.filter((r) => r.outcome === 'term' || r.outcome === 'kill').length;
            deps.note(`Stopped ${n} daemon${n === 1 ? '' : 's'}.`);
            deps.done('Done.');
            return;
        }
        const result = await deps.stop(String(choice));
        const forced = result.outcome === 'kill' ? ', forced' : '';
        deps.note(`Stopped daemon (pid ${result.pid}${forced}) — ${choice}`);
        // Loop: the next iteration re-lists; if more remain it re-prompts, otherwise
        // the top-of-loop empty check prints "All daemons stopped."
    }
}
//# sourceMappingURL=daemon-manager.js.map