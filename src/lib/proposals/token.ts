/**
 * Proposal Page Pod - the link token (spec WEB-013's sibling for proposals).
 *
 * 32 random bytes, base64url - the same recipe as the intake chat session
 * token, kept as its own module so the proposal libraries never import the
 * intake session (which pulls server-only Supabase config with it).
 *
 * Owner decision D3: tokens do not expire on their own. Revocation is an
 * explicit admin act recorded on the proposal row (status = 'revoked'), so the
 * lookup must check status - the token itself carries no lifetime.
 */
import { randomBytes } from 'crypto';

export function newProposalToken(): string {
  return randomBytes(32).toString('base64url');
}
