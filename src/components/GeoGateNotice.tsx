'use client';

/**
 * The round-10 geo notice: who this action is for, said politely on the form
 * itself, never a dead page. Renders NOTHING unless the visitor's tier is
 * known AND blocked for the given action - so NJ (and unknown, per the
 * owner's fail-open decision) never see it, and the server render is
 * identical for everyone.
 *
 * Phase A: this is signage above a still-working form - submits go through
 * and arrive tagged with their tier, so a week of real traffic proves the
 * classification before Phase B lets it refuse anybody.
 */

import { Globe, MapPin } from 'lucide-react';
import { useGeoTier } from '@/hooks/useGeoTier';
import {
  canJoinHomeCare, canJoinNewsletter, canReferProject, canRequestEstimate, type GeoTier,
} from '@/lib/geo/tier';

export type GeoGateKind = 'estimate' | 'referral' | 'homecare' | 'newsletter';

const BLOCKED: Record<GeoGateKind, (tier: GeoTier) => boolean> = {
  estimate: (tier) => !canRequestEstimate(tier),
  referral: (tier) => !canReferProject(tier),
  homecare: (tier) => !canJoinHomeCare(tier),
  newsletter: (tier) => !canJoinNewsletter(tier),
};

function copyFor(kind: GeoGateKind, tier: GeoTier): { title: string; body: string } {
  if (kind === 'homecare') {
    return {
      title: 'Home Care signup is available in the United States',
      body: 'Our guides and checklists are free to read from anywhere. Signing up - and everything that comes with it - is for US homeowners, since that is where our crew works.',
    };
  }
  if (kind === 'newsletter') {
    return {
      title: 'Our newsletter is for US homeowners',
      body: 'Everything we publish here stays free to read from anywhere.',
    };
  }
  if (kind === 'referral') {
    return {
      title: 'Referrals are for New Jersey projects',
      body: 'La Vaca GC builds exclusively in New Jersey, so we can only take on referred projects here.',
    };
  }
  return {
    title: 'Estimates are for New Jersey homeowners',
    body: tier === 'intl'
      ? 'Our portfolio and guides are open to everyone, but estimates are for our New Jersey service area.'
      : 'La Vaca GC builds exclusively in New Jersey, so we can only quote projects here. You are welcome to browse our work - and if you have a home in NJ, our Home Care program and newsletter are open to you.',
  };
}

export function GeoGateNotice({ kind, className }: { kind: GeoGateKind; className?: string }) {
  const tier = useGeoTier();
  if (!tier || !BLOCKED[kind](tier)) return null;

  const { title, body } = copyFor(kind, tier);
  const Icon = tier === 'intl' ? Globe : MapPin;
  return (
    <div
      className={`mb-4 flex gap-3 rounded-lg border border-border border-l-4 border-l-primary bg-primary/5 p-4 text-left ${className ?? ''}`}
      data-testid="geo-gate-notice"
      data-kind={kind}
      data-tier={tier}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
