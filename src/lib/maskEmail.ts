/**
 * An email address, shortened for a server log.
 *
 * Some endpoints have to log WHICH address a decision was made about, or the
 * log cannot answer the only question anyone asks it ("I never got the link -
 * what happened to my address?"). Logging the address in full turns every log
 * export into a harvestable list, so the local part is reduced to something a
 * human can still recognise as theirs and nobody can mail:
 *
 *   alextejena@me.com -> al***a@me.com
 *   jo@example.com    -> j*@example.com
 *
 * The DOMAIN is kept whole, deliberately. It is not personal on its own, and it
 * is what distinguishes "the address bounced" from "they typed gmail.con".
 *
 * Never throws and never returns the input unchanged: anything that does not
 * look like an address at all comes back as `***`, because a value that reached
 * here unexpectedly is exactly the one not to print.
 */
export function maskEmail(email: string | null | undefined): string {
  if (typeof email !== 'string') return '***';
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  // No local part, no domain, or nothing before the @ - not an address.
  if (at < 1 || at === trimmed.length - 1) return '***';

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  // Two characters or fewer cannot show both ends without showing all of it.
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local.slice(0, 2)}***${local[local.length - 1]}@${domain}`;
}
