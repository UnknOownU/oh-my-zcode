"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDatabase = createDatabase;
/**
 * Wraps Node's built-in `node:sqlite` (`DatabaseSync`) to match the
 * better-sqlite3 interface the rest of the code expects.
 *
 * node:sqlite is real SQLite compiled into Node, so it supports WAL, FTS5,
 * mmap, and `@named` params natively — the only shims needed are the
 * better-sqlite3 conveniences node:sqlite omits: a `.pragma()` helper, a
 * `.transaction()` helper, and `open` (node:sqlite exposes `isOpen`).
 */
class NodeSqliteAdapter {
    _db;
    _txDepth = 0;
    constructor(dbPath, opts) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { DatabaseSync } = require('node:sqlite');
        this._db = opts?.readOnly ? new DatabaseSync(dbPath, { readOnly: true }) : new DatabaseSync(dbPath);
    }
    get open() {
        return this._db.isOpen;
    }
    prepare(sql) {
        // node:sqlite matches better-sqlite3's calling convention (variadic
        // positional args, or a single object for @named params), so params forward
        // through unchanged.
        const stmt = this._db.prepare(sql);
        return {
            run(...params) {
                const r = stmt.run(...params);
                return {
                    changes: Number(r?.changes ?? 0),
                    lastInsertRowid: r?.lastInsertRowid ?? 0,
                };
            },
            get(...params) {
                return stmt.get(...params);
            },
            all(...params) {
                return stmt.all(...params);
            },
            iterate(...params) {
                return stmt.iterate(...params);
            },
        };
    }
    exec(sql) {
        this._db.exec(sql);
    }
    pragma(str, options) {
        const trimmed = str.trim();
        // Write pragma ("key = value"): node:sqlite is real SQLite, so every pragma
        // (WAL, mmap, synchronous, …) applies as-is.
        if (trimmed.includes('=')) {
            this._db.exec(`PRAGMA ${trimmed}`);
            return;
        }
        // Read pragma. Default: the row object (e.g. { journal_mode: 'wal' }).
        // `{ simple: true }` returns just the single column value, like better-sqlite3.
        const row = this._db.prepare(`PRAGMA ${trimmed}`).get();
        if (options?.simple) {
            return row && typeof row === 'object' ? Object.values(row)[0] : row;
        }
        return row;
    }
    transaction(fn) {
        return (...args) => {
            // Nested call (a transaction()-wrapped helper invoked from inside another
            // transaction): run the body directly inside the enclosing transaction.
            // BEGIN would throw "cannot start a transaction within a transaction",
            // so no existing caller ever relied on nested rollback granularity —
            // flattening is behavior-preserving and free.
            if (this._txDepth > 0) {
                this._txDepth++;
                try {
                    return fn(...args);
                }
                finally {
                    this._txDepth--;
                }
            }
            this._db.exec('BEGIN');
            this._txDepth = 1;
            try {
                const result = fn(...args);
                this._db.exec('COMMIT');
                this._txDepth = 0;
                return result;
            }
            catch (error) {
                this._db.exec('ROLLBACK');
                this._txDepth = 0;
                throw error;
            }
        };
    }
    close() {
        // node:sqlite's DatabaseSync.close() throws if already closed; make it
        // idempotent to match better-sqlite3 (callers may close more than once).
        if (this._db.isOpen)
            this._db.close();
    }
}
/**
 * Create a database connection backed by `node:sqlite`.
 *
 * Returns the active backend alongside the db so each `DatabaseConnection` can
 * report it per-instance — MCP can open multiple project DBs in one process, so
 * a process-global would race.
 */
function createDatabase(dbPath, opts) {
    try {
        return { db: new NodeSqliteAdapter(dbPath, opts), backend: 'node-sqlite' };
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error('Failed to open SQLite via the built-in node:sqlite module.\n' +
            'CodeGraph requires node:sqlite (Node.js 22.5+). Install the self-contained\n' +
            'CodeGraph release (it bundles a compatible Node), or run on Node 22.5+.\n' +
            `Underlying error: ${msg}`);
    }
}
//# sourceMappingURL=sqlite-adapter.js.map