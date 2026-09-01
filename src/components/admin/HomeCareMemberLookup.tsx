'use client';

/**
 * "Is this address a Home Care member, and did their sign-in link go out?"
 *
 * Sits under the preference-centre lookup because it answers a question about
 * the SAME address staff just typed there - one search box, everything known
 * about that contact. It exists because the public login endpoint answers every
 * caller identically so it cannot be used to enumerate members, which left
 * staff with the same non-answer as a stranger. Here the reason is stated
 * plainly, because the caller is already authenticated.
 *
 * The verdict line is the point: it says what the public route WOULD do with
 * this address right now, rather than printing a status and leaving whoever is
 * on the phone to work out the consequence.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Home, Send, Loader2, AlertTriangle } from 'lucide-react';

interface Member {
  id: string;
  first_name: string | null;
  status: 'pending' | 'active' | 'unsubscribed';
  created_at: string | null;
  verified_at: string | null;
  unsubscribed_at: string | null;
  source: string | null;
  has_pending_link: boolean;
  verify_token_expires_at: string | null;
  can_send_link: boolean;
}

interface MailRow {
  created_at: string;
  category: string;
  subject: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
}

interface LookupResponse {
  email: string;
  member: Member | null;
  mail: MailRow[];
  mailHistoryError: string | null;
}

/** Pinned so a server-rendered date and the browser's cannot disagree. */
const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-US', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
      })
    : '-';

const STATUS_VARIANT: Record<Member['status'], 'default' | 'secondary' | 'destructive'> = {
  active: 'default',
  pending: 'secondary',
  unsubscribed: 'destructive',
};

/** What a member in this state gets when they ask for a sign-in link. */
function verdict(member: Member | null): { tone: 'ok' | 'warn' | 'bad'; text: string } {
  if (!member) {
    return {
      tone: 'bad',
      text: 'No Home Care member with this address. Asking for a sign-in link sends nothing, and the form still says "check your email" - it cannot admit the address is unknown without revealing who is a member. They need to sign up first.',
    };
  }
  if (member.status === 'unsubscribed') {
    return {
      tone: 'bad',
      text: 'This member unsubscribed, so no sign-in link is sent. Re-subscribe them above before trying again.',
    };
  }
  if (member.status === 'pending') {
    return {
      tone: 'warn',
      text: 'Signed up but never confirmed. A sign-in link WILL be sent, and clicking it finishes their signup and sends the welcome email.',
    };
  }
  return { tone: 'ok', text: 'Active member. A sign-in link is sent whenever they ask for one.' };
}

const TONE_CLASS = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  bad: 'border-red-200 bg-red-50 text-red-900',
} as const;

export default function HomeCareMemberLookup({ email }: { email: string }) {
  const { toast } = useToast();
  const [data, setData] = useState<LookupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/home-care/member?email=${encodeURIComponent(email)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Lookup failed');
      setData(body);
    } catch (err) {
      setData(null);
      toast({
        title: 'Home Care lookup failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [email, toast]);

  useEffect(() => { load(); }, [load]);

  const resend = useCallback(async () => {
    setSending(true);
    try {
      const res = await fetch('/api/admin/home-care/member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Send failed');
      toast({
        title: 'Sign-in link sent',
        description: `${email} can use it for the next ${body.expiresInHours} hours.`,
      });
      load(); // the mail history now has one more row
    } catch (err) {
      toast({
        title: 'Could not send the link',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  }, [email, toast, load]);

  if (!email) return null;

  const member = data?.member ?? null;
  const v = verdict(member);

  return (
    <Card className="mt-6" data-testid="home-care-member-lookup">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Home className="h-4 w-4" /> Home Care membership
          {member && (
            <Badge variant={STATUS_VARIANT[member.status]} data-testid="hc-member-status">
              {member.status}
            </Badge>
          )}
          {data && !member && <Badge variant="outline">not a member</Badge>}
        </CardTitle>
        <CardDescription>
          What the sign-in link flow does for {email}, and the Home Care mail it has received.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking…
          </p>
        ) : (
          <>
            <p className={`rounded-lg border p-3 text-sm ${TONE_CLASS[v.tone]}`} data-testid="hc-member-verdict">
              {v.text}
            </p>

            {member && (
              <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Name</dt><dd className="font-medium">{member.first_name || '-'}</dd></div>
                <div><dt className="text-muted-foreground">Signed up</dt><dd className="font-medium">{fmt(member.created_at)}</dd></div>
                <div><dt className="text-muted-foreground">Confirmed</dt><dd className="font-medium">{fmt(member.verified_at)}</dd></div>
                <div><dt className="text-muted-foreground">Source</dt><dd className="font-medium">{member.source || '-'}</dd></div>
                {member.has_pending_link && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Outstanding link</dt>
                    <dd className="font-medium">expires {fmt(member.verify_token_expires_at)}</dd>
                  </div>
                )}
              </dl>
            )}

            {member?.can_send_link && (
              <Button onClick={resend} disabled={sending} className="mt-4 gap-2" data-testid="hc-resend-link">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send them a sign-in link
              </Button>
            )}

            <h4 className="mt-6 mb-2 text-sm font-semibold">Recent mail to this address</h4>
            {data?.mailHistoryError ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Could not read the mail log, so this list is unknown rather than empty: {data.mailHistoryError}
              </p>
            ) : data && data.mail.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No email has ever been sent to this address.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-semibold">When</th>
                      <th className="py-2 pr-3 font-semibold">Type</th>
                      <th className="py-2 pr-3 font-semibold">Subject</th>
                      <th className="py-2 font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.mail.map((m, i) => (
                      <tr key={`${m.created_at}-${i}`} className="border-b last:border-0 align-top">
                        <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">{fmt(m.created_at)}</td>
                        <td className="whitespace-nowrap py-2 pr-3">{m.category}</td>
                        <td className="py-2 pr-3">{m.subject}</td>
                        <td className="py-2">
                          <Badge variant={m.status === 'sent' || m.status === 'delivered' ? 'default' : 'destructive'}>
                            {m.status}
                          </Badge>
                          {m.error_message && (
                            <div className="mt-1 text-xs text-red-700">{m.error_message}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
