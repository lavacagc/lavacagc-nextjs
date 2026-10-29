/**
 * Which language a home services page renders in.
 *
 * Order (acceptance-criteria.md, "Language"): `?lang=es` first, then the
 * `lv_lang` cookie, else English. The toggle writes the cookie and reloads with
 * `?lang=`, so a shared Spanish link and a returning visitor both land right.
 *
 * Import-light: used by server pages and the client toggle alike.
 */
import { toLang, type Lang } from './catalog';

export const LANG_COOKIE = 'lv_lang';
/** One year: a language choice is a preference, not a session. */
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function resolveLang(queryLang: string | string[] | undefined, cookieLang: string | undefined): Lang {
  const q = Array.isArray(queryLang) ? queryLang[0] : queryLang;
  if (q === 'es' || q === 'en') return q;
  return toLang(cookieLang);
}
