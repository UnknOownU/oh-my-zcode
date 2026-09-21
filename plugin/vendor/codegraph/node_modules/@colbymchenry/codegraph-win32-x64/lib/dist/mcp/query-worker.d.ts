/**
 * Query worker thread — issue: concurrent MCP tool calls starve the daemon.
 *
 * The shared daemon serves every session on ONE event loop with synchronous
 * `node:sqlite`. `codegraph_explore` is CPU-heavy (FTS + RWR/personalized-
 * PageRank + impact + output building) stitched together by microtask `await`s,
 * so N concurrent explores keep the microtask queue continuously full and
 * starve the macrotask phases — timers AND socket I/O. The transport freezes:
 * no response flushes, no request is read, until the whole batch drains. With
 * ~10 subagents that routinely exceeds the MCP client's request timeout.
 *
 * This worker moves the heavy read-tool dispatch OFF the daemon's main loop.
 * Each worker owns its OWN read connection (node:sqlite WAL allows N concurrent
 * readers across connections — verified: a worker reader sees the main writer's
 * committed catch-up/watcher writes), so {@link QueryPool} runs N tool calls in
 * true parallel up to core count while the main loop stays free for the MCP
 * transport. The worker runs {@link ToolHandler.executeReadTool} — validation +
 * dispatch + error classification — and returns the raw {@link ToolResult}; the
 * MAIN thread keeps the catch-up gate, the watcher-state notices (staleness /
 * worktree), `codegraph_status`, and telemetry, none of which a watcher-less
 * read connection can answer.
 */
export {};
//# sourceMappingURL=query-worker.d.ts.map