/**
 * Shared client helper for posting a lead to /api/leads/submit, including the
 * reCAPTCHA v2 checkbox fallback.
 *
 * Flow:
 *  1. POST the payload (with the v3 token the form already obtained).
 *  2. If the server replies 200 {challenge:'recaptcha_v2'}, the v3 score was
 *     too low — ask the user to clear a checkbox via `requestChallenge`, then
 *     re-POST the SAME payload with the resulting v2 token.
 *  3. Return a normalized result.
 *
 * Keeping this in one place means every form gets the fallback without
 * duplicating the two-phase logic.
 */
export type SubmitLeadResult = {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  /** True when the user dismissed the v2 checkbox without completing it. */
  cancelled?: boolean;
};

async function postLead(payload: Record<string, unknown>): Promise<{ res: Response; data: Record<string, unknown> }> {
  const res = await fetch("/api/leads/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, data };
}

export async function submitLead(
  payload: Record<string, unknown>,
  requestChallenge: () => Promise<string | null>
): Promise<SubmitLeadResult> {
  let { res, data } = await postLead(payload);

  // Low v3 score → server asks for the v2 checkbox instead of hard-failing.
  if (res.ok && data?.challenge === "recaptcha_v2") {
    const v2Token = await requestChallenge();
    if (!v2Token) {
      return { ok: false, error: "Verification cancelled", cancelled: true };
    }
    ({ res, data } = await postLead({ ...payload, recaptchaV2Token: v2Token }));
  }

  if (!res.ok) {
    return { ok: false, error: (data?.error as string) || "Failed to submit" };
  }
  return { ok: true, data };
}
