/**
 * Credential-blanking for a rendered email body that is about to be STORED.
 *
 * Every Home Care portal email carries the homeowner's access token in every
 * link. That token is stable, never rotated, and buys 30 days of portal access
 * including booking paid work at the member's address - so writing a rendered
 * body verbatim puts a permanent credential into a durable table, with no
 * retention limit and an admin viewer that reads it back. That is the same leak
 * `redactRestPath` closed on the application log, on the durable path.
 *
 * TWO tables hold rendered bodies and both call this: `email_log.html/text`
 * (sendEmail's audit row) and `follow_up_queue.email_body` (the visit-reminder
 * ledger, written by requeueVisitReminder and by the reminder cron). One
 * function rather than a rule per writer, so a third durable store has an
 * obvious thing to call.
 *
 * WHAT WAS SENT IS UNTOUCHED - this is applied at the persistence call, never to
 * the payload handed to Resend, so the recipient's link still works. The stored
 * copies are never re-sent: the admin routes only read email_log, the Resend
 * webhook only patches delivery status, and `visit_reminder_1d` is in
 * DEDICATED_SENDER_FOLLOW_UP_TYPES so no generic drain reads its body and the
 * admin "resend" action refuses it outright - its cron re-renders from the row.
 *
 * Lives here rather than beside the Home Care helpers because `sendEmail` is the
 * generic chokepoint every outbound email funnels through; notify must not
 * import homecare.
 */

/**
 * A credential-bearing query parameter inside a rendered email body.
 *
 * Matched on the parameter NAME, the same rule `redactRestPath` applies to the
 * REST path - `?token=`, `&access_token=`, and the entity-escaped `&amp;token=`
 * an HTML href carries. The value runs to whatever ends it: the next parameter,
 * the quote closing an href, or the whitespace ending a plain-text URL.
 *
 * The unsubscribe, preference and verify tokens sit in the same bodies and are
 * blanked by the same rule - matching on the name costs nothing extra and the
 * alternative is a list that a fifth token shape falls off.
 */
const BODY_CREDENTIAL = /([?&](?:amp;)?[a-z0-9_-]*token=)[^&"'<>\s]+/gi;

/** What replaces the value, so the admin still sees the link's shape. */
const REDACTED = 'REDACTED';

/** The body with its credentials blanked, for the stored copy ONLY. */
export function redactEmailBody(body: string): string {
  return body.replace(BODY_CREDENTIAL, `$1${REDACTED}`);
}
