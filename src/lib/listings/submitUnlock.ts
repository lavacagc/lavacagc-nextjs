/**
 * Client helper for the "Buy + Remodel" newsletter signup / unlock form.
 *
 * Mirrors submitLead's two-phase reCAPTCHA flow against the subscribe endpoint:
 *  1. POST the payload (with the v3 token).
 *  2. If the server replies 200 {challenge:'recaptcha_v2'} (v3 score too low),
 *     show the v2 checkbox via requestChallenge, then re-POST with the v2 token.
 */
export type SubmitUnlockResult = {
  ok: boolean;
  error?: string;
  /** True when the user dismissed the v2 checkbox without completing it. */
  cancelled?: boolean;
};

async function post(payload: Record<string, unknown>): Promise<{ res: Response; data: Record<string, unknown> }> {
  const res = await fetch('/api/buy-and-remodel/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, data };
}

export async function submitUnlock(
  payload: Record<string, unknown>,
  requestChallenge: () => Promise<string | null>,
): Promise<SubmitUnlockResult> {
  let { res, data } = await post(payload);

  if (res.ok && data?.challenge === 'recaptcha_v2') {
    const v2Token = await requestChallenge();
    if (!v2Token) {
      return { ok: false, error: 'Verification cancelled', cancelled: true };
    }
    ({ res, data } = await post({ ...payload, recaptchaV2Token: v2Token }));
  }

  if (!res.ok) {
    return { ok: false, error: (data?.error as string) || 'Failed to submit' };
  }
  return { ok: true };
}
