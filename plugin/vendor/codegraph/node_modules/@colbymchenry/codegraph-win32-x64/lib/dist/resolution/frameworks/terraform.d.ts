/**
 * Terraform Framework Resolver
 *
 * Terraform's scoping rule is narrow and directory-shaped: `var.X`,
 * `local.X`, `module.M`, and resource/data references resolve ONLY inside
 * the same module directory as the reference site. The generic name matcher
 * resolves by qualified-name alone, so a reference to `var.project_id` from
 * `modules/net-vpc/main.tf` could bind to a `variable "project_id"` declared
 * in an unrelated module — a wrong cross-module edge that poisons impact
 * analysis. This resolver enforces the real semantics:
 *
 *   1. Same directory as the reference site → resolve (highest confidence).
 *   2. `.tfvars` files additionally walk UP to the nearest ancestor
 *      directory declaring the variable (`terraform apply -var-file=envs/prod.tfvars`
 *      sets ROOT module variables from a subdirectory).
 *   3. Otherwise: no edge. Terraform cannot reference across sibling module
 *      directories, so a non-local candidate is never a correct target.
 *
 * It also bridges the module boundary through `:`-scoped references that
 * only this resolver understands (see the extractor's emitModuleWiring):
 *
 *   - `module.M:file`       → the entry file of the module's local source
 *     directory (an `imports` edge, so a module call connects to the code
 *     it instantiates).
 *   - `module.M:var.<in>`   → the child module's `variable "<in>"` node —
 *     the module block sets that variable, so "what depends on the child's
 *     var.cidr" reaches every caller.
 *   - `module.M:output.<o>` → the child module's `output "<o>"` node —
 *     `module.M.o` uses flow through to the output's definition instead of
 *     dead-ending at the module declaration.
 *
 * The module's `source` is re-read from the declaration's file (cached
 * lines); only local `./`/`../` sources bridge. Registry/git sources stay
 * unresolved — an out-of-repo module is a visible boundary, never a guess.
 */
import type { FrameworkResolver } from '../types';
export declare const terraformResolver: FrameworkResolver;
//# sourceMappingURL=terraform.d.ts.map