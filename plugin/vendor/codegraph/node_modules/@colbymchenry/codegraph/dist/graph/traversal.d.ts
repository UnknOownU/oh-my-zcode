/**
 * Graph Traversal Algorithms
 *
 * BFS and DFS traversal for the code knowledge graph.
 */
import { Node, Edge, Subgraph, TraversalOptions, EdgeKind } from '../types';
import { QueryBuilder } from '../db/queries';
/**
 * Graph traverser for BFS and DFS traversal
 */
export declare class GraphTraverser {
    private queries;
    constructor(queries: QueryBuilder);
    /**
     * Traverse the graph using breadth-first search
     *
     * @param startId - Starting node ID
     * @param options - Traversal options
     * @returns Subgraph containing traversed nodes and edges
     */
    traverseBFS(startId: string, options?: TraversalOptions): Subgraph;
    /**
     * Traverse the graph using depth-first search
     *
     * @param startId - Starting node ID
     * @param options - Traversal options
     * @returns Subgraph containing traversed nodes and edges
     */
    traverseDFS(startId: string, options?: TraversalOptions): Subgraph;
    /**
     * Recursive DFS helper
     */
    private dfsRecursive;
    /**
     * Get adjacent edges based on direction
     */
    private getAdjacentEdges;
    /**
     * Find all callers of a function/method
     *
     * @param nodeId - ID of the function/method node
     * @param maxDepth - Maximum depth to traverse (default: 1)
     * @returns Array of nodes that call this function
     */
    getCallers(nodeId: string, maxDepth?: number): Array<{
        node: Node;
        edge: Edge;
    }>;
    private getCallersRecursive;
    /**
     * Find all functions/methods called by a function
     *
     * @param nodeId - ID of the function/method node
     * @param maxDepth - Maximum depth to traverse (default: 1)
     * @returns Array of nodes called by this function
     */
    getCallees(nodeId: string, maxDepth?: number): Array<{
        node: Node;
        edge: Edge;
    }>;
    private getCalleesRecursive;
    /**
     * Get the call graph for a function (both callers and callees)
     *
     * @param nodeId - ID of the function/method node
     * @param depth - Maximum depth in each direction (default: 2)
     * @returns Subgraph containing the call graph
     */
    getCallGraph(nodeId: string, depth?: number): Subgraph;
    /**
     * Get the type hierarchy for a class/interface
     *
     * @param nodeId - ID of the class/interface node
     * @returns Subgraph containing the type hierarchy
     */
    getTypeHierarchy(nodeId: string): Subgraph;
    private getTypeAncestors;
    private getTypeDescendants;
    /**
     * Find all usages of a symbol
     *
     * @param nodeId - ID of the symbol node
     * @returns Array of nodes and edges that reference this symbol
     */
    findUsages(nodeId: string): Array<{
        node: Node;
        edge: Edge;
    }>;
    /**
     * Calculate the impact radius of a node
     *
     * Returns all nodes that could be affected by changes to this node.
     *
     * @param nodeId - ID of the node
     * @param maxDepth - Maximum depth to traverse (default: 3)
     * @returns Subgraph containing potentially impacted nodes
     */
    getImpactRadius(nodeId: string, maxDepth?: number): Subgraph;
    private getImpactRecursive;
    /**
     * Find the shortest path between two nodes
     *
     * @param fromId - Starting node ID
     * @param toId - Target node ID
     * @param edgeKinds - Edge types to consider (all if empty)
     * @returns Array of nodes and edges forming the path, or null if no path exists
     */
    findPath(fromId: string, toId: string, edgeKinds?: EdgeKind[]): Array<{
        node: Node;
        edge: Edge | null;
    }> | null;
    /**
     * Get the containment hierarchy for a node (ancestors)
     *
     * @param nodeId - ID of the node
     * @returns Array of ancestor nodes from immediate parent to root
     */
    getAncestors(nodeId: string): Node[];
    /**
     * Get immediate children of a node
     *
     * @param nodeId - ID of the node
     * @returns Array of child nodes
     */
    getChildren(nodeId: string): Node[];
}
//# sourceMappingURL=traversal.d.ts.map