/**
 * WAL checkpoint valve — bounds WAL growth while auto-checkpointing is
 * deferred during a bulk index (#1231).
 *
 * Why deferral: SQLite's default `wal_autocheckpoint` (1000 pages) re-writes
 * hot B-tree/FTS pages into the main DB file over and over during a bulk
 * index — measured at ~95% of ALL disk I/O, and the difference between 45s
 * and 19+ minutes on HDD-class storage (150 random IOPS). Deferring
 * checkpoints turns the store into pure sequential WAL appends; each backfill
 * pass writes distinct pages once, in page order (≈ sequential).
 *
 * Why a valve: unbounded deferral is its own failure mode, both measured in
 * the #1231 repro. The WAL duplicates hot pages per COMMIT, so it grows far
 * faster than the DB (5.9GB WAL for a ~340MB DB on a 3.3k-file index) —
 * filling the disk, and poisoning every subsequent read that must page
 * through it (the first resolution-phase read blocked the main thread >60s
 * and the #850 liveness watchdog killed the healthy index). The valve
 * watches WAL growth on a timer and, past a soft threshold, backfills with
 * `PRAGMA wal_checkpoint(PASSIVE)` on a worker-thread connection — PASSIVE
 * never blocks the writer, and off-thread means the main thread (and the
 * watchdog heartbeat) keep turning regardless of how long a backfill takes.
 *
 * The load-bearing subtlety: a WAL file's SIZE never shrinks. After a full
 * backfill, the writer's next commit RESTARTS the WAL from the top and the
 * frames recycle inside the same file — so raw size says nothing about the
 * un-backfilled backlog, and a size-triggered valve degenerates into firing
 * (and pausing the writer) forever once the file passes its threshold
 * (measured: guava crawled at ~9min per 160 files). Instead the valve
 * tracks `sizeAtLastFullBackfill` — refreshed whenever a checkpoint reports
 * `log === checkpointed` (everything backfilled) — and triggers on GROWTH
 * beyond that baseline, which only happens when genuinely un-backfilled
 * frames push past the file's high-water mark.
 *
 * Backpressure: if the writer outruns the checkpointer past a hard cap of
 * growth (2× soft), {@link backpressure} pauses the writer (at a safe,
 * between-transactions boundary) until a FULL backfill lands. One in-flight
 * pass is not enough: on a disk saturated by the writer, every concurrent
 * PASSIVE pass is already stale by the time it finishes (the writer appended
 * past its snapshot), so neither SQLite's WAL wrap nor the baseline ever
 * trigger and the WAL grows without bound (measured: 5.9GB on guava at 150
 * IOPS, then a >60s read stall and a watchdog kill). With the writer parked,
 * the next pass covers everything, the WAL wraps on the following commit,
 * and the pause is the disk's honest catch-up cost — the correct terminal
 * mode when hardware genuinely can't keep up with the append rate.
 */
import type { DatabaseConnection } from './index';
/**
 * Resolve the valve's soft threshold from the `CODEGRAPH_WAL_VALVE_MB`
 * override; non-numeric / non-positive values fall back to the default.
 */
export declare function resolveWalValveMb(envVal: string | undefined, dbSizeBytes?: number): number;
export declare class WalCheckpointValve {
    private readonly db;
    private readonly intervalMs;
    private timer;
    private inflight;
    /** Writer pause in progress (hard cap breached): passes loop until a full backfill. */
    private pause;
    /**
     * WAL file size observed when a checkpoint last reported the ENTIRE WAL
     * backfilled. Growth is measured against this baseline — see the header
     * comment for why absolute size cannot be used.
     */
    private sizeAtLastFullBackfill;
    private readonly softBytes;
    private readonly hardBytes;
    private readonly fileCapBytes;
    /**
     * Futility latch: consecutive backfill give-ups (a reader pinning the WAL)
     * disable further writer pauses for a cooldown, so a pinned phase degrades
     * to the pre-valve behavior (unbounded WAL, folded when the pinner exits)
     * instead of burning a 20-pass checkpoint attempt — each pass a worker
     * thread + fresh connection — at EVERY over-cap boundary. That churn is
     * what turned a pinned kernel-scale resolution from slow into OOM-killed
     * (§7a.1 run 1: 22GB WAL, exit 137 at an envelope the pre-fix build
     * survived).
     */
    private consecutiveGiveUps;
    private futileUntil;
    constructor(db: DatabaseConnection, softMb?: number, intervalMs?: number, log?: (msg: string) => void);
    private readonly log;
    private mb;
    /** Un-backfilled growth estimate: bytes the WAL has grown past the last full backfill. */
    private growthBytes;
    /** Begin watching the WAL. Idempotent; the timer never holds the loop open. */
    start(): void;
    /** Stop watching. Any in-flight checkpoint keeps running — await drain(). */
    stop(): void;
    /** One poll: fire an off-thread passive checkpoint when growth passes the soft threshold. */
    check(): void;
    /**
     * Writer-side backstop, called at a between-transactions boundary. Returns
     * null (no wait) while growth is under the hard cap; past it, returns a
     * promise that resolves only once a FULL backfill has landed — see the
     * header comment for why a single pass is not enough on a saturated disk.
     */
    backpressure(): Promise<void> | null;
    /** Await any in-flight checkpoint and writer pause. */
    drain(): Promise<void>;
    /**
     * Phase-boundary fold: backfill the ENTIRE WAL now (off-thread, awaited).
     * Called between bulk phases — e.g. after parsing, before resolution's
     * first reads — so the next phase never pages a bulk-write-sized WAL on
     * the main thread (the post-parse read against a multi-GB WAL is what
     * blew the #850 watchdog's 60s window in the #1231 repro). The await
     * keeps the event loop (and the watchdog heartbeat) turning.
     */
    foldNow(): Promise<void>;
    /**
     * With the writer parked on the returned promise, loop passive passes until
     * one reports the entire WAL backfilled (typically the second: the first
     * drains the pass that was already running against a stale snapshot). Gives
     * up after a bounded number of passes — e.g. a reader pinning the WAL —
     * because unbounded WAL growth degrades; a wedged writer never recovers.
     */
    private backfillFully;
    private fire;
}
//# sourceMappingURL=wal-valve.d.ts.map