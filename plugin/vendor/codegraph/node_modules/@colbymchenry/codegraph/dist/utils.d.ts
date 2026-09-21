/**
 * CodeGraph Utilities
 *
 * Common utility functions for memory management, concurrency, batching,
 * and security validation.
 *
 * @module utils
 *
 * @example
 * ```typescript
 * import { Mutex, processInBatches, MemoryMonitor, validatePathWithinRoot } from 'codegraph';
 *
 * // Use mutex for concurrent safety
 * const mutex = new Mutex();
 * await mutex.withLock(async () => {
 *   await performCriticalOperation();
 * });
 *
 * // Process items in batches to manage memory
 * const results = await processInBatches(items, 100, async (item) => {
 *   return await processItem(item);
 * });
 *
 * // Monitor memory usage
 * const monitor = new MemoryMonitor(512, (usage) => {
 *   console.warn(`Memory usage exceeded 512MB: ${usage / 1024 / 1024}MB`);
 * });
 * monitor.start();
 * ```
 */
/**
 * Config "languages" whose nodes are pure key/value DATA lifted from a config
 * file (e.g. Spring `application.{yml,properties}`), not source code.
 */
export declare const CONFIG_LEAF_LANGUAGES: ReadonlySet<string>;
/**
 * A config-leaf node is a single key lifted out of a pure config/data file —
 * `kind: 'constant'` in a {@link CONFIG_LEAF_LANGUAGES} language. Its on-disk
 * line is `key = <value>`, and that value is routinely a secret (DB password,
 * API key, JDBC URL with embedded creds). CodeGraph must surface the KEY only
 * and never read/return the value, or it pushes secrets into agent context
 * unbidden — the value isn't needed for resolution, and an agent that genuinely
 * needs it can read the file directly. (#383)
 */
export declare function isConfigLeafNode(node: {
    kind: string;
    language?: string;
}): boolean;
/**
 * Validate that a file path stays within the project root, resolving symlinks.
 *
 * Two layers: a cheap lexical check that catches `../` traversal, then a
 * realpath check that catches symlink escapes — an in-repo symlink whose
 * logical path is inside the root but whose real target points outside it
 * (issue #527). A symlink that stays within the root is still allowed, so
 * legitimate in-tree symlinks keep working. Both content-serving read sinks
 * (codegraph_node `includeCode`, codegraph_explore source) go through here, so
 * this is the chokepoint that keeps out-of-root file contents from leaking.
 *
 * `allowSymlinkEscape` waives **only** the realpath-escape rejection (the
 * lexical `../` guard still applies) for the INDEXING read path. The directory
 * walk deliberately descends into in-root symlinks whose targets live outside
 * the root (e.g. a `game/` symlink in a Dota custom-game tree, #935); discovery
 * and the reader must agree, or every file the walk enumerated fails to index.
 * Indexing only reads paths it just discovered, into a local index — it never
 * serves them to an agent, so this does not widen the #527 leak surface. The
 * content-serving sinks must never pass this flag.
 *
 * @param projectRoot - The project root directory
 * @param filePath - The (relative or absolute) file path to validate
 * @param options.allowSymlinkEscape - Follow in-root symlinks out of the root
 *   (indexing read path only); defaults to the strict, leak-safe behavior.
 * @returns The resolved absolute path (realpath when it exists), or null if it
 *   escapes the root
 */
export declare function validatePathWithinRoot(projectRoot: string, filePath: string, options?: {
    allowSymlinkEscape?: boolean;
}): string | null;
/**
 * Validate that a path is a safe project root directory.
 *
 * Rejects sensitive system directories and ensures the path is
 * a real, existing directory. Used at MCP and API entry points
 * to prevent arbitrary directory access.
 *
 * @param dirPath - The path to validate
 * @returns An error message if invalid, or null if valid
 */
export declare function validateProjectPath(dirPath: string): string | null;
/**
 * Safely parse JSON with a fallback value.
 * Prevents crashes from corrupted database metadata.
 */
export declare function safeJsonParse<T>(value: string, fallback: T): T;
/**
 * Clamp a numeric value to a range.
 * Used to enforce sane limits on MCP tool inputs.
 */
export declare function clamp(value: number, min: number, max: number): number;
/**
 * Normalize a file path to use forward slashes.
 * Fixes Windows backslash paths so glob matching works consistently.
 */
export declare function normalizePath(filePath: string): string;
/**
 * Cross-process file lock using a lock file with PID tracking.
 *
 * Prevents multiple processes (e.g., git hooks, CLI, MCP server) from
 * writing to the same database simultaneously.
 */
export declare class FileLock {
    private lockPath;
    private held;
    /** Locks older than this are considered stale regardless of PID status */
    private static readonly STALE_TIMEOUT_MS;
    constructor(lockPath: string);
    /**
     * Acquire the lock. Throws if the lock is held by another live process.
     */
    acquire(): void;
    /**
     * Release the lock
     */
    release(): void;
    /**
     * Execute a function while holding the lock
     */
    withLock<T>(fn: () => T): T;
    /**
     * Execute an async function while holding the lock
     */
    withLockAsync<T>(fn: () => Promise<T>): Promise<T>;
    /**
     * Check if a process is still running
     */
    private isProcessAlive;
}
/**
 * Process items in batches to manage memory
 *
 * @param items - Array of items to process
 * @param batchSize - Number of items per batch
 * @param processor - Function to process each item
 * @param onBatchComplete - Optional callback after each batch
 * @returns Array of results
 */
export declare function processInBatches<T, R>(items: T[], batchSize: number, processor: (item: T, index: number) => Promise<R>, onBatchComplete?: (completed: number, total: number) => void): Promise<R[]>;
/**
 * Simple mutex lock for preventing concurrent operations
 */
export declare class Mutex {
    private locked;
    private waitQueue;
    /**
     * Acquire the lock
     *
     * @returns A release function to call when done
     */
    acquire(): Promise<() => void>;
    /**
     * Execute a function while holding the lock
     */
    withLock<T>(fn: () => Promise<T> | T): Promise<T>;
    /**
     * Check if the lock is currently held
     */
    isLocked(): boolean;
}
/**
 * Chunked file reader for large files
 *
 * Reads a file in chunks to avoid loading entire file into memory.
 */
export declare function readFileInChunks(filePath: string, chunkSize?: number): AsyncGenerator<string, void, undefined>;
/**
 * Debounce a function
 *
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export declare function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): (...args: Parameters<T>) => void;
/**
 * Throttle a function
 *
 * @param fn - Function to throttle
 * @param limit - Minimum time between calls in milliseconds
 * @returns Throttled function
 */
export declare function throttle<T extends (...args: unknown[]) => unknown>(fn: T, limit: number): (...args: Parameters<T>) => void;
/**
 * Estimate memory usage of an object (rough approximation)
 *
 * @param obj - Object to measure
 * @returns Approximate size in bytes
 */
export declare function estimateSize(obj: unknown): number;
/**
 * Memory monitor for tracking usage during operations
 */
export declare class MemoryMonitor {
    private checkInterval;
    private peakUsage;
    private threshold;
    private onThresholdExceeded?;
    constructor(thresholdMB?: number, onThresholdExceeded?: (usage: number) => void);
    /**
     * Start monitoring memory usage
     */
    start(intervalMs?: number): void;
    /**
     * Stop monitoring
     */
    stop(): void;
    /**
     * Get peak memory usage in bytes
     */
    getPeakUsage(): number;
    /**
     * Get current memory usage in bytes
     */
    getCurrentUsage(): number;
}
//# sourceMappingURL=utils.d.ts.map