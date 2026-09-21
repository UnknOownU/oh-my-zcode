/**
 * Directory Management
 *
 * Manages the .codegraph/ directory structure for CodeGraph data.
 */
/**
 * Resolve the per-project data directory name, honoring the `CODEGRAPH_DIR`
 * environment override (default `.codegraph`). The override is a single path
 * segment that lives in the project root.
 *
 * Why this exists: two environments that share one working tree must NOT share
 * one `.codegraph/` — most concretely Windows-native and WSL (issue #636). The
 * daemon lockfile (`.codegraph/daemon.pid`) records a platform-specific pid and
 * socket path (a Windows named pipe vs a WSL Unix socket), and SQLite file
 * locking across the WSL2 ↔ Windows filesystem boundary is unreliable, so two
 * daemons sharing one index risks corruption. Setting `CODEGRAPH_DIR=.codegraph-win`
 * on one side gives each environment its own index in the same tree.
 *
 * Read live (not captured at load) so it is both process-accurate and testable.
 * An override that isn't a plain directory name — empty, containing a path
 * separator, `.`, `..`/traversal, or absolute — is ignored (we keep the
 * default) rather than risk writing the index outside the project or into the
 * project root itself; we warn once to stderr so the misconfiguration is seen.
 */
export declare function codeGraphDirName(): string;
/**
 * CodeGraph directory name — a load-time snapshot of {@link codeGraphDirName}.
 * A running process's environment is fixed, so this equals the live value;
 * it's kept as a stable string export for backward compatibility. Internal code
 * resolves the name through {@link codeGraphDirName} / {@link getCodeGraphDir}
 * so the `CODEGRAPH_DIR` override always applies.
 */
export declare const CODEGRAPH_DIR: string;
/**
 * Is `name` (a single path segment) a CodeGraph data directory? Matches the
 * default `.codegraph`, the active `CODEGRAPH_DIR` override, and any
 * `.codegraph-*` sibling. File-watching and the indexer skip ALL of these, so
 * when two environments share one working tree (Windows + WSL, issue #636)
 * neither indexes or watches the other's index directory.
 */
export declare function isCodeGraphDataDir(name: string): boolean;
/**
 * Get the .codegraph directory path for a project
 */
export declare function getCodeGraphDir(projectRoot: string): string;
/**
 * Check if a project has been initialized with CodeGraph
 * Requires both .codegraph/ directory AND codegraph.db to exist
 */
export declare function isInitialized(projectRoot: string): boolean;
/**
 * Find the nearest parent directory containing .codegraph/
 *
 * Walks up from the given path to find a CodeGraph-initialized project,
 * similar to how git finds .git/ directories.
 *
 * @param startPath - Directory to start searching from
 * @returns The project root containing .codegraph/, or null if not found
 */
/**
 * Reason a directory is unsafe to use as an index ROOT, or null when it's fine.
 *
 * Indexing your home directory or a filesystem root drags in caches, `Library`,
 * every other project, etc. — a multi-GB index, constant file-watcher churn, and
 * (pre-1.0 on macOS) a file-descriptor blowup that exhausted `kern.maxfiles` and
 * took unrelated apps / the whole machine down (#845). The classic trigger:
 * running the installer or `codegraph init` from `$HOME`, which auto-indexes the
 * current directory. These are never intended project roots, so the installer
 * and `init`/`index` refuse them (overridable with `--force`).
 *
 * Pure-ish (reads only `os.homedir()` + realpath) so it's easy to unit-test.
 * The returned string is a human phrase that slots into "… looks like {reason}".
 */
export declare function unsafeIndexRootReason(projectRoot: string): string | null;
export declare function findNearestCodeGraphRoot(startPath: string): string | null;
/**
 * Indexed sub-project roots beneath `root` (bounded breadth-first scan). For
 * the monorepo case behind #964: the index lives in a CHILD
 * (`packages/x/.codegraph/`), not at the workspace root the agent's cwd points
 * at. Descent stops at the first indexed directory on a branch (a project's
 * own sub-dirs aren't separate projects) and is bounded by depth + count so it
 * never turns into a full-tree crawl on a large repo.
 */
export declare function findIndexedSubprojectRoots(root: string, opts?: {
    maxDepth?: number;
    max?: number;
}): string[];
/**
 * Does `prompt` contain an explicit structural keyword? A keyword is a strong,
 * self-contained signal, so the front-load hook fires on it directly — no graph
 * check needed. (A *code-token* match, by contrast, is only a candidate the
 * hook verifies against the graph first; see {@link extractCodeTokens}.)
 * Coverage is multilingual (#994, #1126): the ~29 languages with the largest
 * developer populations, across Latin, Cyrillic, Greek, CJK, Hangul, Arabic,
 * Hebrew, Thai, and Devanagari scripts. Languages beyond the keyword table
 * still fire through the language-agnostic code-token path.
 */
export declare function hasStructuralKeyword(prompt: string): boolean;
/**
 * Identifier-shaped tokens in `prompt` — camelCase / PascalCase-with-inner-cap,
 * snake_case, a `name(` call, or the two sides of an `a.b` member access. Naming
 * a symbol is a code question whatever the surrounding human language, and these
 * shapes almost never occur in ordinary prose, so they catch the common
 * "<symbol> 的调用链?" / "where is <symbol> 定義" prompts no keyword list would.
 *
 * These are *candidates*, not a verdict: a tech brand like `JavaScript` or
 * `GitHub` is identifier-shaped too, so the front-load hook checks each token
 * against the actual index ({@link getNodesByName}) and only fires when one is a
 * real symbol here — otherwise a brand-name prompt would inject ~16KB of
 * low-relevance context (issue #994 follow-up). A doc/data filename ("README.md")
 * is excluded from the member-access form since it's a file reference, not a symbol.
 */
export declare function extractCodeTokens(prompt: string): string[];
/**
 * Cheap, graph-free candidate gate for the front-load hook: could `prompt` be a
 * structural / flow / impact / "where-how" question worth front-loading context
 * for? True on an explicit keyword in any covered language (#994, #1126) OR an
 * identifier-shaped token. A keyword is sufficient to fire on its own; a
 * token-only match is only a candidate the hook then verifies against the graph
 * (a brand name like `JavaScript` is token-shaped but isn't a symbol). Every
 * non-candidate prompt ("fix this typo", in any language) stays a zero-cost no-op.
 */
export declare function isStructuralPrompt(prompt: string): boolean;
/**
 * What the front-load hook should do for a prompt issued from a directory.
 */
export interface FrontloadPlan {
    /** Open + explore this project and inject its source as context. `null` when
     *  there's no single project to front-load (none indexed, or several indexed
     *  sub-projects with no clear match — see {@link nudgeProjects}). */
    exploreRoot: string | null;
    /** Indexed sub-projects to surface in a "pass `projectPath`" nudge: the rest
     *  of a monorepo's indexed projects alongside `exploreRoot`, or — when no one
     *  project clearly matches — the full list (with `exploreRoot` null). */
    nudgeProjects: string[];
    /** True when the plan came from scanning DOWN into sub-projects (cwd itself
     *  is not under any index) — the monorepo case, where a follow-up
     *  `codegraph_explore` needs an explicit `projectPath`. */
    viaSubScan: boolean;
}
/**
 * Decide what the front-load hook injects for a `prompt` issued from `cwd`,
 * shaped by where the `.codegraph/` index(es) actually are:
 *   1. **cwd (or an ancestor) is indexed** → front-load that project. The
 *      normal single-project / nested-file case.
 *   2. **cwd isn't indexed but looks like a workspace root** → the indexes live
 *      in sub-projects (the monorepo case behind #964). One indexed
 *      sub-project → front-load it; several → front-load the one the prompt
 *      names (by relative path like `packages/api`, or package directory name)
 *      and nudge about the rest; several with no match → nudge the full list so
 *      the agent passes `projectPath`, rather than guessing wrong.
 *   3. **nothing indexed reachable** → do nothing (the agent's own tools apply).
 */
export declare function planFrontload(cwd: string, prompt: string): FrontloadPlan;
/**
 * Create the .codegraph directory structure
 * Note: Only throws if codegraph.db already exists, not just if .codegraph/ exists.
 */
export declare function createDirectory(projectRoot: string): void;
/**
 * Remove the .codegraph directory
 */
export declare function removeDirectory(projectRoot: string): void;
/**
 * Get all files in the .codegraph directory
 */
export declare function listDirectoryContents(projectRoot: string): string[];
/**
 * Get the total size of the .codegraph directory in bytes
 */
export declare function getDirectorySize(projectRoot: string): number;
/**
 * Ensure a subdirectory exists within .codegraph
 */
export declare function ensureSubdirectory(projectRoot: string, subdirName: string): string;
/**
 * Check if the .codegraph directory has valid structure
 */
export declare function validateDirectory(projectRoot: string): {
    valid: boolean;
    errors: string[];
};
//# sourceMappingURL=directory.d.ts.map