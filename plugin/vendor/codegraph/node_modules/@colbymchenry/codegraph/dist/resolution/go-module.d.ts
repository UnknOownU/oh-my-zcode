/**
 * Go module path detection.
 *
 * A Go monorepo's cross-package calls (`pkga.FuncX(...)`) only resolve when
 * the resolver knows the project's module path (the `module ...` directive
 * in `go.mod`). Without it, `isExternalImport` treats every in-module import
 * — `github.com/example/myproject/pkga` — as a third-party package, so
 * resolution falls through to name-matching with path proximity and returns
 * a tiny fraction of the real call sites. See issue #388.
 */
export interface GoModule {
    /** The module path declared in `go.mod`, e.g. `github.com/example/myproject` */
    modulePath: string;
    /** Absolute path to the directory containing the `go.mod` file. */
    rootDir: string;
}
/**
 * Read the `go.mod` file at the project root and extract the module path.
 * Returns `null` if no `go.mod` exists or it has no `module` directive.
 *
 * Limitation: only the project-root `go.mod` is read. Nested `go.mod` files
 * (Go workspaces, monorepos with multiple modules) are not yet resolved —
 * a follow-up if a real repro shows up.
 */
export declare function loadGoModule(projectRoot: string): GoModule | null;
//# sourceMappingURL=go-module.d.ts.map