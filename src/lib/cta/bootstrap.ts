/**
 * The hero CTA pre-paint script.
 *
 * Runs inline, synchronously, before the buttons are parsed, so the visitor's
 * variant is chosen before first paint without React: it reads `cta_v` (or
 * draws a seed and assigns by hash), writes `cta_v` back, and sets
 * `data-cta-p` / `data-cta-s` on <html>. CSS (heroCtaCss) then shows only the
 * matching link. Nothing in the React tree depends on the choice, so there is
 * no hydration mismatch and no invisible period. Without JavaScript no
 * attribute is set and the CSS shows the first variant of each button.
 *
 * `data-cta-ok="1"` is set only when `cta_v` reads back after the write,
 * i.e. cookies are stored. The event sender (HeroCtaEvents) sends nothing
 * otherwise, since a visitor who cannot keep a cookie would be counted anew on
 * every load.
 *
 * <html> carries suppressHydrationWarning in src/app/layout.tsx, so attributes
 * added here before hydration are expected and not reported.
 */
import { ctaIndex } from './assign';
import { CTA_COOKIE_MAX_AGE, CTA_VARIANT_KEYS, type HeroCtaVariants } from './types';

export interface CtaBootstrapConfig {
  /** Active, table-backed keys of the primary button as one string, e.g. "AB". Empty for a fallback. */
  p: string;
  /** Same for the secondary button. */
  s: string;
  /** Cookie Max-Age in seconds. */
  a: number;
}

/**
 * SELF-CONTAINED ON PURPOSE: serialized with toString() into the page, so it
 * must not reference anything outside its parameters. Written tersely, with
 * no whitespace inside any string or regex literal, because compactJs strips
 * whitespace and the whole inline script must stay under 1 KB (both are
 * asserted in tests/cta-tests.spec.ts). No comments inside the body:
 * toString() would ship them.
 *
 * A crawler that runs JavaScript (Googlebot, Bingbot, the Google tools, and
 * the generic bot words) returns at once: nothing is assigned, stored or sent,
 * and CSS shows the first link, which is the control (experiments slice H:
 * crawlers always get the control). Link-preview fetchers on the allow-list
 * (Facebook, WhatsApp, Pinterest) run no script, so they get the CSS default
 * without a check. The pattern is short on purpose: the 1 KB budget.
 *
 * c: config. x: ctaIndex. The cookie name `cta_v` (CTA_ASSIGN_COOKIE) is
 * spelled out because it is fixed; the spec asserts the two agree. The stored value is read in its encoded
 * form (`P%3DA%3BS%3DB%3BR%3D<seed>`), so nothing here can throw on a
 * mangled cookie. The seed comes only from crypto.getRandomValues; if that
 * throws, nothing is assigned or stored, the CSS default (first variant)
 * shows, and no events are sent. The cookie is always Secure: production is
 * https, and browsers treat http://localhost as secure.
 */
export function ctaBootstrap(c: CtaBootstrapConfig, x: (seed: string, button: string, count: number) => number): void {
  try {
    if (/bot|crawl|spider|slurp|google/i.test(navigator.userAgent)) return;
    const D = document, d = D.documentElement, m = D.cookie.match(/(?:^|;\s*)cta_v=([^;]*)/), o: Record<string, string> = {}, q: string[] = [];
    let r: string, v: string;
    if (m) m[1].split('%3B').forEach((p) => { const k = p.split('%3D'); o[k[0]] = k[1]; });
    r = o.R;
    if (!/^[0-9a-f]{32}$/.test(r)) r = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => (n + 256).toString(16).slice(1)).join('');
    ([['P', 'primary', c.p], ['S', 'secondary', c.s]] as string[][]).forEach(([l, n, k]) => {
      if (k) {
        v = o[l] && o[l].length == 1 && k.indexOf(o[l]) + 1 ? o[l] : k[x(r, n, k.length)];
        q.push(l + '%3D' + v);
        d.setAttribute('data-cta-' + l, v);
      }
    });
    q.push('R%3D' + r);
    v = 'cta_v=' + q.join('%3B');
    D.cookie = v + ';Max-Age=' + c.a + ';Path=/;SameSite=Lax;Secure';
    if (D.cookie.indexOf(v) + 1) d.setAttribute('data-cta-ok', '1');
  } catch {
    return;
  }
}

/**
 * Strip whitespace from function source: runs collapse to one space, and a
 * space survives only between two word characters (`const d`, `return r`).
 * Sound only because no string or regex literal in the serialized functions
 * contains whitespace; the spec asserts that, and the live spec runs the
 * result in a real browser.
 */
export function compactJs(source: string): string {
  return source.replace(/\s+/g, ' ').replace(/ ?([^\w$ ]) ?/g, '$1').trim();
}

/** The bootstrap config for these variants (fallback buttons contribute no keys). */
export function heroCtaBootstrapConfig(variants: HeroCtaVariants): CtaBootstrapConfig {
  // Key order, whatever the render order (the control renders first): the
  // hash indexes the sorted keys, exactly as the server-side assignment does
  // (src/lib/experiments/assign.ts).
  const keys = (list: HeroCtaVariants['primary']) => list.filter((v) => !v.fallback).map((v) => v.variant_key).sort().join('');
  return { p: keys(variants.primary), s: keys(variants.secondary), a: CTA_COOKIE_MAX_AGE };
}

/** The inline script for these variants. */
export function heroCtaBootstrapScript(variants: HeroCtaVariants): string {
  const cfg = heroCtaBootstrapConfig(variants);
  // Function names are dropped (not needed for an expression) to save bytes.
  const fn = (f: (...args: never[]) => unknown) => f.toString().replace(/^function \w+/, 'function');
  // Keys are A-G, so the JSON holds nothing that could close the <script>.
  return compactJs(`(${fn(ctaBootstrap)})(${JSON.stringify(cfg)},${fn(ctaIndex)});`);
}

/**
 * Show exactly one link per button: the one <html> names, else the first.
 * Static (covers every key A-G), so it does not depend on which are active.
 */
export const HERO_CTA_CSS = [
  '.hero-cta a[data-cta-variant]{display:none}',
  'html:not([data-cta-p]) .hero-cta a[data-cta-button="primary"][data-cta-first]{display:inline-flex}',
  'html:not([data-cta-s]) .hero-cta a[data-cta-button="secondary"][data-cta-first]{display:inline-flex}',
  ...CTA_VARIANT_KEYS.flatMap((k) => [
    `html[data-cta-p="${k}"] .hero-cta a[data-cta-button="primary"][data-cta-variant="${k}"]{display:inline-flex}`,
    `html[data-cta-s="${k}"] .hero-cta a[data-cta-button="secondary"][data-cta-variant="${k}"]{display:inline-flex}`,
  ]),
].join('');
