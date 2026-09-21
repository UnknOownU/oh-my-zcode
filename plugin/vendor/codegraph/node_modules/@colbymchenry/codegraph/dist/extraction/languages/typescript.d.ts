import type { LanguageExtractor } from '../tree-sitter-types';
import type { Node as SyntaxNode } from 'web-tree-sitter';
/**
 * A TS/JS class field (`public_field_definition` / `field_definition`) is a
 * METHOD only when its value is callable — an arrow function, a function
 * expression, or a HOF call wrapping one (`onScroll = throttle(() => {…})`),
 * exactly mirroring what `resolveBody` below knows how to walk. Everything
 * else (`public fonts: Fonts;`, `count = 0`, `static defaults = {…}`) is a
 * PROPERTY. Previously every field extracted as method-kind (#808), which
 * misrepresented class shape and defeated kind-based filtering — the reason
 * #756's function-ref resolution had to restrict TS/JS bare identifiers to
 * function targets.
 */
export declare function classifyTsClassMember(node: SyntaxNode): 'method' | 'property';
export declare const typescriptExtractor: LanguageExtractor;
//# sourceMappingURL=typescript.d.ts.map