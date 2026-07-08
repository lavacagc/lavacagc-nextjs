'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const LOGO = '/logo.png';

/**
 * Public tokenless unsubscribe page (/unsub, aliased from /unsubscribe).
 *
 * The self-service preference center (/preferences) needs a signed token, so
 * anyone who reaches an unsubscribe URL without one — a short link, a mistyped
 * address, a link that never carried a token — would otherwise be stuck. This
 * page always lets a recipient opt out by entering their email, satisfying the
 * CAN-SPAM requirement that the mechanism actually works. It pre-fills from an
 * ?email= param when present.
 */
export default function UnsubClient() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Follow-ups mode: the "unsubscribe" link on a lead follow-up / review-request
  // email. Opts out of just those (transactional) emails, NOT marketing streams.
  const isFollowUps = params.get('stream') === 'follow_ups';

  useEffect(() => {
    const prefill = params.get('email');
    if (prefill) {
      setEmail(prefill);
    }
  }, [params]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/preferences/unsubscribe-by-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isFollowUps ? { email, stream: 'follow_ups' } : { email }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setDone(true);
      } else {
        setError(data.error || 'Something went wrong — please try again.');
      }
    } catch {
      setError('Something went wrong — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#eef0ea' }} className="py-10 px-4">
      <div className="mx-auto" style={{ maxWidth: 560 }}>
        {/* Branded header */}
        <div style={{ background: '#002855' }} className="rounded-t-2xl px-6 py-5 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} width={40} height={40} alt="La Vaca" style={{ borderRadius: 10, background: '#fff' }} />
          <div>
            <div className="text-white font-extrabold text-lg leading-tight">Unsubscribe</div>
            <div style={{ color: '#FFCB8E' }} className="text-[11px] font-bold tracking-widest uppercase mt-0.5">
              La Vaca General Contractors
            </div>
          </div>
        </div>

        <div className="bg-white rounded-b-2xl px-6 py-6 shadow-sm">
          {done ? (
            <div className="py-6 text-center" data-testid="unsub-done">
              <h1 className="text-xl font-bold mb-2">
                {isFollowUps ? 'Follow-ups stopped' : 'You’ve been unsubscribed'}
              </h1>
              <p className="text-muted-foreground">
                {isFollowUps ? (
                  <>
                    We&apos;ve stopped follow-up and review-request emails to{' '}
                    <span className="font-semibold break-all">{email}</span>. You&apos;ll still receive any
                    estimates, scheduling, or other messages you&apos;re expecting from us.
                  </>
                ) : (
                  <>
                    We&apos;ve removed <span className="font-semibold break-all">{email}</span> from La Vaca
                    marketing emails. You&apos;ll still receive important account and project messages (like
                    estimates and scheduling).
                  </>
                )}
              </p>
              <p className="text-muted-foreground mt-4 text-sm">
                Changed your mind?{' '}
                <Link href="/home-care" className="text-primary font-semibold hover:underline">
                  Re-join La Vaca Home Care
                </Link>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={submit} data-testid="unsub-form">
              <h1 className="text-xl font-bold mb-2">
                {isFollowUps ? 'Stop follow-up emails' : 'Unsubscribe from marketing emails'}
              </h1>
              <p className="text-sm text-muted-foreground mb-5">
                {isFollowUps ? (
                  <>
                    Enter your email and we&apos;ll stop the follow-up and review-request emails about your
                    inquiry. This won&apos;t affect any newsletters or other La Vaca emails you signed up for.
                  </>
                ) : (
                  <>
                    Enter your email and we&apos;ll stop sending La Vaca marketing emails — the Home Care
                    checklist, listings, and occasional news. Important account and project emails still
                    come through.
                  </>
                )}
              </p>

              <label htmlFor="unsub-email" className="block text-sm font-semibold mb-1.5">
                Email address
              </label>
              <Input
                id="unsub-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mb-1"
                data-testid="unsub-email"
              />
              {error && (
                <p className="text-sm text-destructive mt-2" data-testid="unsub-error" role="alert">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full mt-4 bg-secondary text-secondary-foreground hover:bg-secondary/90 font-bold"
                data-testid="unsub-submit"
              >
                {submitting ? 'Unsubscribing…' : 'Unsubscribe'}
              </Button>

              <p className="text-xs text-muted-foreground mt-4 text-center">
                Prefer to choose which emails you get? Manage them from the footer of any email we&apos;ve
                sent you.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
