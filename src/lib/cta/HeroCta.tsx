/**
 * The hero call-to-action pair (server component).
 *
 * Every active variant of each button is rendered as its own real <a href> in
 * the server HTML; the inline pre-paint script picks the visitor's variant and
 * CSS shows only that link (see bootstrap.ts). Without JavaScript the first
 * variant shows. Rendered by src/app/page.tsx and passed into the client Hero
 * as a slot, so the inline script comes from a server component and React never
 * re-renders it.
 *
 * It lives in src/lib/cta rather than src/components because slice C owns this
 * directory.
 */
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ctaColorStyle } from './color';
import { HERO_CTA_CSS, heroCtaBootstrapConfig, heroCtaBootstrapScript } from './bootstrap';
import { HeroCtaEvents } from './HeroCtaEvents';
import { CTA_HREF, type CtaButton, type CtaVariant, type HeroCtaVariants } from './types';

const BASE = 'text-lg px-8 py-3 min-h-16 h-auto whitespace-normal text-center font-semibold transition-all duration-300';

function variantClasses(button: CtaButton, variant: CtaVariant): { className: string; style?: React.CSSProperties } {
  const color = ctaColorStyle(variant.color);
  if (button === 'primary') {
    return {
      className: cn(
        BASE,
        'text-primary-foreground hover:shadow-button hover:scale-105',
        color?.className ?? 'bg-gradient-to-r from-primary to-accent-tangerine',
      ),
      style: color?.style,
    };
  }
  return {
    className: cn(
      BASE,
      'border-2',
      color
        ? cn('text-white hover:text-white hover:opacity-90', color.className)
        : 'border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground',
    ),
    style: color?.style,
  };
}

function CtaLink({ button, variant, first }: { button: CtaButton; variant: CtaVariant; first: boolean }) {
  const { className, style } = variantClasses(button, variant);
  return (
    <Button asChild size="lg" variant={button === 'primary' ? 'default' : 'outline'} className={className} style={style}>
      <Link
        href={CTA_HREF[button]}
        data-cta-button={button}
        data-cta-variant={variant.variant_key}
        data-cta-first={first ? '' : undefined}
      >
        <span className="flex flex-col items-center leading-tight">
          <span>{variant.wording}</span>
          {variant.subtext && <span className="text-sm font-normal opacity-90 mt-1">{variant.subtext}</span>}
        </span>
      </Link>
    </Button>
  );
}

export function HeroCta({ variants }: { variants: HeroCtaVariants }) {
  return (
    <>
      <style href="hero-cta" precedence="default">{HERO_CTA_CSS}</style>
      <script dangerouslySetInnerHTML={{ __html: heroCtaBootstrapScript(variants) }} />
      <HeroCtaEvents
        config={heroCtaBootstrapConfig(variants)}
        className="hero-cta flex flex-col sm:flex-row gap-4 justify-center items-stretch mb-12"
      >
        {variants.primary.map((v, i) => (
          <CtaLink key={`p-${v.variant_key}`} button="primary" variant={v} first={i === 0} />
        ))}
        {variants.secondary.map((v, i) => (
          <CtaLink key={`s-${v.variant_key}`} button="secondary" variant={v} first={i === 0} />
        ))}
      </HeroCtaEvents>
    </>
  );
}
