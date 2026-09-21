import { ExtractionResult } from '../types';
/**
 * Custom extractor for Delphi DFM/FMX form files.
 *
 * DFM/FMX files describe the visual component hierarchy and event handler
 * bindings. They use a simple text format (object/end blocks) that we parse
 * with regex — no tree-sitter grammar exists for this format.
 *
 * Extracted information:
 * - Components as NodeKind `component`
 * - Nesting as EdgeKind `contains`
 * - Event handlers (OnClick = MethodName) as UnresolvedReference → EdgeKind `references`
 */
export declare class DfmExtractor {
    private filePath;
    private source;
    private nodes;
    private edges;
    private unresolvedReferences;
    private errors;
    constructor(filePath: string, source: string);
    /**
     * Extract components and event handler references from DFM/FMX source
     */
    extract(): ExtractionResult;
    /** Create a file node for the DFM form file */
    private createFileNode;
    /** Parse object/end blocks and extract components + event handlers */
    private parseComponents;
}
//# sourceMappingURL=dfm-extractor.d.ts.map