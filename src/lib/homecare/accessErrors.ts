/**
 * What each `?error=` code on /home-care tells the visitor.
 *
 * They are separated because the advice differs. Telling someone to request a
 * fresh link is actively wrong for `unavailable` - that is our signing secret or
 * our database, and a fresh link fails in exactly the same way - and wrong again
 * for `unsubscribed`, where the link worked and the account is the problem.
 *
 * Two routes reach the same page with different spellings of the same outcome:
 * /verify emits `expired` and `error` where /api/home-care/access emits
 * `invalid` and `unavailable`. Those pairs share one sentence, so the sentence
 * is written once and pointed at twice - spelled as copy-paste, editing one
 * silently leaves its twin saying something different about the same failure.
 */
const LINK_DEAD = "That link was invalid or expired. Enter your email below and we'll send a fresh one.";
const ON_OUR_SIDE = "We couldn't open your plan just now - that one is on us, not your link. Please try the same link again in a few minutes.";

export const ACCESS_ERRORS: Record<string, string> = {
  invalid: LINK_DEAD,
  expired: LINK_DEAD,
  unavailable: ON_OUR_SIDE,
  error: ON_OUR_SIDE,
  unsubscribed: "That plan is unsubscribed, so the link no longer opens it. Re-join below and your checklist comes straight back.",
  busy: "We're seeing a lot of requests from your network right now. Please try the same link again in a few minutes.",
};

/** A dead link is the likeliest reason to arrive here with a code we never sent. */
export const ACCESS_ERROR_FALLBACK = LINK_DEAD;

/**
 * `?error=` is whatever the visitor typed, so it is matched against the codes we
 * actually defined rather than indexed straight into the map. A plain lookup
 * resolves inherited keys - `?error=toString` returns a function and
 * `?error=__proto__` an object, neither of which `??` rejects and neither of
 * which React can render - so a crafted URL took the public signup page down.
 */
export function accessErrorCopy(code: string | undefined): string {
  if (!code || !Object.prototype.hasOwnProperty.call(ACCESS_ERRORS, code)) return ACCESS_ERROR_FALLBACK;
  return ACCESS_ERRORS[code];
}
