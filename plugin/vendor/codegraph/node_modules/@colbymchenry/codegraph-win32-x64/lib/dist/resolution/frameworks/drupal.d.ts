/**
 * Drupal Framework Resolver
 *
 * Supports Drupal 8/9/10/11 (Composer-based projects). Drupal 7 is not supported.
 *
 * ## What this resolver does
 *
 * 1. **Detection** — reads composer.json and checks for any `drupal/*` dependency in
 *    `require` or `require-dev`.
 *
 * 2. **Route extraction** — parses `*.routing.yml` files and emits `route` nodes for each
 *    Drupal route, with `references` edges to the `_controller`, `_form`, or entity handler
 *    class/method.
 *
 * 3. **Hook detection** — scans `.module`, `.install`, `.theme`, and `.inc` files for Drupal
 *    hook implementations. Two strategies are used:
 *      a. Docblock: `@Implements hook_X()` → precise, no false positives.
 *      b. Name pattern: function `{moduleName}_{hookSuffix}()` → catches hooks without
 *         docblocks but may produce false positives on helper functions.
 *    Detected hooks emit an `UnresolvedRef` from the implementing function node to the
 *    canonical `hook_X` name, linking implementations to the hook when `codegraph_callers`
 *    is invoked.
 *
 * ## Design decisions (review in future iterations)
 *
 * - Hook graph resolution (v1): hook references are stored as UnresolvedRef pointing to the
 *   canonical `hook_X` name. If Drupal core is indexed, these will resolve to core hook
 *   definitions. Without core, they remain unresolved but are still searchable via
 *   `codegraph_search("form_alter")`. Full hook-node creation (virtual nodes for every hook)
 *   is deferred to a future iteration.
 *
 * - Services / plugins (out of scope for v1): `*.services.yml` service definitions and plugin
 *   annotations (`@Block`, `@FormElement`, etc.) are not extracted. Add a TODO below when
 *   ready to implement.
 *
 * - Twig templates (out of scope for v1): `.twig` files are tracked as file nodes but no
 *   symbol extraction is performed (no tree-sitter Twig grammar). Implement when a Twig
 *   grammar WASM is available.
 *
 * ## TODOs for future iterations
 *
 * - TODO: Extract service definitions from `*.services.yml` files (class → service-id edges).
 * - TODO: Extract plugin annotations (`@Block`, `@FormElement`, `@Field`, etc.) from PHP
 *   docblocks and emit plugin nodes with references to the annotated class.
 * - TODO: Add Twig symbol extraction when a tree-sitter Twig grammar becomes available.
 * - TODO: Improve hook resolution: create virtual `hook_*` nodes so `codegraph_callers`
 *   returns all implementations even when Drupal core is not indexed.
 */
import { FrameworkResolver } from '../types';
export declare const drupalResolver: FrameworkResolver;
//# sourceMappingURL=drupal.d.ts.map