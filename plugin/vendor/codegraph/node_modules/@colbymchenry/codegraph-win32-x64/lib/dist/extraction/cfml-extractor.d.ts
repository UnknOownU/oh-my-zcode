import { ExtractionResult, Language } from '../types';
/**
 * CfmlExtractor - Extracts code relationships from CFML source (.cfc/.cfm).
 *
 * tree-sitter-cfml splits CFML into two related grammars: `cfml` (tag-based —
 * `<cfcomponent>`/`<cffunction>`/HTML) and `cfscript` (modern bare-script
 * `component { ... }` syntax). The `cfml` grammar's own injections.scm treats
 * bare-script content as an opaque blob meant to be re-parsed by `cfscript` —
 * that re-parsing only happens at the editor/highlighting layer, not in the
 * raw AST, so this extractor replicates it: a file whose first real token
 * isn't `<` is delegated wholesale to the cfscript grammar (the dominant
 * modern style); otherwise the file is walked tag-by-tag with the cfml
 * grammar, delegating any `<cfscript>` tag bodies the same way.
 */
export declare class CfmlExtractor {
    private filePath;
    private source;
    private language;
    private nodes;
    private edges;
    private unresolvedReferences;
    private errors;
    /** `language` is the file's detected language — `'cfml'` for `.cfc`/`.cfm`, `'cfscript'` for `.cfs`. Both dialect-switch internally; this only controls the language tag stamped onto emitted nodes/refs. */
    constructor(filePath: string, source: string, language?: Language);
    extract(): ExtractionResult;
    /** Modern bare-script `.cfc`/`.cfm`: delegate the whole file to the cfscript grammar. */
    private extractBareScript;
    /** Legacy tag-based CFML: walk `<cfcomponent>`/`<cffunction>`, delegating `<cfscript>` bodies. */
    private extractTagBased;
    /** Build the file's own `kind:'file'` node, spanning the whole source. Tag-based files need this explicitly — unlike `extractBareScript` (which delegates the whole file to `TreeSitterExtractor` and inherits its file node), `extractTagBased` walks the tree itself and has no other source of one. */
    private createFileNode;
    /**
     * Walks `program`'s named children with a single forward cursor (not an
     * index loop) — `extractComponent` consumes a variable run of FOLLOWING
     * siblings as the component body (see its doc comment), so this must
     * resume from whatever it last consumed rather than revisiting those same
     * cffunction/cfscript siblings a second time as bogus top-level symbols.
     */
    private walkProgram;
    /**
     * `<cfcomponent extends="Base" implements="IFoo,IBar">...</cfcomponent>`.
     * The grammar's implicit-end-tag scanner means component body content
     * (cffunction tags, cfscript tags, etc.) appears as the open tag's FOLLOWING
     * siblings in `program`, not nested children — walk forward to the matching
     * cf_component_close_tag.
     */
    private extractComponent;
    /**
     * `<cffunction name="..." access="..." returntype="...">...</cffunction>`.
     * `parentClassId` decides `method` vs top-level `function`; `containerId` is
     * the `contains`-edge target (the class when inside one, otherwise the file
     * node for a bare top-level cffunction) — kept separate so a top-level
     * function still gets a containment edge without being misclassified as a
     * method of the file. A method's qualifiedName is scoped under
     * `parentClassName` (`TagService::save`, the same `Class::member` shape the
     * generic extractor produces) so type-validated method resolution can match.
     */
    private extractFunctionTag;
    /**
     * Recursively delegates any `cf_script_tag`/`cf_query_tag` found within
     * `node`'s subtree — e.g. a `<cfscript>`/`<cfquery>` nested inside
     * `<cfif>`/`<cfloop>`/`<cftry>` control-flow tags, which (unlike
     * `<cfcomponent>`'s body — see the implicit-end-tag note on `extractComponent`)
     * ARE normal children, just possibly several levels deep, so a direct-children
     * check misses them. Does not descend into a nested `cf_function_tag` — that
     * has its own scope and is walked separately. `parentClassName` rides along
     * so a `<cfscript>` at component scope classifies its functions as methods
     * scoped under the component.
     */
    private delegateNestedTags;
    /**
     * Delegate a `<cfscript>...</cfscript>` tag body to the cfscript grammar.
     * With `parentClassName` set (the block sits at component scope), functions
     * declared at the script's top level are the component's methods
     * (`<cfcomponent><cfscript>function configure(){}` — the standard ColdBox
     * ModuleConfig shape): they're re-kinded `function` → `method`, and every
     * merged symbol's qualifiedName is prefixed with the component scope
     * (`configure` → `ModuleConfig::configure`) so type-validated method
     * resolution can match them. Functions nested inside another function
     * (closures) keep kind `function`.
     */
    private delegateScriptTag;
    /**
     * Delegate a `<cfquery>...</cfquery>` tag's SQL body to the `cfquery` grammar.
     * `#hash#` expressions inside the SQL (e.g. `#getCurrentUser().getId()#` in a
     * WHERE clause) are real CFML calls/references — tree-sitter-cfml's `cfquery`
     * grammar parses them structurally (same `call_expression`/`member_expression`
     * shape as cfscript), so without this delegation they're silently dropped as
     * opaque SQL text. The grammar models no other symbols, so only call/reference
     * extraction is relevant here — unlike `delegateScriptTag`, there are no nodes
     * or contains-edges to merge.
     */
    private delegateQueryTag;
    /** Read a `cf_attribute`'s value by name from a tag node's direct `cf_attribute`/`cf_tag_attributes` children. */
    private tagAttr;
    private componentNameFromPath;
}
/**
 * Sniff whether CFML source is bare-script (`component { ... }`, modern style)
 * vs tag-based (`<cfcomponent>`, `<cfif>`, HTML). Skips a leading UTF-8 BOM
 * (endemic in CFML's Windows-editor history — 17% of ColdBox's files carry
 * one; both grammars parse fine with it once routed correctly), whitespace,
 * and `//`/`/* *\/` comments to find the first real token; tag-based files
 * start with `<`, script-based files don't.
 */
export declare function isBareScriptCfml(source: string): boolean;
//# sourceMappingURL=cfml-extractor.d.ts.map