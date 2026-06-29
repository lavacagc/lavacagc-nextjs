/**
 * Admin-controlled "publish" gate for the Buy + Remodel feature.
 *
 * The owner populates listings and previews the pages while logged in, then
 * flips `site_settings.buy_and_remodel_published` from the admin panel to make
 * the feature public. Until then the public sees a 404, but a logged-in admin
 * (and local dev) can still view it.
 *
 * Read with the cookieless anon client (the flag is public-read via RLS).
 * Defaults to UNPUBLISHED on any error / missing table, so the feature stays
 * hidden until the migration is applied and the switch is turned on.
 */
import { createClient } from '@supabase/supabase-js';
import { createClient as createCookieClient } from '@/lib/supabase/server';
import { IS_DEV } from '@/lib/listings/sampleData';

const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
);

export async function getBuyRemodelPublished(): Promise<boolean> {
  try {
    const { data, error } = await anon
      .from('site_settings')
      .select('buy_and_remodel_published')
      .eq('id', 1)
      .maybeSingle();
    if (error) return false;
    return !!data?.buy_and_remodel_published;
  } catch {
    return false;
  }
}

/** True when the current request carries a valid Supabase (admin) session. */
export async function hasAdminSession(): Promise<boolean> {
  try {
    const supabase = await createCookieClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return !!user;
  } catch {
    return false;
  }
}

export interface BuyRemodelAccess {
  /** Whether the page should render at all (else call notFound()). */
  canView: boolean;
  /** True when rendering only because the viewer is an admin/dev and it's unpublished. */
  isPreview: boolean;
}

/**
 * Resolve whether the Buy + Remodel pages may render for this request.
 * Importing this (via the cookie-aware admin check) makes the calling page
 * dynamic — intended, since access depends on the session + the live flag.
 */
export async function resolveBuyRemodelAccess(): Promise<BuyRemodelAccess> {
  const published = await getBuyRemodelPublished();
  if (published) return { canView: true, isPreview: false };
  const admin = await hasAdminSession();
  if (admin || IS_DEV) return { canView: true, isPreview: true };
  return { canView: false, isPreview: false };
}
