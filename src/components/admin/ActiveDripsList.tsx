'use client';

/**
 * Presentational person-centric "active drips" list: a desktop table and a
 * mobile slim-card view over the same data. Stateless — the Follow-Ups admin
 * owns the data + stop handler; a demo can render it with fixtures.
 */
import { Button } from '@/components/ui/button';
import { MailX } from 'lucide-react';
import { sequenceLabel, followUpTypeLabel, whenRelative, type ActiveDrip } from '@/lib/followups/activeDrips';

/** One colour per sequence: sharing purple with the nurture drip is how a
 *  transactional visit reminder read as marketing at a glance. */
const SEQ_PILL: Record<ActiveDrip['sequence'], string> = {
  nurture: 'bg-purple-100 text-purple-800',
  review: 'bg-sky-100 text-sky-800',
  visit: 'bg-amber-100 text-amber-900',
};

function SeqPill({ seq }: { seq: ActiveDrip['sequence'] }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${SEQ_PILL[seq] ?? SEQ_PILL.nurture}`}>
      {sequenceLabel(seq)}
    </span>
  );
}

export function ActiveDripsList({ drips, now, onStop }: { drips: ActiveDrip[]; now: number; onStop: (d: ActiveDrip) => void }) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Person</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Drip</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">What&apos;s next</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pending</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {drips.map(d => (
              <tr key={d.key} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3"><div className="font-medium">{d.name}</div><div className="text-xs text-muted-foreground">{d.email}</div></td>
                <td className="px-4 py-3"><SeqPill seq={d.sequence} /></td>
                <td className="px-4 py-3"><div className="font-medium">{followUpTypeLabel(d.nextType)}</div><div className="text-xs text-muted-foreground">{whenRelative(d.nextAt, now)}</div></td>
                <td className="px-4 py-3">{d.pendingCount}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="outline" size="sm" onClick={() => onStop(d)} className="text-orange-700 border-orange-200 hover:bg-orange-50 hover:text-orange-800">
                    <MailX className="w-4 h-4 mr-1.5" />Stop drip
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile slim cards */}
      <div className="md:hidden space-y-2">
        {drips.map(d => (
          <div key={d.key} className="border rounded-lg p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-sm leading-tight truncate">{d.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{d.email}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => onStop(d)} className="h-8 px-2.5 shrink-0 text-orange-700 border-orange-200 hover:bg-orange-50 hover:text-orange-800">
                <MailX className="w-3.5 h-3.5 mr-1" />Stop
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5 flex-wrap">
              <SeqPill seq={d.sequence} />
              <span>· next {followUpTypeLabel(d.nextType)} · {whenRelative(d.nextAt, now)}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
