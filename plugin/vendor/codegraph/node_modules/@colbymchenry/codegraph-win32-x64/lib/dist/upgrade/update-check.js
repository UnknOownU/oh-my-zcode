"use strict";
/**
 * Background update-availability check for long-lived servers (#1243).
 *
 * The recommended MCP config launches the LOCAL `codegraph` binary, so the
 * server (and the prompt hook alongside it) silently stays on whatever version
 * was last manually upgraded — users discover the drift only when something
 * breaks. This module gives the running server *visibility* without changing
 * behavior: a non-blocking check against the latest GitHub release, surfaced
 * as a one-line notice (stderr log, MCP initialize instructions, and
 * `codegraph_status`) telling the user to run `codegraph upgrade`.
 *
 * Invariants (mirrors the telemetry module's contract):
 *   - Never stdout — stdio is the MCP protocol channel.
 *   - Never blocking: the network refresh is fire-and-forget; every reader
 *     (`getUpdateNotice`) is a cheap synchronous cache read, so the #172
 *     respond-fast handshake contract holds.
 *   - Fail silent: offline / rate-limited / disk-full all degrade to "no
 *     notice", never an error, never a retry loop.
 *   - Off is off: `CODEGRAPH_NO_UPDATE_CHECK` (dedicated) or `DO_NOT_TRACK`
 *     (broad don't-phone-home convention — set by e.g. the Pro container's
 *     data plane) suppresses the network call AND the notice entirely.
 *
 * The check itself reuses `resolveLatestVersion` — the GitHub release-redirect
 * trick with the API fallback — so version resolution can't drift from what
 * `codegraph upgrade` installs. Results are cached in `~/.codegraph/` (the
 * same global state dir telemetry and the daemon registry use) with a 24h TTL
 * on success and a 1h backoff after failure, shared across every proxy /
 * daemon process on the machine.
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
exports.UPDATE_CHECK_FAILURE_BACKOFF_MS = exports.UPDATE_CHECK_TTL_MS = void 0;
exports.updateCheckDisabled = updateCheckDisabled;
exports.updateCheckCachePath = updateCheckCachePath;
exports.readUpdateCheckCache = readUpdateCheckCache;
exports.canonicalVersionTag = canonicalVersionTag;
exports.formatUpdateNotice = formatUpdateNotice;
exports.refreshUpdateCheck = refreshUpdateCheck;
exports.getUpdateNotice = getUpdateNotice;
exports.resetUpdateNoticeMemo = resetUpdateNoticeMemo;
exports.checkForUpdateInBackground = checkForUpdateInBackground;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const index_1 = require("./index");
const version_1 = require("../mcp/version");
/** Re-check the release feed after this long (successful checks). */
exports.UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;
/** Back off this long after a failed check (offline, rate-limited). */
exports.UPDATE_CHECK_FAILURE_BACKOFF_MS = 60 * 60 * 1000;
/** Short network budget — the refresh is background work, not a handshake. */
const UPDATE_CHECK_NETWORK_TIMEOUT_MS = 5000;
function resolveDeps(deps = {}) {
    return {
        dir: deps.dir ?? path.join(os.homedir(), '.codegraph'),
        env: deps.env ?? process.env,
        now: deps.now ?? Date.now,
        resolveLatest: deps.resolveLatest ?? (() => (0, index_1.resolveLatestVersion)(undefined, UPDATE_CHECK_NETWORK_TIMEOUT_MS)),
        currentVersion: deps.currentVersion ?? version_1.CodeGraphPackageVersion,
    };
}
function envTruthy(raw) {
    return raw !== undefined && raw !== '' && raw !== '0' && raw.toLowerCase() !== 'false';
}
/**
 * True when the update check must not run at all — no network call, no
 * notice. `DO_NOT_TRACK` uses the same truthiness the telemetry opt-out does.
 */
function updateCheckDisabled(env = process.env) {
    return envTruthy(env.CODEGRAPH_NO_UPDATE_CHECK) || envTruthy(env.DO_NOT_TRACK);
}
function updateCheckCachePath(dir) {
    return path.join(dir, 'update-check.json');
}
function readUpdateCheckCache(dir) {
    try {
        const raw = fs.readFileSync(updateCheckCachePath(dir), 'utf8');
        const parsed = JSON.parse(raw);
        if (typeof parsed?.lastAttemptAt !== 'number')
            return null;
        return parsed;
    }
    catch {
        return null; // missing / torn / unparseable — same as no cache
    }
}
function writeUpdateCheckCache(dir, cache) {
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(updateCheckCachePath(dir), JSON.stringify(cache));
    }
    catch {
        /* fail silent — a read-only home dir must not break the server */
    }
}
/**
 * Rebuild a canonical `vX.Y.Z[-pre]` tag from the PARSED semver fields, or
 * null when the input isn't version-shaped. The notice ends up inside the MCP
 * initialize instructions — agent-visible, system-prompt-adjacent text — and
 * the `latest` value arrives from a network redirect via an on-disk cache, so
 * only a reconstructed canonical string may ever be interpolated, never the
 * raw value. (`parseSemver`'s regex is not end-anchored: a value like
 * `1.2.3-x <arbitrary text>` parses "valid" while the raw string would carry
 * the trailing text straight into every session's instructions.)
 */
function canonicalVersionTag(v) {
    const s = (0, index_1.parseSemver)(v);
    if (!s)
        return null;
    return `v${s.major}.${s.minor}.${s.patch}${s.pre ? `-${s.pre}` : ''}`;
}
/** One user-facing sentence; every surface (stderr, instructions, status) shows this. */
function formatUpdateNotice(current, latest) {
    return (`CodeGraph ${latest} is available (this server is running ` +
        `${current}). Update with \`codegraph upgrade\`.`);
}
function noticeFrom(cache, d) {
    if (!cache?.latest)
        return null;
    // A dev build whose package.json couldn't be read reports the sentinel
    // version; any comparison against it would always claim an update.
    if (d.currentVersion === '0.0.0-unknown')
        return null;
    // Canonicalize BOTH sides before comparing or rendering — a non-semver
    // `latest` (garbage redirect, tampered cache) yields no notice at all
    // rather than flowing into agent-visible text.
    const latest = canonicalVersionTag(cache.latest);
    const current = canonicalVersionTag(d.currentVersion);
    if (!latest || !current)
        return null;
    return (0, index_1.isUpdateAvailable)(current, latest) ? formatUpdateNotice(current, latest) : null;
}
function cacheIsFresh(cache, nowMs) {
    if (!cache)
        return false;
    if (cache.lastSuccessAt !== undefined && nowMs - cache.lastSuccessAt < exports.UPDATE_CHECK_TTL_MS) {
        return true;
    }
    // No recent success: only the failure backoff holds the network call off.
    return nowMs - cache.lastAttemptAt < exports.UPDATE_CHECK_FAILURE_BACKOFF_MS;
}
/**
 * Ensure the on-disk cache is fresh (hitting the network only past the TTL /
 * backoff) and return the current notice, or null. Never throws.
 */
async function refreshUpdateCheck(deps = {}) {
    const d = resolveDeps(deps);
    if (updateCheckDisabled(d.env))
        return null;
    const cached = readUpdateCheckCache(d.dir);
    const nowMs = d.now();
    if (cacheIsFresh(cached, nowMs))
        return noticeFrom(cached, d);
    try {
        const latest = canonicalVersionTag(await d.resolveLatest());
        // A response that isn't version-shaped is a failure, not a result —
        // fall through to the backoff path and keep the previous known-good tag.
        if (!latest)
            throw new Error('release feed returned a non-version tag');
        const next = { lastAttemptAt: nowMs, lastSuccessAt: nowMs, latest };
        writeUpdateCheckCache(d.dir, next);
        return noticeFrom(next, d);
    }
    catch {
        // Record the attempt (starts the backoff) but KEEP the previous latest —
        // a transient outage must not hide an already-known update.
        const next = {
            lastAttemptAt: nowMs,
            lastSuccessAt: cached?.lastSuccessAt,
            latest: cached?.latest,
        };
        writeUpdateCheckCache(d.dir, next);
        return noticeFrom(next, d);
    }
}
// Per-process memo so the sync read path (MCP initialize, codegraph_status)
// touches the disk at most once a minute, not once per handshake.
const NOTICE_MEMO_TTL_MS = 60 * 1000;
let noticeMemo = null;
/**
 * The current update notice from the on-disk cache — synchronous and cheap
 * (memoized disk read), safe on the initialize respond-fast path. When the
 * cache has gone stale (e.g. a daemon that has been up for weeks), kicks a
 * background refresh so the NEXT reader sees a current answer; this call
 * still returns immediately from the stale cache.
 */
function getUpdateNotice(deps = {}) {
    const d = resolveDeps(deps);
    if (updateCheckDisabled(d.env))
        return null;
    const useMemo = deps.dir === undefined && deps.now === undefined;
    const nowMs = d.now();
    if (useMemo && noticeMemo && nowMs - noticeMemo.at < NOTICE_MEMO_TTL_MS) {
        return noticeMemo.value;
    }
    const cached = readUpdateCheckCache(d.dir);
    if (!cacheIsFresh(cached, nowMs)) {
        void refreshUpdateCheck(deps).catch(() => { });
    }
    const value = noticeFrom(cached, d);
    if (useMemo)
        noticeMemo = { at: nowMs, value };
    return value;
}
/** Test hook: clear the per-process memo. */
function resetUpdateNoticeMemo() {
    noticeMemo = null;
}
/**
 * Fire-and-forget entry point for server startup: refresh the cache in the
 * background and, if an update is available, emit ONE stderr line (stderr is
 * the MCP-safe channel; hosts surface it in their server logs). Never throws,
 * never blocks, never writes stdout.
 */
function checkForUpdateInBackground(deps = {}, log = (line) => process.stderr.write(line)) {
    refreshUpdateCheck(deps)
        .then((notice) => {
        // The shared notice sentence starts with "CodeGraph …"; drop the word
        // after the log tag so the line doesn't read "[CodeGraph] CodeGraph …".
        if (notice)
            log(`[CodeGraph] ${notice.replace(/^CodeGraph /, '')}\n`);
    })
        .catch(() => { });
}
//# sourceMappingURL=update-check.js.map