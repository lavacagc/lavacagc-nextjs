/**
 * Client helpers for the admin follow_up_queue API (/api/admin/follow-ups).
 * The admin browser can't read/write follow_up_queue directly (RLS grants anon,
 * not the logged-in authenticated role), so all access goes through the server
 * route, which uses the secret key. Keeps the admin UI honest about failures.
 */
import type { FollowUpRow } from '@/lib/followups/activeDrips';

export interface FollowUpQueueRow extends FollowUpRow {
  sent_at: string | null;
  email_subject: string;
  email_body: string;
  created_at: string;
}

export async function fetchFollowUpQueue(): Promise<FollowUpQueueRow[]> {
  const res = await fetch('/api/admin/follow-ups', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load follow-ups');
  const data = await res.json();
  return (data.rows ?? []) as FollowUpQueueRow[];
}

/** Stop a person's drip for one sequence; returns the number cancelled. */
export async function stopDrip(email: string, sequence: 'nurture' | 'review'): Promise<number> {
  const res = await fetch('/api/admin/follow-ups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stop', email, sequence }),
  });
  if (!res.ok) throw new Error('Failed to stop follow-ups');
  const data = await res.json();
  return (data.stopped ?? 0) as number;
}

export async function cancelFollowUp(id: string): Promise<void> {
  const res = await fetch('/api/admin/follow-ups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel', id }),
  });
  if (!res.ok) throw new Error('Failed to cancel follow-up');
}

export async function resendFollowUp(
  row: Pick<FollowUpQueueRow, 'lead_email' | 'lead_name' | 'follow_up_type' | 'email_subject' | 'email_body'>,
): Promise<void> {
  const res = await fetch('/api/admin/follow-ups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'resend', ...row }),
  });
  if (!res.ok) throw new Error('Failed to resend follow-up');
}
