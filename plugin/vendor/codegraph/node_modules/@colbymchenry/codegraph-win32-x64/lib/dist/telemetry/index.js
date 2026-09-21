"use strict";
/**
 * Anonymous usage telemetry — client side.
 *
 * The contract for what may be collected lives in docs/design/telemetry.md
 * (and user-facing TELEMETRY.md); the ingest endpoint that enforces it is
 * public at telemetry-worker/. This module honors four invariants:
 *
 * 1. Zero hot-path cost: recording is an in-memory increment. Disk writes are
 *    a tiny synchronous append at process exit (works under `process.exit()`,
 *    where `beforeExit` never fires); network sends happen opportunistically
 *    (startup of long-running commands, daemon interval, bounded await at the
 *    end of install/init) and are fire-and-forget everywhere else.
 * 2. Zero stdout: stdio is the MCP protocol channel. Notices and debug output
 *    go to stderr only.
 * 3. Off is off: when disabled, nothing is recorded, nothing is sent, and no
 *    socket is opened — there is no "opted out" ping. Turning telemetry off
 *    also deletes any buffered, unsent data.
 * 4. Fail silent: offline, endpoint down, disk full — every failure mode is
 *    silence, never a retry loop, never an error surfaced to the user/agent.
 *
 * Usage counts aggregate locally into per-day rollups; only *completed* (UTC)
 * days are sent, so volume scales with active machines, not with tool calls.
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
exports.Telemetry = exports.TELEMETRY_DOCS = exports.TELEMETRY_ENDPOINT = void 0;
exports.bucketFileCount = bucketFileCount;
exports.bucketDuration = bucketDuration;
exports.recordIndexEvent = recordIndexEvent;
exports.getTelemetry = getTelemetry;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const crypto_1 = require("crypto");
exports.TELEMETRY_ENDPOINT = 'https://telemetry.getcodegraph.com/v1/events';
exports.TELEMETRY_DOCS = 'https://github.com/colbymchenry/codegraph/blob/main/TELEMETRY.md';
// v2: dropped the `sqlite_backend` field from the `index` event — node:sqlite is
// now the only backend (the better-sqlite3-native / wasm-fallback split is gone),
// so the value was a constant carrying no signal. See TELEMETRY.md.
const SCHEMA_VERSION = 2;
const MAX_BUFFER_BYTES = 256 * 1024;
const MAX_EVENTS_PER_REQUEST = 100;
const DEFAULT_FLUSH_TIMEOUT_MS = 1500;
/** A crashed sender's claimed file is merged back after this long. */
const STALE_CLAIM_MS = 60 * 60_000;
/** Coarse buckets — exact counts are deliberately not collected. */
function bucketFileCount(n) {
    if (n < 100)
        return '<100';
    if (n < 1000)
        return '100-1k';
    if (n < 10000)
        return '1k-10k';
    return '10k+';
}
function bucketDuration(ms) {
    if (ms < 10_000)
        return '<10s';
    if (ms < 60_000)
        return '10-60s';
    if (ms < 300_000)
        return '1-5m';
    return '5m+';
}
/**
 * Shared "a full index completed" event (CLI init/index + installer local
 * init): language names and coarse buckets only — never paths, file names,
 * or exact counts. Structurally typed so callers don't need engine imports.
 */
function recordIndexEvent(cg, result) {
    try {
        const languages = Object.entries(cg.getStats().filesByLanguage)
            .filter(([, count]) => count > 0)
            .map(([lang]) => lang);
        getTelemetry().recordLifecycle('index', {
            languages,
            file_count_bucket: bucketFileCount(result.filesIndexed),
            duration_bucket: bucketDuration(result.durationMs),
        });
    }
    catch {
        /* telemetry must never break indexing */
    }
}
// One process-level 'exit' listener for ALL instances (in practice: the
// singleton) — N instances must not mean N listeners on process.
const exitInstances = new Set();
let exitListenerRegistered = false;
function registerForExit(instance) {
    exitInstances.add(instance);
    if (!exitListenerRegistered) {
        exitListenerRegistered = true;
        // 'exit' fires under process.exit() too (unlike beforeExit); handlers must
        // be synchronous — persistSync is a single small file write.
        process.on('exit', () => {
            for (const i of exitInstances)
                i.persistSync();
        });
    }
}
class Telemetry {
    dir;
    fetchImpl;
    now;
    env;
    writeStderr;
    counts = new Map();
    events = [];
    installExitHook;
    exitHookInstalled = false;
    configCache; // undefined = not read yet
    intervalHandle = null;
    constructor(opts = {}) {
        this.dir = opts.dir ?? path.join(os.homedir(), '.codegraph');
        this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
        this.now = opts.now ?? (() => new Date());
        this.env = opts.env ?? process.env;
        this.writeStderr = opts.stderr ?? ((line) => process.stderr.write(line));
        this.installExitHook = opts.installExitHook ?? true;
    }
    // ---------------------------------------------------------------- consent
    get configPath() {
        return path.join(this.dir, 'telemetry.json');
    }
    get queuePath() {
        return path.join(this.dir, 'telemetry-queue.jsonl');
    }
    /**
     * Resolution order (first match wins) — keep in sync with TELEMETRY.md:
     * DO_NOT_TRACK=1 > CODEGRAPH_TELEMETRY=0|1 > stored config > default on.
     */
    getStatus() {
        const config = this.readConfig();
        const machineId = config?.machine_id ?? null;
        const dnt = this.env.DO_NOT_TRACK;
        if (dnt !== undefined && dnt !== '' && dnt !== '0' && dnt.toLowerCase() !== 'false') {
            return { enabled: false, decidedBy: 'DO_NOT_TRACK', machineId, configPath: this.configPath };
        }
        const forced = this.env.CODEGRAPH_TELEMETRY;
        if (forced !== undefined && forced !== '') {
            const on = forced !== '0' && forced.toLowerCase() !== 'false';
            return { enabled: on, decidedBy: 'CODEGRAPH_TELEMETRY', machineId, configPath: this.configPath };
        }
        if (config) {
            return { enabled: config.enabled, decidedBy: 'config', machineId, configPath: this.configPath };
        }
        return { enabled: true, decidedBy: 'default', machineId, configPath: this.configPath };
    }
    isEnabled() {
        return this.getStatus().enabled;
    }
    /**
     * Persist an explicit user choice (installer toggle or `codegraph
     * telemetry on|off`). Turning telemetry off also deletes any buffered,
     * unsent data — off means off.
     */
    setEnabled(enabled, source) {
        const existing = this.readConfig();
        this.writeConfig({
            enabled,
            machine_id: existing?.machine_id ?? (0, crypto_1.randomUUID)(),
            consent_source: source,
            first_run_notice_shown: true,
            updated_at: this.now().toISOString(),
        });
        if (!enabled) {
            try {
                fs.rmSync(this.queuePath, { force: true });
            }
            catch { /* fail silent */ }
        }
    }
    /** True once any consent decision (or the first-run notice) is on disk. */
    hasStoredChoice() {
        return this.readConfig() !== null;
    }
    // -------------------------------------------------------------- recording
    /** In-memory increment — safe on the MCP tool-call hot path. */
    recordUsage(kind, name, ok, client) {
        if (!this.isEnabled())
            return;
        const day = this.utcDay();
        const cn = client?.name?.slice(0, 64);
        const cv = client?.version?.slice(0, 32);
        const key = [day, kind, name, cn ?? '', cv ?? ''].join(' ');
        const line = this.counts.get(key);
        if (line) {
            line.c += 1;
            if (!ok)
                line.e += 1;
        }
        else {
            const fresh = { v: SCHEMA_VERSION, d: day, k: kind, n: name.slice(0, 64), c: 1, e: ok ? 0 : 1 };
            if (cn)
                fresh.cn = cn;
            if (cv)
                fresh.cv = cv;
            this.counts.set(key, fresh);
        }
        this.ensureExitHook();
    }
    /** install / index / uninstall — buffered like everything else. */
    recordLifecycle(event, props) {
        if (!this.isEnabled())
            return;
        this.events.push({ v: SCHEMA_VERSION, ev: event, ts: this.now().toISOString(), props });
        this.ensureExitHook();
    }
    // ---------------------------------------------------------------- sending
    /**
     * Fire-and-forget send of everything sendable. Never throws, never logs
     * above debug. Safe to call at startup of long-running commands.
     */
    maybeFlush() {
        void this.flushNow().catch(() => { });
    }
    /**
     * Drain in-memory state to the buffer, then send completed-day rollups and
     * lifecycle events. Bounded by `timeoutMs`; leftovers stay buffered for the
     * next process. Awaited only where latency is invisible (install/init).
     */
    async flushNow(timeoutMs = DEFAULT_FLUSH_TIMEOUT_MS) {
        if (!this.isEnabled())
            return;
        try {
            this.persistSync();
            this.recoverStaleClaims();
            const claim = this.claimQueue();
            if (!claim)
                return;
            const { claimPath, lines } = claim;
            const today = this.utcDay();
            const sendable = [];
            const keep = [];
            for (const line of lines) {
                if ('ev' in line)
                    sendable.push(line);
                else if (line.d < today)
                    sendable.push(line);
                else
                    keep.push(line);
            }
            let failed = [];
            if (sendable.length > 0) {
                // Consent gate: the one-time notice precedes the FIRST bytes that
                // ever leave the machine (and mints the machine id). Recording only
                // buffers locally, so it stays silent — this lets the installer show
                // its explicit consent toggle before any notice can fire, instead of
                // the preAction usage count pre-empting it. An explicit installer/CLI
                // choice sets first_run_notice_shown and suppresses this permanently.
                this.firstRunNotice();
                failed = await this.send(sendable, timeoutMs);
            }
            // Whatever didn't go out returns to the queue (append — writers may
            // have created a fresh queue file while we held the claim).
            const back = [...failed, ...keep];
            if (back.length > 0)
                this.appendLines(back);
            try {
                fs.rmSync(claimPath, { force: true });
            }
            catch { /* fail silent */ }
        }
        catch {
            /* fail silent */
        }
    }
    /**
     * Periodic flush for long-lived processes (MCP daemon / serve). Unref'd so
     * it never keeps the process alive.
     */
    startInterval(everyMs = 6 * 60 * 60_000) {
        if (this.intervalHandle || !this.isEnabled())
            return;
        this.maybeFlush();
        this.intervalHandle = setInterval(() => this.maybeFlush(), everyMs);
        this.intervalHandle.unref();
    }
    stopInterval() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }
    // -------------------------------------------------------------- internals
    utcDay() {
        return this.now().toISOString().slice(0, 10);
    }
    readConfig() {
        if (this.configCache !== undefined)
            return this.configCache;
        try {
            const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            this.configCache = typeof raw.machine_id === 'string' && typeof raw.enabled === 'boolean' ? raw : null;
        }
        catch {
            this.configCache = null;
        }
        return this.configCache;
    }
    writeConfig(config) {
        try {
            fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2) + '\n');
            this.configCache = config;
        }
        catch {
            /* fail silent */
        }
    }
    /**
     * Default-on consent is gated by a one-time stderr notice (interactive
     * installs record their choice explicitly and never reach this).
     */
    firstRunNotice() {
        const config = this.readConfig();
        if (config?.first_run_notice_shown)
            return;
        if (!config) {
            this.writeConfig({
                enabled: true,
                machine_id: (0, crypto_1.randomUUID)(),
                consent_source: 'default-notice',
                first_run_notice_shown: true,
                updated_at: this.now().toISOString(),
            });
        }
        else {
            this.writeConfig({ ...config, first_run_notice_shown: true, updated_at: this.now().toISOString() });
        }
        this.writeStderr(`codegraph collects anonymous usage stats (no code, paths, or names) — ` +
            `"codegraph telemetry off" or CODEGRAPH_TELEMETRY=0 disables. Details: ${exports.TELEMETRY_DOCS}\n`);
    }
    /**
     * Synchronous, tiny, exit-safe: drain in-memory deltas to the JSONL queue.
     * Runs on `process.on('exit')`, so it must never be async or slow.
     */
    persistSync() {
        if (this.counts.size === 0 && this.events.length === 0)
            return;
        const lines = [...this.counts.values(), ...this.events];
        this.counts.clear();
        this.events = [];
        // Re-check at persist time: `codegraph telemetry off` mid-process must not
        // have its own invocation resurrect the queue file at exit.
        if (!this.isEnabled())
            return;
        this.appendLines(lines);
    }
    appendLines(lines) {
        try {
            fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
            const payload = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
            // Cap the buffer: drop oldest lines first (telemetry is best-effort —
            // bounded disk use beats completeness).
            let existing = '';
            try {
                existing = fs.readFileSync(this.queuePath, 'utf8');
            }
            catch { /* no queue yet */ }
            let combined = existing + payload;
            if (combined.length > MAX_BUFFER_BYTES) {
                combined = combined.slice(combined.length - MAX_BUFFER_BYTES);
                combined = combined.slice(combined.indexOf('\n') + 1); // drop the partial first line
            }
            fs.writeFileSync(this.queuePath, combined);
        }
        catch {
            /* fail silent */
        }
    }
    /**
     * Atomically claim the queue for sending (rename). Concurrent processes
     * can't double-send; a crash mid-send leaves a claim file that
     * `recoverStaleClaims` merges back after an hour.
     */
    claimQueue() {
        const claimPath = path.join(this.dir, `telemetry-queue.sending.${process.pid}.jsonl`);
        try {
            fs.renameSync(this.queuePath, claimPath);
        }
        catch {
            return null; // no queue, or another process just claimed it
        }
        const lines = [];
        try {
            for (const raw of fs.readFileSync(claimPath, 'utf8').split('\n')) {
                if (!raw.trim())
                    continue;
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object' && parsed.v === SCHEMA_VERSION)
                        lines.push(parsed);
                }
                catch {
                    /* skip corrupt line */
                }
            }
        }
        catch {
            /* unreadable claim — treat as empty; file removed by caller */
        }
        return { claimPath, lines };
    }
    recoverStaleClaims() {
        try {
            const cutoff = this.now().getTime() - STALE_CLAIM_MS;
            for (const name of fs.readdirSync(this.dir)) {
                if (!name.startsWith('telemetry-queue.sending.'))
                    continue;
                const full = path.join(this.dir, name);
                try {
                    if (fs.statSync(full).mtimeMs < cutoff) {
                        const content = fs.readFileSync(full, 'utf8');
                        fs.rmSync(full, { force: true });
                        if (content.trim())
                            fs.appendFileSync(this.queuePath, content.endsWith('\n') ? content : content + '\n');
                    }
                }
                catch {
                    /* fail silent */
                }
            }
        }
        catch {
            /* fail silent */
        }
    }
    /** Returns the lines that did NOT make it out (to be re-queued). */
    async send(lines, timeoutMs) {
        const config = this.readConfig();
        if (!config)
            return [];
        const events = lines.map((line) => 'ev' in line
            ? { event: line.ev, ts: line.ts, props: line.props }
            : {
                event: 'usage_rollup',
                ts: `${line.d}T12:00:00.000Z`,
                props: {
                    kind: line.k,
                    name: line.n,
                    count: line.c,
                    error_count: line.e,
                    ...(line.cn ? { client_name: line.cn } : {}),
                    ...(line.cv ? { client_version: line.cv } : {}),
                },
            });
        const envelope = {
            machine_id: config.machine_id,
            codegraph_version: this.packageVersion(),
            os: process.platform,
            arch: process.arch,
            node_major: parseInt(process.versions.node.split('.')[0] ?? '0', 10),
            ci: this.env.CI !== undefined && this.env.CI !== '' && this.env.CI !== '0' && this.env.CI !== 'false',
            schema_version: SCHEMA_VERSION,
        };
        const endpoint = this.env.CODEGRAPH_TELEMETRY_ENDPOINT || exports.TELEMETRY_ENDPOINT;
        for (let i = 0; i < events.length; i += MAX_EVENTS_PER_REQUEST) {
            const chunk = events.slice(i, i + MAX_EVENTS_PER_REQUEST);
            const body = JSON.stringify({ ...envelope, events: chunk });
            this.debug(`POST ${endpoint} (${chunk.length} events)`);
            try {
                // Any response — 204, 4xx, anything — is final. No retries.
                await this.fetchImpl(endpoint, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body,
                    signal: AbortSignal.timeout(timeoutMs),
                });
            }
            catch (err) {
                this.debug(`send failed: ${String(err)}`);
                return lines.slice(i); // network failure: re-queue this chunk + the rest
            }
        }
        return [];
    }
    packageVersion() {
        try {
            // dist/telemetry/index.js → ../../package.json (same layout in src/ for tests via tsx)
            const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
            return pkg.version ?? '0.0.0';
        }
        catch {
            return '0.0.0';
        }
    }
    ensureExitHook() {
        if (this.exitHookInstalled || !this.installExitHook)
            return;
        this.exitHookInstalled = true;
        registerForExit(this);
    }
    debug(msg) {
        if (this.env.CODEGRAPH_TELEMETRY_DEBUG === '1') {
            this.writeStderr(`[codegraph telemetry] ${msg}\n`);
        }
    }
}
exports.Telemetry = Telemetry;
// Process-wide singleton — app code goes through this; tests construct their own.
let singleton = null;
function getTelemetry() {
    if (!singleton)
        singleton = new Telemetry();
    return singleton;
}
//# sourceMappingURL=index.js.map