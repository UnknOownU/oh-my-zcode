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
export type GitHookName = 'post-commit' | 'post-merge' | 'post-checkout';
/** Hooks installed by default: commit, merge (git pull), and checkout. */
export declare const DEFAULT_SYNC_HOOKS: GitHookName[];
export interface GitHookResult {
    /** Hook names that were created or updated. */
    installed: GitHookName[];
    /** Resolved hooks directory, or null when not a git repo. */
    hooksDir: string | null;
    /** Reason nothing happened (e.g. not a git repository). */
    skipped?: string;
}
/**
 * Whether `projectRoot` is inside a git working tree. Returns false if git
 * isn't installed or the path isn't a repo.
 */
export declare function isGitRepo(projectRoot: string): boolean;
/**
 * Install (or update) the CodeGraph sync hooks in a git repository.
 * Idempotent: re-running replaces our marker block rather than duplicating
 * it, and any user-authored hook content is preserved.
 */
export declare function installGitSyncHook(projectRoot: string, hooks?: GitHookName[]): GitHookResult;
/**
 * Remove the CodeGraph sync hooks. Strips only our marker block; deletes the
 * hook file entirely when nothing but a shebang remains, otherwise rewrites
 * the user's content untouched.
 */
export declare function removeGitSyncHook(projectRoot: string, hooks?: GitHookName[]): GitHookResult;
/** Whether any CodeGraph sync hook is currently installed. */
export declare function isSyncHookInstalled(projectRoot: string, hooks?: GitHookName[]): boolean;
//# sourceMappingURL=git-hooks.d.ts.map