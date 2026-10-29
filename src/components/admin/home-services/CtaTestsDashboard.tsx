'use client';

/**
 * Marketing > CTA Tests: the homepage hero buttons under multivariate test.
 *
 * Per button and variant: views, clicks, requests, valid leads, won jobs and
 * rates; the leader (named only once every active variant has the minimum
 * visitors); inline editing of wording, subtext, colour and active.
 * Data: /api/admin/cta/{report,variants,settings} (secret key server-side).
 */
import { useCallback, useEffect, useId, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { CTA_BUTTONS, type CtaButton, type CtaVariantKey } from '@/lib/cta/types';
import { ButtonReportCard } from './cta/ButtonReportCard';
import { ctaApi, type CtaReportResponse, type VariantPatch } from './cta/ctaApi';
import type { VariantDraft } from './cta/VariantEditor';

function MinVisitorsSetting({ value, busy, onSave }: { value: number; busy: boolean; onSave: (n: number) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const parsed = Number(draft);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 1_000_000;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(parsed);
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={id}>Minimum visitors per variant</Label>
        <Input
          id={id}
          type="number"
          min={1}
          max={1000000}
          step={1}
          inputMode="numeric"
          className="w-36"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </div>
      <Button type="submit" variant="outline" disabled={busy || !valid || parsed === value}>
        Save
      </Button>
    </form>
  );
}

export default function CtaTestsDashboard() {
  const [report, setReport] = useState<CtaReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await ctaApi.report());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the CTA report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount: setState happens after the await, not synchronously.
    void ctaApi
      .report()
      .then((r) => {
        setReport(r);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the CTA report'))
      .finally(() => setLoading(false));
  }, []);

  /** Runs a write, toasts the outcome, reloads the numbers. */
  const mutate = useCallback(
    async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
      setBusy(true);
      try {
        await action();
        toast({ title: success });
        await load();
        return true;
      } catch (err) {
        toast({
          title: 'Not saved',
          description: err instanceof Error ? err.message : 'Something went wrong',
          variant: 'destructive',
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const onUpdate = (button: CtaButton) => (variantKey: CtaVariantKey, patch: VariantPatch) =>
    mutate(
      () => ctaApi.update(button, variantKey, patch),
      patch.active === undefined
        ? `Variant ${variantKey} saved`
        : `Variant ${variantKey} ${patch.active ? 'activated' : 'deactivated'}`,
    );

  const onCreate = (button: CtaButton) => (draft: VariantDraft) =>
    mutate(
      () => ctaApi.create(button, { wording: draft.wording, subtext: draft.subtext, color: draft.color }),
      'Variant added (inactive). Switch it on to start showing it.',
    );

  if (loading && !report) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading CTA tests...
      </div>
    );
  }

  if (!report) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <p className="text-destructive">{error ?? 'Could not load the CTA report.'}</p>
          <Button variant="outline" onClick={() => void load()}>Try again</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">CTA Tests</h2>
          <p className="text-sm text-muted-foreground">
            Homepage hero buttons. Each visitor keeps the variant they first saw; views and clicks count once per
            visitor per variant.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || busy}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="text-base">How the leader is chosen</CardTitle>
          <CardDescription>
            Highest request rate (requests / views), named only once every active variant has at least the minimum
            visitors. {report.valid_lead_rule}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MinVisitorsSetting
            key={report.min_visitors}
            value={report.min_visitors}
            busy={busy}
            onSave={(n) => void mutate(() => ctaApi.setMinVisitors(n), `Minimum visitors set to ${n}`)}
          />
          {report.requests_truncated && (
            <p className="mt-3 text-sm text-amber-700">
              Request counts were capped at the most recent 10,000 attributed requests.
            </p>
          )}
          {error && <p className="mt-3 text-sm text-destructive">Last refresh failed: {error}</p>}
        </CardContent>
      </Card>

      {CTA_BUTTONS.map((button) => (
        <ButtonReportCard
          key={button}
          report={report.buttons[button]}
          minVisitors={report.min_visitors}
          busy={busy}
          onUpdate={onUpdate(button)}
          onCreate={onCreate(button)}
        />
      ))}
    </div>
  );
}
