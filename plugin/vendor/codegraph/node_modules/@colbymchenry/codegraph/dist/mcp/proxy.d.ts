/**
 * MCP proxy mode — issue #411.
 *
 * The proxy is a near-transparent stdio↔socket pipe. Once it has verified
 * the daemon's hello line (same major.minor.patch as ours), it does no
 * protocol parsing of its own: every byte the MCP host writes to the proxy's
 * stdin goes straight to the daemon socket, and every byte the daemon emits
 * goes straight to the host's stdout. Server-initiated JSON-RPC requests
 * (e.g. `roots/list`) flow through the same pipe transparently.
 *
 * Lifecycle expectations:
 *   - The proxy exits when *either* stream closes (host stdin closed →
 *     daemon socket end, or daemon-side socket close → host stdout end).
 *   - Closing the socket on the proxy side is what tells the daemon to
 *     decrement its connected-clients refcount.
 *   - On a parent-process death we can't detect via stdin close (e.g. SIGKILL
 *     of the MCP host), the proxy's PPID watchdog catches it — same logic
 *     the direct-mode server uses; see issue #277.
 */
import * as net from 'net';
import { DaemonHello } from './daemon';
import type { MCPEngine } from './engine';
/**
 * Log a successful daemon attach — gated behind {@link LOG_ATTACH_ENV} so it is
 * silent by default (see #618). Exported for tests.
 */
export declare function logAttachedDaemon(socketPath: string, hello: DaemonHello): void;
export interface ProxyResult {
    /**
     * `proxied` — successfully attached to a same-version daemon and piped
     * stdio. The proxy stays alive until either end closes.
     * `fallback-needed` — the daemon rejected us (version mismatch / unreachable
     * socket) and the caller should run the server in direct mode.
     */
    outcome: 'proxied' | 'fallback-needed';
    reason?: string;
}
/**
 * Attempt to connect to the daemon at `socketPath` and pipe stdio through it.
 *
 * Returns a promise that resolves when either:
 *   - the connection succeeded and one of stdin/socket has now closed
 *     (after which the process should exit), or
 *   - the connection failed early enough that the caller can still fall
 *     back to direct mode.
 *
 * The `expectedVersion` param defaults to the package's own version — daemon
 * and proxy MUST match exactly. Mismatch resolves with
 * `outcome: 'fallback-needed'` so the caller can transparently start its own
 * server. (We accept the cost of two concurrent servers in this case as the
 * price of never silently running a stale daemon against newer client code.)
 */
export declare function runProxy(socketPath: string, expectedVersion?: string): Promise<ProxyResult>;
/**
 * Connect to a daemon at `socketPath` and verify its hello (exact version match).
 * Returns the live socket (hello already consumed) or null if unreachable / stale
 * / version-mismatched. Unlike {@link runProxy} it does NOT pipe — the caller
 * owns the socket. Used by the local-handshake proxy's background connect.
 */
export declare function connectWithHello(socketPath: string, expectedVersion?: string): Promise<net.Socket | 'version-mismatch' | null>;
/** Dependencies the local-handshake proxy needs, injected by MCPServer (which
 *  owns the daemon-spawn machinery and the engine factory). */
export interface LocalHandshakeDeps {
    /** Probe → spawn → retry → hello-verify; resolves a connected daemon socket,
     *  or null when the daemon path is genuinely unavailable (→ in-process fallback). */
    getDaemonSocket(): Promise<net.Socket | null>;
    /** Lazily create an in-process engine — used ONLY if the daemon never comes up,
     *  preserving the "a broken daemon never wedges a session" guarantee. */
    makeEngine(): MCPEngine;
    /** Project root for the fallback engine's lazy init. */
    root: string;
}
/**
 * Local-handshake proxy (the cold-start fix).
 *
 * Answers `initialize` + `tools/list` from STATIC constants the instant the
 * client asks — tools register in ~process-startup time instead of waiting
 * ~600ms for the daemon to spawn+bind, which is what produced the "No such tool
 * available" race that made headless agents flail into grep/Read. Tool CALLS are
 * forwarded to the shared daemon (connected in the background); the daemon's
 * response to the forwarded `initialize` is suppressed (the client already got
 * the local one). If the daemon never comes up (version mismatch / spawn fail),
 * a lazily-created in-process engine serves the calls — so the handshake speedup
 * never costs the old fall-back-to-direct robustness.
 */
export declare function runLocalHandshakeProxy(deps: LocalHandshakeDeps): Promise<void>;
//# sourceMappingURL=proxy.d.ts.map