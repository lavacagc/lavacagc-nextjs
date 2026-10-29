'use client';

import { useEffect } from 'react';
import {
  ATTRIBUTION_MAX_AGE,
  LID_COOKIE,
  SRC_COOKIE,
  UTM_COOKIE,
  UTM_KEYS,
  cleanListingId,
  cleanSourceTag,
  cleanUtm,
} from '@/lib/home-services/attribution';
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE } from '@/lib/home-services/lang';

function setCookie(name: string, value: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${ATTRIBUTION_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

/**
 * Persists `?src`, `?lid` and `utm_*` from the landing URL into 30-day cookies
 * (LP9), so a Craigslist visitor who browses before requesting is still
 * attributed. Only overwrites when the URL actually carries a value. Renders
 * nothing.
 */
export default function AttributionCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const src = cleanSourceTag(params.get('src'));
    if (src) setCookie(SRC_COOKIE, src);
    const lid = cleanListingId(params.get('lid'));
    if (lid) setCookie(LID_COOKIE, lid);
    const utm = cleanUtm(Object.fromEntries(UTM_KEYS.map((k) => [k, params.get(k) ?? ''])));
    if (Object.keys(utm).length) setCookie(UTM_COOKIE, JSON.stringify(utm));
    // A Spanish listing link (?lang=es) keeps the visitor in Spanish on later visits too.
    const lang = params.get('lang');
    if (lang === 'es' || lang === 'en') {
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${LANG_COOKIE}=${lang}; Max-Age=${LANG_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
    }
  }, []);
  return null;
}
