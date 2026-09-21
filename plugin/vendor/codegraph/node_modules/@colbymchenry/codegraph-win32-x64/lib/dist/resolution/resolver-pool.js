"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResolverPool = void 0;
exports.minRefsForPool = minRefsForPool;
const worker_threads_1 = require("worker_threads");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const memory_budget_1 = require("./memory-budget");
const MIN_PARALLEL_BATCH = 1000;
const CHUNK_SIZE = 500;
/**
 * Minimum TOTAL pending refs before the pool is created at all. Pool boot
 * (module load + readonly DB open + framework detect + cache warm, times N
 * workers) costs real CPU that CONTENDS with sequential resolution on the
 * same cores — measured on a medium repo (~40k refs, ~1.2s of resolution)
 * the pool made indexing slower. It pays off when resolution runs for tens
 * of seconds to minutes (large JVM/Spring-class repos). Override:
 * CODEGRAPH_PARALLEL_RESOLVE_MIN=<refs> (0 forces the pool on).
 */
function minRefsForPool() {
    const raw = process.env.CODEGRAPH_PARALLEL_RESOLVE_MIN;
    if (raw !== undefined) {
        const parsed = Number.parseInt(raw, 10);
        if (Number.isFinite(parsed) && parsed >= 0)
            return parsed;
    }
    return 150_000;
}
class ResolverPool {
    workers = [];
    nextId = 0;
    waiters = new Map();
    synthWaiters = new Map();
    recycleWaiters = new Map();
    failed = null;
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
    static resolvePoolSize(opts) {
        if (opts.explicit !== undefined && opts.explicit !== '') {
            const n = Number.parseInt(opts.explicit, 10);
            if (Number.isFinite(n)) {
                if (n <= 0)
                    return null;
                return Math.min(n, 16);
            }
        }
        // No floor: at ap=2 the pool LOSES to sequential outright — measured on
        // the kernel-scale 2-cpuset envelope: resolution 853s sequential vs
        // 1,150s pooled-6-on-2 (§7a.1), and synthesis is Amdahl-bound by its
        // dominant pass (cFnPtrEdges 306s of 358s) so pooling it bought nothing.
        // ap−1 < 2 ⇒ sequential is the fast path, not a fallback.
        const cpuCap = Math.min(opts.availableParallelism - 1, 6);
        const perWorker = Math.min(Math.max(opts.dbSizeBytes * 0.2, 256 * 1024 * 1024), 1.5 * 1024 * 1024 * 1024);
        const memCap = Math.floor((opts.memoryBudget * 0.7) / perWorker);
        const size = Math.min(cpuCap, memCap);
        return size >= 2 ? size : null;
    }
    /**
     * Create a pool when the compiled worker exists (absent when running from
     * source in tests → callers use the sequential path), the kill switch is
     * off, and the machine has the cores AND memory to carry it. Returns null
     * otherwise. `CODEGRAPH_RESOLVE_WORKERS` overrides the computed size
     * (0 disables the pool; values are capped at 16).
     */
    static tryCreate(dbPath, projectRoot) {
        if (process.env.CODEGRAPH_NO_PARALLEL_RESOLVE === '1')
            return null;
        const workerScript = path.join(__dirname, 'resolver-worker.js');
        if (!fs.existsSync(workerScript))
            return null;
        let dbSizeBytes = 0;
        try {
            dbSizeBytes = fs.statSync(dbPath).size;
        }
        catch { /* fresh/missing file — the 256MB per-worker floor applies */ }
        const ap = os.availableParallelism();
        const budget = (0, memory_budget_1.memoryBudgetBytes)();
        const size = ResolverPool.resolvePoolSize({
            explicit: process.env.CODEGRAPH_RESOLVE_WORKERS,
            availableParallelism: ap,
            memoryBudget: budget,
            dbSizeBytes,
        });
        // Both outcomes log under SYNTH_TIMINGS — a silent null is how §7a.1's
        // diagnostic run hid the memory-term misfire for a whole 25-minute cycle.
        if (process.env.CODEGRAPH_SYNTH_TIMINGS) {
            console.error(`[pool-timing] pool ${size === null ? 'disabled' : `size=${size}`} (ap=${ap} budget=${Math.round(budget / 1024 / 1024)}MB db=${Math.round(dbSizeBytes / 1024 / 1024)}MB)`);
        }
        if (size === null)
            return null;
        try {
            return new ResolverPool(workerScript, dbPath, projectRoot, size);
        }
        catch {
            return null;
        }
    }
    constructor(workerScript, dbPath, projectRoot, size) {
        for (let i = 0; i < size; i++) {
            const worker = new worker_threads_1.Worker(workerScript);
            let readyResolve;
            let readyReject;
            const ready = new Promise((resolve, reject) => {
                readyResolve = resolve;
                readyReject = reject;
            });
            const pw = { worker, ready, busy: 0 };
            worker.on('message', (msg) => {
                if (msg.type === 'ready') {
                    readyResolve();
                }
                else if (msg.type === 'result' && msg.id !== undefined) {
                    pw.busy--;
                    const waiter = this.waiters.get(msg.id);
                    this.waiters.delete(msg.id);
                    waiter?.resolve({
                        resolved: msg.resolved,
                        unresolved: msg.unresolved,
                        deferredChain: msg.deferredChain,
                        deferredThisMember: msg.deferredThisMember,
                        byMethod: msg.byMethod,
                    });
                }
                else if (msg.type === 'synth-result' && msg.id !== undefined) {
                    pw.busy--;
                    const waiter = this.synthWaiters.get(msg.id);
                    this.synthWaiters.delete(msg.id);
                    waiter?.resolve({ edges: msg.edges ?? [], ms: msg.ms ?? 0 });
                }
                else if (msg.type === 'recycled' && msg.id !== undefined) {
                    const waiter = this.recycleWaiters.get(msg.id);
                    this.recycleWaiters.delete(msg.id);
                    waiter?.();
                }
                else if (msg.type === 'error') {
                    pw.busy--;
                    const err = new Error(`resolver worker: ${msg.message}`);
                    if (msg.id !== undefined && this.waiters.has(msg.id)) {
                        const waiter = this.waiters.get(msg.id);
                        this.waiters.delete(msg.id);
                        waiter.reject(err);
                    }
                    else if (msg.id !== undefined && this.synthWaiters.has(msg.id)) {
                        const waiter = this.synthWaiters.get(msg.id);
                        this.synthWaiters.delete(msg.id);
                        waiter.reject(err);
                    }
                    else {
                        this.fail(err);
                    }
                }
            });
            worker.on('error', (err) => {
                this.fail(err instanceof Error ? err : new Error(String(err)));
                readyReject(this.failed);
            });
            worker.on('exit', (code) => {
                if (code !== 0) {
                    this.fail(new Error(`resolver worker exited with code ${code}`));
                    readyReject(this.failed);
                }
            });
            worker.postMessage({ type: 'open', dbPath, projectRoot });
            this.workers.push(pw);
        }
    }
    fail(err) {
        if (!this.failed)
            this.failed = err;
        for (const [, waiter] of this.waiters)
            waiter.reject(this.failed);
        this.waiters.clear();
        for (const [, waiter] of this.synthWaiters)
            waiter.reject(this.failed);
        this.synthWaiters.clear();
        // Pending recycles resolve rather than reject: their per-call timeout
        // owns rejection, and the recycle caller checks this.failed next round.
        for (const [, done] of this.recycleWaiters)
            done();
        this.recycleWaiters.clear();
    }
    /** Whether this batch is worth fanning out. */
    static worthParallel(batchLength) {
        return batchLength >= MIN_PARALLEL_BATCH;
    }
    async ready() {
        await Promise.all(this.workers.map((w) => w.ready));
    }
    /**
     * Resolve `refs` across the pool. Chunks preserve input order; the returned
     * arrays are the in-order concatenation of the chunk results.
     */
    async resolveBatch(refs) {
        if (this.failed)
            throw this.failed;
        const chunkPromises = [];
        for (let i = 0; i < refs.length; i += CHUNK_SIZE) {
            const chunk = refs.slice(i, i + CHUNK_SIZE);
            const id = this.nextId++;
            // Least-busy dispatch keeps workers evenly loaded regardless of chunk
            // cost variance; result order is fixed by the promise array, not by
            // completion order.
            const pw = this.workers.reduce((a, b) => (b.busy < a.busy ? b : a));
            pw.busy++;
            chunkPromises.push(new Promise((resolve, reject) => {
                this.waiters.set(id, { resolve, reject });
                pw.worker.postMessage({ type: 'resolve', id, refs: chunk });
            }));
        }
        const chunks = await Promise.all(chunkPromises);
        const out = { resolved: [], unresolved: [], deferredChain: [], deferredThisMember: [], byMethod: {} };
        for (const c of chunks) {
            out.resolved.push(...c.resolved);
            out.unresolved.push(...c.unresolved);
            out.deferredChain.push(...c.deferredChain);
            out.deferredThisMember.push(...c.deferredThisMember);
            for (const [k, v] of Object.entries(c.byMethod))
                out.byMethod[k] = (out.byMethod[k] || 0) + v;
        }
        return out;
    }
    /**
     * Run one synthesis pass (by SYNTH_PASSES name) on the least-busy worker.
     * The worker reads the committed graph on its own connection and returns
     * the pass's edge list; the caller merges in canonical order. Rejects on
     * worker failure — the caller retries the pass on the main thread.
     */
    async runSynthPass(passName) {
        if (this.failed)
            throw this.failed;
        const id = this.nextId++;
        const pw = this.workers.reduce((a, b) => (b.busy < a.busy ? b : a));
        pw.busy++;
        return new Promise((resolve, reject) => {
            this.synthWaiters.set(id, { resolve, reject });
            pw.worker.postMessage({ type: 'synth', id, pass: passName });
        });
    }
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
    async recycleWorkers() {
        if (this.failed)
            throw this.failed;
        await Promise.all(this.workers.map((pw) => new Promise((resolve, reject) => {
            const id = this.nextId++;
            const t = setTimeout(() => {
                if (this.recycleWaiters.delete(id)) {
                    const err = new Error('resolver worker recycle timed out');
                    this.fail(err);
                    reject(err);
                }
            }, 10_000);
            this.recycleWaiters.set(id, () => {
                clearTimeout(t);
                resolve();
            });
            pw.worker.postMessage({ type: 'recycle', id });
        })));
    }
    async destroy() {
        await Promise.all(this.workers.map((pw) => new Promise((resolve) => {
            const t = setTimeout(() => {
                void pw.worker.terminate().then(() => resolve());
            }, 5000);
            pw.worker.once('exit', () => {
                clearTimeout(t);
                resolve();
            });
            pw.worker.postMessage({ type: 'close' });
        })));
    }
}
exports.ResolverPool = ResolverPool;
//# sourceMappingURL=resolver-pool.js.map