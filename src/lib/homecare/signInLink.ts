/**
 * Issuing a Home Care sign-in link, in one place.
 *
 * Two callers need the identical sequence - mint a verify token, stamp it on
 * the homeowner with an expiry, email it - and they must not drift apart:
 *
 *  - the public /api/home-care/login route, where the member asks for it;
 *  - the admin membership lookup, where staff resend it for someone on the
 *    phone who says the email never arrived.
 *
 * If those two ever disagree about the TTL or which statuses may be mailed, the
 * support path stops reproducing the customer path, which is the one thing a
 * support path exists to do.
 *
 * The link itself is the same one onboarding uses. Clicking it runs
 * /api/home-care/verify, which activates a pending homeowner, sends the welcome
 * email and heals a missing access_token - so a member who never finished
 * signing up recovers the whole flow they missed rather than just a cookie.
 */
import {
  updateHomeowner,
  newToken,
  hoursFromNow,
  type Homeowner,
} from '@/lib/homecare/homeowners';
import { sendHomeCareVerificationEmail, type HomeCareEmailResult } from '@/lib/notify/sendHomeCareEmails';

/** How long an emailed sign-in link stays good. Stated once; both callers read it. */
export const VERIFY_TOKEN_TTL_HOURS = 48;

/**
 * Who may be sent a link.
 *
 * `pending` is in here on purpose. Someone who signed up and never clicked the
 * first email is exactly the person who later tries "I'm a member", and they
 * used to get silence - while the signup tab beside it would happily re-send
 * them the very same verification link. So including them leaks nothing the
 * signup form does not already leak, and it closes a real dead end.
 *
 * `unsubscribed` is NOT here, also on purpose: they asked us to stop, and a
 * sign-in link is still mail we chose to send them.
 */
export const SENDABLE_STATUSES: ReadonlySet<Homeowner['status']> = new Set(['active', 'pending']);

export function canSendSignInLink(homeowner: Pick<Homeowner, 'status'>): boolean {
  return SENDABLE_STATUSES.has(homeowner.status);
}

function buildVerifyUrl(origin: string, token: string): string {
  const u = new URL(`${origin}/api/home-care/verify`);
  u.searchParams.set('token', token);
  return u.toString();
}

function buildUnsubscribeUrl(origin: string, token: string): string {
  return `${origin}/api/home-care/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Mint a fresh token for this homeowner and email them the link.
 *
 * Callers are expected to have checked `canSendSignInLink` - this does not
 * re-check, because the two callers refuse for different reasons and want to
 * say different things about it (the public route stays silent; the admin route
 * explains). Throws only if the token write or the send itself throws; a send
 * that Resend merely refuses comes back as a non-'sent' result, which the
 * caller reports rather than swallowing.
 *
 * `homeownerId` is passed to the send so the email_log row is linked to the
 * member. Verification emails used to land with a null homeowner_id, which made
 * an audit row impossible to attribute after the fact.
 */
export async function issueSignInLink(
  homeowner: Homeowner,
  origin: string,
): Promise<HomeCareEmailResult> {
  const verifyToken = newToken();
  await updateHomeowner(homeowner.id, {
    verify_token: verifyToken,
    verify_token_expires_at: hoursFromNow(VERIFY_TOKEN_TTL_HOURS),
  });
  return sendHomeCareVerificationEmail({
    to: homeowner.email,
    firstName: homeowner.first_name,
    verifyUrl: buildVerifyUrl(origin, verifyToken),
    unsubscribeUrl: buildUnsubscribeUrl(origin, homeowner.unsubscribe_token),
    homeownerId: homeowner.id,
  });
}
