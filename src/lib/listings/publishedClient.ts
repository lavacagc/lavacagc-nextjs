'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Client-side read of the Buy + Remodel publish flag, for conditionally showing
 * the nav links. Cached at module level so it's fetched once per page session
 * regardless of how many components ask. Defaults to false (hidden) on error.
 *
 * Note: this only controls link VISIBILITY. Actual access is enforced
 * server-side by the pages (notFound) + middleware, so a stale/forged value
 * here can't expose the feature.
 */
let cached: Promise<boolean> | null = null;

async function fetchOnce(): Promise<boolean> {
  try {
    const { data, error } = await supabase
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

export function useBuyRemodelPublished(): boolean {
  const [published, setPublished] = useState(false);
  useEffect(() => {
    let active = true;
    if (!cached) cached = fetchOnce();
    cached.then((v) => {
      if (active) setPublished(v);
    });
    return () => {
      active = false;
    };
  }, []);
  return published;
}
