'use client';

/**
 * Customers > Pricing Report (AD6): per trade and county, how offers land with
 * subs - offers sent, subs reached, declines and decline rate, the top decline
 * reasons, average counter price (from the offer page and from Alex's decline
 * calls), and average sub pay and customer price. Used to adjust sub pay and
 * the catalog's starting prices.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDollars } from '@/lib/home-services/pricing';
import { DECLINE_REASON_LABEL, type DeclineReason } from '@/lib/home-services/offerRules';
import { LabeledSelect, fetchJson, tradeName } from './shared';

interface Row {
  trade: string;
  county: string;
  offers: number;
  recipients: number;
  declines: number;
  declineRate: number | null;
  topReasons: Array<{ reason: DeclineReason | 'none'; count: number }>;
  counters: number;
  avgCounterCents: number | null;
  avgSubPayCents: number | null;
  avgCustomerPriceCents: number | null;
}

const money = (c: number | null) => (c === null ? '-' : formatDollars(c));
const pct = (r: number | null) => (r === null ? '-' : `${Math.round(r * 100)}%`);

export default function PricingReport() {
  const [days, setDays] = useState('0');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A late answer for a period the admin already switched away from is dropped.
    let current = true;
    fetchJson<{ rows: Row[] }>(`/api/admin/pricing-report${days !== '0' ? `?days=${days}` : ''}`)
      .then((data) => { if (current) { setRows(data.rows); setError(null); } })
      .catch((e) => { if (current) setError(e instanceof Error ? e.message : 'Could not load the report'); });
    return () => { current = false; };
  }, [days]);

  return (
    <div className="space-y-4" data-testid="pricing-report">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Pricing Report</h2>
          <p className="text-sm text-muted-foreground">How subs answer our pay, per service and county.</p>
        </div>
        <div className="w-44">
          <LabeledSelect id="pricing-days" label="Period" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="0">All time</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </LabeledSelect>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 p-3 text-sm font-medium text-red-700" role="alert">{error}</p>
      ) : !rows ? (
        <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No offers sent in this period yet.</p>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">By service and county</CardTitle>
            <CardDescription>Decline rate is declines over subs reached. Counters include prices Alex logged on decline calls.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm" data-testid="pricing-table">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">Service</th>
                  <th scope="col" className="pr-3 font-medium">County</th>
                  <th scope="col" className="pr-3 text-right font-medium">Offers</th>
                  <th scope="col" className="pr-3 text-right font-medium">Subs reached</th>
                  <th scope="col" className="pr-3 text-right font-medium">Declines</th>
                  <th scope="col" className="pr-3 text-right font-medium">Decline rate</th>
                  <th scope="col" className="pr-3 font-medium">Top reasons</th>
                  <th scope="col" className="pr-3 text-right font-medium">Avg counter</th>
                  <th scope="col" className="pr-3 text-right font-medium">Avg sub pay</th>
                  <th scope="col" className="text-right font-medium">Avg customer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.trade}|${r.county}`} className="border-b last:border-0" data-testid="pricing-row" data-trade={r.trade} data-county={r.county}>
                    <th scope="row" className="py-2 pr-3 font-medium">{tradeName(r.trade)}</th>
                    <td className="pr-3">{r.county}</td>
                    <td className="pr-3 text-right tabular-nums" data-col="offers">{r.offers}</td>
                    <td className="pr-3 text-right tabular-nums" data-col="recipients">{r.recipients}</td>
                    <td className="pr-3 text-right tabular-nums" data-col="declines">{r.declines}</td>
                    <td className="pr-3 text-right tabular-nums" data-col="decline-rate">{pct(r.declineRate)}</td>
                    <td className="pr-3 text-xs" data-col="reasons">
                      {r.topReasons.length === 0 ? '-' : r.topReasons.map((t) => `${t.reason === 'none' ? 'No reason' : DECLINE_REASON_LABEL[t.reason]} (${t.count})`).join(', ')}
                    </td>
                    <td className="pr-3 text-right tabular-nums" data-col="avg-counter">{money(r.avgCounterCents)}{r.counters ? <span className="block text-xs text-muted-foreground">{r.counters} counter{r.counters > 1 ? 's' : ''}</span> : null}</td>
                    <td className="pr-3 text-right tabular-nums" data-col="avg-pay">{money(r.avgSubPayCents)}</td>
                    <td className="text-right tabular-nums" data-col="avg-customer">{money(r.avgCustomerPriceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
