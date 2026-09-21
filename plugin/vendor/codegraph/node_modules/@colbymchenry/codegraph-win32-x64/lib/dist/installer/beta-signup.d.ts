/**
 * CodeGraph Pro beta opt-in — the installer's one-time offer to join the
 * beta-access waitlist (the same list the getcodegraph.com homepage form
 * feeds). Strictly opt-in: the user must answer yes AND type their email;
 * nothing is ever sent otherwise, and `--yes` / non-interactive runs never
 * see the prompt.
 *
 * The choice (subscribed or declined) is stored once in the user-level
 * state dir (~/.codegraph) so re-installs and upgrades never re-ask —
 * mirroring the telemetry consent pattern. A failed submit stores nothing,
 * so a later install can offer again.
 */
/** JSON waitlist endpoint on the landing page (see its /api/waitlist route). */
export declare const BETA_SIGNUP_ENDPOINT = "https://getcodegraph.com/api/waitlist";
export declare const BETA_SIGNUP_URL = "https://getcodegraph.com";
/** Same shape the landing-page form validates against. */
export declare const EMAIL_RE: RegExp;
export interface BetaSignupDeps {
    /** Global state dir; defaults to ~/.codegraph. Tests inject a temp dir. */
    dir?: string;
    fetchImpl?: typeof fetch;
    now?: () => Date;
    /** Where the signup came from, recorded with the email. */
    source?: 'cli-install' | 'cli-upgrade';
    /** TTY probes; default to the real process streams. Tests inject. */
    stdinIsTTY?: boolean;
    stdoutIsTTY?: boolean;
}
/** True once the user has answered (either way) on this machine. */
export declare function hasBetaSignupChoice(deps?: BetaSignupDeps): boolean;
/** Persist the answer so no future install re-asks. Fail silent. */
export declare function recordBetaSignupChoice(subscribed: boolean, deps?: BetaSignupDeps): void;
/**
 * Submit one email to the beta waitlist. Returns true on success, false on
 * any failure (bad response, offline, timeout) — never throws, never retries.
 */
export declare function submitBetaSignup(email: string, deps?: BetaSignupDeps): Promise<boolean>;
/**
 * The one gate every ask site shares: offer only on a real terminal, and
 * never once ANY prior ask (install or upgrade) has been answered on this
 * machine. Exported separately so the no-spam rule is unit-testable.
 */
export declare function shouldOfferBetaSignup(deps?: BetaSignupDeps): boolean;
/**
 * The full interactive offer: confirm → email → submit → remember. Shared by
 * `codegraph install` (end of a successful install) and `codegraph upgrade`
 * (after a successful binary update). Silently does nothing when the gate
 * says no; never throws — a marketing question must not fail the command
 * that hosts it. Cancel (Ctrl-C) and a failed submit store nothing, so a
 * later install/upgrade may offer again; an explicit yes or no is stored
 * forever.
 */
export declare function maybeOfferBetaSignup(deps?: BetaSignupDeps): Promise<void>;
//# sourceMappingURL=beta-signup.d.ts.map