"use strict";
/**
 * Go module path detection.
 *
 * A Go monorepo's cross-package calls (`pkga.FuncX(...)`) only resolve when
 * the resolver knows the project's module path (the `module ...` directive
 * in `go.mod`). Without it, `isExternalImport` treats every in-module import
 * — `github.com/example/myproject/pkga` — as a third-party package, so
 * resolution falls through to name-matching with path proximity and returns
 * a tiny fraction of the real call sites. See issue #388.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadGoModule = loadGoModule;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Read the `go.mod` file at the project root and extract the module path.
 * Returns `null` if no `go.mod` exists or it has no `module` directive.
 *
 * Limitation: only the project-root `go.mod` is read. Nested `go.mod` files
 * (Go workspaces, monorepos with multiple modules) are not yet resolved —
 * a follow-up if a real repro shows up.
 */
function loadGoModule(projectRoot) {
    const goModPath = path.join(projectRoot, 'go.mod');
    let content;
    try {
        content = fs.readFileSync(goModPath, 'utf-8');
    }
    catch {
        return null;
    }
    // `module <path>` is the first non-comment directive in any valid go.mod.
    // Strip line comments so a `// module foo` doesn't false-match.
    const stripped = content.replace(/\/\/[^\n]*/g, '');
    const match = stripped.match(/^\s*module\s+(\S+)\s*$/m);
    if (!match)
        return null;
    // Strip optional quoting around the module path.
    const modulePath = match[1].replace(/^["']|["']$/g, '');
    if (!modulePath)
        return null;
    return { modulePath, rootDir: projectRoot };
}
//# sourceMappingURL=go-module.js.map