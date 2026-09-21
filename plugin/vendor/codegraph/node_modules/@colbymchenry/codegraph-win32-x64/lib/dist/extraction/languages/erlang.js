"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.erlangExtractor = void 0;
const tree_sitter_helpers_1 = require("../tree-sitter-helpers");
// Node names follow the vendored WhatsApp/tree-sitter-erlang grammar (0.19,
// ABI 14) — the grammar behind the Erlang Language Platform (ELP).
//
// Erlang is form-based, and three of its shapes don't fit the generic
// extractor, so every symbol-bearing top-level form is dispatched through the
// visitNode hook below instead:
//   - a function's name lives on its CLAUSE, not the fun_decl, and the grammar
//     emits one fun_decl PER CLAUSE — consecutive same-name fun_decl forms are
//     merged into a single function node here;
//   - type-position expressions (-spec/-type/-callback bodies, record field
//     types) parse as `call` nodes, so descending into them would mint bogus
//     call refs to type names (`pid()`, `term()`); the hook consumes those
//     subtrees;
//   - record_decl carries its fields as direct children (no body field), which
//     the generic extractStruct would skip as a forward declaration.
// Calls (local `f(X)`, remote `mod:f(X)`, `fun f/1` references, and record
// usages) are handled by the erlang branch in extractCall — remote calls are
// emitted as `mod::f`, which matches the qualifiedName the module namespace
// produces (see packageTypes below), so cross-module resolution rides the
// standard qualified-name matcher.
/** Text of an atom with quoted-atom quotes stripped (`'EXIT'` → `EXIT`). */
function atomText(node, source) {
    return (0, tree_sitter_helpers_1.getNodeText)(node, source).replace(/^'([\s\S]*)'$/, '$1');
}
function collapseWs(text) {
    return text.replace(/\s+/g, ' ').trim();
}
// --- Per-file memos. Extraction is file-sequential within a worker, so a
// single-entry memo keyed by filePath is safe (and resets naturally). ---
/** Exported function names for the current file ('all' for -compile(export_all)). */
let exportsFile = '';
let exportsMemo = new Set();
/**
 * Clause-merge state: the previous fun_decl's name and node id. A fun_decl
 * whose clause repeats that name is a continuation clause (or a same-name
 * different-arity definition — deliberately grouped under one node, the way
 * overloads are elsewhere) and attaches to the existing node instead of
 * creating a duplicate.
 */
let lastFnFile = '';
let lastFnName = '';
let lastFnId = '';
function moduleExports(node, source, filePath) {
    if (filePath === exportsFile)
        return exportsMemo;
    let root = node;
    while (root.parent)
        root = root.parent;
    let result = new Set();
    for (let i = 0; i < root.namedChildCount; i++) {
        const form = root.namedChild(i);
        if (!form)
            continue;
        if (form.type === 'compile_options_attribute' &&
            (0, tree_sitter_helpers_1.getNodeText)(form, source).includes('export_all')) {
            result = 'all';
            break;
        }
        if (form.type === 'export_attribute') {
            for (const fa of form.namedChildren) {
                if (fa.type !== 'fa')
                    continue;
                const fun = (0, tree_sitter_helpers_1.getChildByField)(fa, 'fun');
                if (fun)
                    result.add(atomText(fun, source));
            }
        }
    }
    exportsFile = filePath;
    exportsMemo = result;
    return result;
}
/** The -spec directly above a function (comments may sit between), if it names it. */
function precedingSpec(node, name, source) {
    let prev = node.previousNamedSibling;
    while (prev && prev.type === 'comment')
        prev = prev.previousNamedSibling;
    if (prev?.type === 'spec') {
        const specFun = (0, tree_sitter_helpers_1.getChildByField)(prev, 'fun');
        if (specFun && atomText(specFun, source) === name)
            return prev;
    }
    return null;
}
/** `name(Args) when Guard` — the clause text up to the `->`. */
function clauseHeader(clause, source) {
    const body = (0, tree_sitter_helpers_1.getChildByField)(clause, 'body');
    const end = body ? body.startIndex : clause.endIndex;
    return collapseWs(source.substring(clause.startIndex, end)) || undefined;
}
function handleFunDecl(node, ctx) {
    const clauses = node.namedChildren.filter((c) => c.type === 'function_clause');
    const first = clauses[0];
    if (!first)
        return true; // macro-templated clause (`?M(...) -> ...`) — no static name
    const nameNode = (0, tree_sitter_helpers_1.getChildByField)(first, 'name');
    if (!nameNode)
        return true;
    const name = atomText(nameNode, ctx.source);
    if (!name)
        return true;
    // Continuation clause: extend the existing node's span and attribute this
    // clause's calls to it.
    if (ctx.filePath === lastFnFile && name === lastFnName && lastFnId) {
        for (let i = ctx.nodes.length - 1; i >= 0; i--) {
            const n = ctx.nodes[i];
            if (n && n.id === lastFnId) {
                if (node.endPosition.row + 1 > n.endLine)
                    n.endLine = node.endPosition.row + 1;
                break;
            }
        }
        ctx.pushScope(lastFnId);
        for (const clause of clauses)
            ctx.visitFunctionBody(clause, lastFnId);
        ctx.popScope();
        return true;
    }
    const spec = precedingSpec(node, name, ctx.source);
    const exports = moduleExports(node, ctx.source, ctx.filePath);
    const fn = ctx.createNode('function', name, node, {
        docstring: (0, tree_sitter_helpers_1.getPrecedingDocstring)(spec ?? node, ctx.source),
        signature: spec
            ? collapseWs((0, tree_sitter_helpers_1.getNodeText)(spec, ctx.source)).slice(0, 300)
            : clauseHeader(first, ctx.source),
        isExported: exports === 'all' || exports.has(name),
    });
    if (!fn)
        return true;
    ctx.pushScope(fn.id);
    // The whole clause is walked (not just the body) so record patterns in the
    // arguments and guard calls contribute references too.
    for (const clause of clauses)
        ctx.visitFunctionBody(clause, fn.id);
    ctx.popScope();
    lastFnFile = ctx.filePath;
    lastFnName = name;
    lastFnId = fn.id;
    return true;
}
function handleRecordDecl(node, ctx) {
    const nameNode = (0, tree_sitter_helpers_1.getChildByField)(node, 'name');
    if (!nameNode)
        return true;
    const rec = ctx.createNode('struct', atomText(nameNode, ctx.source), node, {
        docstring: (0, tree_sitter_helpers_1.getPrecedingDocstring)(node, ctx.source),
        signature: collapseWs((0, tree_sitter_helpers_1.getNodeText)(node, ctx.source)).slice(0, 300),
    });
    if (rec) {
        ctx.pushScope(rec.id);
        for (const field of node.namedChildren) {
            if (field.type !== 'record_field')
                continue;
            const fieldName = (0, tree_sitter_helpers_1.getChildByField)(field, 'name');
            if (fieldName)
                ctx.createNode('field', atomText(fieldName, ctx.source), field);
        }
        ctx.popScope();
    }
    return true; // field types/defaults are type-position exprs — don't descend
}
function handleTypeAlias(node, ctx) {
    const typeName = (0, tree_sitter_helpers_1.getChildByField)(node, 'name'); // type_name wrapper
    const nameNode = typeName ? (0, tree_sitter_helpers_1.getChildByField)(typeName, 'name') : null;
    if (nameNode) {
        ctx.createNode('type_alias', atomText(nameNode, ctx.source), node, {
            signature: collapseWs((0, tree_sitter_helpers_1.getNodeText)(node, ctx.source)).slice(0, 200),
        });
    }
    return true;
}
function handlePpDefine(node, ctx) {
    const lhs = (0, tree_sitter_helpers_1.getChildByField)(node, 'lhs');
    const nameNode = lhs ? (0, tree_sitter_helpers_1.getChildByField)(lhs, 'name') : null;
    if (!nameNode)
        return true;
    const macro = ctx.createNode('constant', (0, tree_sitter_helpers_1.getNodeText)(nameNode, ctx.source), node, {
        signature: collapseWs((0, tree_sitter_helpers_1.getNodeText)(node, ctx.source)).slice(0, 200),
    });
    // The replacement's calls execute at expansion sites, but attributing them
    // to the MACRO node keeps them true exactly once: `-define(LOG_AUDIT(E),
    // audit_logger:log(E))` gives the LOG_AUDIT constant a `calls` edge to the
    // logger, and each `?LOG_AUDIT(...)` use site links to the constant (see the
    // macro_call_expr case in extractCall) — so the chain
    // `caller → LOG_AUDIT → audit_logger:log` traverses without minting a
    // per-use duplicate of the body's calls.
    const replacement = (0, tree_sitter_helpers_1.getChildByField)(node, 'replacement');
    if (macro && replacement) {
        ctx.pushScope(macro.id);
        ctx.visitFunctionBody(replacement, macro.id);
        ctx.popScope();
    }
    return true;
}
function handleBehaviour(node, ctx) {
    const nameNode = (0, tree_sitter_helpers_1.getChildByField)(node, 'name');
    const parentId = ctx.nodeStack[ctx.nodeStack.length - 1];
    if (nameNode && parentId) {
        // `-behaviour(x)` implements x's callback contract. Resolves when the
        // behaviour module is in the repo; OTP behaviours (gen_server, …) simply
        // stay unresolved.
        ctx.addUnresolvedReference({
            fromNodeId: parentId,
            referenceName: atomText(nameNode, ctx.source),
            referenceKind: 'implements',
            line: node.startPosition.row + 1,
            column: node.startPosition.column,
        });
    }
    return true;
}
/**
 * OTP application resource file (`<app>.app.src` / `<app>.app`): a single
 * `{application, Name, Props}.` term the grammar parses as a top-level
 * expression. Two properties carry graph structure — `{mod, {Mod, _Args}}`
 * names the application-callback module (the app's entry point), and
 * `{applications, [...]}` / `{included_applications, [...]}` declare the apps
 * this one depends on. In an umbrella repo those resolve to the sibling app's
 * module of the same name (the OTP convention); kernel/stdlib and other
 * out-of-repo apps stay unresolved.
 */
function handleAppResourceTuple(node, ctx) {
    const parentId = ctx.nodeStack[ctx.nodeStack.length - 1];
    const props = node.namedChildren[2];
    if (!parentId || props?.type !== 'list')
        return true;
    const ref = (nameNode, kind) => {
        const name = atomText(nameNode, ctx.source);
        if (!name)
            return;
        ctx.addUnresolvedReference({
            fromNodeId: parentId,
            referenceName: name,
            referenceKind: kind,
            line: nameNode.startPosition.row + 1,
            column: nameNode.startPosition.column,
        });
    };
    for (const prop of props.namedChildren) {
        if (prop.type !== 'tuple' || prop.namedChildren.length < 2)
            continue;
        const key = prop.namedChildren[0];
        const value = prop.namedChildren[1];
        if (!key || key.type !== 'atom' || !value)
            continue;
        const keyName = atomText(key, ctx.source);
        if (keyName === 'mod' && value.type === 'tuple') {
            const mod = value.namedChildren[0];
            if (mod?.type === 'atom')
                ref(mod, 'references');
        }
        else if ((keyName === 'applications' || keyName === 'included_applications') &&
            value.type === 'list') {
            for (const app of value.namedChildren) {
                if (app.type === 'atom')
                    ref(app, 'imports');
            }
        }
    }
    return true; // nothing else in an app term carries graph structure
}
exports.erlangExtractor = {
    functionTypes: ['fun_decl'], // dispatched via visitNode (name lives on the clause)
    classTypes: [],
    methodTypes: [],
    interfaceTypes: [],
    structTypes: ['record_decl'], // dispatched via visitNode (fields are direct children)
    enumTypes: [],
    typeAliasTypes: ['type_alias', 'opaque'], // dispatched via visitNode
    importTypes: ['import_attribute', 'pp_include', 'pp_include_lib'],
    callTypes: [
        'call',
        'internal_fun', // fun f/1
        'external_fun', // fun mod:f/1
        'record_expr', // #rec{...} construction
        'record_update_expr', // X#rec{...}
        'record_index_expr', // #rec.field
        'record_field_expr', // X#rec.field
        'macro_call_expr', // ?MACRO / ?MACRO(...) — links use sites to the -define constant
    ],
    variableTypes: [],
    nameField: 'name',
    bodyField: 'body',
    paramsField: 'args',
    // `-module(m)` wraps the file's declarations in a namespace so every
    // function's qualifiedName is `m::f` — which is exactly the reference shape
    // the extractCall erlang branch emits for remote calls, so `mod:f(...)`
    // resolves through matchByQualifiedName with no resolver changes.
    packageTypes: ['module_attribute'],
    extractPackage: (node, source) => {
        const name = (0, tree_sitter_helpers_1.getChildByField)(node, 'name');
        return name ? atomText(name, source) : null;
    },
    extractImport: (node, source) => {
        if (node.type === 'import_attribute') {
            const mod = (0, tree_sitter_helpers_1.getChildByField)(node, 'module');
            if (!mod)
                return null;
            return {
                moduleName: atomText(mod, source),
                signature: collapseWs((0, tree_sitter_helpers_1.getNodeText)(node, source)).slice(0, 200),
            };
        }
        // pp_include / pp_include_lib — a C-include-style file dependency on a .hrl.
        const file = (0, tree_sitter_helpers_1.getChildByField)(node, 'file');
        if (!file)
            return null;
        const headerPath = (0, tree_sitter_helpers_1.getNodeText)(file, source).replace(/^"/, '').replace(/"$/, '');
        if (!headerPath)
            return null;
        return { moduleName: headerPath, signature: (0, tree_sitter_helpers_1.getNodeText)(node, source).trim() };
    },
    visitNode: (node, ctx) => {
        switch (node.type) {
            case 'fun_decl':
                return handleFunDecl(node, ctx);
            case 'record_decl':
                return handleRecordDecl(node, ctx);
            case 'type_alias':
            case 'opaque':
                return handleTypeAlias(node, ctx);
            case 'pp_define':
                return handlePpDefine(node, ctx);
            case 'behaviour_attribute':
                return handleBehaviour(node, ctx);
            // -spec / -callback: their type expressions parse as `call` nodes;
            // consume the subtree so the walker doesn't mint bogus call refs.
            case 'spec':
            case 'callback':
                return true;
            // `{application, Name, Props}.` at the top of an .app/.app.src resource
            // file (never a valid form in a module, so the gate is file + position).
            case 'tuple':
                if (node.parent?.type === 'source_file' &&
                    /\.app(?:\.src)?$/i.test(ctx.filePath) &&
                    node.namedChildren[0]?.type === 'atom' &&
                    atomText(node.namedChildren[0], ctx.source) === 'application') {
                    return handleAppResourceTuple(node, ctx);
                }
                return false;
            default:
                return false;
        }
    },
};
//# sourceMappingURL=erlang.js.map