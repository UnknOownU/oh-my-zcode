/**
 * Grammar Loading and Caching
 *
 * Uses web-tree-sitter (WASM) for universal cross-platform support.
 * Grammars are loaded lazily — only languages actually present in the project
 * are compiled, keeping V8 WASM memory pressure low on large codebases.
 */
import { Parser } from 'web-tree-sitter';
import { Language } from '../types';
export type GrammarLanguage = Exclude<Language, 'svelte' | 'vue' | 'astro' | 'liquid' | 'razor' | 'yaml' | 'twig' | 'xml' | 'properties' | 'unknown'>;
/**
 * File extension to Language mapping
 */
export declare const EXTENSION_MAP: Record<string, Language>;
/**
 * Whether a file is one CodeGraph can parse, based purely on its extension.
 * This is the single source of truth for "should we index this file" — derived
 * from EXTENSION_MAP so parser support and indexing selection never drift.
 *
 * `overrides` is the project's validated custom extension → language map (from
 * `codegraph.json`); when present its extensions count as indexable in addition
 * to the built-ins. Omitting it is byte-identical to the zero-config behavior.
 */
export declare function isSourceFile(filePath: string, overrides?: Record<string, Language>): boolean;
/**
 * Shopify OS 2.0 JSON template (`templates/*.json`) or section group
 * (`sections/*.json`) — these reference sections by `"type"`, so the Liquid
 * extractor links them. (config/ + locales/ JSON have no section refs.)
 */
export declare function isShopifyLiquidJson(filePath: string): boolean;
/**
 * OTP application resource file: `<app>.app.src` (checked into every rebar3/
 * erlang.mk app) or its compiled `<app>.app`. Erlang TERMS, not forms — the
 * grammar parses them as top-level expressions, and the Erlang extractor's
 * application-tuple handler turns `{mod, {Mod, _}}` and `{applications, […]}`
 * into entry-module and dependency edges. Routed by full suffix because the
 * last-dot extension (`.src`) is far too generic for EXTENSION_MAP.
 */
export declare function isErlangAppFile(filePath: string): boolean;
/**
 * Play Framework routes file: the extensionless `conf/routes` (and included
 * `conf/*.routes`). No grammar — route extraction is done by the Play framework
 * resolver, so it's processed through the no-grammar (`yaml`-style) path.
 */
export declare function isPlayRoutesFile(filePath: string): boolean;
/**
 * Initialize the tree-sitter WASM runtime. Must be called before loading grammars.
 * Does NOT load any grammar WASM files — use loadGrammarsForLanguages() for that.
 * Idempotent — safe to call multiple times.
 */
export declare function initGrammars(): Promise<void>;
/**
 * Pre-read the grammar WASM bytes for an index set, keyed by language. The
 * orchestrator reads each grammar ONCE and hands the bytes to every parse
 * worker via its `load-grammars` message, so worker spawns/respawns load
 * grammars from memory instead of re-reading them from disk — on slow storage
 * (HDD, issue #1231) each respawn's grammar re-read otherwise amplifies the
 * I/O contention that caused the respawn. Best-effort: a language whose WASM
 * can't be read here is simply omitted, and the worker falls back to its own
 * disk load (which surfaces the real error/warning path).
 */
export declare function readGrammarWasmBytes(languages: Language[]): Promise<Record<string, Uint8Array>>;
/**
 * Load grammar WASM files for specific languages only.
 * Skips languages that are already loaded or have no WASM grammar.
 * Must be called after initGrammars().
 *
 * `wasmBytes` (optional) holds pre-read grammar bytes keyed by language (from
 * {@link readGrammarWasmBytes}, forwarded through the parse pool); when a
 * language's bytes are present they're loaded from memory instead of disk.
 */
export declare function loadGrammarsForLanguages(languages: Language[], wasmBytes?: Record<string, Uint8Array>): Promise<void>;
/**
 * Load ALL grammar WASM files. Convenience function for tests and
 * backward compatibility. Prefer loadGrammarsForLanguages() in production.
 */
export declare function loadAllGrammars(): Promise<void>;
/**
 * Check if grammars have been initialized
 */
export declare function isGrammarsInitialized(): boolean;
/**
 * Get a parser for the specified language.
 * Returns synchronously from pre-loaded cache.
 */
export declare function getParser(language: Language): Parser | null;
/**
 * Detect language from file extension.
 *
 * `overrides` is the project's validated custom extension → language map (from
 * `codegraph.json`); when present its mappings take precedence over the built-in
 * `EXTENSION_MAP`. Omitting it is byte-identical to the zero-config behavior.
 */
export declare function detectLanguage(filePath: string, source?: string, overrides?: Record<string, Language>): Language;
/**
 * Check if a language is supported (has a grammar defined).
 * Returns true if the grammar exists, even if not yet loaded.
 */
export declare function isLanguageSupported(language: Language): boolean;
/**
 * Check if a grammar has been loaded and is ready for parsing.
 */
export declare function isGrammarLoaded(language: Language): boolean;
/**
 * Languages tracked at the file-record level only: parsing emits zero symbol
 * nodes, but the file is still stored (and framework resolvers may add per-file
 * references later, e.g. Drupal routing yml, Spring `@Value` against
 * application.properties). This is the canonical set behind the no-symbol
 * branch in `tree-sitter.ts`; `xml` is intentionally excluded because its
 * MyBatis extractor emits a file node. Callers use this to count such files as
 * indexed rather than skipped, so it must stay in sync with that branch.
 */
export declare function isFileLevelOnlyLanguage(language: Language): boolean;
/**
 * Get all supported languages (those with grammar definitions).
 */
export declare function getSupportedLanguages(): Language[];
/**
 * Reset the cached parser for a language to reclaim WASM heap memory.
 * The tree-sitter WASM runtime accumulates fragmented memory over thousands
 * of parses. Deleting and recreating the Parser instance forces the WASM
 * heap to reset, preventing "memory access out of bounds" crashes in
 * large repos.
 */
export declare function resetParser(language: Language): void;
/**
 * Clear parser/grammar caches (useful for testing)
 */
export declare function clearParserCache(): void;
/**
 * Report grammars that failed to load.
 */
export declare function getUnavailableGrammarErrors(): Partial<Record<Language, string>>;
/**
 * Get language display name
 */
export declare function getLanguageDisplayName(language: Language): string;
//# sourceMappingURL=grammars.d.ts.map