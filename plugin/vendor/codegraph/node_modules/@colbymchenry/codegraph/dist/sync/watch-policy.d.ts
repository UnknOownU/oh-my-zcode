/**
 * Watch Policy
 *
 * Decides whether the live file watcher should run for a given project.
 *
 * Native recursive `fs.watch` is pathologically slow on WSL2 `/mnt/*`
 * drives (NTFS exposed over the 9p/drvfs bridge): setting up the recursive
 * watch walks the directory tree, and every readdir/stat crosses the
 * Windows boundary. Inside an MCP server this stalls the event loop during
 * startup long enough to blow past host handshake timeouts (opencode's 30s),
 * so the tools never appear. See issue #199.
 *
 * This module centralizes the on/off decision so the watcher, the MCP
 * server (for diagnostics), and the installer all agree.
 */
/**
 * Detect whether the current process is running under WSL (Windows
 * Subsystem for Linux). Result is cached after the first call.
 *
 * Checks the WSL-specific env vars first (no I/O), then falls back to
 * `/proc/version`, which contains "microsoft" on WSL kernels.
 */
export declare function detectWsl(): boolean;
/**
 * Inputs that can be overridden in tests so the decision is deterministic
 * without touching real env vars or `/proc/version`.
 */
export interface WatchProbe {
    /** Defaults to `process.env`. */
    env?: NodeJS.ProcessEnv;
    /** Defaults to `detectWsl()`. */
    isWsl?: boolean;
}
/**
 * Decide whether the file watcher should be disabled for a project, and why.
 *
 * Returns a short human-readable reason when watching should be skipped, or
 * `null` when it should run normally.
 *
 * Precedence (first match wins):
 *  1. `CODEGRAPH_NO_WATCH=1`    → off  (explicit opt-out always wins)
 *  2. `CODEGRAPH_FORCE_WATCH=1` → on   (overrides auto-detection)
 *  3. WSL2 + `/mnt/*` drive     → off  (recursive fs.watch is too slow; #199)
 */
export declare function watchDisabledReason(projectRoot: string, probe?: WatchProbe): string | null;
/** Test-only: reset the cached WSL detection. */
export declare function __resetWslCacheForTests(): void;
//# sourceMappingURL=watch-policy.d.ts.map