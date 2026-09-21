/**
 * MCP JSON-RPC Transports
 *
 * Two flavors share the same wire format (newline-delimited JSON-RPC 2.0):
 *
 * - `StdioTransport` — original transport; reads/writes the process's
 *   stdin/stdout. Used by direct-mode MCP servers.
 * - `SocketTransport` — wraps a single `net.Socket`. Used by the shared-daemon
 *   architecture (see {@link ./daemon}) to multiplex multiple MCP clients onto
 *   one CodeGraph instance via per-connection sessions.
 *
 * Both implement {@link JsonRpcTransport} so the session-level protocol logic
 * (initialize / tools/list / tools/call, plus server-initiated `roots/list`)
 * is identical regardless of where the bytes come from.
 */
import type { Socket } from 'net';
/**
 * JSON-RPC 2.0 Request
 */
export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: unknown;
}
/**
 * JSON-RPC 2.0 Response
 */
export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: unknown;
    error?: JsonRpcError;
}
/**
 * JSON-RPC 2.0 Error
 */
export interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}
/**
 * JSON-RPC 2.0 Notification (no id, no response expected)
 */
export interface JsonRpcNotification {
    jsonrpc: '2.0';
    method: string;
    params?: unknown;
}
export declare const ErrorCodes: {
    readonly ParseError: -32700;
    readonly InvalidRequest: -32600;
    readonly MethodNotFound: -32601;
    readonly InvalidParams: -32602;
    readonly InternalError: -32603;
};
export type MessageHandler = (message: JsonRpcRequest | JsonRpcNotification) => Promise<void>;
/**
 * Generic JSON-RPC transport interface — common surface for stdio and socket
 * carriers. Anything below the session layer (initialize, tool dispatch, etc.)
 * talks to this, not to a concrete transport class.
 */
export interface JsonRpcTransport {
    start(handler: MessageHandler): void;
    stop(): void;
    send(response: JsonRpcResponse): void;
    notify(method: string, params?: unknown): void;
    request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>;
    sendResult(id: string | number, result: unknown): void;
    sendError(id: string | number | null, code: number, message: string, data?: unknown): void;
}
/**
 * Shared implementation of newline-delimited JSON-RPC 2.0 over any
 * `Readable`/`Writable` stream pair. Stdio and socket transports both wrap
 * this — the only difference between them is which streams get plugged in
 * and how a "close" propagates back to the owning code.
 */
declare abstract class LineBasedJsonRpcTransport implements JsonRpcTransport {
    protected messageHandler: MessageHandler | null;
    protected pending: Map<string | number, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
    }>;
    protected nextRequestId: number;
    protected stopped: boolean;
    abstract start(handler: MessageHandler): void;
    protected abstract write(line: string): void;
    protected abstract idPrefix(): string;
    abstract stop(): void;
    /**
     * Send a server-initiated request to the client and await its response.
     *
     * MCP is bidirectional: the server can ask the client questions too. We use
     * this for `roots/list` — the spec-blessed way to learn the workspace root
     * when the client didn't pass one in `initialize` (see issue #196). Rejects
     * on timeout so callers can fall back rather than hang forever.
     */
    request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>;
    send(response: JsonRpcResponse): void;
    notify(method: string, params?: unknown): void;
    sendResult(id: string | number, result: unknown): void;
    sendError(id: string | number | null, code: number, message: string, data?: unknown): void;
    /**
     * Fail any in-flight server-initiated requests so their awaiters don't hang.
     * Called from `stop()` in subclasses.
     */
    protected rejectPending(reason: string): void;
    /**
     * Handle an incoming line of JSON. Both transports feed lines here.
     */
    protected handleLine(line: string): Promise<void>;
    /**
     * Resolve (or reject) the pending server-initiated request matching this
     * response's id. Unknown ids are ignored — the client may echo something we
     * never sent, or a request may have already timed out.
     */
    private handleResponse;
    /**
     * Check if message is a valid JSON-RPC 2.0 message
     */
    private isValidMessage;
}
export interface StdioTransportOptions {
    /**
     * If true, the transport calls `process.exit(0)` when stdin closes. Set to
     * `false` in shared-daemon mode where the stdio "session" is just *one* of
     * many clients — losing it shouldn't drag the daemon down. The default
     * (true) matches the original single-process behavior callers rely on.
     */
    exitOnClose?: boolean;
    /**
     * Optional callback fired when the stdin stream closes. The daemon uses
     * this to decrement its connected-clients refcount.
     */
    onClose?: () => void;
}
/**
 * Stdio Transport for MCP
 *
 * Reads JSON-RPC messages from stdin and writes responses to stdout. Used by
 * the direct (single-process) MCP server path, where the MCP host launches
 * one server per session and talks to it over the child's stdio. Also used by
 * shared-daemon mode for the launcher's session (with `exitOnClose: false`)
 * so the daemon outlives its launcher.
 */
export declare class StdioTransport extends LineBasedJsonRpcTransport {
    private rl;
    private opts;
    constructor(opts?: StdioTransportOptions);
    start(handler: MessageHandler): void;
    stop(): void;
    protected write(line: string): void;
    protected idPrefix(): string;
}
/**
 * Socket Transport for MCP daemon sessions.
 *
 * Wraps a single `net.Socket` (Unix domain socket on POSIX, named pipe on
 * Windows). One instance per connected MCP client. Unlike {@link StdioTransport},
 * `stop()` and stream-close *don't* call `process.exit` — a daemon-side session
 * ending must not bring down the whole daemon.
 */
export declare class SocketTransport extends LineBasedJsonRpcTransport {
    private socket;
    private prefix;
    private buffer;
    private closeHandlers;
    constructor(socket: Socket, prefix?: string);
    /**
     * Register a callback fired exactly once when the socket closes (from either
     * side). Used by the daemon to decrement its connected-clients refcount.
     */
    onClose(handler: () => void): void;
    start(handler: MessageHandler): void;
    stop(): void;
    /**
     * Write a one-shot line directly to the socket (no JSON-RPC framing applied
     * by this class — caller produces the line). The daemon uses this for the
     * hello/handshake line that precedes the JSON-RPC stream.
     */
    writeRaw(line: string): void;
    protected write(line: string): void;
    protected idPrefix(): string;
    private handleSocketClose;
}
export {};
//# sourceMappingURL=transport.d.ts.map