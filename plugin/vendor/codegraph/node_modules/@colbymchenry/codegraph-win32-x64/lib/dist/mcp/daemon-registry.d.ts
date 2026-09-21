export interface DaemonRecord {
    /** Realpath'd project root the daemon serves. */
    root: string;
    pid: number;
    version: string;
    socketPath: string;
    /** Epoch ms when the daemon bound its socket. */
    startedAt: number;
}
/**
 * `~/.codegraph/daemons` — GLOBAL, keyed off the home install dir. (The
 * `CODEGRAPH_DIR` env var only renames the per-project index dir, not this.)
 */
export declare function getRegistryDir(): string;
/**
 * Is `pid` a live process? `kill(pid, 0)` sends no signal — it just probes:
 * ESRCH ⇒ dead, EPERM ⇒ alive but not ours (still alive). Same liveness check
 * the PPID watchdog (#277) and daemon lock arbitration use.
 */
export declare function isProcessAlive(pid: number): boolean;
/** Best-effort: record this daemon so `list`/`stop --all` can find it. */
export declare function registerDaemon(rec: DaemonRecord): void;
/** Best-effort: drop this daemon's record on graceful shutdown. */
export declare function deregisterDaemon(root: string): void;
/**
 * All registered daemons whose process is still alive, newest first. Dead/garbage
 * records are deleted as a side effect (self-healing) unless `prune` is false.
 */
export declare function listDaemons(opts?: {
    prune?: boolean;
}): DaemonRecord[];
export interface StopResult {
    root: string;
    pid: number | null;
    /** 'term' graceful, 'kill' force, 'not-running' stale lock, 'no-daemon' none found. */
    outcome: 'term' | 'kill' | 'not-running' | 'no-daemon';
}
/**
 * Stop the daemon serving `root`: SIGTERM, wait, then SIGKILL if it won't go,
 * then sweep its artifacts. `root` must be realpath'd (match how the daemon
 * keys its socket/lockfile). Resolves the pid from the authoritative lockfile,
 * falling back to the registry.
 */
export declare function stopDaemonAt(root: string): Promise<StopResult>;
/** Stop every registered, live daemon. */
export declare function stopAllDaemons(): Promise<StopResult[]>;
//# sourceMappingURL=daemon-registry.d.ts.map