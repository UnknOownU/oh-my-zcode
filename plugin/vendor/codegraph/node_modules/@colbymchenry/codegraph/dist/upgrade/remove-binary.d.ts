/**
 * CLI binary removal for `codegraph uninstall` (the #1071 shadow, uninstall
 * edition).
 *
 * Before this module, three disconnected paths each removed PART of an
 * installation and none removed it all: `codegraph uninstall` swept agent
 * configs only, `install.sh --uninstall` deleted the bundle only, and npm's
 * `preuninstall` hook cleaned configs when npm removed its own package. A
 * user with more than one install method (the common drift: npm first, the
 * bundle later — or vice versa) ran `codegraph uninstall` and still had a
 * working `codegraph` on PATH.
 *
 * This module makes `codegraph uninstall` complete: PLAN every binary
 * install present on the machine (bundle layout(s), the npm global package,
 * the bin-dir shim), then EXECUTE the removals. Split planner/executor with
 * injected side effects, same convention as the upgrade orchestrator.
 *
 * Safety rules:
 *   - A source checkout is REPORTED, never deleted — a git repo is the
 *     user's working tree, not an "install".
 *   - A project-local npm install is left alone — the project's
 *     package.json owns it, not the machine-level uninstaller.
 *   - On unix the default install dir (`~/.codegraph`) doubles as the
 *     machine-level state dir (telemetry choice, daemon records, the
 *     update-check cache) — only the install ARTIFACTS (`versions/`,
 *     `current`) are removed there, never the whole dir. A dedicated
 *     install dir (Windows `%LOCALAPPDATA%\codegraph`, or a custom
 *     `CODEGRAPH_INSTALL_DIR`) is removed wholesale.
 *   - The bin-dir shim is removed only when it verifiably points into a
 *     detected install dir — a user's unrelated `codegraph` file survives.
 *   - Windows cannot DELETE a running exe but CAN rename it (the same
 *     trick the in-place upgrade uses): a locked `node.exe` is renamed
 *     aside and reported as a leftover for the user to delete after the
 *     window closes, instead of failing the whole removal.
 */
export interface RemoveBinaryProbes {
    /** `__filename` of the running CLI entry (dist/bin/codegraph.js). */
    filename: string;
    platform: NodeJS.Platform;
    cwd: string;
    env: NodeJS.ProcessEnv;
    homedir: string;
    exists: (p: string) => boolean;
    /** Symlink target (raw link text), or null when not a symlink / unreadable. */
    readlink: (p: string) => string | null;
    /** Run a command capturing stdout; null = spawn failed. */
    capture: (cmd: string, args: string[]) => {
        code: number;
        stdout: string;
    } | null;
}
export interface BinaryRemovalPlan {
    /** Filesystem paths to delete (bundle dirs / artifacts, shim links). */
    paths: string[];
    /** The npm global package is installed and should be `npm uninstall -g`ed. */
    npmGlobal: boolean;
    /**
     * npm's global node_modules root (for the Windows locked-exe dance — the
     * vendored node.exe lives in the SIBLING per-platform package, so the
     * whole root is the lock surface, not just the meta package's dir).
     */
    npmRoot: string | null;
    /** Running from a git checkout — surfaced to the user, never deleted. */
    sourceRoot: string | null;
    /** One human line per planned removal, for the confirm prompt. */
    summary: string[];
}
export declare function defaultProbes(filename: string): RemoveBinaryProbes;
export declare function planBinaryRemoval(p: RemoveBinaryProbes): BinaryRemovalPlan;
export interface RemoveBinaryDeps {
    platform: NodeJS.Platform;
    /** The running node binary — the file Windows will hold a lock on. */
    execPath: string;
    rm: (p: string) => void;
    rename: (from: string, to: string) => void;
    /** Run a command inheriting stdio; returns exit code (-1 = spawn failed). */
    run: (cmd: string, args: string[]) => number;
}
export interface BinaryRemovalResult {
    removed: string[];
    /** Paths that could not be (fully) removed — surfaced with manual steps. */
    leftovers: string[];
    npm: 'removed' | 'failed' | 'skipped';
}
export declare function defaultRemoveDeps(): RemoveBinaryDeps;
export declare function executeBinaryRemoval(plan: BinaryRemovalPlan, deps?: RemoveBinaryDeps): BinaryRemovalResult;
//# sourceMappingURL=remove-binary.d.ts.map