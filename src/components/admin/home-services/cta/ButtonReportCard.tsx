'use client';

import { Fragment, useState } from 'react';
import { Pencil, Plus, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ctaColorStyle } from '@/lib/cta/color';
import type { CtaButtonReport, CtaVariantStats } from '@/lib/cta/report';
import { CTA_HREF, MAX_VARIANTS_PER_BUTTON, type CtaVariantKey } from '@/lib/cta/types';
import type { VariantPatch } from './ctaApi';
import { formatCount, formatRate } from './format';
import { VariantEditor, type VariantDraft } from './VariantEditor';

const BUTTON_TITLE = { primary: 'Primary button', secondary: 'Secondary button' } as const;

interface Props {
  report: CtaButtonReport;
  minVisitors: number;
  busy: boolean;
  onUpdate: (variantKey: CtaVariantKey, patch: VariantPatch) => Promise<boolean>;
  onCreate: (draft: VariantDraft) => Promise<boolean>;
}

function LeaderCallout({ report, minVisitors }: { report: CtaButtonReport; minVisitors: number }) {
  const base = 'rounded-lg border px-4 py-3 text-sm';
  switch (report.leader_status) {
    case 'leader':
      return (
        <div className={`${base} border-emerald-300 bg-emerald-50 text-emerald-900`} data-testid="cta-leader">
          <Trophy className="mr-2 inline h-4 w-4" aria-hidden />
          Leader: <strong>{report.leader!.variant_key} - {report.leader!.wording}</strong> at{' '}
          {formatRate(report.leader!.request_rate)} request rate. Sample size {formatCount(report.sample_size)} views per
          variant (minimum {formatCount(minVisitors)}).
        </div>
      );
    case 'not_enough_visitors':
      return (
        <div className={`${base} border-amber-300 bg-amber-50 text-amber-900`} data-testid="cta-leader">
          Not enough visitors yet ({formatCount(report.sample_size)} of {formatCount(minVisitors)}). The leader is named
          once every active variant has {formatCount(minVisitors)} views.
        </div>
      );
    case 'tied':
      return (
        <div className={`${base} bg-muted/50 text-muted-foreground`} data-testid="cta-leader">
          No leader: the top variants are tied on request rate. Sample size {formatCount(report.sample_size)} views per
          variant.
        </div>
      );
    case 'single_variant':
      return (
        <div className={`${base} bg-muted/50 text-muted-foreground`} data-testid="cta-leader">
          Only one active variant, so there is nothing to compare. Activate or add another to start a test.
        </div>
      );
    default:
      return (
        <div className={`${base} border-destructive/40 bg-destructive/5 text-destructive`} data-testid="cta-leader">
          No active variant. The homepage is showing its built-in default wording.
        </div>
      );
  }
}

function Swatch({ color }: { color: string | null }) {
  const style = ctaColorStyle(color);
  if (!style) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span
        className={`inline-block h-3 w-3 rounded-sm border ${style.className ?? ''}`}
        style={style.style}
        aria-hidden
      />
      {color}
    </span>
  );
}

export function ButtonReportCard({ report, minVisitors, busy, onUpdate, onCreate }: Props) {
  const [editing, setEditing] = useState<CtaVariantKey | null>(null);
  const [adding, setAdding] = useState(false);
  const full = report.variants.length >= MAX_VARIANTS_PER_BUTTON;
  const onlyActive = report.active_count === 1;

  const row = (v: CtaVariantStats) => (
    <Fragment key={v.variant_key}>
      <TableRow className={v.active ? undefined : 'text-muted-foreground'} data-testid={`cta-row-${report.button}-${v.variant_key}`}>
        <TableCell className="font-semibold">
          {v.variant_key}
        </TableCell>
        <TableCell>
          <div className="font-medium text-foreground">
            {v.wording}
            {report.leader?.variant_key === v.variant_key && (
              <Badge className="ml-2 bg-emerald-600 hover:bg-emerald-600">Leader</Badge>
            )}
          </div>
          {v.subtext && <div className="text-xs text-muted-foreground">{v.subtext}</div>}
          <Swatch color={v.color} />
        </TableCell>
        <TableCell className="text-right tabular-nums">{formatCount(v.views)}</TableCell>
        <TableCell className="text-right tabular-nums">{formatCount(v.clicks)}</TableCell>
        <TableCell className="text-right tabular-nums">{formatRate(v.click_rate)}</TableCell>
        <TableCell className="text-right tabular-nums">{formatCount(v.requests)}</TableCell>
        <TableCell className="text-right tabular-nums font-semibold">{formatRate(v.request_rate)}</TableCell>
        <TableCell className="text-right tabular-nums">{formatCount(v.valid_leads)}</TableCell>
        <TableCell className="text-right tabular-nums">{formatCount(v.won)}</TableCell>
        <TableCell className="pl-6">
          <Switch
            checked={v.active}
            disabled={busy || (v.active && onlyActive)}
            title={v.active && onlyActive ? 'The homepage needs one active variant' : undefined}
            aria-label={`${v.active ? 'Deactivate' : 'Activate'} ${report.button} variant ${v.variant_key}`}
            onCheckedChange={(checked) => void onUpdate(v.variant_key, { active: checked })}
          />
        </TableCell>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Edit ${report.button} variant ${v.variant_key}`}
            onClick={() => setEditing(editing === v.variant_key ? null : v.variant_key)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
      {editing === v.variant_key && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={11}>
            <VariantEditor
              initial={{ wording: v.wording, subtext: v.subtext ?? '', color: v.color ?? '' }}
              submitLabel="Save"
              busy={busy}
              onCancel={() => setEditing(null)}
              onSubmit={async (draft) => {
                const ok = await onUpdate(v.variant_key, {
                  wording: draft.wording,
                  subtext: draft.subtext,
                  color: draft.color,
                });
                if (ok) setEditing(null);
              }}
            />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );

  return (
    <Card data-testid={`cta-card-${report.button}`}>
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg">{BUTTON_TITLE[report.button]}</CardTitle>
        <CardDescription>
          Links to <code className="text-xs">{CTA_HREF[report.button]}</code>. {report.active_count} active of{' '}
          {report.variants.length} (max {MAX_VARIANTS_PER_BUTTON}), split evenly by visitor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <LeaderCallout report={report} minVisitors={minVisitors} />
        {/* Fixed layout with the same widths in both cards, so the columns line up. */}
        <Table className="min-w-[1100px] table-fixed">
          <TableHeader className="[&_th]:whitespace-nowrap">
            <TableRow>
              <TableHead className="w-[72px]">Key</TableHead>
              <TableHead>Wording</TableHead>
              <TableHead className="w-[72px] text-right">Views</TableHead>
              <TableHead className="w-[72px] text-right">Clicks</TableHead>
              <TableHead className="w-[100px] text-right">Click rate</TableHead>
              <TableHead className="w-[88px] text-right">Requests</TableHead>
              <TableHead className="w-[116px] text-right">Request rate</TableHead>
              <TableHead className="w-[104px] text-right">Valid leads</TableHead>
              <TableHead className="w-[64px] text-right">Won</TableHead>
              <TableHead className="w-[80px] pl-6">Active</TableHead>
              <TableHead className="w-[56px]"><span className="sr-only">Edit</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{report.variants.map(row)}</TableBody>
        </Table>
        {adding ? (
          <div className="rounded-lg border p-4">
            <p className="mb-3 text-sm font-medium">New {report.button} variant (added inactive)</p>
            <VariantEditor
              initial={{ wording: '', subtext: '', color: '' }}
              submitLabel="Add variant"
              busy={busy}
              onCancel={() => setAdding(false)}
              onSubmit={async (draft) => {
                if (await onCreate(draft)) setAdding(false);
              }}
            />
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || full}
            onClick={() => setAdding(true)}
            title={full ? `A button can have at most ${MAX_VARIANTS_PER_BUTTON} variants` : undefined}
          >
            <Plus className="mr-1 h-4 w-4" />
            {full ? `All ${MAX_VARIANTS_PER_BUTTON} variants in use` : 'Add variant'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
