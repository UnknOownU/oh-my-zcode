/**
 * Context Builder
 *
 * Builds rich context for tasks by combining FTS search with graph traversal.
 * Outputs structured context ready to inject into Claude.
 */
import { Subgraph, TaskContext, TaskInput, BuildContextOptions, FindRelevantContextOptions } from '../types';
import { QueryBuilder } from '../db/queries';
import { GraphTraverser } from '../graph';
export { LOW_CONFIDENCE_MARKER } from './markers';
/**
 * Context Builder
 *
 * Coordinates semantic search and graph traversal to build
 * comprehensive context for tasks.
 */
export declare class ContextBuilder {
    private projectRoot;
    private queries;
    private traverser;
    constructor(projectRoot: string, queries: QueryBuilder, traverser: GraphTraverser);
    /**
     * Build context for a task
     *
     * Pipeline:
     * 1. Parse task input (string or {title, description})
     * 2. Run semantic search to find entry points
     * 3. Expand graph around entry points
     * 4. Extract code blocks for key nodes
     * 5. Format output for Claude
     *
     * @param input - Task description or object with title/description
     * @param options - Build options
     * @returns TaskContext (structured) or formatted string
     */
    buildContext(input: TaskInput, options?: BuildContextOptions): Promise<TaskContext | string>;
    /**
     * Honest handoff appended when retrieval confidence is low (the query matched
     * mostly common words). Instead of the usual "this covers the surface" framing
     * — which, when wrong, sends the agent off to Read/Grep — it admits the
     * uncertainty and routes the agent to the precise tools (explore with real
     * symbol names, search, or files to browse the closest areas we *did* surface).
     */
    private buildLowConfidenceNote;
    /**
     * Surface short call-paths among the symbols this context already found,
     * derived in-memory from the subgraph's `calls` edges (no extra queries).
     *
     * This bakes the value of path-finding INTO the always-loaded `context` tool.
     * Agents reliably read context's output but do NOT discover/adopt a standalone
     * trace tool (in deferred-MCP harnesses they only ToolSearch-select tools they
     * already know). Delivering the flow here means "how does X reach Y" is
     * answered without the agent needing to find, load, or choose a new tool.
     * Chains stop where the static call graph ends (e.g. dynamic dispatch) — that
     * truncation is honest, and the agent can codegraph_node the last hop to bridge.
     */
    private buildCallPathsSection;
    /**
     * Find relevant subgraph for a query
     *
     * Uses hybrid search combining exact symbol lookup with semantic search:
     * 1. Extract potential symbol names from query
     * 2. Look up exact matches for those symbols (high confidence)
     * 3. Use semantic search for concept matching
     * 4. Merge results, prioritizing exact matches
     * 5. Traverse graph from entry points
     *
     * @param query - Natural language query
     * @param options - Search and traversal options
     * @returns Subgraph of relevant nodes and edges
     */
    findRelevantContext(query: string, options?: FindRelevantContextOptions): Promise<Subgraph>;
    /**
     * Get the source code for a node
     *
     * Reads the file and extracts the code between startLine and endLine.
     *
     * @param nodeId - ID of the node
     * @returns Code string or null if not found
     */
    getCode(nodeId: string): Promise<string | null>;
    /**
     * Extract code from a node's source file
     */
    private extractNodeCode;
    /**
     * Get entry points from a subgraph (the root nodes)
     */
    private getEntryPoints;
    /**
     * Extract code blocks for key nodes in the subgraph
     */
    private extractCodeBlocks;
    /**
     * Get unique files from a subgraph
     */
    private getRelatedFiles;
    /**
     * Generate a summary of the context
     */
    private generateSummary;
    /**
     * Resolve import/export nodes to their actual definitions
     *
     * When search returns `import { TerminalPanel }`, users want the TerminalPanel
     * class definition, not the import statement. This follows the `imports` edge
     * to find and return the actual definition instead.
     *
     * @param results - Search results that may include import/export nodes
     * @returns Results with imports resolved to definitions where possible
     */
    private resolveImportsToDefinitions;
}
/**
 * Create a context builder
 */
export declare function createContextBuilder(projectRoot: string, queries: QueryBuilder, traverser: GraphTraverser): ContextBuilder;
export { formatContextAsMarkdown, formatContextAsJson } from './formatter';
//# sourceMappingURL=index.d.ts.map