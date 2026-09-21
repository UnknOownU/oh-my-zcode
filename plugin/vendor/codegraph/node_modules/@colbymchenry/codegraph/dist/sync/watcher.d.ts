/**
 * File Watcher
 *
 * Watches the project directory for file changes and triggers debounced sync
 * operations to keep the code graph up-to-date.
 *
 * Uses Node's built-in `fs.watch` directly (no third-party watcher, no native
 * addon) with a per-platform strategy chosen to keep the open-descriptor /
 * kernel-watch cost BOUNDED rather than growing with the number of files:
 *
 *   - macOS / Windows: a SINGLE recursive `fs.watch(root, {recursive:true})`.
 *     libuv maps this to one FSEvents stream (macOS) / one
 *     ReadDirectoryChangesW handle (Windows), so it costs O(1) descriptors no
 *     matter how large the tree. This is the fix for the macOS file-table
 *     exhaustion (#644 / #496 / #555 / #628): the previous watcher held one
 *     open fd PER WATCHED FILE on macOS (tens of thousands of REG fds), which
 *     exhausted `kern.maxfiles` and crashed unrelated processes system-wide.
 *
 *   - Linux: recursive `fs.watch` is unsupported, so we watch each (non-ignored)
 *     DIRECTORY with one inotify watch — O(directories), NOT O(files). New
 *     directories are picked up dynamically and an overall watch cap bounds
 *     inotify usage on pathological monorepos (#579). A single inotify watch on
 *     a directory already reports create/modify/delete for its children, so
 *     per-file watches are never needed.
 *
 * Excluded trees (node_modules/, dist/, .git/, …) are filtered via the
 * indexer's `buildScopeIgnore` (built-in default-ignore dirs + the project's
 * .gitignore) — on Linux they're never descended into (so they cost no watch),
 * and on macOS/Windows the single recursive stream still covers them but their
 * events are dropped before any sync is scheduled. Either way the watcher's
 * scope matches the indexer's (#276 / #407).
 */
import * as fs from 'fs';
/**
 * Indirection over `fs.watch` so tests can inject a fake that throws or emits
 * `EMFILE`/`ENFILE` deterministically (real watch-resource exhaustion can't be
 * provoked reliably, and `fs.watch` is a non-configurable property so it can't
 * be spied). Production always uses the real `fs.watch`.
 */
type WatchFn = typeof fs.watch;
/** @internal Test-only seam to inject a fake fs.watch implementation. */
export declare function __setFsWatchForTests(fn: WatchFn | null): void;
/**
 * Options for the file watcher
 */
export interface WatchOptions {
    /**
     * Debounce delay in milliseconds.
     * After the last file change, wait this long before triggering sync.
     * Default: 2000ms
     */
    debounceMs?: number;
    /**
     * Callback when a sync completes (for logging/diagnostics).
     */
    onSyncComplete?: (result: {
        filesChanged: number;
        durationMs: number;
    }) => void;
    /**
     * Callback when a sync errors (for logging/diagnostics).
     */
    onSyncError?: (error: Error) => void;
    /**
     * Callback fired ONCE when live watching degrades permanently and auto-sync
     * is disabled — OS watch-resource exhaustion (EMFILE/ENFILE), a write lock
     * held past the retry budget, or a generic sync failure that persists past
     * the retry budget (#1127). The string is an actionable, human-readable
     * reason. Lets a host (MCP server, daemon, CLI) tell the user that the index
     * will no longer auto-update instead of silently serving stale results.
     */
    onDegraded?: (reason: string) => void;
    /**
     * Test-only. When true, `start()` installs NO OS-level fs.watch — the
     * watcher is "inert" and only the {@link __emitWatchEventForTests} /
     * {@link FileWatcher.ingestEventForTests} seam drives its pipeline. This
     * restores the deterministic, OS-free behavior the unit tests need (real
     * FSEvents/inotify delivery races under parallel vitest). Production never
     * sets it.
     */
    inertForTests?: boolean;
}
/**
 * Thrown by a `syncFn` to signal that the underlying sync couldn't acquire
 * the cross-process write lock (#449). The watcher treats this as "no
 * progress" — preserves `pendingFiles`, skips `onSyncComplete`, and the
 * `finally` block reschedules. Quiet (debug-only) because a long-running
 * external indexer can hit this every debounce cycle.
 */
export declare class LockUnavailableError extends Error {
    constructor(message?: string);
}
/**
 * Per-file pending entry — tracks a source file the watcher saw an event for
 * but hasn't yet synced into the index. Exposed via {@link FileWatcher.getPendingFiles}
 * so MCP tool responses can mark stale results without forcing a wait.
 */
export interface PendingFile {
    /** Project-relative POSIX path (e.g. "src/foo.ts"). */
    path: string;
    /** Wall-clock ms at the first event we saw for this path since the last sync. */
    firstSeenMs: number;
    /** Wall-clock ms at the most recent event we saw for this path. */
    lastSeenMs: number;
    /**
     * True when a sync is currently in flight that began AFTER this file's most
     * recent event — i.e. the next successful sync will pick it up. False when
     * the file is still in the debounce window (no sync running yet).
     */
    indexing: boolean;
}
/**
 * FileWatcher monitors a project directory for changes and triggers
 * debounced sync operations via a provided callback.
 *
 * Design goals:
 * - Bounded resource usage: O(1) descriptors on macOS/Windows (one recursive
 *   watch), O(directories) inotify watches on Linux — never O(files), which
 *   was the system-crashing fd leak on macOS (#644/#496/#555/#628).
 * - Debounced to avoid thrashing on rapid saves
 * - Filters to supported source files by extension
 * - Ignores .codegraph/ and .git/ regardless of .gitignore
 * - Tracks per-file pending state so MCP tools can flag stale results
 *   without blocking on a sync (issue #403)
 */
export declare class FileWatcher {
    /** macOS/Windows: the single recursive watcher. Null on Linux. */
    private recursiveWatcher;
    /** Linux: one watcher per watched directory (keyed by absolute path). */
    private dirWatchers;
    /** Set once the per-directory watch cap is hit, so we log only once. */
    private dirCapWarned;
    /**
     * Set once the Linux inotify watch limit (ENOSPC) is hit. Double duty: we
     * warn only once, AND we stop attempting new directory watches for the rest
     * of the session — once the kernel budget is exhausted every further
     * `inotify_add_watch` fails too, so trying the rest of the tree is pure
     * waste. NON-fatal (does not degrade): installed watches keep working.
     */
    private inotifyLimitWarned;
    /**
     * One-way latch: the reason live watching was permanently disabled at runtime
     * (watch-resource exhaustion, lock contention past the retry budget, or a
     * persistent generic sync failure past the retry budget), or null while
     * healthy. Set by {@link degrade}; cleared only by a fresh start().
     */
    private degradedReason;
    /** Consecutive lock-contention retries for watcher-triggered syncs. */
    private lockRetryCount;
    /** Consecutive generic (non-lock) sync failures; reset only by a clean sync. */
    private syncFailureRetryCount;
    /** Test-only inert mode: started, but with no OS watcher installed. */
    private inert;
    private debounceTimer;
    /**
     * True when the pending set does NOT exactly describe the change (a
     * directory removal's children are unknown from the event, #1285) — the
     * next sync must be a full scan-diff. Cleared only after a successful FULL
     * sync reconciles the tree.
     */
    private needsFullScan;
    /**
     * Files seen by the watcher since the last successful sync — populated on
     * every change event, cleared at the start of a sync, and re-populated by
     * events that arrive mid-sync (or restored on sync failure). Keyed by the
     * same project-relative POSIX path the rest of the codebase uses, so a
     * caller can intersect tool-response file paths against this map cheaply.
     */
    private pendingFiles;
    /**
     * Wall-clock ms at which the in-flight sync began. Combined with
     * {@link pendingFiles}'s `lastSeenMs`, this distinguishes "still in the
     * debounce window" (lastSeen > syncStarted, sync hasn't started yet for
     * this edit) from "currently being indexed" (lastSeen <= syncStarted).
     */
    private syncStartedMs;
    private syncing;
    private stopped;
    /**
     * True once the initial watch set is established. Unlike the previous
     * chokidar implementation there is no asynchronous initial "crawl" emitting
     * an `add` per existing file — `fs.watch` only reports changes from the
     * moment it's installed — so this flips to true synchronously at the end of
     * `start()`. The startup reconcile against on-disk state is handled
     * separately by the engine's catch-up sync, not by the watcher.
     */
    private ready;
    /**
     * Callbacks that resolve when the watch set is established. Used by tests
     * (and any production caller that cares about a clean baseline) to
     * deterministically gate on watcher readiness.
     */
    private readyWaiters;
    private ignoreMatcher;
    private readonly projectRoot;
    private readonly debounceMs;
    private readonly syncFn;
    private readonly onSyncComplete?;
    private readonly onSyncError?;
    private readonly onDegraded?;
    private readonly inertForTests;
    constructor(projectRoot: string, syncFn: (paths?: string[]) => Promise<{
        filesChanged: number;
        durationMs: number;
    }>, options?: WatchOptions);
    /**
     * Start watching for file changes.
     * Returns true if watching started successfully, false otherwise.
     */
    start(): boolean;
    /**
     * macOS/Windows: one recursive watcher for the whole tree. O(1) descriptors.
     * `filename` arrives relative to the project root (with subdirectories), so
     * it maps straight to a project-relative path.
     */
    private startRecursive;
    /**
     * Linux: walk the (non-ignored) tree and watch each directory. One inotify
     * watch per directory reports create/modify/delete for that directory's
     * direct children, so we never watch individual files.
     */
    private startPerDirectory;
    /**
     * Add an inotify watch for `dir` and recurse into its non-ignored
     * subdirectories. When `markExisting` is true (a directory that appeared
     * AFTER startup), the source files already inside it are recorded as pending
     * — this closes the `mkdir + write` race where files created before the new
     * directory's watch is installed would otherwise be missed until the next
     * full sync. The initial startup walk passes false (the engine's catch-up
     * sync owns the baseline).
     */
    private watchTree;
    /**
     * Linux per-directory event handler. `filename` is relative to `dir`. A new
     * sub-directory is picked up by extending the watch tree; everything else is
     * routed through the shared change handler.
     */
    private handleDirEvent;
    /**
     * Shared change handler for both watch strategies. `rel` is a
     * project-relative POSIX path. Applies the ignore + source-file filters and,
     * for a real source change, records it as pending (#403) and schedules a
     * debounced sync.
     *
     * The recursive (macOS/Windows) watcher reports events for ignored trees too
     * (one stream covers the whole repo), so the ignore check here is load-bearing
     * — it drops node_modules/dist/.git churn before any sync is scheduled.
     */
    private handleChange;
    /**
     * A deleted DIRECTORY arrives as one event on the directory's own path —
     * no source extension, so the source-file filter drops it, and the files
     * underneath may never get events of their own (Windows's recursive
     * watcher reports only the top-most removed entry; macOS FSEvents can
     * coalesce a tree deletion the same way). The index then kept every child
     * record until some unrelated edit happened to trigger a sync (#1285).
     *
     * If a non-source path no longer exists on disk, treat it as a potential
     * subtree removal and schedule the debounced sync — its scan-diff removes
     * whatever is gone, which is the ground truth for what was underneath.
     * pendingFiles is left alone (we can't know the children from the event).
     * An event for an EXISTING non-source file stays fully ignored, so build
     * churn on live files never schedules work; a deleted non-source file
     * costs at most one no-op scan-diff, absorbed by the debounce.
     */
    private maybeScheduleForRemovedDir;
    /** Close and forget the watch for a directory that errored/was removed. */
    private unwatchDir;
    /** Our own dirs are always ignored, regardless of .gitignore. */
    private isAlwaysIgnored;
    /**
     * True for any directory that should NOT be watched (used while building the
     * Linux per-directory watch tree). Tests the directory form of the path so a
     * dir-only ignore rule like `build/` matches.
     */
    private shouldIgnoreDir;
    /**
     * Permanently disable live watching after a terminal runtime failure
     * (watch-resource exhaustion, lock contention past the retry budget, or a
     * persistent generic sync failure past the retry budget).
     * Idempotent: logs one actionable warning, fires {@link WatchOptions.onDegraded}
     * once, and stops the watcher. A subsequent start() clears the latch.
     */
    private degrade;
    /**
     * Warn ONCE that the Linux inotify watch budget is exhausted (ENOSPC), and
     * stop adding new watches for the rest of this session — every further
     * `inotify_add_watch` would fail too, so walking the rest of the tree is
     * waste. Unlike {@link degrade} this is NON-fatal: the watches already
     * installed keep firing, and `codegraph sync` covers the unwatched remainder.
     * The message names the kernel knob to raise (`fs.inotify.max_user_watches`).
     */
    private warnInotifyLimit;
    /**
     * Whether live watching has degraded permanently (until the next start()).
     * Distinct from {@link isActive}: a degraded watcher is inactive, but an
     * inactive watcher is not necessarily degraded (it may simply be stopped or
     * never started). Hosts use this to tell the user auto-sync is off.
     */
    isDegraded(): boolean;
    /** The reason live watching degraded, or null if it is healthy. */
    getDegradedReason(): string | null;
    /**
     * Stop watching for file changes.
     */
    stop(): void;
    /**
     * @internal Test-only: feed a synthetic project-relative change through the
     * same filter → pendingFiles → debounced-sync path a real fs.watch event
     * takes. Lets the watcher / staleness-banner suites stay deterministic
     * instead of racing on OS watch-delivery latency. See
     * {@link __emitWatchEventForTests}.
     */
    ingestEventForTests(relPath: string): void;
    /**
     * Whether the watcher is currently active.
     */
    isActive(): boolean;
    /**
     * Resolves once the watch set has been installed (or immediately if it
     * already has). Useful for tests that need a deterministic boundary before
     * asserting on `pendingFiles`.
     *
     * Production callers don't need this: `pendingFiles` is read continuously,
     * the staleness banner is always correct (empty or populated), and there is
     * no asynchronous initial-scan window with `fs.watch`.
     */
    waitUntilReady(timeoutMs?: number): Promise<void>;
    /**
     * Schedule a normal debounced sync after a source edit.
     */
    private scheduleSync;
    /**
     * Schedule a retry after a recoverable sync failure (lock contention). Kept
     * separate from {@link scheduleSync} so prolonged contention backs off
     * exponentially instead of hammering the lock every debounce cycle.
     */
    private scheduleRetrySync;
    /**
     * Flush pending changes by running sync.
     *
     * pendingFiles is NOT cleared at the start of sync — entries are removed
     * only after sync commits successfully, and only for entries whose
     * lastSeenMs <= syncStartedMs. That way, a query that arrives mid-sync
     * still sees the affected files marked stale (the DB hasn't been updated
     * yet), and an event that lands mid-sync persists into the follow-up.
     *
     * On sync failure pendingFiles is left untouched — every edit is still
     * unindexed, and the rescheduled sync will absorb the same set next time.
     */
    private flush;
    /**
     * Snapshot of files seen by the watcher since the last successful sync.
     *
     * Used by MCP tool responses to mark stale results without blocking on a
     * sync: a tool that returns a hit in `src/foo.ts` while `src/foo.ts` is in
     * this list tells the agent "Read this file directly, the index lags."
     *
     * `indexing` is true when a sync is currently in flight whose start time is
     * AFTER this file's most recent event — i.e. that sync will absorb the
     * edit. False means the file is still inside the debounce window and no
     * sync has started yet (a follow-up call a few hundred ms later may show
     * `indexing: true` or the file may have left the list entirely).
     *
     * Cheap: O(pendingFiles.size), no I/O, no locks.
     */
    getPendingFiles(): PendingFile[];
}
/**
 * Test-only: synthesize a source-file change for the live watcher running at
 * `projectRoot`, exercising the real filter → pendingFiles → debounced-sync
 * logic without depending on fs.watch delivery timing (which races under
 * parallel vitest). `relPath` is project-relative POSIX (e.g. "src/foo.ts").
 * Returns false if no live watcher is registered for that root (e.g. outside a
 * test runtime, where the registry is intentionally not populated).
 */
export declare function __emitWatchEventForTests(projectRoot: string, relPath: string): boolean;
export {};
//# sourceMappingURL=watcher.d.ts.map