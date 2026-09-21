/** Default: 60s — ~300× shorter than the 5h #850 wedge, far longer than any real main-thread block. */
export declare const DEFAULT_WATCHDOG_TIMEOUT_MS = 60000;
/**
 * Hard cap on disk-progress deferral: after this many timeouts' worth of
 * CONTINUOUS heartbeat silence the process is killed even if the watched files
 * keep advancing (a wedge coinciding with unrelated file writes, or I/O hung
 * beyond any legitimate statement). 10× the 60s default ⇒ 10 minutes.
 */
export declare const PROGRESS_CAP_MULTIPLIER = 10;
/** Parse the timeout env, falling back to the default for missing/invalid values. */
export declare function parseWatchdogTimeoutMs(raw: string | undefined, fallback?: number): number;
/** Derive a heartbeat cadence that emits several beats inside the timeout window. */
export declare function deriveCheckIntervalMs(timeoutMs: number): number;
export interface WatchdogHandle {
    /** Stop heartbeating and shut the watchdog child down. Idempotent. */
    stop(): void;
}
export interface WatchdogOptions {
    /**
     * Files whose size/mtime advancing counts as forward progress (the SQLite
     * DB + `-wal` for an in-process indexer). With paths supplied, a silent
     * timeout only kills when the files did NOT advance — see the header. Omit
     * for pure heartbeat behavior (the daemon, whose main thread never runs
     * long synchronous work).
     */
    progressPaths?: string[];
}
/**
 * Install the main-thread liveness watchdog for a long-lived process. Returns a
 * handle to stop it, or `null` when disabled or when the child can't be spawned
 * (degraded, never throws — a missing watchdog must never keep a process from
 * starting).
 */
export declare function installMainThreadWatchdog(options?: WatchdogOptions): WatchdogHandle | null;
//# sourceMappingURL=liveness-watchdog.d.ts.map