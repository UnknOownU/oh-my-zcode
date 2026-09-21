/**
 * Tree-sitter Shared Helpers
 *
 * Utility functions used by the core TreeSitterExtractor and per-language extractors.
 * Extracted to a leaf module to avoid circular imports between tree-sitter.ts and languages/.
 */
import { Node as SyntaxNode } from 'web-tree-sitter';
import { NodeKind } from '../types';
/**
 * Generate a unique node ID
 *
 * Uses a 32-character (128-bit) hash to avoid collisions when indexing
 * large codebases with many files containing similar symbols.
 */
export declare function generateNodeId(filePath: string, kind: NodeKind, name: string, line: number): string;
/**
 * Extract text from a syntax node
 */
export declare function getNodeText(node: SyntaxNode, source: string): string;
/**
 * Find a child node by field name
 */
export declare function getChildByField(node: SyntaxNode, fieldName: string): SyntaxNode | null;
/**
 * Get the docstring/comment preceding a node
 */
export declare function getPrecedingDocstring(node: SyntaxNode, source: string): string | undefined;
//# sourceMappingURL=tree-sitter-helpers.d.ts.map