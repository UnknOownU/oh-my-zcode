import type { LanguageExtractor } from '../tree-sitter-types';
/**
 * Normalize a C++ return type to the bare class name a method could be called
 * on. Unwraps smart-pointer / optional wrappers to their element type
 * (`std::unique_ptr<Widget>` → `Widget`) so a factory's `->method()` resolves on
 * the pointee. Strips cv-qualifiers, `&`/`*`, namespace qualifiers, and other
 * template args. Returns undefined for primitives / void / `auto` / empty.
 */
export declare function normalizeCppReturnType(raw: string): string | undefined;
/**
 * Strip C++ template arguments from a base-type reference name so it matches the
 * bare class/struct the template was DEFINED as. `template<typename T> class
 * Base { … }` is indexed as a node named `Base`, but a derived class
 * `class D : public Base<int>` records its base as the full `Base<int>` (and
 * `class Q : public ns::Tpl<int>` as `ns::Tpl<int>`) — neither name-matches
 * `Base` / `ns::Tpl`, so the `extends` edge never resolves and the derived class
 * looks like it inherits from nothing (#1043).
 *
 * Removes every balanced `<…>` group regardless of nesting or position, so
 * `Base<int>` → `Base`, `ns::Tpl<Foo<int>>` → `ns::Tpl`, and the rare
 * `Outer<int>::Inner` → `Outer::Inner`. The remaining qualified head is exactly
 * what the non-templated base case already produces, so resolution treats them
 * identically. A name with no template args passes through unchanged.
 */
export declare function stripCppTemplateArgs(name: string): string;
export declare const cExtractor: LanguageExtractor;
/**
 * Blank an export/visibility macro in a `class/struct EXPORT_MACRO Name …`
 * *definition* header before parsing. Not knowing the macro, tree-sitter reads
 * `class EXPORT_MACRO` as an elaborated type specifier and the rest as a
 * function, so the whole class — its name, base clause, and members — drops out
 * of the index (#946 catches the resulting phantom function but can't recover
 * the class), which silently breaks type-hierarchy / inheritance-impact queries
 * for effectively every Unreal-Engine (`*_API`), Qt/Boost (`*_EXPORT`), LLVM
 * (`*_ABI`), … class. Replacing the macro with equal-length spaces preserves
 * every byte offset (and thus line/column), so the declaration then parses as a
 * normal class_specifier and the existing extraction emits the node, members,
 * and `extends` edge. (#1061, follow-up to #946.)
 *
 * Matched tightly so it can't touch the same macro used as an ordinary value
 * elsewhere (`int x = SOME_API;`): the macro is the ALL-CAPS token sitting
 * *between* `class`/`struct` and the type name, and the trailing `[:{]`
 * definition-guard fires only when a base clause or body follows — the only
 * shape that misparses. That guard also leaves elaborated-type variable
 * declarations (`struct FOO var;`, `class FOO obj = …`) untouched, since those
 * end in `;` / `=` / `[`, never `:` / `{`. C++-only (wired into cppExtractor),
 * so C's heavier use of `struct TAG var;` never reaches it.
 */
export declare function blankCppExportMacros(source: string): string;
export declare function blankCppInlineMacros(source: string): string;
/**
 * Universal fallback (any macro, no list) for a C/C++ function name still mangled
 * because a macro we don't blank sat in front of the return type: `MACRO Ret
 * name(…)` / `Ret MACRO name(…)` misparse so the return type is glued onto the
 * name ("Ret name", "char_t* to_str(double v)"). Recover the real identifier —
 * the token immediately before the parameter list (or the last token). This runs
 * AFTER the curated pre-parse blank, so it only ever sees the residual tail that
 * blanking didn't already fix cleanly (which also recovers the return type).
 *
 * Safe by construction: only touches an ALREADY-mangled name — one with an
 * internal space that isn't a legit `operator …`/destructor — so a well-formed
 * name is returned unchanged. Guarded against the two ways it could mis-pick:
 * the `Ret (name)` parenthesized-name idiom (left as-is, ambiguous), and a token
 * that is a bare primitive/keyword rather than a real identifier.
 */
export declare function recoverMangledCppName(name: string): string;
export declare function blankMetalAttributes(source: string): string;
/**
 * Blank annotation-style macro invocations that decorate a declaration but carry
 * NO terminating semicolon — the pervasive Unreal-Engine reflection markup
 * (`UPROPERTY(...)`, `UFUNCTION(...)`, `UCLASS(...)`, `GENERATED_BODY()`,
 * `UE_DEPRECATED_FORGAME(...)`, `DECLARE_DELEGATE_*(...)`, …) that sits on its
 * own line right before a member/type. tree-sitter's C++ grammar doesn't know
 * these are macros, so each one drops into error recovery; in a big reflected
 * class (`CharacterMovementComponent.h` has ~240 of them) the errors accumulate
 * until the enclosing `class_specifier` can't close and collapses into an ERROR
 * node — the whole class definition, its members, and its `extends` edges vanish
 * from the graph. Neither `blankCppExportMacros` (class-header export macros) nor
 * `blankCppInlineMacros` (return-type inline specifiers) touches these in-body
 * markup macros. Replacing each with equal-length spaces preserves every byte
 * offset (so line/column stay exact) and the class then parses normally.
 *
 * Deliberately name-list-FREE — UE alone has hundreds of such macros and projects
 * add their own — so it keys on structure, not a curated list, matched tightly to
 * avoid touching legitimate C++:
 *  - the macro must be the FIRST non-whitespace token on its line (`^[ \t]*`),
 *    which is where declaration markup lives — so a macro used inside an
 *    expression or condition (`if (CHECK(x))`, `x = MACRO(a) + b`) is never
 *    matched (it isn't line-leading);
 *  - the name must be ALL-CAPS (`[A-Z][A-Z0-9_]{2,}`), since ordinary
 *    function/type names called at line start are lower/mixed case;
 *  - the char after the balanced `(...)` must START A DECLARATION — a letter,
 *    `_`, `~` (destructor), or `#` (a following directive). Declaration markup is
 *    always followed by the thing it decorates (`UPROPERTY(...)\n float X;`,
 *    `UE_DEPRECATED(...) UPROPERTY(...)`), whereas a statement call is followed by
 *    `;` (`FOO(x);`), an init-list item by `,`/`{`, and an expression fragment by
 *    an operator (`MAKE(a) + 1`) — all rejected. String/char literals inside the
 *    args are skipped so an embedded `)` can't mis-close the balance.
 *
 * C++-only (wired into cppExtractor). A blanked macro inside a block comment is
 * harmless (comments don't parse), and the rare line-leading no-semicolon
 * ALL-CAPS call that isn't markup only loses that one annotation, never a whole
 * class.
 */
export declare function blankCppAnnotationMacroCalls(source: string): string;
export declare function blankLoneMacroLines(source: string): string;
export declare function blankCppApiPrefixMacros(source: string): string;
export declare function blankCppInlineAnnotationMacros(source: string): string;
export declare function blankCudaConstructs(source: string): string;
export declare function blankCLeadingAttrMacros(source: string): string;
export declare function blankCCplusplusGuardBodies(source: string): string;
export declare function blankCStatementMacroCalls(source: string): string;
export declare function blankCSandwichedAnnotations(source: string): string;
export declare function blankCAutoInference(source: string): string;
export declare function blankCTrailingParamAttrMacros(source: string): string;
export declare function blankCKernelAnnotations(source: string): string;
export declare function blankCParameterizedAnnotationMacros(source: string): string;
export declare function blankCTypeKeywordArgs(source: string): string;
export declare function blankCFileScopePrefixedDeclMacros(source: string): string;
export declare function rewriteCPrefixedDeclMacroInitializers(source: string): string;
export declare function blankCVaArgQualifiedTypeArgs(source: string): string;
export declare function blankCNamedVariadicDefineDots(source: string): string;
export declare const cppExtractor: LanguageExtractor;
//# sourceMappingURL=c-cpp.d.ts.map