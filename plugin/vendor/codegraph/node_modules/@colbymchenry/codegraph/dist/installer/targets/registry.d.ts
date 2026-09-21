/**
 * Registry of all known agent targets.
 *
 * Adding a new target = create `targets/<id>.ts` exporting an
 * `AgentTarget`, then add it to the array below. Order here is the
 * order they appear in the multiselect prompt, in `--target=all`,
 * and in `--print-config`'s help listing — keep it stable.
 */
import { AgentTarget, Location, TargetId } from './types';
export declare const ALL_TARGETS: readonly AgentTarget[];
export declare function getTarget(id: string): AgentTarget | undefined;
export declare function listTargetIds(): TargetId[];
/**
 * Run `detect()` for every target at the given location. Returns the
 * full registry zipped with detection results — orchestrator uses
 * this to seed the multiselect prompt with installed agents
 * pre-checked.
 */
export declare function detectAll(loc: Location): Array<{
    target: AgentTarget;
    detection: ReturnType<AgentTarget['detect']>;
}>;
/**
 * Resolve a `--target=` flag value to a list of `AgentTarget`
 * instances. Accepts:
 *
 *   - `auto` — return all targets whose `detect().installed` is true,
 *     or `['claude']` as a fallback if none detected (least-surprise
 *     for existing users).
 *   - `all` — every target in the registry.
 *   - `none` — empty list (caller skips agent writes entirely).
 *   - csv list — `'claude,cursor'` etc. Unknown ids throw.
 */
export declare function resolveTargetFlag(value: string, loc: Location): AgentTarget[];
//# sourceMappingURL=registry.d.ts.map