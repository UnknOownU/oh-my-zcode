#!/usr/bin/env node
/**
 * CodeGraph CLI
 *
 * Command-line interface for CodeGraph code intelligence.
 *
 * Usage:
 *   codegraph                    Run interactive installer (when no args)
 *   codegraph install            Run interactive installer
 *   codegraph uninstall          Remove CodeGraph from your agents
 *   codegraph init [path]        Initialize CodeGraph in a project
 *   codegraph uninit [path]      Remove CodeGraph from a project
 *   codegraph index [path]       Index all files in the project
 *   codegraph sync [path]        Sync changes since last index
 *   codegraph status [path]      Show index status
 *   codegraph query <search>     Search for symbols
 *   codegraph files [options]    Show project file structure
 *   codegraph context <task>     Build context for a task
 *   codegraph callers <symbol>   Find what calls a function/method
 *   codegraph callees <symbol>   Find what a function/method calls
 *   codegraph impact <symbol>    Analyze what code is affected by changing a symbol
 *   codegraph affected [files]   Find test files affected by changes
 *   codegraph upgrade [version]  Update CodeGraph to the latest release
 */
import '../mcp/early-ppid';
//# sourceMappingURL=codegraph.d.ts.map