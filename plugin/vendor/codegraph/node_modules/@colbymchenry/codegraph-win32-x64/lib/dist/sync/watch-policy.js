"use strict";
/**
 * Watch Policy
 *
 * Decides whether the live file watcher should run for a given project.
 *
 * Native recursive `fs.watch` is pathologically slow on WSL2 `/mnt/*`
 * drives (NTFS exposed over the 9p/drvfs bridge): setting up the recursive
 * watch walks the directory tree, and every readdir/stat crosses the
 * Windows boundary. Inside an MCP server this stalls the event loop during
 * startup long enough to blow past host handshake timeouts (opencode's 30s),
 * so the tools never appear. See issue #199.
 *
 * This module centralizes the on/off decision so the watcher, the MCP
 * server (for diagnostics), and the installer all agree.
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
exports.detectWsl = detectWsl;
exports.watchDisabledReason = watchDisabledReason;
exports.__resetWslCacheForTests = __resetWslCacheForTests;
const fs = __importStar(require("fs"));
const utils_1 = require("../utils");
let wslChecked = false;
let wslValue = false;
/**
 * Detect whether the current process is running under WSL (Windows
 * Subsystem for Linux). Result is cached after the first call.
 *
 * Checks the WSL-specific env vars first (no I/O), then falls back to
 * `/proc/version`, which contains "microsoft" on WSL kernels.
 */
function detectWsl() {
    if (wslChecked)
        return wslValue;
    wslChecked = true;
    if (process.platform !== 'linux') {
        wslValue = false;
        return wslValue;
    }
    if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
        wslValue = true;
        return wslValue;
    }
    try {
        const version = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
        wslValue = version.includes('microsoft') || version.includes('wsl');
    }
    catch {
        wslValue = false;
    }
    return wslValue;
}
/**
 * True for WSL Windows-drive mounts like `/mnt/c` or `/mnt/d/project`.
 * Deliberately matches only single-letter drive mounts, so genuinely fast
 * Linux mounts such as `/mnt/wsl/...` are not flagged.
 */
function isWindowsDriveMount(projectRoot) {
    return /^\/mnt\/[a-z](\/|$)/i.test((0, utils_1.normalizePath)(projectRoot));
}
/**
 * Decide whether the file watcher should be disabled for a project, and why.
 *
 * Returns a short human-readable reason when watching should be skipped, or
 * `null` when it should run normally.
 *
 * Precedence (first match wins):
 *  1. `CODEGRAPH_NO_WATCH=1`    → off  (explicit opt-out always wins)
 *  2. `CODEGRAPH_FORCE_WATCH=1` → on   (overrides auto-detection)
 *  3. WSL2 + `/mnt/*` drive     → off  (recursive fs.watch is too slow; #199)
 */
function watchDisabledReason(projectRoot, probe = {}) {
    const env = probe.env ?? process.env;
    if (env.CODEGRAPH_NO_WATCH === '1') {
        return 'CODEGRAPH_NO_WATCH=1 is set';
    }
    if (env.CODEGRAPH_FORCE_WATCH === '1') {
        return null;
    }
    const isWsl = probe.isWsl ?? detectWsl();
    if (isWsl && isWindowsDriveMount(projectRoot)) {
        return 'project is on a WSL2 /mnt/ drive, where recursive fs.watch is too slow to be reliable';
    }
    return null;
}
/** Test-only: reset the cached WSL detection. */
function __resetWslCacheForTests() {
    wslChecked = false;
    wslValue = false;
}
//# sourceMappingURL=watch-policy.js.map