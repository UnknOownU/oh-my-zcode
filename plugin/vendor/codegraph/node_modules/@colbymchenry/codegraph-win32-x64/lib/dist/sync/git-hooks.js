"use strict";
/**
 * Git Sync Hooks
 *
 * When the live file watcher is disabled (e.g. on WSL2 `/mnt/*` drives,
 * see watch-policy.ts), the CodeGraph index would otherwise go stale until
 * the user runs `codegraph sync` by hand. As an opt-in alternative, we can
 * install git hooks that refresh the index after the operations that change
 * files on disk: commit, merge (covers `git pull`), and checkout.
 *
 * The hooks run `codegraph sync` in the background so they never block git,
 * and are guarded by `command -v codegraph` so they no-op cleanly when the
 * CLI isn't on PATH. Our snippet is delimited by marker comments so install
 * is idempotent and removal preserves any user-authored hook content.
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
exports.DEFAULT_SYNC_HOOKS = void 0;
exports.isGitRepo = isGitRepo;
exports.installGitSyncHook = installGitSyncHook;
exports.removeGitSyncHook = removeGitSyncHook;
exports.isSyncHookInstalled = isSyncHookInstalled;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const MARKER_BEGIN = '# >>> codegraph sync hook >>>';
const MARKER_END = '# <<< codegraph sync hook <<<';
/** Hooks installed by default: commit, merge (git pull), and checkout. */
exports.DEFAULT_SYNC_HOOKS = ['post-commit', 'post-merge', 'post-checkout'];
/**
 * Whether `projectRoot` is inside a git working tree. Returns false if git
 * isn't installed or the path isn't a repo.
 */
function isGitRepo(projectRoot) {
    try {
        const out = (0, child_process_1.execFileSync)('git', ['rev-parse', '--is-inside-work-tree'], {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            windowsHide: true,
            timeout: 5000, // fail fast instead of hanging init/sync on a stuck git (#1139)
        }).trim();
        return out === 'true';
    }
    catch {
        return false;
    }
}
/**
 * Resolve the git hooks directory for a project, honoring `core.hooksPath`
 * and git worktrees. Returns an absolute path, or null when not a repo.
 */
function gitHooksDir(projectRoot) {
    try {
        const out = (0, child_process_1.execFileSync)('git', ['rev-parse', '--git-path', 'hooks'], {
            cwd: projectRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            windowsHide: true,
            timeout: 5000, // same rationale as isGitRepo
        }).trim();
        if (!out)
            return null;
        return path.isAbsolute(out) ? out : path.resolve(projectRoot, out);
    }
    catch {
        return null;
    }
}
/** The shell snippet (between markers) injected into each hook. */
function markerBlock() {
    return [
        MARKER_BEGIN,
        '# Keeps the CodeGraph index fresh while the live file watcher is off',
        '# (e.g. WSL2 /mnt drives). Runs in the background so it never blocks git.',
        '# Managed by codegraph; remove with `codegraph uninit` or delete this block.',
        'if command -v codegraph >/dev/null 2>&1; then',
        '  ( codegraph sync >/dev/null 2>&1 & ) >/dev/null 2>&1',
        'fi',
        MARKER_END,
    ].join('\n');
}
/** Remove our marker block (and the marker lines) from hook content. */
function stripMarkerBlock(content) {
    const lines = content.split('\n');
    const kept = [];
    let inBlock = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === MARKER_BEGIN) {
            inBlock = true;
            continue;
        }
        if (trimmed === MARKER_END) {
            inBlock = false;
            continue;
        }
        if (!inBlock)
            kept.push(line);
    }
    return kept.join('\n');
}
/** Whether a hook body is just a shebang / blank lines (i.e. only ever ours). */
function isEffectivelyEmpty(content) {
    return content
        .split('\n')
        .map((l) => l.trim())
        .every((l) => l.length === 0 || l.startsWith('#!'));
}
function chmodExecutable(file) {
    try {
        fs.chmodSync(file, 0o755);
    }
    catch {
        /* chmod is a no-op / unsupported on some platforms (e.g. Windows) */
    }
}
/**
 * Install (or update) the CodeGraph sync hooks in a git repository.
 * Idempotent: re-running replaces our marker block rather than duplicating
 * it, and any user-authored hook content is preserved.
 */
function installGitSyncHook(projectRoot, hooks = exports.DEFAULT_SYNC_HOOKS) {
    const hooksDir = gitHooksDir(projectRoot);
    if (!hooksDir) {
        return { installed: [], hooksDir: null, skipped: 'not a git repository' };
    }
    try {
        fs.mkdirSync(hooksDir, { recursive: true });
    }
    catch {
        return { installed: [], hooksDir, skipped: 'could not access the git hooks directory' };
    }
    const block = markerBlock();
    const installed = [];
    for (const hook of hooks) {
        const file = path.join(hooksDir, hook);
        let content;
        if (fs.existsSync(file)) {
            // Strip any prior block, then re-append the current one.
            const base = stripMarkerBlock(fs.readFileSync(file, 'utf8')).replace(/\s*$/, '');
            content = base.length > 0
                ? `${base}\n\n${block}\n`
                : `#!/bin/sh\n${block}\n`;
        }
        else {
            content = `#!/bin/sh\n${block}\n`;
        }
        fs.writeFileSync(file, content);
        chmodExecutable(file);
        installed.push(hook);
    }
    return { installed, hooksDir };
}
/**
 * Remove the CodeGraph sync hooks. Strips only our marker block; deletes the
 * hook file entirely when nothing but a shebang remains, otherwise rewrites
 * the user's content untouched.
 */
function removeGitSyncHook(projectRoot, hooks = exports.DEFAULT_SYNC_HOOKS) {
    const hooksDir = gitHooksDir(projectRoot);
    if (!hooksDir) {
        return { installed: [], hooksDir: null, skipped: 'not a git repository' };
    }
    const removed = [];
    for (const hook of hooks) {
        const file = path.join(hooksDir, hook);
        if (!fs.existsSync(file))
            continue;
        const original = fs.readFileSync(file, 'utf8');
        if (!original.includes(MARKER_BEGIN))
            continue;
        const stripped = stripMarkerBlock(original);
        if (isEffectivelyEmpty(stripped)) {
            fs.unlinkSync(file);
        }
        else {
            fs.writeFileSync(file, `${stripped.replace(/\s*$/, '')}\n`);
            chmodExecutable(file);
        }
        removed.push(hook);
    }
    return { installed: removed, hooksDir };
}
/** Whether any CodeGraph sync hook is currently installed. */
function isSyncHookInstalled(projectRoot, hooks = exports.DEFAULT_SYNC_HOOKS) {
    const hooksDir = gitHooksDir(projectRoot);
    if (!hooksDir)
        return false;
    return hooks.some((hook) => {
        const file = path.join(hooksDir, hook);
        return fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(MARKER_BEGIN);
    });
}
//# sourceMappingURL=git-hooks.js.map