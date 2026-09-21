"use strict";
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
exports.EMAIL_RE = exports.BETA_SIGNUP_URL = exports.BETA_SIGNUP_ENDPOINT = void 0;
exports.hasBetaSignupChoice = hasBetaSignupChoice;
exports.recordBetaSignupChoice = recordBetaSignupChoice;
exports.submitBetaSignup = submitBetaSignup;
exports.shouldOfferBetaSignup = shouldOfferBetaSignup;
exports.maybeOfferBetaSignup = maybeOfferBetaSignup;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
/** JSON waitlist endpoint on the landing page (see its /api/waitlist route). */
exports.BETA_SIGNUP_ENDPOINT = 'https://getcodegraph.com/api/waitlist';
exports.BETA_SIGNUP_URL = 'https://getcodegraph.com';
/** Same shape the landing-page form validates against. */
exports.EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBMIT_TIMEOUT_MS = 8_000;
function choicePath(deps = {}) {
    return path.join(deps.dir ?? path.join(os.homedir(), '.codegraph'), 'beta-signup.json');
}
/** True once the user has answered (either way) on this machine. */
function hasBetaSignupChoice(deps = {}) {
    try {
        const raw = JSON.parse(fs.readFileSync(choicePath(deps), 'utf8'));
        return raw.status === 'subscribed' || raw.status === 'declined';
    }
    catch {
        return false;
    }
}
/** Persist the answer so no future install re-asks. Fail silent. */
function recordBetaSignupChoice(subscribed, deps = {}) {
    try {
        const file = choicePath(deps);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const choice = {
            status: subscribed ? 'subscribed' : 'declined',
            updated_at: (deps.now?.() ?? new Date()).toISOString(),
        };
        fs.writeFileSync(file, JSON.stringify(choice, null, 2) + '\n');
    }
    catch {
        /* a full disk must not break the installer */
    }
}
/**
 * Submit one email to the beta waitlist. Returns true on success, false on
 * any failure (bad response, offline, timeout) — never throws, never retries.
 */
async function submitBetaSignup(email, deps = {}) {
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    try {
        const res = await fetchImpl(exports.BETA_SIGNUP_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, source: deps.source ?? 'cli-install' }),
            signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
        });
        return res.ok;
    }
    catch {
        return false;
    }
}
/**
 * The one gate every ask site shares: offer only on a real terminal, and
 * never once ANY prior ask (install or upgrade) has been answered on this
 * machine. Exported separately so the no-spam rule is unit-testable.
 */
function shouldOfferBetaSignup(deps = {}) {
    const stdinTTY = deps.stdinIsTTY ?? process.stdin.isTTY;
    const stdoutTTY = deps.stdoutIsTTY ?? process.stdout.isTTY;
    if (!stdinTTY || !stdoutTTY)
        return false;
    return !hasBetaSignupChoice(deps);
}
// Dynamic import helper — tsc compiles import() to require() in CJS mode,
// which fails for ESM-only packages (same trick as installer/index.ts).
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importESM = new Function('specifier', 'return import(specifier)');
/**
 * The full interactive offer: confirm → email → submit → remember. Shared by
 * `codegraph install` (end of a successful install) and `codegraph upgrade`
 * (after a successful binary update). Silently does nothing when the gate
 * says no; never throws — a marketing question must not fail the command
 * that hosts it. Cancel (Ctrl-C) and a failed submit store nothing, so a
 * later install/upgrade may offer again; an explicit yes or no is stored
 * forever.
 */
async function maybeOfferBetaSignup(deps = {}) {
    try {
        if (!shouldOfferBetaSignup(deps))
            return;
        const clack = await importESM('@clack/prompts');
        const wantsBeta = await clack.confirm({
            message: 'Want early access to CodeGraph Pro? Join the beta waitlist — we’ll only email you about CodeGraph, never share your address.',
            initialValue: true,
        });
        if (clack.isCancel(wantsBeta)) {
            clack.log.info(`Skipped — you can join anytime at ${exports.BETA_SIGNUP_URL}.`);
            return;
        }
        if (!wantsBeta) {
            recordBetaSignupChoice(false, deps);
            clack.log.info(`No problem — you can join anytime at ${exports.BETA_SIGNUP_URL}.`);
            return;
        }
        const email = await clack.text({
            message: 'What email should we send beta access to?',
            placeholder: 'you@company.com',
            validate: (value) => exports.EMAIL_RE.test((value ?? '').trim()) ? undefined : 'That email address doesn’t look right.',
        });
        if (clack.isCancel(email)) {
            clack.log.info(`Skipped — you can join anytime at ${exports.BETA_SIGNUP_URL}.`);
            return;
        }
        const s = clack.spinner();
        s.start('Joining the beta waitlist...');
        const ok = await submitBetaSignup(email.trim(), deps);
        if (ok) {
            s.stop('You’re on the list — we’ll email you when beta access opens.');
            recordBetaSignupChoice(true, deps);
        }
        else {
            s.stop('Couldn’t reach the waitlist right now.');
            clack.log.warn(`No worries — you can join anytime at ${exports.BETA_SIGNUP_URL}.`);
        }
    }
    catch {
        /* never let the beta question break an install or upgrade */
    }
}
//# sourceMappingURL=beta-signup.js.map