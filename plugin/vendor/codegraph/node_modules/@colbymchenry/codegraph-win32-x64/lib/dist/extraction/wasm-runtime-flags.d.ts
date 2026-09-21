/**
 * The V8 flag(s) that keep tree-sitter grammar compilation off the turboshaft
 * optimizing tier. Single source of truth: the relaunch guard and the test
 * suite both read this (a test asserts each is a real flag on the running
 * runtime, so a rename can't silently regress the fix).
 */
export declare const WASM_RUNTIME_FLAGS: readonly string[];
/**
 * Node CLI options (not V8 flags) passed alongside the WASM flags on every
 * launch path. `--disable-warning=ExperimentalWarning` mutes node:sqlite's
 * "SQLite is an experimental feature" warning, which is emitted once per
 * THREAD — the main process plus every parse worker — so during indexing it
 * prints repeatedly, interleaved with the progress UI. Node options apply
 * process-wide (workers inherit them), so the command line covers everything.
 *
 * Deliberately NOT part of the {@link processHasWasmRuntimeFlags} re-exec
 * gate: a launcher passing only the WASM flags (an older installed bundle
 * running a newer dist) must not trigger a whole re-exec over a cosmetic
 * warning.
 */
export declare function nodeRuntimeFlagsFor(nodeVersion: string): readonly string[];
export declare const NODE_RUNTIME_FLAGS: readonly string[];
/**
 * Env var carrying the *host* PID (the relauncher's own parent) across the
 * re-exec. Without `--liftoff-only` the CLI re-execs itself once, inserting an
 * intermediate process between the MCP host and the server. That intermediate
 * stays alive (blocked in spawnSync) even after the host is killed, so the
 * server's PPID watchdog can't detect the host's death by watching its own
 * `process.ppid`. Passing the host PID through lets the watchdog poll it
 * directly. Unset on the no-re-exec path (bundled launcher / flag already
 * present), where the server is already a direct child of the host. See
 * src/mcp/index.ts (#277).
 */
export declare const HOST_PPID_ENV = "CODEGRAPH_HOST_PPID";
/** True when every required WASM runtime flag is already present in `execArgv`. */
export declare function processHasWasmRuntimeFlags(execArgv?: readonly string[]): boolean;
/**
 * Build the argv for re-execing node with the WASM runtime flags: our flags
 * first, then any node flags already in `execArgv` (deduped), then the script
 * and its args. Pure — exported for unit testing.
 */
export declare function buildRelaunchArgv(scriptPath: string, scriptArgs: readonly string[], execArgv?: readonly string[]): string[];
/**
 * If the current process is missing the WASM runtime flags, re-exec it once
 * with them and exit with the child's status. No-op when the flags are already
 * present (the normal bundled-launcher path), when already relaunched, or when
 * disabled via CODEGRAPH_NO_RELAUNCH.
 *
 * On spawn failure, returns so the caller runs in-process anyway — risking the
 * OOM is still better than refusing to start.
 */
export declare function relaunchWithWasmRuntimeFlagsIfNeeded(scriptPath: string): void;
//# sourceMappingURL=wasm-runtime-flags.d.ts.map