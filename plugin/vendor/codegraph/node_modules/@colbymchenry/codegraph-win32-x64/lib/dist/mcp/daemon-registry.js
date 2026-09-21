"use strict";
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
exports.getRegistryDir = getRegistryDir;
exports.isProcessAlive = isProcessAlive;
exports.registerDaemon = registerDaemon;
exports.deregisterDaemon = deregisterDaemon;
exports.listDaemons = listDaemons;
exports.stopDaemonAt = stopDaemonAt;
exports.stopAllDaemons = stopAllDaemons;
/**
 * Global daemon registry + stop/list control — the discovery layer behind
 * `codegraph list` and `codegraph stop [--all]`.
 *
 * Every per-project daemon already writes an authoritative lockfile at
 * `<root>/.codegraph/daemon.pid`. That's enough to stop ONE daemon you can name,
 * but there's no central place to find them ALL — which `list` and `stop --all`
 * need. So each daemon also drops a tiny record under `~/.codegraph/daemons/` on
 * start and removes it on graceful shutdown.
 *
 * The registry is a DISCOVERY index, never a source of truth: the live pid is.
 * A SIGKILL'd daemon can't remove its own record, so readers prune any record
 * whose pid is dead (`isProcessAlive`). Every write/read is best-effort — a
 * registry hiccup must never break the daemon or a command; worst case `list`
 * momentarily misses or over-lists one, which the next liveness prune corrects.
 *
 * Cross-platform by construction: only files + `process.kill(pid, signal)`,
 * which behave consistently on macOS/Linux (real signals) and Windows (mapped to
 * TerminateProcess). Validated live on all three.
 */
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const daemon_paths_1 = require("./daemon-paths");
/**
 * `~/.codegraph/daemons` — GLOBAL, keyed off the home install dir. (The
 * `CODEGRAPH_DIR` env var only renames the per-project index dir, not this.)
 */
function getRegistryDir() {
    return path.join(os.homedir(), '.codegraph', 'daemons');
}
function recordPath(root) {
    const hash = crypto.createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16);
    return path.join(getRegistryDir(), `${hash}.json`);
}
/**
 * Is `pid` a live process? `kill(pid, 0)` sends no signal — it just probes:
 * ESRCH ⇒ dead, EPERM ⇒ alive but not ours (still alive). Same liveness check
 * the PPID watchdog (#277) and daemon lock arbitration use.
 */
function isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (err) {
        return err.code === 'EPERM';
    }
}
/** Best-effort: record this daemon so `list`/`stop --all` can find it. */
function registerDaemon(rec) {
    try {
        fs.mkdirSync(getRegistryDir(), { recursive: true });
        fs.writeFileSync(recordPath(rec.root), JSON.stringify(rec, null, 2) + '\n', { mode: 0o600 });
    }
    catch {
        /* best-effort — list's liveness prune tolerates a missing record */
    }
}
/** Best-effort: drop this daemon's record on graceful shutdown. */
function deregisterDaemon(root) {
    try {
        fs.unlinkSync(recordPath(root));
    }
    catch {
        /* already gone */
    }
}
/**
 * All registered daemons whose process is still alive, newest first. Dead/garbage
 * records are deleted as a side effect (self-healing) unless `prune` is false.
 */
function listDaemons(opts = {}) {
    const prune = opts.prune ?? true;
    const dir = getRegistryDir();
    let files;
    try {
        files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    }
    catch {
        return []; // no registry dir yet
    }
    const live = [];
    for (const file of files) {
        const full = path.join(dir, file);
        let rec = null;
        try {
            rec = JSON.parse(fs.readFileSync(full, 'utf8'));
        }
        catch {
            rec = null;
        }
        const valid = rec && typeof rec.pid === 'number' && typeof rec.root === 'string';
        if (valid && isProcessAlive(rec.pid)) {
            live.push(rec);
        }
        else if (prune) {
            try {
                fs.unlinkSync(full);
            }
            catch { /* ignore */ }
        }
    }
    return live.sort((a, b) => b.startedAt - a.startedAt);
}
/** Remove a stopped daemon's leftover lockfile + socket + registry record. */
function cleanupDaemonArtifacts(root) {
    try {
        fs.unlinkSync((0, daemon_paths_1.getDaemonPidPath)(root));
    }
    catch { /* gone */ }
    // POSIX sockets are real files; Windows named pipes vanish with the process.
    // Sweep every candidate — a daemon that relocated past an unusable in-project
    // FS (ExFAT/FAT; #997) left its socket at the tmpdir fallback, not candidate 0.
    if (process.platform !== 'win32') {
        for (const candidate of (0, daemon_paths_1.getDaemonSocketCandidates)(root)) {
            try {
                fs.unlinkSync(candidate);
            }
            catch { /* gone */ }
        }
    }
    deregisterDaemon(root);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForDeath(pid, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!isProcessAlive(pid))
            return true;
        await sleep(100);
    }
    return !isProcessAlive(pid);
}
/**
 * Stop the daemon serving `root`: SIGTERM, wait, then SIGKILL if it won't go,
 * then sweep its artifacts. `root` must be realpath'd (match how the daemon
 * keys its socket/lockfile). Resolves the pid from the authoritative lockfile,
 * falling back to the registry.
 */
async function stopDaemonAt(root) {
    let pid = null;
    try {
        const info = (0, daemon_paths_1.decodeLockInfo)(fs.readFileSync((0, daemon_paths_1.getDaemonPidPath)(root), 'utf8'));
        pid = info?.pid ?? null;
    }
    catch {
        /* no lockfile */
    }
    if (pid == null) {
        const rec = listDaemons({ prune: false }).find((r) => path.resolve(r.root) === path.resolve(root));
        pid = rec?.pid ?? null;
    }
    if (pid == null) {
        cleanupDaemonArtifacts(root);
        return { root, pid: null, outcome: 'no-daemon' };
    }
    if (!isProcessAlive(pid)) {
        cleanupDaemonArtifacts(root);
        return { root, pid, outcome: 'not-running' };
    }
    // POSIX: SIGTERM runs the daemon's graceful shutdown. Windows: TerminateProcess
    // (no graceful path), so we always sweep artifacts ourselves below.
    try {
        process.kill(pid, 'SIGTERM');
    }
    catch { /* raced to exit */ }
    let outcome = 'term';
    if (!(await waitForDeath(pid, 3000))) {
        try {
            process.kill(pid, 'SIGKILL');
        }
        catch { /* raced to exit */ }
        await waitForDeath(pid, 2000);
        outcome = 'kill';
    }
    cleanupDaemonArtifacts(root);
    return { root, pid, outcome };
}
/** Stop every registered, live daemon. */
async function stopAllDaemons() {
    const results = [];
    for (const rec of listDaemons()) {
        results.push(await stopDaemonAt(rec.root));
    }
    return results;
}
//# sourceMappingURL=daemon-registry.js.map