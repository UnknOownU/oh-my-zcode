/**
 * Query pool — runs CPU-heavy read-tool calls on a pool of worker threads so
 * the shared daemon's main event loop stays free for the MCP transport.
 *
 * Why this exists: see {@link ./query-worker}. One daemon, one event loop, one
 * synchronous SQLite connection serializes every concurrent `codegraph_explore`
 * AND starves the transport (a 10-way wave delivered 0 transport heartbeats in
 * 25s — responses can't flush until the whole batch drains, so clients time
 * out). Spreading the dispatch across worker threads (each its own WAL read
 * connection) restores true multi-core parallelism and an idle main loop.
 *
 * Properties:
 *   - lazy growth: one warm worker on construct, grows to `size` on demand, so a
 *     single-agent session pays for one connection and a 10-subagent burst grows
 *     to the core budget.
 *   - crash recovery: a dead worker is respawned and its in-flight call retried
 *     once; a poison call that keeps crashing fails gracefully (never wedges the
 *     pool). A crash budget trips a circuit breaker (`healthy` → false) so the
 *     caller falls back to in-process dispatch instead of thrashing respawns.
 *   - graceful backstop: a call that can't be served within `softTimeoutMs`
 *     resolves with SUCCESS-shaped "busy, retry" guidance — never `isError`, so
 *     a momentary overload can't teach the agent to abandon codegraph — instead
 *     of hanging past the client's hard timeout.
 */
import type { ToolResult } from './tools';
/**
 * Minimal worker surface the pool drives — satisfied by a real `worker_threads`
 * Worker. Abstracted so tests can inject a fake worker and exercise the pool's
 * queue / growth / crash-recovery / backstop logic without spawning threads or
 * needing a built `dist/`.
 */
export interface PoolWorker {
    postMessage(msg: unknown): void;
    terminate(): Promise<number> | void;
    on(event: 'message', cb: (m: unknown) => void): void;
    on(event: 'error', cb: (e: Error) => void): void;
    on(event: 'exit', cb: (code: number) => void): void;
}
export interface QueryPoolOptions {
    /** Default project root each worker opens at spawn. */
    root: string;
    /** Max worker threads. Defaults to `clamp(cores-1, 1, 16)`. */
    size?: number;
    /** Linger before a queued call gets busy-guidance. Default 45s. */
    softTimeoutMs?: number;
    /** Retries for an in-flight call whose worker crashed. Default 1. */
    maxRetries?: number;
    /** Worker factory (tests inject a fake). Defaults to a real `worker_threads` Worker. */
    createWorker?: () => PoolWorker;
}
/**
 * Resolve the pool size from the `CODEGRAPH_QUERY_POOL_SIZE` override and the
 * machine's core count. `0` (or a negative) explicitly disables the pool (the
 * caller serves in-process — today's behavior). Unset → `clamp(cores-1, 1, 16)`:
 * leave a core for the main loop + OS, but never zero, since even one worker
 * frees the transport and lets responses flush incrementally.
 */
export declare function resolvePoolSize(envVal: string | undefined, cpuCount: number): number;
export declare class QueryPool {
    private idle;
    private queue;
    private inflight;
    private workers;
    private pendingWorkers;
    private nextId;
    private totalCrashes;
    private destroyed;
    private readonly root;
    private readonly maxSize;
    private readonly softTimeoutMs;
    private readonly maxRetries;
    private readonly createWorker;
    constructor(opts: QueryPoolOptions);
    /** Pool size cap (for logging/status). */
    get size(): number;
    /** Live worker count (for tests/status). */
    get liveWorkers(): number;
    /**
     * False once the crash budget is exhausted (or after destroy). The ToolHandler
     * checks this and falls back to in-process dispatch — a broken worker platform
     * degrades to today's behavior instead of failing tool calls.
     */
    get healthy(): boolean;
    /**
     * True once at least one worker has completed its cold start (posted the
     * 'ready' handshake). Until then the ToolHandler serves calls IN-PROCESS:
     * a worker cold start is a full module load + DB open — seconds normally,
     * tens of seconds on a loaded machine — and a call queued behind it gets
     * nothing until the 45s busy backstop. The daemon's very first tool call
     * hitting that window was the recurring #662 test flake (and a real
     * first-call stall for agents). The pool exists for CONCURRENT load, which
     * by definition arrives after warm-up; the pre-pool in-process path is
     * strictly better while nothing is warm. Stays true for the pool's
     * lifetime — later crash-respawn gaps are covered by retry + backstop.
     */
    get ready(): boolean;
    private everReady;
    private spawnOne;
    private onMessage;
    private onWorkerGone;
    private drain;
    private settle;
    /** Run a read tool on the pool. Always resolves (never rejects). */
    run(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
    /** Terminate all workers and answer any outstanding calls gracefully. */
    destroy(): Promise<void>;
}
//# sourceMappingURL=query-pool.d.ts.map