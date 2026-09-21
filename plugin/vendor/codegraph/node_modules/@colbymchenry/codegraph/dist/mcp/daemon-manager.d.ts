import type { DaemonRecord, StopResult } from './daemon-registry';
/** Sentinel option values (not real roots, so they can't collide with a project path). */
export declare const STOP_ALL = "__stop_all__";
export declare const CANCEL = "__cancel__";
export interface PickItem {
    value: string;
    label: string;
    hint?: string;
}
/** Compact uptime: `45s`, `12m`, `3h 5m`. */
export declare function formatUptime(ms: number): string;
/**
 * Build the ordered, UI-ready option list: the current project's daemon first
 * (so it's the auto-selected default), the rest newest-first, then "Stop all"
 * (only when there's more than one) and "Cancel".
 */
export declare function buildPickItems(daemons: DaemonRecord[], cwdRoot: string | null, now: number): PickItem[];
export interface PickerDeps {
    list: () => DaemonRecord[];
    stop: (root: string) => Promise<StopResult>;
    stopAll: () => Promise<StopResult[]>;
    /** Realpath'd root of the current project's daemon, or null. */
    cwdRoot: string | null;
    now: () => number;
    /** Render the picker; returns the chosen value or a cancel sentinel. */
    select: (opts: {
        message: string;
        options: PickItem[];
        initialValue: string;
    }) => Promise<unknown>;
    isCancel: (v: unknown) => boolean;
    /** Per-action note (e.g. "Stopped daemon …"). */
    note: (msg: string) => void;
    /** Final line + teardown (clack outro). */
    done: (msg: string) => void;
}
/**
 * Pick a daemon → stop it → re-prompt with what's left, until the user cancels
 * (Esc / Ctrl-C / "Cancel"), picks "Stop all", or nothing remains.
 */
export declare function runDaemonPicker(deps: PickerDeps): Promise<void>;
//# sourceMappingURL=daemon-manager.d.ts.map