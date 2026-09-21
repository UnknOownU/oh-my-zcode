#!/usr/bin/env node
/**
 * CodeGraph preuninstall cleanup script
 *
 * Runs automatically when `npm uninstall -g @colbymchenry/codegraph`
 * is called. Loops over every known agent target's `uninstall(loc)`
 * for the global location only — local-location entries live inside
 * project working trees and aren't ours to nuke at npm-uninstall
 * time.
 *
 * This script must never throw — a failed cleanup must not block
 * uninstall.
 */
//# sourceMappingURL=uninstall.d.ts.map