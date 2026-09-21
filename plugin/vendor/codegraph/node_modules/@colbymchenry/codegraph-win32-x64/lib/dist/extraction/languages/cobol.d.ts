/**
 * COBOL Language Extractor
 *
 * COBOL's AST (vendored, patched build of yutaro-sakamoto/tree-sitter-cobol)
 * is fundamentally different from block-structured languages, so extraction
 * runs almost entirely through the custom visitNode hook (the Pascal pattern):
 *
 * - A program (PROGRAM-ID) becomes a `module` node.
 * - PROCEDURE DIVISION sections and paragraphs become `function` nodes. The
 *   grammar emits them FLAT — a section_header/paragraph_header followed by
 *   sibling statements — so extents are reconstructed here: a paragraph runs
 *   from its header to the next header, a section to the next section header.
 * - PERFORM (including THRU ranges), GO TO, and CALL 'literal' become `calls`
 *   references. A dynamic CALL through a data name is skipped — announce,
 *   don't guess. EXEC CICS LINK/XCTL PROGRAM('X') with a literal target also
 *   becomes a `calls` reference; EXEC SQL INCLUDE X becomes an `imports`
 *   reference (DB2's COPY).
 * - COPY statements become `import` nodes + `imports` references.
 * - DATA DIVISION entries become `variable` (01/77 levels), `field` (nested
 *   levels, contained in their group item), or `constant` (88-level condition
 *   names) nodes, so impact queries on working-storage names work.
 * - Standalone copybooks (.cpy) parse via the grammar's copybook_fragment
 *   entry point: data copybooks yield their record structure, procedure
 *   copybooks yield paragraphs.
 *
 * The grammar is fixed-format (code area columns 8-72). preParse detects a
 * free-format file (division header or level number starting before column 8)
 * and indents every line by 7 spaces: line numbers are preserved, columns
 * drift by 7 — acceptable for line-oriented consumers.
 */
import type { LanguageExtractor } from '../tree-sitter-types';
export declare const cobolExtractor: LanguageExtractor;
//# sourceMappingURL=cobol.d.ts.map