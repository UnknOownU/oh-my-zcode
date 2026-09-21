/**
 * Swift ↔ Objective-C bridge resolver.
 *
 * Closes the cross-language flow gap in mixed iOS codebases. The pure
 * bridging name math lives in `../swift-objc-bridge.ts`; this file wires
 * it into the resolution pipeline.
 *
 * **Two directions to close:**
 *
 * 1. **Swift call → ObjC method** — A Swift caller writes
 *    `imageDownloader.download(url:completion:)`. Tree-sitter-swift parses
 *    this as a call_expression whose callee identifier is `download`
 *    (parameter labels live in the argument list, not the callee). The
 *    name-matcher tries to find any node named `download` and fails (no
 *    Swift method by that name in this project; the ObjC implementation is
 *    `-downloadURL:completion:`). We catch it here: from the bare Swift
 *    name `download`, look up ObjC methods whose bridged Swift base name
 *    would be `download` (using `swiftBaseNamesForObjcSelector`'s reverse
 *    map, precomputed once per session).
 *
 * 2. **ObjC call → Swift method** — An ObjC caller writes
 *    `[swiftThing fooWithBar:42]`. Tree-sitter-objc parses this as a
 *    message_expression with selector `fooWithBar:` (after the multi-
 *    keyword fix in this branch). The name-matcher tries to find a node
 *    named `fooWithBar:` — no Swift node has colons in its name, so it
 *    fails. We catch it: from the ObjC selector, derive candidate Swift
 *    base names (`['fooWithBar', 'foo']`), and look up Swift methods
 *    named those.
 *
 * **Provenance:** every edge produced here is recorded as a framework-
 * resolved reference (`resolvedBy: 'framework'`) with `confidence: 0.7`
 * (matches the django ORM dynamic-dispatch precedent — not exact, but
 * deterministic from the bridging rule).
 */
import { FrameworkResolver } from '../types';
export declare const swiftObjcBridgeResolver: FrameworkResolver;
//# sourceMappingURL=swift-objc.d.ts.map