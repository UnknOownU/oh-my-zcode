/**
 * Import Resolver
 *
 * Resolves import paths to actual files and symbols.
 */
import { Language } from '../types';
import { UnresolvedRef, ResolvedRef, ResolutionContext, ImportMapping, ReExport } from './types';
export declare function isNixPathImportRef(ref: UnresolvedRef): boolean;
/** Drop the per-context memo tables (see ReferenceResolver.clearCaches). */
export declare function clearImportResolverMemos(context: ResolutionContext): void;
export declare function resolveImportPath(importPath: string, fromFile: string, language: Language, context: ResolutionContext): string | null;
/**
 * Clear the C/C++ include directory cache (call between indexing runs)
 */
export declare function clearCppIncludeDirCache(): void;
/**
 * Discover C/C++ include search directories for a project.
 *
 * Strategy:
 * 1. Look for compile_commands.json (Clang compilation database) in the
 *    project root and common build subdirectories. Parse -I and -isystem
 *    flags from compiler commands.
 * 2. If no compilation database is found, probe for common convention
 *    directories (include/, src/, lib/, api/) and top-level directories
 *    containing .h/.hpp files.
 *
 * Returns paths relative to projectRoot.
 */
export declare function loadCppIncludeDirs(projectRoot: string): string[];
/**
 * Is this reference a PHP include/require PATH (vs a namespace `use` symbol)?
 *
 * include/require emit a file path ("lib.php", "inc/db.php", "../x.php"),
 * whereas namespace use is an FQN (App\Foo\Bar) or a bare class symbol
 * (Closure). PHP identifiers contain neither '/' nor '.', so a slash or dot
 * marks a path-shaped include. Such references resolve to files only — never
 * to a same-named symbol — so callers must not fall back to the name-matcher.
 */
export declare function isPhpIncludePathRef(ref: UnresolvedRef): boolean;
/**
 * Is this a COBOL COPY / EXEC SQL INCLUDE copybook reference? These resolve
 * to files only (or stay unresolved for compiler-supplied members) — never
 * to a same-named symbol via the name-matcher.
 */
export declare function isCobolCopybookRef(ref: UnresolvedRef): boolean;
/**
 * Extract import mappings from a file
 */
export declare function extractImportMappings(_filePath: string, content: string, language: Language): ImportMapping[];
/**
 * Clear the import mapping cache (call between indexing runs)
 */
export declare function clearImportMappingCache(): void;
/**
 * Extract JS/TS re-export declarations from `content`.
 *
 * Recognised forms:
 *   export { foo } from './a';
 *   export { foo as bar } from './a';
 *   export * from './a';
 *   export * as ns from './a';   (treated as wildcard for chasing)
 *   export { default as Foo } from './a';
 *
 * The walker intentionally stays regex-based — the import-resolver
 * elsewhere in this file already chooses regex over a fresh
 * tree-sitter pass, and this function shares that trade-off. Errors
 * fall through silently; resolution simply skips the broken file.
 */
export declare function extractReExports(content: string, language: Language): ReExport[];
/**
 * Resolve a reference using import mappings
 */
/**
 * JVM (Java / Kotlin) imports use fully-qualified names (`import
 * com.example.foo.Bar`) decoupled from filenames, so the JS/Python
 * style filesystem path lookup misses them whenever the file isn't
 * named after its primary symbol (Kotlin `Utils.kt` exporting `Bar`,
 * top-level fns, extension fns). Resolve them through the
 * `qualifiedName` index instead — populated by the package_header /
 * package_declaration namespace wrappers in the extractor.
 */
export declare function resolveJvmImport(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null;
export declare function resolveViaImport(ref: UnresolvedRef, context: ResolutionContext): ResolvedRef | null;
//# sourceMappingURL=import-resolver.d.ts.map