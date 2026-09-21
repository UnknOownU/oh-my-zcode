import { ExtractionResult } from '../types';
/**
 * MyBatisExtractor — parses MyBatis mapper XML files.
 *
 * MyBatis splits a DAO interface across two files: a Java interface (parsed by
 * tree-sitter) declares the method, and an XML mapper file holds the SQL keyed
 * by `<namespace>` (the fully-qualified Java type name) and `id` (the method
 * name). Without the XML side in the graph, `trace(Controller, ...DAO.method)`
 * dead-ends at the interface method — the SQL it actually runs is invisible,
 * and "what does this query touch" / "where is this column written" can't be
 * answered.
 *
 * This extractor emits one method-shaped node per `<select|insert|update|
 * delete>` and per `<sql>` fragment, qualified as `<namespace>::<id>` so the
 * MyBatis framework synthesizer can link the matching Java method → XML
 * statement by suffix-matching qualified names. `<include refid="...">` inside
 * a statement yields an unresolved reference to the SQL fragment, also keyed
 * by `<namespace>::<refid>`.
 *
 * Both dialects are covered: MyBatis 3 `<mapper namespace="...">` and the
 * legacy iBatis 2 `<sqlMap>` (namespaced, or namespace-less with `Map.stmt`
 * ids, plus its extra `<statement>`/`<procedure>` verbs). Attribute values may
 * use either quote style, and statements commented out with `<!-- ... -->` are
 * ignored (see the constructor's comment-stripping pre-pass).
 *
 * Non-mapper XML (Maven `pom.xml`, Spring beans XML, `web.xml`, log4j config,
 * etc.) is detected by the absence of a `<mapper namespace="...">` /
 * `<sqlMap>` root and returns just a file node — we still need the file row so
 * the watcher can track it, but we emit no symbols.
 */
export declare class MyBatisExtractor {
    private filePath;
    private source;
    private nodes;
    private edges;
    private unresolvedReferences;
    private errors;
    private lineStarts;
    constructor(filePath: string, source: string);
    private static stripXmlComments;
    extract(): ExtractionResult;
    private createFileNode;
    /**
     * Find the mapper root and its dialect. Two shapes are recognized:
     *   - MyBatis 3: `<mapper namespace="com.foo.Bar">` — namespace required.
     *   - iBatis 2:  `<sqlMap namespace="Account">`, or a namespace-less
     *     `<sqlMap>` whose statement ids carry the qualifier as `Map.statement`.
     * Returns the namespace, the dialect, and the byte offsets of the body
     * (between the opening and closing tag) so statement extraction is scoped to
     * the root's contents. Either quote style is accepted for the namespace
     * (`namespace='X'` is legal XML and common in older mappers).
     */
    private findMapperRoot;
    private extractMapper;
    private buildSignature;
    /**
     * Build the `<namespace>::<id>` qualified name the MyBatis synthesizer
     * suffix-matches against a Java `<Class>::<method>`, and the display name.
     * For a namespace-less iBatis `<sqlMap>`, the statement id carries the
     * qualifier as `Map.statement`, so split on the last dot to reach the same
     * shape (`Account.getById` → `Account::getById`, name `getById`).
     */
    private qualifyStatement;
    private previewSql;
    private computeLineStarts;
    private getLineNumber;
}
//# sourceMappingURL=mybatis-extractor.d.ts.map