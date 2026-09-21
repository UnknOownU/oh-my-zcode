/**
 * MCP shared engine — the heavyweight, *shared* state for an MCP server:
 * the project's {@link CodeGraph} instance, file watcher, and the
 * {@link ToolHandler} cache for cross-project queries.
 *
 * One engine, many sessions:
 * - direct mode (single stdio session) instantiates one engine + one session;
 * - daemon mode instantiates one engine and a new session per socket
 *   connection. Every session reads from the same SQLite WAL and the same
 *   inotify watch set — that's the entire point of issue #411.
 */
import { ToolHandler } from './tools';
export interface MCPEngineOptions {
    /**
     * Whether to start the file watcher when initializing. Daemon and direct
     * modes both want this true; tests may set it false to keep the engine
     * cheap. Honors {@link watchDisabledReason} regardless.
     */
    watch?: boolean;
    /**
     * Whether to off-load read-tool dispatch to a worker-thread pool. Only the
     * SHARED daemon wants this — it serves many concurrent clients on one event
     * loop, so without a pool concurrent explores serialize and starve the MCP
     * transport. Direct mode (one stdio client, no concurrency) leaves it off so a
     * single call never pays a worker round-trip. `CODEGRAPH_QUERY_POOL_SIZE=0`
     * disables it even in daemon mode.
     */
    queryPool?: boolean;
}
/**
 * Shared MCP engine. Thread-safe in the sense that multiple sessions can
 * call its methods concurrently — internally it serializes initialization
 * through a single promise so multiple sessions racing each other on first
 * connect never double-open the SQLite file.
 */
export declare class MCPEngine {
    private cg;
    private toolHandler;
    private projectPath;
    private initPromise;
    private watcherStarted;
    private opts;
    private closed;
    private queryPool;
    constructor(opts?: MCPEngineOptions);
    /**
     * Start the worker-thread query pool once a default project is open (daemon
     * mode only; honors `CODEGRAPH_QUERY_POOL_SIZE`). Idempotent and best-effort:
     * if workers can't spawn on this platform the ToolHandler keeps serving reads
     * in-process, so the pool can only help, never break, tool calls.
     */
    private maybeStartPool;
    /**
     * Convenience for {@link MCPServer} compatibility: pre-seed an explicit
     * project path (from the `--path` CLI flag) without yet opening it. This
     * keeps the synchronous constructor cheap; the actual open happens on the
     * first `ensureInitialized` call.
     */
    setProjectPathHint(projectPath: string): void;
    /** Project root that the engine resolved on first init (null if none). */
    getProjectPath(): string | null;
    /** Shared ToolHandler — sessions delegate tool dispatch through this. */
    getToolHandler(): ToolHandler;
    /** Whether the default project's CodeGraph is open. */
    hasDefaultCodeGraph(): boolean;
    /**
     * Walk up from `searchFrom` to find the nearest `.codegraph/` and open it.
     * Idempotent: concurrent callers share one in-flight init; subsequent
     * callers after success are no-ops.
     *
     * The original `MCPServer.tryInitializeDefault` carried the same retry-on-
     * subsequent-tool-call semantics; we preserve them by NOT throwing when the
     * search misses (just leaves `cg` null so the next call can retry).
     */
    ensureInitialized(searchFrom: string): Promise<void>;
    /**
     * Synchronous last-resort init used by the per-session retry loop when the
     * background `ensureInitialized` already finished (or failed) and we need
     * to pick up a project that appeared *after* the engine started.
     */
    retryInitializeSync(searchFrom: string): void;
    /**
     * Close everything. Used on graceful daemon shutdown (SIGTERM/idle timeout)
     * and on direct-mode stop. Idempotent.
     */
    stop(): void;
    private doInitialize;
    /**
     * Start file watching on the active CodeGraph instance. Idempotent — the
     * watcher is per-engine, not per-session, which is why the daemon path
     * collapses N inotify sets to one. The wording of the disabled-reason log
     * exactly matches the prior in-tree implementation so log-driven dashboards
     * keep working.
     */
    private startWatching;
    /**
     * Reconcile the index with the current filesystem once, right after open —
     * catches edits, adds, deletes, and `git pull`/`checkout` changes made while
     * no watcher was running. Runs in the background, but the returned promise
     * is pushed into the ToolHandler as a one-shot gate so the *first* tool
     * call awaits completion before serving (without this, a tool call that
     * races past sync returns rows for files that no longer exist on disk —
     * and the per-file staleness banner can't help because `getPendingFiles()`
     * is populated by the watcher, not by catch-up).
     */
    private catchUpSync;
}
/**
 * Parse and clamp the CODEGRAPH_WATCH_DEBOUNCE_MS env override.
 *
 * Issue #403: workspaces with bursty writes (formatter-on-save, multi-file
 * refactors) sometimes want a longer quiet window before sync. Returns
 * `undefined` for unset / empty / non-numeric / out-of-range values so the
 * FileWatcher default (2000ms) takes over — never throws.
 *
 * Clamp range: 100ms (faster would mean a sync per keystroke) to 60s (longer
 * and the watcher feels broken). Out-of-range values are treated as "ignore
 * this misconfiguration" rather than capped, since silently capping a 0 or
 * a typoed value would mask a real config bug.
 */
export declare function parseDebounceEnv(raw: string | undefined): number | undefined;
//# sourceMappingURL=engine.d.ts.map