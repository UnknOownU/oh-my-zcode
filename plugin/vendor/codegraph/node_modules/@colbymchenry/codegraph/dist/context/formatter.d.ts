/**
 * Context Formatter
 *
 * Formats TaskContext as markdown or JSON for consumption by Claude.
 */
import { Node, TaskContext, Subgraph } from '../types';
/**
 * Format context as markdown
 *
 * Creates a compact markdown document optimized for Claude with minimal context usage:
 * - Brief summary
 * - Entry points with locations
 * - Code blocks only for key symbols
 */
export declare function formatContextAsMarkdown(context: TaskContext): string;
/**
 * Format context as JSON
 *
 * Returns a structured JSON representation suitable for programmatic use.
 */
export declare function formatContextAsJson(context: TaskContext): string;
/**
 * Format a subgraph as an ASCII tree structure
 */
export declare function formatSubgraphTree(subgraph: Subgraph, entryPoints: Node[]): string;
/**
 * Format bytes as human-readable string
 */
export declare function formatBytes(bytes: number): string;
//# sourceMappingURL=formatter.d.ts.map