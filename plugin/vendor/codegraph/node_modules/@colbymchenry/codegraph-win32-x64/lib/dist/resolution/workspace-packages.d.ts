/**
 * JS/TS workspace (monorepo) package resolution.
 *
 * npm / yarn / bun read member packages from the root `package.json`
 * `workspaces` field; pnpm from `pnpm-workspace.yaml`. A cross-package
 * import like `@scope/ui/widgets` is LOCAL to the monorepo, but to a
 * single-package resolver it looks exactly like a third-party npm
 * specifier — so `isExternalImport` flags it external and the
 * consumer↔definition edge is never created. For component barrels
 * (`export { default as X } from './x.svelte'`) that surfaces as a false
 * `0 callers` on a live component (issue #629).
 *
 * This module maps each member package's declared `name` to its
 * directory so the resolver can rewrite `@scope/ui/widgets` →
 * `packages/ui/widgets` and then run normal extension/index resolution.
 *
 * Scope deliberately small for v1 (mirrors path-aliases.ts):
 *   - reads `workspaces` (array OR `{ packages: [...] }`) from package.json,
 *     plus a minimal `pnpm-workspace.yaml` `packages:` list
 *   - expands one level of `*` / `**` globs (`packages/*`, `apps/*`)
 *   - subpath resolution is directory-based (`@scope/ui/sub` → `<ui>/sub`);
 *     it does NOT yet honour a member's `exports` map or `main` field
 *   - returns null when the project declares no workspaces, so single-
 *     package repos pay nothing and see no behaviour change.
 */
export interface WorkspacePackages {
    /** Member package `name` → directory relative to projectRoot (posix). */
    byName: Map<string, string>;
    /**
     * Member package `name` → its declared ENTRY FILE relative to projectRoot
     * (posix), when the member's manifest names one (ohpm's oh-package.json5
     * `"main": "Index.ets"`). Lets a bare `import { X } from "data"` resolve to
     * the member's real barrel even when it doesn't follow an index-file
     * convention — and independent of the CONSUMER's language (a `.ts` file
     * importing an `.ets` barrel resolves without `.ets` in the TS candidate
     * list). Absent for npm/pnpm members (their index conventions cover it).
     */
    entryByName?: Map<string, string>;
}
/**
 * Load workspace member packages for `projectRoot`. Returns `null` when
 * the project declares no workspaces (the common single-package case) —
 * callers then skip all workspace logic.
 *
 * Cheap to call repeatedly only via the resolver's per-instance cache;
 * this function itself touches the filesystem, so the resolver memoises it
 * the same way it does {@link loadProjectAliases} / {@link loadGoModule}.
 */
export declare function loadWorkspacePackages(projectRoot: string): WorkspacePackages | null;
/**
 * Rewrite a bare workspace import to a path relative to projectRoot,
 * WITHOUT an extension — the caller applies the language's extension/index
 * resolution. `@scope/ui/widgets` → `packages/ui/widgets`; the bare package
 * name `@scope/ui` → its directory. Returns `null` when no member package
 * name matches.
 */
export declare function resolveWorkspaceImport(importPath: string, ws: WorkspacePackages): string | null;
//# sourceMappingURL=workspace-packages.d.ts.map