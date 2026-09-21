/**
 * Swift ↔ Objective-C bridging rules.
 *
 * Apple's auto-bridging mechanism exposes Swift declarations to the ObjC
 * runtime under a deterministic selector name. The full rule set:
 * https://developer.apple.com/documentation/swift/importing-swift-into-objective-c
 *
 * This module is **pure name math** — given a Swift declaration's base name
 * + parameter external labels (or the raw signature text), produce the
 * bridged ObjC selector(s); given an ObjC selector, produce the
 * candidate Swift base names. No graph/DB access here.
 *
 * Used by `frameworks/swift-objc.ts` (the framework resolver that wires
 * the rules into the resolution pipeline) and by its tests.
 *
 * ─── Bridging cheat sheet ───────────────────────────────────────────────
 *
 *   Swift declaration                             ObjC selector
 *   ─────────────────────────────────────────     ─────────────────────────
 *   func play()                                    play
 *   func play(_ song: String)                      play:
 *   func play(song: String)                        playWithSong:
 *   func play(_ song: String, by artist: String)   play:by:
 *   func play(song: String, by artist: String)     playWithSong:by:
 *   init(name: String)                             initWithName:
 *   init(name: String, age: Int)                   initWithName:age:
 *   var name: String  (getter / setter)            name  /  setName:
 *   @objc(custom:) func f(_ x: Int)                custom:        (literal override)
 *
 * The reverse direction (ObjC → Swift) collapses the bridge: a Swift call
 * site for `play(song:)` reaches us as the bare base name `play` (Swift's
 * tree-sitter call_expression strips parameter labels from the callee
 * name). So `swiftBaseNamesForObjcSelector('playWithSong:')` returns
 * `['play']` — the resolver looks up Swift methods named `play`.
 */
/**
 * Compute the auto-bridged ObjC selector for a Swift method declaration.
 *
 * @param baseName  The Swift method's base name (e.g. `play`).
 * @param externalLabels  Parameter EXTERNAL labels in declaration order;
 *                        `null` for a `_` (unlabeled) parameter.
 *                        `[]` for a no-parameter method.
 * @param explicitObjcName  If `@objc(customSel:)` was specified, the
 *                          literal selector — short-circuits the rule
 *                          and is returned as-is.
 * @returns The ObjC selector (e.g. `playWithSong:by:`), or `null` if it
 *          can't be determined.
 *
 * **Method rules:**
 * - No params → base name (no colons)
 * - Single param, `_` label → `baseName:`
 * - Single param, explicit label `L` → `baseNameWithL:`
 * - Multi-param, `_` first label → `baseName:label2:label3:`
 * - Multi-param, explicit first label `L1` → `baseNameWithL1:label2:label3:`
 *
 * Initializer rules are handled by `objcSelectorForSwiftInit`.
 */
export declare function objcSelectorForSwiftMethod(baseName: string, externalLabels: (string | null)[], explicitObjcName?: string | null): string | null;
/**
 * Compute the bridged ObjC selector for a Swift `init(...)` declaration.
 *
 * **Init rules** (different from regular methods — Apple always uses
 * `initWith` regardless of whether the first label is `_`):
 * - `init()`                       → `init`
 * - `init(_ name: String)`         → `initWithName:`  (uses the INTERNAL
 *                                    name when external is `_`, per Apple's
 *                                    bridging conventions)
 * - `init(name: String)`           → `initWithName:`
 * - `init(name: String, age: Int)` → `initWithName:age:`
 *
 * For the `_` case we need the internal (second identifier) name —
 * passed via `internalNames`.
 */
export declare function objcSelectorForSwiftInit(externalLabels: (string | null)[], internalNames: string[], explicitObjcName?: string | null): string | null;
/**
 * Compute the bridged ObjC getter + setter for a Swift `@objc` property.
 *
 * - `var name: String`        → getter `name`, setter `setName:`
 * - `var isReady: Bool`       → getter `isReady`, setter `setIsReady:`
 *   (no special `is` handling — Swift's `isReady` stays as `isReady` in ObjC;
 *   `@objc(name:)` overrides if a Cocoa-style getter `isReady` / setter
 *   `setReady:` pairing is needed — that's the responsibility of the
 *   declaration's `@objc(customGetter)` annotation, which we surface via
 *   `explicitObjcName`.)
 */
export declare function objcAccessorsForSwiftProperty(swiftName: string, explicitObjcName?: string | null): {
    getter: string;
    setter: string;
} | null;
/**
 * Reverse: from an ObjC selector, return the candidate Swift base names
 * the resolver should try when looking for the bridged Swift declaration.
 *
 * Examples:
 *   `play`                 → ['play']
 *   `play:`                → ['play']
 *   `playWithSong:`        → ['play', 'playWithSong']
 *   `play:by:`             → ['play']
 *   `playWithSong:by:`     → ['play', 'playWithSong']
 *   `initWithName:`        → ['init']                      (init is its own base name)
 *   `initWithName:age:`    → ['init']
 *   `setName:`             → ['name', 'setName']           (could be a setter OR a regular func)
 *   `tableView:didSel…:`   → ['tableView']
 *
 * Returns multiple candidates because the bare base name is ambiguous —
 * `playWithSong:` could correspond to either `func play(song:)` or
 * `func playWithSong(_ x:)` (a Swift method literally named that with a
 * `_` first label). The resolver tries each.
 */
export declare function swiftBaseNamesForObjcSelector(selector: string): string[];
/**
 * Detect whether a Swift method `@objc` declaration uses the `@objc(custom:)`
 * override form, returning the literal selector when present.
 *
 * Regex-based scan over the small chunk of source preceding the declaration —
 * tree-sitter would be more precise but this is only consulted as a fallback
 * when the structured AST isn't available (e.g. resolver-time lookups
 * via `context.readFile`).
 *
 * Returns `null` when the declaration is plain `@objc` (no override) or has
 * no `@objc` attribute at all.
 */
export declare function detectExplicitObjcName(sourceSlice: string): string | null;
/**
 * Detect whether a Swift declaration is `@objc`-exposed by scanning the
 * source slice that precedes it. Returns true for explicit `@objc`,
 * `@objc(custom:)`, or membership in a `@objcMembers` class (caller's
 * responsibility to pass class-level context if relevant).
 *
 * `@nonobjc` returns false even if `@objc` also appears (per Swift's rule
 * that `@nonobjc` opts out of class-level `@objcMembers`).
 */
export declare function isObjcExposed(sourceSlice: string): boolean;
//# sourceMappingURL=swift-objc-bridge.d.ts.map