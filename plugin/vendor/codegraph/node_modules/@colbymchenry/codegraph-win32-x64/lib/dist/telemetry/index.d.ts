/**
 * Anonymous usage telemetry — client side.
 *
 * The contract for what may be collected lives in docs/design/telemetry.md
 * (and user-facing TELEMETRY.md); the ingest endpoint that enforces it is
 * public at telemetry-worker/. This module honors four invariants:
 *
 * 1. Zero hot-path cost: recording is an in-memory increment. Disk writes are
 *    a tiny synchronous append at process exit (works under `process.exit()`,
 *    where `beforeExit` never fires); network sends happen opportunistically
 *    (startup of long-running commands, daemon interval, bounded await at the
 *    end of install/init) and are fire-and-forget everywhere else.
 * 2. Zero stdout: stdio is the MCP protocol channel. Notices and debug output
 *    go to stderr only.
 * 3. Off is off: when disabled, nothing is recorded, nothing is sent, and no
 *    socket is opened — there is no "opted out" ping. Turning telemetry off
 *    also deletes any buffered, unsent data.
 * 4. Fail silent: offline, endpoint down, disk full — every failure mode is
 *    silence, never a retry loop, never an error surfaced to the user/agent.
 *
 * Usage counts aggregate locally into per-day rollups; only *completed* (UTC)
 * days are sent, so volume scales with active machines, not with tool calls.
 */
export declare const TELEMETRY_ENDPOINT = "https://telemetry.getcodegraph.com/v1/events";
export declare const TELEMETRY_DOCS = "https://github.com/colbymchenry/codegraph/blob/main/TELEMETRY.md";
export type UsageKind = 'mcp_tool' | 'cli_command';
export type LifecycleEvent = 'install' | 'index' | 'uninstall';
/** Coarse buckets — exact counts are deliberately not collected. */
export declare function bucketFileCount(n: number): '<100' | '100-1k' | '1k-10k' | '10k+';
export declare function bucketDuration(ms: number): '<10s' | '10-60s' | '1-5m' | '5m+';
/**
 * Shared "a full index completed" event (CLI init/index + installer local
 * init): language names and coarse buckets only — never paths, file names,
 * or exact counts. Structurally typed so callers don't need engine imports.
 */
export declare function recordIndexEvent(cg: {
    getStats(): {
        filesByLanguage: Record<string, number>;
    };
}, result: {
    filesIndexed: number;
    durationMs: number;
}): void;
export interface ClientInfo {
    name?: string;
    version?: string;
}
export interface TelemetryStatus {
    enabled: boolean;
    /** What decided the current state — mirrors the precedence order. */
    decidedBy: 'DO_NOT_TRACK' | 'CODEGRAPH_TELEMETRY' | 'config' | 'default';
    machineId: string | null;
    configPath: string;
}
export interface TelemetryOptions {
    /** Global state dir; defaults to ~/.codegraph. Tests inject a temp dir. */
    dir?: string;
    fetchImpl?: typeof globalThis.fetch;
    now?: () => Date;
    env?: NodeJS.ProcessEnv;
    stderr?: (line: string) => void;
    /** Tests opt out so short-lived instances don't pile onto process 'exit'. */
    installExitHook?: boolean;
}
export declare class Telemetry {
    private readonly dir;
    private readonly fetchImpl;
    private readonly now;
    private readonly env;
    private readonly writeStderr;
    private counts;
    private events;
    private readonly installExitHook;
    private exitHookInstalled;
    private configCache;
    private intervalHandle;
    constructor(opts?: TelemetryOptions);
    get configPath(): string;
    get queuePath(): string;
    /**
     * Resolution order (first match wins) — keep in sync with TELEMETRY.md:
     * DO_NOT_TRACK=1 > CODEGRAPH_TELEMETRY=0|1 > stored config > default on.
     */
    getStatus(): TelemetryStatus;
    isEnabled(): boolean;
    /**
     * Persist an explicit user choice (installer toggle or `codegraph
     * telemetry on|off`). Turning telemetry off also deletes any buffered,
     * unsent data — off means off.
     */
    setEnabled(enabled: boolean, source: 'installer' | 'cli'): void;
    /** True once any consent decision (or the first-run notice) is on disk. */
    hasStoredChoice(): boolean;
    /** In-memory increment — safe on the MCP tool-call hot path. */
    recordUsage(kind: UsageKind, name: string, ok: boolean, client?: ClientInfo): void;
    /** install / index / uninstall — buffered like everything else. */
    recordLifecycle(event: LifecycleEvent, props: Record<string, unknown>): void;
    /**
     * Fire-and-forget send of everything sendable. Never throws, never logs
     * above debug. Safe to call at startup of long-running commands.
     */
    maybeFlush(): void;
    /**
     * Drain in-memory state to the buffer, then send completed-day rollups and
     * lifecycle events. Bounded by `timeoutMs`; leftovers stay buffered for the
     * next process. Awaited only where latency is invisible (install/init).
     */
    flushNow(timeoutMs?: number): Promise<void>;
    /**
     * Periodic flush for long-lived processes (MCP daemon / serve). Unref'd so
     * it never keeps the process alive.
     */
    startInterval(everyMs?: number): void;
    stopInterval(): void;
    private utcDay;
    private readConfig;
    private writeConfig;
    /**
     * Default-on consent is gated by a one-time stderr notice (interactive
     * installs record their choice explicitly and never reach this).
     */
    private firstRunNotice;
    /**
     * Synchronous, tiny, exit-safe: drain in-memory deltas to the JSONL queue.
     * Runs on `process.on('exit')`, so it must never be async or slow.
     */
    persistSync(): void;
    private appendLines;
    /**
     * Atomically claim the queue for sending (rename). Concurrent processes
     * can't double-send; a crash mid-send leaves a claim file that
     * `recoverStaleClaims` merges back after an hour.
     */
    private claimQueue;
    private recoverStaleClaims;
    /** Returns the lines that did NOT make it out (to be re-queued). */
    private send;
    private packageVersion;
    private ensureExitHook;
    private debug;
}
export declare function getTelemetry(): Telemetry;
//# sourceMappingURL=index.d.ts.map