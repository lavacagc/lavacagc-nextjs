/**
 * Save one of a homeowner's "home facts" (My Home Systems) - e.g. where the
 * water main shut-off is, or the HVAC filter size. Cookie-gated by hc_access,
 * re-checks the account is active (fails closed), validates the fact + detail
 * through the records.ts chokepoint, and upserts one canonical row per fact
 * (on_conflict homeowner_id,fact_key), scoped to the signed-in homeowner.
 *
 * These are sensitive home-security details, so home_records is deny-by-default
 * (RLS on, no anon policy); this route is the only homeowner write path and
 * runs on the service-role key in-process. Mirrors api/home-care/task/route.ts.
 *
 * On the homeowner's first save the client passes `consent: true`; we log that
 * affirmative acknowledgement to consent_logs IN-PROCESS (never a self-fetch -
 * Cloudflare would interstitial a server-to-server call to our own domain)
 * BEFORE writing the record, so we hold proof of consent for this sensitive
 * category. If consent can't be recorded, we don't store the data.
 *
 * Consent is enforced server-side, not just client-side: we store sensitive
 * data only when this save carries consent OR the homeowner already consented
 * (proven by a prior homeowner-authored home_records row). A save without
 * consent and without prior consent is rejected, and consent-verification
 * errors fail closed.
 *
 * DELETE removes one of the homeowner's own saved facts (scoped by homeowner_id),
 * fulfilling the "you can view or delete these anytime" promise in the consent.
 */
import { NextRequest, NextResponse } from 'next/server';
import { HC_ACCESS_COOKIE, verifyHomeAccess } from '@/lib/homecare/accessCookie';
import { findHomeownerById } from '@/lib/homecare/homeowners';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { getClientIp } from '@/lib/rateLimit';
import {
  getFact,
  validateFactDetail,
  sanitizeNote,
  HOME_DETAILS_CONSENT_TYPE,
  HOME_DETAILS_CONSENT_TEXT,
} from '@/lib/homecare/records';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const access = await verifyHomeAccess(request.cookies.get(HC_ACCESS_COOKIE)?.value);
  if (!access) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });

  try {
    // A signed cookie stays valid until expiry; re-check the account is still
    // active so an unsubscribed homeowner can't keep writing (and, since this
    // is sensitive data, can't keep reading via a later GET either). Fails closed.
    const homeowner = await findHomeownerById(access.homeownerId);
    if (!homeowner || homeowner.status !== 'active') {
      return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      fact_key?: string;
      source_task_key?: string;
      note?: string;
      detail?: unknown;
      consent?: boolean;
    };

    const factKey = (body.fact_key ?? '').slice(0, 80);
    const fact = getFact(factKey);
    // Unknown fact_key is the chokepoint that keeps junk out of the sensitive table.
    if (!fact) return NextResponse.json({ ok: false, error: 'Unknown fact' }, { status: 400 });

    const validation = validateFactDetail(factKey, body.detail);
    if (!validation.ok) return NextResponse.json({ ok: false, error: 'Invalid detail' }, { status: 400 });

    const note = sanitizeNote(body.note);
    // A save must carry something: a location note or at least one detail field.
    if (!note && Object.keys(validation.cleaned).length === 0) {
      return NextResponse.json({ ok: false, error: 'Nothing to save' }, { status: 400 });
    }

    const sourceTaskKey =
      typeof body.source_task_key === 'string' ? body.source_task_key.slice(0, 80) : null;
    const now = new Date().toISOString();

    // First-save consent: record the affirmative acknowledgement BEFORE writing
    // the sensitive record. In-process (no self-fetch). If consent can't be
    // logged, do not store the data.
    if (body.consent === true) {
      try {
        const consentRow: Record<string, unknown> = {
          consent_type: HOME_DETAILS_CONSENT_TYPE,
          user_email: homeowner.email || null,
          consent_text: HOME_DETAILS_CONSENT_TEXT,
          user_agent: request.headers.get('user-agent') || null,
        };
        const ip = getClientIp(request);
        if (ip && ip !== 'unknown' && /^[0-9a-fA-F.:]+$/.test(ip)) {
          consentRow.ip_address = ip;
        }
        await supabaseRest('POST', 'consent_logs', consentRow, { prefer: 'return=minimal' });
      } catch (err) {
        console.error('home-care record consent log failed:', err instanceof Error ? err.message : String(err));
        return NextResponse.json(
          { ok: false, error: 'Could not record consent. Please try again.' },
          { status: 500 },
        );
      }
    } else {
      // No consent on this save: storing is allowed only if the homeowner
      // already consented, proven by a prior homeowner-authored row. Mirrors the
      // client's homeowner-authored-row consent signal so client and server
      // agree, and fails safe (after the homeowner deletes all their rows, the
      // server also requires fresh consent).
      let priorConsent: { fact_key: string }[];
      try {
        priorConsent = await supabaseRest<{ fact_key: string }[]>(
          'GET',
          `home_records?select=fact_key&homeowner_id=eq.${access.homeownerId}&updated_by=eq.homeowner&limit=1`,
        );
      } catch (err) {
        console.error('home-care record consent check failed:', err instanceof Error ? err.message : String(err));
        return NextResponse.json(
          { ok: false, error: 'Could not verify consent. Please try again.' },
          { status: 500 },
        );
      }
      if (!priorConsent || priorConsent.length === 0) {
        return NextResponse.json({ ok: false, error: 'Consent required' }, { status: 403 });
      }
    }

    await supabaseRest(
      'POST',
      'home_records?on_conflict=homeowner_id,fact_key',
      {
        homeowner_id: access.homeownerId,
        fact_key: factKey,
        note: note || null,
        detail: validation.cleaned,
        source_task_key: sourceTaskKey,
        updated_by: 'homeowner',
        updated_at: now,
      },
      { prefer: 'resolution=merge-duplicates,return=minimal' },
    );

    return NextResponse.json({ ok: true, fact_key: factKey });
  } catch (err) {
    console.error('home-care record save failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const access = await verifyHomeAccess(request.cookies.get(HC_ACCESS_COOKIE)?.value);
  if (!access) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });

  try {
    // Same fail-closed active-account re-check as the write path.
    const homeowner = await findHomeownerById(access.homeownerId);
    if (!homeowner || homeowner.status !== 'active') {
      return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { fact_key?: string };
    const factKey = (body.fact_key ?? '').slice(0, 80);
    if (!getFact(factKey)) return NextResponse.json({ ok: false, error: 'Unknown fact' }, { status: 400 });

    // Scoped to the signed-in homeowner: the filter carries their own id, so a
    // homeowner can only ever delete their own row. Honors the "you can view or
    // delete these anytime" promise in HOME_DETAILS_CONSENT_TEXT.
    await supabaseRest(
      'DELETE',
      `home_records?homeowner_id=eq.${access.homeownerId}&fact_key=eq.${encodeURIComponent(factKey)}`,
      undefined,
      { prefer: 'return=minimal' },
    );

    return NextResponse.json({ ok: true, fact_key: factKey });
  } catch (err) {
    console.error('home-care record delete failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
