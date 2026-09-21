/**
 * ResolverPool — main-thread client for the parallel-resolution workers.
 *
 * resolveBatch() splits a rowid-ordered batch into ordered chunks, fans the
 * chunks across the pool, and reassembles the results IN CHUNK ORDER, so the
 * caller's admission (edge inserts, row cleanup, failure parking, deferred
 * post-pass queues) is byte-for-byte the sequence the single-threaded loop
 * would have produced. Any worker failure fails the batch — the caller falls
 * back to the sequential path. Kill switch: CODEGRAPH_NO_PARALLEL_RESOLVE=1.
 */
import type { Edge, UnresolvedReference } from '../types';
import type { ResolvedRef, UnresolvedRef } from './types';
/** One synthesis pass's output: its edge list + worker-measured wall clock. */
export interface SynthPassResult {
    edges: Edge[];
    ms: number;
}
export interface ChunkResult {
    resolved: ResolvedRef[];
    unresolved: UnresolvedRef[];
    deferredChain: UnresolvedRef[];
    deferredThisMember: UnresolvedRef[];
    byMethod: Record<string, number>;
}
/**
 * Minimum TOTAL pending refs before the pool is created at all. Pool boot
 * (module load + readonly DB open + framework detect + cache warm, times N
 * workers) costs real CPU that CONTENDS with sequential resolution on the
 * same cores — measured on a medium repo (~40k refs, ~1.2s of resolution)
 * the pool made indexing slower. It pays off when resolution runs for tens
 * of seconds to minutes (large JVM/Spring-class repos). Override:
 * CODEGRAPH_PARALLEL_RESOLVE_MIN=<refs> (0 forces the pool on).
 */
export declare function minRefsForPool(): number;
export declare class ResolverPool {
    private workers;
    private nextId;
    private waiters;
    private synthWaiters;
    private recycleWaiters;
    private failed;
    /**
     * Pool size from CPU headroom, memory headroom, and the explicit override.
     * Pure — every input injected — so the whole matrix is unit-testable.
     *
     * CPU term: `availableParallelism` (cpuset/affinity-honest — `os.cpus()`
     * enumerates the host's CPUs and sized SIX workers inside a 2-CPU cpuset,
     * §7a.1's false-premise finding), minus one for the persisting main thread,
     * floored at 2 so a true 2-core box keeps the pool's ~2× on synthesis,
     * capped at the long-standing 6.
     *
     * Memory term: workers hold real heap at scale (~1GB each against a 4.6GB
     * kernel-scale DB — six of them OOM-killed a 7GB container once real
     * 8-core concurrency let them peak simultaneously). Estimate per-worker
     * cost from the DB size, keep 30% of the budget for the main thread, and
     * let the smaller term win. Below 2 workers the pool isn't worth its boot
     * cost — callers get null and stay sequential.
     */
    static resolvePoolSize(opts: {
        explicit?: string;
        availableParallelism: number;
        memoryBudget: number;
        dbSizeBytes: number;
    }): number | null;
    /**
     * Create a pool when the compiled worker exists (absent when running from
     * source in tests → callers use the sequential path), the kill switch is
     * off, and the machine has the cores AND memory to carry it. Returns null
     * otherwise. `CODEGRAPH_RESOLVE_WORKERS` overrides the computed size
     * (0 disables the pool; values are capped at 16).
     */
    static tryCreate(dbPath: string, projectRoot: string): ResolverPool | null;
    private constructor();
    private fail;
    /** Whether this batch is worth fanning out. */
    static worthParallel(batchLength: number): boolean;
    ready(): Promise<void>;
    /**
     * Resolve `refs` across the pool. Chunks preserve input order; the returned
     * arrays are the in-order concatenation of the chunk results.
     */
    resolveBatch(refs: UnresolvedReference[]): Promise<ChunkResult>;
    /**
     * Run one synthesis pass (by SYNTH_PASSES name) on the least-busy worker.
     * The worker reads the committed graph on its own connection and returns
     * the pass's edge list; the caller merges in canonical order. Rejects on
     * worker failure — the caller retries the pass on the main thread.
     */
    runSynthPass(passName: string): Promise<SynthPassResult>;
    /**
     * Ask every worker to close and reopen its read-only connection, and wait
     * for all acks. MUST be called only at the pool-idle boundary (all fanned
     * chunks settled, next batch not yet dispatched) — the workers close their
     * connections in place. Why: a long-lived reader pins WAL checkpoint
     * progress, and the deep WAL behind it taxes every main-thread B-tree
     * page operation (writes-under-readers, plan §7a.6 — deletes 42.6→118.8s
     * from 0 to 4 attached readers). Releasing the read marks periodically
     * lets the existing checkpoints advance, keeping the WAL shallow WITHOUT
     * the full-park folds an aggressive valve pays (+129s measured at 64MB).
     * A recycle failure fails the pool — the caller's sequential fallback
     * covers the rest of the run.
     */
    recycleWorkers(): Promise<void>;
    destroy(): Promise<void>;
}
//# sourceMappingURL=resolver-pool.d.ts.map