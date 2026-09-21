/**
 * Node.js version compatibility check.
 *
 * Node 25.x has a V8 turboshaft WASM JIT Zone allocator bug that
 * reliably crashes CodeGraph with `Fatal process out of memory: Zone`
 * during tree-sitter grammar compilation. This module owns the
 * user-facing banner shown before exit. Kept side-effect-free so it's
 * safe to import from tests without triggering CLI bootstrap.
 */
/**
 * Build the bordered banner shown when CodeGraph detects an
 * unsupported Node.js major version (currently 25+). Pinned via unit
 * test so the recovery commands and override instructions can't be
 * silently stripped by future edits.
 *
 * Uses ASCII glyphs to stay readable on Windows OEM-codepage consoles
 * (see ../ui/glyphs.ts for the rationale).
 */
export declare function buildNode25BlockBanner(nodeVersion: string): string;
/**
 * Lowest supported Node.js major version. Matches the `engines` floor in
 * package.json. Below this, CodeGraph relies on language features / native APIs
 * that aren't present, and the combination is untested. `engines` alone only
 * *warns* on install (unless the user set `engine-strict`), so the CLI bootstrap
 * also hard-blocks here to actually enforce the floor.
 */
export declare const MIN_NODE_MAJOR = 20;
/**
 * Build the bordered banner shown when CodeGraph detects a Node.js major below
 * {@link MIN_NODE_MAJOR}. Pinned via unit test so the recovery commands and the
 * override env var can't be silently stripped by future edits.
 *
 * Uses ASCII glyphs to stay readable on Windows OEM-codepage consoles
 * (see ../ui/glyphs.ts for the rationale).
 */
export declare function buildNodeTooOldBanner(nodeVersion: string): string;
//# sourceMappingURL=node-version-check.d.ts.map