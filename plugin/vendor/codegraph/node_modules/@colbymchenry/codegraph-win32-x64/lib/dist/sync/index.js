"use strict";
/**
 * Sync Module
 *
 * Provides synchronization functionality for keeping the code graph
 * up-to-date with file system changes.
 *
 * Components:
 * - FileWatcher: Debounced fs.watch that auto-triggers sync on file changes
 * - Watch policy: decides when the watcher must be disabled (e.g. WSL2 /mnt)
 * - Git sync hooks: opt-in commit/merge/checkout hooks when watching is off
 * - Git worktree awareness: detect when a query borrows another tree's index
 * - Content hashing for change detection (in extraction module)
 * - Incremental reindexing (in extraction module)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.worktreeMismatchNotice = exports.worktreeMismatchWarning = exports.detectWorktreeIndexMismatch = exports.gitWorktreeRoot = exports.DEFAULT_SYNC_HOOKS = exports.isGitRepo = exports.isSyncHookInstalled = exports.removeGitSyncHook = exports.installGitSyncHook = exports.detectWsl = exports.watchDisabledReason = exports.LockUnavailableError = exports.FileWatcher = void 0;
var watcher_1 = require("./watcher");
Object.defineProperty(exports, "FileWatcher", { enumerable: true, get: function () { return watcher_1.FileWatcher; } });
Object.defineProperty(exports, "LockUnavailableError", { enumerable: true, get: function () { return watcher_1.LockUnavailableError; } });
var watch_policy_1 = require("./watch-policy");
Object.defineProperty(exports, "watchDisabledReason", { enumerable: true, get: function () { return watch_policy_1.watchDisabledReason; } });
Object.defineProperty(exports, "detectWsl", { enumerable: true, get: function () { return watch_policy_1.detectWsl; } });
var git_hooks_1 = require("./git-hooks");
Object.defineProperty(exports, "installGitSyncHook", { enumerable: true, get: function () { return git_hooks_1.installGitSyncHook; } });
Object.defineProperty(exports, "removeGitSyncHook", { enumerable: true, get: function () { return git_hooks_1.removeGitSyncHook; } });
Object.defineProperty(exports, "isSyncHookInstalled", { enumerable: true, get: function () { return git_hooks_1.isSyncHookInstalled; } });
Object.defineProperty(exports, "isGitRepo", { enumerable: true, get: function () { return git_hooks_1.isGitRepo; } });
Object.defineProperty(exports, "DEFAULT_SYNC_HOOKS", { enumerable: true, get: function () { return git_hooks_1.DEFAULT_SYNC_HOOKS; } });
var worktree_1 = require("./worktree");
Object.defineProperty(exports, "gitWorktreeRoot", { enumerable: true, get: function () { return worktree_1.gitWorktreeRoot; } });
Object.defineProperty(exports, "detectWorktreeIndexMismatch", { enumerable: true, get: function () { return worktree_1.detectWorktreeIndexMismatch; } });
Object.defineProperty(exports, "worktreeMismatchWarning", { enumerable: true, get: function () { return worktree_1.worktreeMismatchWarning; } });
Object.defineProperty(exports, "worktreeMismatchNotice", { enumerable: true, get: function () { return worktree_1.worktreeMismatchNotice; } });
//# sourceMappingURL=index.js.map