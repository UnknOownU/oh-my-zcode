"use strict";
/**
 * Daemon socket + lockfile path helpers — issue #411.
 *
 * One shared `codegraph serve --mcp` daemon per project root means we need a
 * stable, project-keyed rendezvous between cooperating processes. The IPC
 * surface area is just two file paths:
 *
 *   - `daemon.sock` — Unix domain socket / named pipe the daemon listens on.
 *   - `daemon.pid` — atomic-create lockfile holding the daemon's pid + version.
 *
 * Both live under `.codegraph/` so the project-scoped uninstall (`codegraph
 * uninit`) sweeps them up for free.
 *
 * Special-case: Unix domain socket paths have a hard length limit (~104 on
 * macOS, ~108 on Linux); when the in-project path exceeds it we fall back to
 * an absolute-path hash under `os.tmpdir()`. The pidfile always stays in the
 * project (it doesn't have a length limit) — and acts as the authoritative
 * pointer to the socket path the daemon chose.
 *
 * Second special-case (#997, #974): some filesystems can't host an AF_UNIX node
 * AT ALL — ExFAT/FAT external volumes, certain network mounts, WSL2 DrvFs — so
 * `listen()` throws ENOTSUP/EACCES regardless of path length. We can't cheaply
 * tell those apart from a normal volume up front, so instead of guessing we
 * expose an ORDERED candidate list (`getDaemonSocketCandidates`): the in-project
 * path first, the deterministic tmpdir path as the fallback of last resort. The
 * daemon binds the first that works (relocating past a capability error); the
 * proxy connects the first that answers. Both walk the SAME list, so they still
 * converge on whichever the daemon bound with zero coordination.
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
exports.getDaemonSocketCandidates = getDaemonSocketCandidates;
exports.getDaemonSocketPath = getDaemonSocketPath;
exports.getDaemonPidPath = getDaemonPidPath;
exports.encodeLockInfo = encodeLockInfo;
exports.decodeLockInfo = decodeLockInfo;
const crypto = __importStar(require("crypto"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const directory_1 = require("../directory");
/** Soft upper bound for in-project socket paths. */
const POSIX_SOCKET_PATH_LIMIT = 100;
/** Short stable identifier for a project root — used in tmpdir/pipe names. */
function projectHash(projectRoot) {
    return crypto.createHash('sha256').update(path.resolve(projectRoot)).digest('hex').slice(0, 16);
}
/**
 * The deterministic tmpdir socket path for `projectRoot` — the fallback used
 * when the in-project location can't host a socket (too long, or an FS that
 * doesn't support AF_UNIX). Hash keeps it project-scoped, and being purely a
 * function of the root means the daemon and the proxy compute the identical
 * path without talking to each other.
 */
function tmpdirSocketPath(projectRoot) {
    return path.join(os.tmpdir(), `codegraph-${projectHash(projectRoot)}.sock`);
}
/**
 * Ordered socket / named-pipe path candidates the daemon should try to bind (and
 * the proxy should try to connect) for `projectRoot`, most-preferred first.
 * Deterministic given a project root, so independent processes converge without
 * coordination — even when the preferred candidate is unusable and both fall
 * through to the same fallback.
 *
 *   - Windows: a single named pipe (lives in the kernel pipe namespace, not on
 *     the project FS, so neither the length nor the ExFAT hazard applies).
 *   - Short in-project path: `[ .codegraph/daemon.sock , <tmpdir> ]` — try the
 *     project first, fall back to tmpdir if its FS can't host a socket (#997).
 *   - Long in-project path (deep monorepos, Bazel out dirs): `[ <tmpdir> ]` only
 *     — bind would throw ENAMETOOLONG, so we skip straight to tmpdir.
 */
function getDaemonSocketCandidates(projectRoot) {
    if (process.platform === 'win32') {
        return [`\\\\.\\pipe\\codegraph-${projectHash(projectRoot)}`];
    }
    const inProject = path.join((0, directory_1.getCodeGraphDir)(projectRoot), 'daemon.sock');
    const tmp = tmpdirSocketPath(projectRoot);
    if (inProject.length > POSIX_SOCKET_PATH_LIMIT)
        return [tmp];
    return [inProject, tmp];
}
/**
 * The PREFERRED (primary) socket path — candidate 0. Use this only where a
 * single representative path is wanted (the lockfile's informational
 * `socketPath` field, status display). For binding/connecting, walk the full
 * {@link getDaemonSocketCandidates} list — the daemon may bind a fallback when
 * candidate 0 is unusable.
 */
function getDaemonSocketPath(projectRoot) {
    // The candidate list is never empty (≥1 on every platform), so [0] is safe.
    return getDaemonSocketCandidates(projectRoot)[0];
}
/** Absolute path to the daemon pid lockfile for `projectRoot`. */
function getDaemonPidPath(projectRoot) {
    return path.join((0, directory_1.getCodeGraphDir)(projectRoot), 'daemon.pid');
}
/**
 * Serialize a {@link DaemonLockInfo} for writing to the pidfile. JSON for
 * human readability — operators occasionally `cat` this when debugging.
 */
function encodeLockInfo(info) {
    return JSON.stringify(info, null, 2) + '\n';
}
/**
 * Parse a pidfile body. Tolerant of old-format pidfiles (plain decimal pid) so
 * a 0.10.x daemon doesn't trip over a 0.9.x lockfile if that ever happens —
 * we treat such a lockfile as "process is unknown version, refuse to share."
 */
function decodeLockInfo(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed &&
            typeof parsed.pid === 'number' &&
            typeof parsed.version === 'string' &&
            typeof parsed.socketPath === 'string' &&
            typeof parsed.startedAt === 'number') {
            return parsed;
        }
        return null;
    }
    catch {
        // Fall through to legacy plain-pid handling.
    }
    const pid = Number(trimmed);
    if (Number.isFinite(pid) && pid > 0) {
        return { pid, version: 'unknown', socketPath: '', startedAt: 0 };
    }
    return null;
}
//# sourceMappingURL=daemon-paths.js.map