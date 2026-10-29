/**
 * The secret behind every one-tap Telegram link (the article unpublish link and
 * the experiment veto link): INTERNAL_WEBHOOK_SECRET, at least 32 characters.
 * No secret, or a shorter one, means no link is minted and every link is
 * refused (fail closed, the CM-11 rule), the same for both links.
 *
 * Free of Next imports so specs can import it.
 */
export const MIN_ONE_TAP_LINK_SECRET_LENGTH = 32;

export function oneTapLinkSecret(env: Partial<Record<string, string | undefined>> = process.env): string | null {
  const secret = env.INTERNAL_WEBHOOK_SECRET?.trim();
  return secret && secret.length >= MIN_ONE_TAP_LINK_SECRET_LENGTH ? secret : null;
}
