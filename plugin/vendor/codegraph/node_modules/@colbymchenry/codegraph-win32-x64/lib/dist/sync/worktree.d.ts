/**
 * Git Worktree Awareness
 *
 * A CodeGraph index lives in a `.codegraph/` directory and is resolved by
 * walking up parent directories to the nearest one (see
 * `findNearestCodeGraphRoot`). That walk is unaware of git worktrees: when a
 * worktree is created *inside* the main checkout (e.g. some tools place them
 * under `.gitignore`d paths like `.claude/worktrees/<name>/`), a command run
 * from the worktree walks up and silently resolves the MAIN checkout's index.
 *
 * Every query then returns results from the main tree's code — usually a
 * different branch — rather than the worktree the user is actually editing.
 * Symbols added or changed only in the worktree are invisible. This module
 * detects that "borrowed index" situation so callers can warn about it.
 *
 * Detection is best-effort: when git is unavailable or the path isn't a repo,
 * it reports "no mismatch" and callers carry on unchanged.
 */
/**
 * Absolute, symlink-resolved toplevel of the git working tree that `dir`
 * belongs to, or null when `dir` isn't inside a git repo (or git is missing).
 *
 * `git rev-parse --show-toplevel` returns the per-worktree root: the main
 * checkout and each linked worktree report their own distinct directory, which
 * is exactly the distinction this module relies on.
 */
export declare function gitWorktreeRoot(dir: string): string | null;
/**
 * Absolute, symlink-resolved git **common** directory for `dir` — the shared
 * `.git` that all worktrees of one repository point at. Linked worktrees of the
 * same repo report the SAME common dir; a submodule or an embedded clone is a
 * DIFFERENT repository and reports its own (`…/.git/modules/<name>` or its own
 * `.git`). That distinction is what separates a genuine "borrowed worktree"
 * from a nested repo the parent index already covers. Null when not a repo.
 */
export declare function gitCommonDir(dir: string): string | null;
export interface WorktreeIndexMismatch {
    /** The git working tree the command was run from. */
    worktreeRoot: string;
    /** The (different) working tree whose `.codegraph` index is being used. */
    indexRoot: string;
}
/**
 * Detect when `startPath` lives in one git working tree but the resolved
 * CodeGraph index (`indexRoot`) belongs to a *different* working tree.
 *
 * Returns null — meaning "nothing to warn about" — when:
 *   - `startPath` isn't in a git repo (or git is unavailable),
 *   - the index already lives in `startPath`'s own working tree, or
 *   - `indexRoot` isn't itself a working-tree root (an unrelated parent dir
 *     that merely happens to contain a `.codegraph/`), which keeps non-git
 *     and monorepo-subdir layouts from producing false warnings.
 */
export declare function detectWorktreeIndexMismatch(startPath: string, indexRoot: string): WorktreeIndexMismatch | null;
/** One-line-per-fact warning describing a detected mismatch. */
export declare function worktreeMismatchWarning(m: WorktreeIndexMismatch): string;
/**
 * Compact, single-line variant for prefixing a tool's result. Read tools
 * return their answer inline, so the heads-up has to ride on the same payload
 * the agent is already reading — a multi-line block would bury the result.
 */
export declare function worktreeMismatchNotice(m: WorktreeIndexMismatch): string;
//# sourceMappingURL=worktree.d.ts.map