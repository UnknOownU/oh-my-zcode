/**
 * Identifier-segment utilities for the prompt hook's graph-derived gate
 * (name_segment_vocab): symbol names split into the words a human would use
 * for them in prose, and prompt prose normalized into candidate words to look
 * those segments up with.
 *
 * "OrderStateMachine" → order / state / machine — so the French prompt
 * "comment marche la state machine des commandes ?" (or any language's prose
 * naming the concept in Latin script) can be verified against the graph
 * without a keyword list ever knowing the words. The FTS index can't serve
 * this — its tokenizer keeps camelCase names as single tokens — which is why
 * segments are materialized at index time instead (see schema.sql,
 * name_segment_vocab).
 */
/**
 * Split a symbol or file name into lowercase word segments.
 *
 * Handles camelCase / PascalCase (inner lower→Upper), acronym runs
 * ("HTMLParser" → html/parser), snake_case / kebab-case / dotted file names
 * (non-alphanumerics separate), and keeps digits glued to their word
 * ("base64Encode" → base64/encode). Digit-only fragments are dropped.
 */
export declare function splitIdentifierSegments(name: string): string[];
/**
 * Normalize a prose word for segment lookup: lowercase + strip diacritics
 * (NFD, drop combining marks), so "références" matches the segment
 * "references" and "résolution" matches "resolution". Identifier segments are
 * overwhelmingly ASCII, so this is what buys Latin-script languages their
 * cross-lingual reach on loanwords.
 */
export declare function normalizeProseWord(word: string): string;
/**
 * Candidate words from a prompt for segment-vocabulary lookup, in order of
 * appearance: Unicode letter/digit runs, normalized via
 * {@link normalizeProseWord}, length-bounded, digit-only dropped,
 * {@link ENGLISH_PROSE_STOPWORDS} dropped, deduped, capped. Everything that
 * survives is judged per-repo by the rarity and co-occurrence rules in
 * CodeGraph.getSegmentMatches — there is no domain-word list.
 */
export declare function extractProseCandidates(prompt: string): string[];
/**
 * Lookup variants for a prose word: the word itself plus light plural folding
 * ("services" → service, "dependencies" → dependencie/dependency is NOT
 * attempted — only a trailing s/es strip), so common plurals still hit their
 * singular segment. Returned variants map back to the same original word.
 *
 * The strips are keyed on English plural spelling (#1145), in three classes:
 * - UNAMBIGUOUS `-es` (after x/sh/ss/zz: boxes, hashes, classes, quizzes) —
 *   strip 2 only. Stripping 1 minted a bogus sibling ("classes" → classe).
 * - AMBIGUOUS endings (`-ches`/`-ses`/`-zes`/`-oes`): spelling alone can't
 *   split patches(+es) from caches(+s), lenses from databases, heroes from
 *   shoes — emit BOTH candidate keys and let the vocab lookup decide; a miss
 *   is an ignored key, a wrong exclusive guess would LOSE the real match.
 * - Everything else ending in `-s` — a bare `-s` plural (services, machines,
 *   cookies): strip 1 only. Stripping 2 minted "services" → servic.
 * A trailing `-ss` is a singular (class, process), not a plural: no strip —
 * that used to mint "class" → clas.
 */
export declare function segmentLookupVariants(word: string): string[];
//# sourceMappingURL=identifier-segments.d.ts.map