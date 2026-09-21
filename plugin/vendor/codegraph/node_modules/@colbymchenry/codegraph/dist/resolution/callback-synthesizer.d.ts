/**
 * Callback / observer edge synthesis — Phase 1 + 2.
 *
 * Closes dynamic-dispatch holes where a dispatcher invokes callbacks registered
 * elsewhere. Two channel shapes:
 *
 *  (1) Field-backed observer (Phase 1):
 *      onUpdate(cb) { this.callbacks.add(cb); }            // registrar
 *      triggerUpdate() { for (cb of this.callbacks) cb(); } // dispatcher
 *      scene.onUpdate(this.triggerRender)                  // registration
 *      → synthesize triggerUpdate → triggerRender
 *
 *  (2) String-keyed EventEmitter (Phase 2):
 *      this.on('mount', function onmount(){...})           // registration
 *      fn.emit('mount', this)                              // dispatch
 *      → synthesize (method containing emit('mount')) → onmount
 *
 * Whole-graph pass after base resolution. High-precision/low-recall by design:
 * named callbacks only; field channels paired by file+field; EventEmitter
 * channels capped by event fan-out (generic names like 'error' skipped — they
 * need receiver-type matching, deferred to Phase 3). All synthesized edges are
 * tagged `provenance:'heuristic'`. See docs/design/callback-edge-synthesis.md.
 */
import type { Edge } from '../types';
import type { QueryBuilder } from '../db/queries';
import type { ResolutionContext } from './types';
import { type MaybeYield } from './cooperative-yield';
/** `has(...)` shape passed to pass gates — true when the project contains any of the languages. */
type HasLang = (...ls: string[]) => boolean;
/**
 * One independent synthesis pass. Every pass scans the COMMITTED graph (plus
 * source via ctx) and returns an edge list; nothing it produces is persisted
 * until the ordered merge in synthesizeCallbackEdges — which is what makes
 * execution order free and the passes safe to fan out across the resolver
 * pool's read-only workers. `gate` short-circuits a pass whose language never
 * appears in the project (its result is provably empty — see #1212).
 */
export interface SynthPassDef {
    name: string;
    gate: (has: HasLang) => boolean;
    run: (queries: QueryBuilder, ctx: ResolutionContext, yieldToLoop: MaybeYield, subProgress?: (fraction: number) => void) => Promise<Edge[]>;
}
/**
 * The independent passes, in MERGE ORDER — the first-seen dedup in
 * synthesizeCallbackEdges follows this array, so reordering entries changes
 * which duplicate edge wins. The two Go pre-passes (cross-file method
 * `contains`, implicit `implements`) are NOT here: they persist before these
 * run because interfaceOverrideEdges reads their edges from the DB.
 */
export declare const SYNTH_PASSES: SynthPassDef[];
export declare const SYNTH_PROGRESS_STEPS: number;
export declare function synthesizeCallbackEdges(queries: QueryBuilder, ctx: ResolutionContext, onProgress?: (done: number, total: number) => void, pool?: {
    runSynthPass(name: string): Promise<{
        edges: Edge[];
        ms: number;
    }>;
} | null, backpressure?: () => Promise<void> | null): Promise<number>;
export {};
//# sourceMappingURL=callback-synthesizer.d.ts.map