/**
 * Function-as-value capture (#756) — registration-linking for callbacks.
 *
 * A function name used as a VALUE — passed as a call argument
 * (`register_handler(target_cb)`, `signal(SIGINT, handler)`), assigned to a
 * field or function pointer (`o->cb = target_cb`, `OnFire := TargetCb`),
 * placed in a struct/object initializer (`{ .recv_cb = my_cb }`,
 * `{ recv: targetCb }`, `Ops{Cb: targetCb}`), or listed in a function table
 * (`static cb_t table[] = { cb_a, cb_b }`) — is a real dependency that static
 * call extraction misses entirely: `callers(target_cb)` showed nothing but
 * direct calls, so every callback looked dead and its registration sites were
 * invisible to impact analysis.
 *
 * This module captures those value positions during the AST walk as
 * `function_ref` candidates. Capture is table-driven per language (the value
 * positions and wrapper forms differ per grammar — `&fn` in C, `Main::fn` in
 * Java, `::fn` in Kotlin, `#selector(fn)` in Swift, `@TargetCb` in Pascal,
 * `method(:fn)` in Ruby). Candidates are GATED at end-of-file extraction
 * (see `TreeSitterExtractor.flushFnRefCandidates`): only names matching a
 * same-file function/method or an imported binding survive, which bounds
 * volume and keeps precision high. Resolution then matches survivors against
 * function/method nodes ONLY (`matchFunctionRef` in
 * `src/resolution/name-matcher.ts`) and persists them as `references` edges,
 * which `callers`/`impact` already traverse.
 *
 * Deliberately NOT covered (resolving the *dispatch* — `o->cb(x)` → the
 * registered function — needs data-flow through struct fields; a wrong edge
 * is worse than none): indirect-call resolution and `obj.method` member
 * values where `obj` isn't `this`/`self` (the receiver's type is statically
 * unknowable without local data-flow).
 */
import type { Node as SyntaxNode } from 'web-tree-sitter';
export interface FnRefCandidate {
    name: string;
    line: number;
    column: number;
    /** Which capture position produced this candidate (gate policy keys on it). */
    mode: CaptureMode;
    /**
     * True when the value was an explicit reference form (`&fn`, `&Cls::m`,
     * `::fn`, `#selector`, `method(:sym)`) rather than a bare identifier —
     * C++'s flush policy keys on it.
     */
    explicitRef: boolean;
    /**
     * Skip the same-file/import name gate for this candidate. Set for PHP
     * string callables in known HOF positions: PHP global functions are
     * referenced cross-file WITHOUT imports (global namespace), so the gate
     * can't see them — the strong positional prior (a string argument to
     * `usort`/`array_map`/…) plus resolution's unique-or-drop rule carry the
     * precision instead.
     */
    skipGate?: boolean;
}
/** How to pull candidate value nodes out of a dispatched container node. */
type CaptureMode = 'args' | 'rhs' | 'value' | 'list' | 'varinit';
interface CaptureRule {
    mode: CaptureMode;
    /** Field holding the value for rhs/value/varinit (defaults per mode). */
    field?: string;
}
export interface FnRefSpec {
    /** Bare identifier node types that can act as a function value. */
    idTypes: Set<string>;
    /** Container node type → how to extract candidate values from it. */
    dispatch: Map<string, CaptureRule>;
    /**
     * Transparent wrapper layers between a container and its values
     * (`argument`, `value_argument`, `literal_element`, `expression_list`…).
     * Value: the field to descend into, or null for "named children".
     * `expression_list` fans out to ALL named children (Go multi-assign).
     */
    layers?: Map<string, string | null>;
    /**
     * Unary wrappers whose operand is the function value — C/C++ `&fn`
     * (pointer_expression), Pascal `@Fn` (exprUnary), Scala eta `fn _`
     * (postfix_expression). Value: operand field, or null for first named child.
     */
    unwrap?: Map<string, string | null>;
    /**
     * Whole-node reference forms needing bespoke name extraction —
     * `method_reference` (Java), `callable_reference` / `navigation_expression`
     * (Kotlin), `selector_expression` (Swift `#selector` / ObjC `@selector`),
     * Ruby `method(:sym)` calls, and `this.method` member forms.
     */
    special?: Set<string>;
    /**
     * Capture modes whose candidates skip the same-file/import gate and rely on
     * resolution's unique-or-drop rule instead. C-family only: an initializer
     * value, function-pointer assignment RHS, or table element is a
     * function-pointer position by construction, and C has no symbol imports —
     * the dominant repo-scale pattern (`server.c`'s command table naming
     * handlers defined across files) would otherwise be invisible. Call
     * arguments stay gated everywhere (locals passed as args dwarf callbacks).
     */
    ungatedModes?: Set<CaptureMode>;
    /**
     * C++ only: in args/rhs/varinit positions, accept ONLY explicit reference
     * forms (`&fn`, `&Cls::method`) — never bare identifiers. C++ codebases are
     * dense with generic free-function/accessor names (`begin`, `end`, `out`,
     * `size`, `data`) that collide with parameters and locals, and out-of-line
     * member definitions extract as function-kind nodes — bare-id matching on
     * fmt was mostly wrong edges. File-scope initializer tables (value/list)
     * still accept bare identifiers, same as C.
     */
    addressOfOnly?: boolean;
}
/**
 * Capture specs by language.
 */
export declare const FN_REF_SPECS: Record<string, FnRefSpec | undefined>;
/**
 * Extract candidate names from a dispatched container node. Returns the
 * (name, position) pairs of every function-value-shaped expression found.
 */
export declare function captureFnRefCandidates(container: SyntaxNode, rule: CaptureRule, spec: FnRefSpec, source: string): FnRefCandidate[];
export {};
//# sourceMappingURL=function-ref.d.ts.map