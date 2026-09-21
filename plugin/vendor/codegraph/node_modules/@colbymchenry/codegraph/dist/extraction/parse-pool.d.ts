/**
 * Parse worker pool — runs tree-sitter parsing across N worker threads so a full
 * `codegraph index` uses every core instead of pinning one.
 *
 * Why this exists: `ExtractionOrchestrator.indexAll()` already reads files in
 * parallel, but it parsed them through a SINGLE worker thread, so on an
 * N-core machine indexing a large repo used one core and left the rest idle
 * (issue #1015, the parse-time half of #320). Spreading the parse calls across a
 * pool of workers — each its own tree-sitter WASM heap — restores multi-core
 * throughput. SQLite storage stays on the main thread (it isn't thread-safe), so
 * only the CPU-bound parse step is parallelised; results are stored as they
 * arrive, in whatever order they finish.
 *
 * Design mirrors {@link ../mcp/query-pool} (idle-list dispatch, lazy growth,
 * throttled cold-starts, crash recovery), with parse-specific behaviour:
 *   - per-worker recycle: WASM linear memory grows but never shrinks, so each
 *     worker is torn down and replaced after `recycleInterval` parses to reclaim
 *     its heap — the same reason the old single worker recycled.
 *   - reject, don't retry: a parse that crashes or times out its worker REJECTS
 *     (with a message the orchestrator's retry pass recognises) rather than being
 *     silently requeued — the orchestrator owns the smarter two-stage retry
 *     (fresh worker, then comment-stripped) on a clean WASM heap.
 *   - a size-1 pool reproduces the old single-worker path exactly, which is the
 *     conservative rollback: set `CODEGRAPH_PARSE_WORKERS=1`.
 *
 * Memory: peak scales with pool size (≈ size × a worker's pre-recycle heap), so
 * the default is capped and the env var lets constrained machines dial it down.
 */
import type { Language, ExtractionResult } from '../types';
/**
 * Minimal worker surface the pool drives — satisfied by a real `worker_threads`
 * Worker. Abstracted so tests can inject a fake worker and exercise the pool's
 * queue / growth / recycle / crash-recovery logic without spawning threads or a
 * built `dist/`.
 */
export interface ParsePoolWorker {
    postMessage(msg: unknown): void;
    terminate(): Promise<number> | void;
    on(event: 'message', cb: (m: unknown) => void): void;
    on(event: 'error', cb: (e: Error) => void): void;
    on(event: 'exit', cb: (code: number) => void): void;
}
/** A single file to parse. `language` is resolved on the main thread (it holds
 *  the project's codegraph.json extension overrides) and handed to the worker. */
export interface ParseTask {
    filePath: string;
    content: string;
    language: Language;
    frameworkNames?: string[];
}
/**
 * Resolve the pool size from the `CODEGRAPH_PARSE_WORKERS` override and the
 * machine's core count.
 *   - explicit `0` or `1` → 1 worker (the old single-worker path; the rollback).
 *   - explicit `N` → N, clamped to [1, 16].
 *   - unset / blank / non-numeric → `clamp(cores - 1, 1, 8)` (leave a core for
 *     the main thread + UI; never zero — parsing always needs a worker).
 */
/**
 * Resolve the base per-parse timeout from the `CODEGRAPH_PARSE_TIMEOUT_MS`
 * override. Slow storage (HDD, network folders) can need a larger budget; a
 * non-numeric / non-positive value falls back to the default (10s).
 */
export declare function resolveParseTimeoutMs(envVal: string | undefined): number;
export declare function resolveParsePoolSize(envVal: string | undefined, cpuCount: number): number;
export interface ParseWorkerPoolOptions {
    /** Languages to load grammars for in every worker at spawn. */
    languages: Language[];
    /** Number of worker threads (≥1). Clamp the resolved value before passing. */
    size: number;
    /** Compiled `parse-worker.js` path. Required unless `createWorker` is given. */
    workerScriptPath?: string;
    /** Parses per worker before recycle. Default 250. */
    recycleInterval?: number;
    /** Base per-parse timeout (ms); scaled by file size per parse. Default 10s. */
    parseTimeoutMs?: number;
    /** Worker factory (tests inject a fake). Defaults to a real `worker_threads` Worker. */
    createWorker?: () => ParsePoolWorker;
    /** Optional verbose logger (the orchestrator's `[worker] …` logger). */
    log?: (msg: string) => void;
    /**
     * Pre-read grammar WASM bytes keyed by language, forwarded to every worker's
     * `load-grammars` message so a spawn/respawn loads grammars from memory
     * instead of re-reading them from disk — on slow storage each respawn's
     * grammar re-read otherwise amplifies the very I/O contention that caused
     * the respawn (issue #1231). Best-effort: a missing language falls back to
     * the worker's own disk read.
     */
    grammarBuffers?: Record<string, Uint8Array>;
}
export declare class ParseWorkerPool {
    private idle;
    private queue;
    private inflight;
    private workers;
    private pending;
    private parseCounts;
    private nextId;
    private totalCrashes;
    private destroyed;
    private readonly languages;
    private readonly maxSize;
    private readonly recycleInterval;
    private readonly parseTimeoutMs;
    private readonly createWorker;
    private readonly log;
    private readonly grammarBuffers?;
    constructor(opts: ParseWorkerPoolOptions);
    /**
     * Spawn the whole pool up front. The default demand-driven growth avoids
     * paying worker boot for small jobs, but a bulk index KNOWS every core will
     * be needed — on a fast repo the one-by-one ramp-up otherwise consumes most
     * of the parse phase (each worker boot is a fresh Node isolate + grammar
     * load, ~hundreds of ms, and growth only triggers as queue pressure builds).
     */
    prewarm(): void;
    /** Pool size cap (for logging). */
    get size(): number;
    /** Live worker count (for tests). */
    get liveWorkers(): number;
    /** False once the crash budget is exhausted (or after destroy). */
    get healthy(): boolean;
    /**
     * Parse one file on the pool. Resolves with the extraction result, or REJECTS
     * if the parse times out or its worker crashes — the caller records the error
     * and (for worker-exit/OOM/timeout rejections) re-attempts in its retry pass.
     */
    requestParse(task: ParseTask): Promise<ExtractionResult>;
    private spawnOne;
    private onMessage;
    /** A worker died (crash hook / OOM exit / spawn error). Reject its in-flight
     *  parse so the caller's retry pass can re-attempt it, then respawn. */
    private onWorkerGone;
    /** Tear down a worker that has hit its recycle threshold and replace it. Not a
     *  crash, so it doesn't count against the budget. */
    private recycle;
    private removeWorker;
    private dispatch;
    /**
     * The base timer fired with no result processed yet. Do NOT kill or settle:
     * the timer firing doesn't prove the parse is still running — after a long
     * synchronous main-thread stretch Node services the timers phase before the
     * poll phase, so an already-delivered `parse-result` is still queued behind
     * this callback. Mark the job late (onMessage accepts a result that shows up)
     * and arm the hard-kill backstop for workers that are genuinely hung.
     */
    private onTimeout;
    /** No result after the full hard-kill window — the worker really is hung. */
    private onHardTimeout;
    private drain;
    private settle;
    /**
     * Recycle every idle worker now (fresh WASM heaps). The orchestrator calls
     * this before its retry pass so crash-on-memory files get the cleanest heap.
     */
    recycleAll(): void;
    /** Terminate all workers and reject any outstanding parses. */
    destroy(): Promise<void>;
}
//# sourceMappingURL=parse-pool.d.ts.map