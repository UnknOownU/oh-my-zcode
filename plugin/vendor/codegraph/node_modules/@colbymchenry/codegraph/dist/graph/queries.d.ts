/**
 * Graph Query Functions
 *
 * Higher-level query functions built on top of traversal algorithms.
 */
import { Node, Context, Subgraph } from '../types';
import { QueryBuilder } from '../db/queries';
import { GraphTraverser } from './traversal';
/**
 * Graph query manager for complex queries
 */
export declare class GraphQueryManager {
    private queries;
    private traverser;
    constructor(queries: QueryBuilder);
    /**
     * Get full context for a node
     *
     * Returns the focal node along with its ancestors, children,
     * and both incoming and outgoing references.
     *
     * @param nodeId - ID of the focal node
     * @returns Context object with all related information
     */
    getContext(nodeId: string): Context;
    /**
     * Get dependencies of a file
     *
     * Returns all files that this file imports from.
     *
     * @param filePath - Path to the file
     * @returns Array of file paths this file depends on
     */
    getFileDependencies(filePath: string): string[];
    /**
     * Get dependents of a file
     *
     * Returns all files that import from this file.
     *
     * @param filePath - Path to the file
     * @returns Array of file paths that depend on this file
     */
    getFileDependents(filePath: string): string[];
    /**
     * Get all symbols exported by a file
     *
     * @param filePath - Path to the file
     * @returns Array of exported nodes
     */
    getExportedSymbols(filePath: string): Node[];
    /**
     * Find symbols by qualified name pattern
     *
     * @param pattern - Pattern to match (supports * wildcard)
     * @returns Array of matching nodes
     */
    findByQualifiedName(pattern: string): Node[];
    /**
     * Get the module/package structure
     *
     * Returns a tree structure of files organized by directory.
     *
     * @returns Map of directory paths to contained files
     */
    getModuleStructure(): Map<string, string[]>;
    /**
     * Find circular dependencies in the graph
     *
     * @returns Array of cycles, each cycle is an array of node IDs
     */
    findCircularDependencies(): string[][];
    /**
     * Get complexity metrics for a node
     *
     * @param nodeId - ID of the node
     * @returns Object containing various complexity metrics
     */
    getNodeMetrics(nodeId: string): {
        incomingEdgeCount: number;
        outgoingEdgeCount: number;
        callCount: number;
        callerCount: number;
        childCount: number;
        depth: number;
    };
    /**
     * Find dead code (nodes with no incoming references)
     *
     * @param kinds - Node kinds to check (default: functions, methods, classes)
     * @returns Array of unreferenced nodes
     */
    findDeadCode(kinds?: Node['kind'][]): Node[];
    /**
     * Get subgraph containing nodes matching a filter
     *
     * @param filter - Filter function to select nodes
     * @param includeEdges - Whether to include edges between matching nodes
     * @returns Subgraph containing matching nodes
     */
    getFilteredSubgraph(filter: (node: Node) => boolean, includeEdges?: boolean): Subgraph;
    /**
     * Access the underlying traverser for direct traversal operations
     */
    getTraverser(): GraphTraverser;
}
//# sourceMappingURL=queries.d.ts.map