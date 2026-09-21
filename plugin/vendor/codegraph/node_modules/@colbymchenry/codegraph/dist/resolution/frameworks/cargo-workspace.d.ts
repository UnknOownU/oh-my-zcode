/**
 * Cargo Workspace Resolver Helper
 *
 * Parses a project's root Cargo.toml and member crate manifests to
 * build a crate-name -> member-directory map. Used by the Rust
 * resolver to resolve `use crate_name::...` references that point
 * into workspace member crates.
 */
import { ResolutionContext } from '../types';
/**
 * Build a map from crate-name aliases to workspace member directory paths.
 * Example: "mytool-core" and "mytool_core" -> "crates/mytool-core"
 *
 * Supports glob members (e.g. `members = ["crates/*"]`) via picomatch
 * when the context exposes `listDirectories`.
 */
export declare function getCargoWorkspaceCrateMap(context: ResolutionContext): Map<string, string>;
//# sourceMappingURL=cargo-workspace.d.ts.map