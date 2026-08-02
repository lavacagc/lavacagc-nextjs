/**
 * The envelope addresses this site sends from.
 *
 * A leaf module with no imports, on purpose. The calendar builder has to name
 * the Home Care sender as the invite's ORGANIZER - Gmail and Outlook check that
 * the two match before they will render a REQUEST as an invitation rather than
 * a plain attachment - and ics.ts sits in the client bundle graph, so it cannot
 * reach into the send layer to read it. One constant both sides import is what
 * stops the ORGANIZER and the From drifting apart.
 */

/**
 * Every La Vaca Home Care email is from the program, not from a person - and
 * only `email.lavaca.link` is a verified sending domain in Resend, so this is
 * the only address mail can actually leave from.
 */
export const HOME_CARE_FROM = 'La Vaca Home Care <alex@email.lavaca.link>';

/** The bare address out of a `Name <addr@host>` header. */
export function fromAddress(header: string): string {
  return header.match(/<([^>]+)>/)?.[1]?.trim() ?? header.trim();
}
