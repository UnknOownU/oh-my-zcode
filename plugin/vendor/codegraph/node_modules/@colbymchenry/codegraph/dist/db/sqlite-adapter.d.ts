/**
 * SQLite Adapter
 *
 * Thin wrapper over Node's built-in `node:sqlite` (`DatabaseSync`), exposed
 * through a small better-sqlite3-shaped interface so the rest of the codebase
 * is storage-agnostic.
 *
 * CodeGraph ships with a bundled Node runtime, so `node:sqlite` (real SQLite,
 * with WAL + FTS5) is always available — there is no native build step and no
 * wasm fallback. When run from source instead, it requires Node >= 22.5.
 */
export interface SqliteStatement {
    run(...params: any[]): {
        changes: number;
        lastInsertRowid: number | bigint;
    };
    get(...params: any[]): any;
    all(...params: any[]): any[];
    /**
     * Lazily yield result rows one at a time instead of materializing the whole
     * set with `all()`. Use for unbounded scans (e.g. every function/method node)
     * so memory stays O(1) in the row count rather than O(rows) — see #610, where
     * `all()`-ing every symbol on a dense project spiked the heap into an OOM.
     */
    iterate(...params: any[]): IterableIterator<any>;
}
export interface SqliteDatabase {
    prepare(sql: string): SqliteStatement;
    exec(sql: string): void;
    pragma(str: string, options?: {
        simple?: boolean;
    }): any;
    transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T;
    close(): void;
    readonly open: boolean;
}
/**
 * The active SQLite backend. Only one now (`node:sqlite`); kept as a named type
 * so `codegraph status` and the per-instance reporting have a stable shape.
 */
export type SqliteBackend = 'node-sqlite';
/**
 * Create a database connection backed by `node:sqlite`.
 *
 * Returns the active backend alongside the db so each `DatabaseConnection` can
 * report it per-instance — MCP can open multiple project DBs in one process, so
 * a process-global would race.
 */
export declare function createDatabase(dbPath: string, opts?: {
    readOnly?: boolean;
}): {
    db: SqliteDatabase;
    backend: SqliteBackend;
};
//# sourceMappingURL=sqlite-adapter.d.ts.map