'use client';

import { Languages } from 'lucide-react';
import type { Lang } from '@/lib/home-services/catalog';
import { s } from '@/lib/home-services/i18n';
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE } from '@/lib/home-services/lang';

/**
 * EN / ES switch (grill 001 Q11, LP7). Writes the `lv_lang` cookie and reloads
 * with `?lang=` so the server renders the other language; the cookie makes the
 * choice stick on later visits without the parameter. A real link, so it also
 * works before hydration and is crawlable.
 */
export default function LangToggle({ lang, className }: { lang: Lang; className?: string }) {
  const other: Lang = lang === 'es' ? 'en' : 'es';
  const href = `?lang=${other}`;
  return (
    <a
      href={href}
      hrefLang={other}
      lang={other}
      data-testid="lang-toggle"
      onClick={(e) => {
        e.preventDefault();
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `${LANG_COOKIE}=${other}; Max-Age=${LANG_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
        const url = new URL(window.location.href);
        url.searchParams.set('lang', other);
        url.hash = '';
        window.location.assign(url.toString());
      }}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold text-secondary shadow-sm transition-colors hover:border-secondary ${className ?? ''}`}
    >
      <Languages aria-hidden className="h-4 w-4" />
      {s('language', lang)}
    </a>
  );
}
