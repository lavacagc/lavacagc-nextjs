'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { STREAMS, type StreamKey } from '@/lib/preferences/streams';

type StreamState = Record<StreamKey, boolean>;

const LOGO = '/logo.png';

type ConfirmTarget = StreamKey | 'all';

function parseConfirm(raw: string | null): ConfirmTarget | null {
  if (!raw) return null;
  if (raw === 'all') return 'all';
  const match = STREAMS.find((s) => s.key === raw);
  return match ? match.key : 'all';
}

export default function PreferencesClient() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const justDone = params.get('done');

  const [email, setEmail] = useState<string | null>(null);
  const [streams, setStreams] = useState<StreamState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(
    parseConfirm(params.get('confirm')),
  );
  const [savedMsg, setSavedMsg] = useState<{ text: string; kind: 'success' | 'error' } | null>(
    justDone ? { text: 'Your preferences have been updated.', kind: 'success' } : null,
  );

  const load = useCallback(async () => {
    if (!token) {
      setInvalid(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/preferences?token=${encodeURIComponent(token)}`);
      if (res.status === 404) {
        setInvalid(true);
        return;
      }
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setEmail(data.email);
      setStreams(data.streams);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (next: StreamState, prev: StreamState, message: string) => {
      setSaving(true);
      setSavedMsg(null);
      try {
        const res = await fetch('/api/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, changes: next }),
        });
        if (!res.ok) throw new Error('save failed');
        const data = await res.json();
        setStreams(data.streams);
        setSavedMsg({ text: message, kind: 'success' });
      } catch {
        setStreams(prev);
        setSavedMsg({
          text: 'Something went wrong saving your preferences. Please try again.',
          kind: 'error',
        });
      } finally {
        setSaving(false);
      }
    },
    [token],
  );

  const toggle = (key: StreamKey) => {
    if (!streams) return;
    const next = { ...streams, [key]: !streams[key] };
    setStreams(next);
    save(next, streams, 'Saved.');
  };

  const unsubscribeAll = () => {
    if (!streams) return;
    const next: StreamState = { home_care: false, buy_remodel: false, announcements: false };
    setStreams(next);
    save(next, streams, "You've been unsubscribed from all marketing emails.");
  };

  const confirmLabel =
    confirmTarget && confirmTarget !== 'all'
      ? STREAMS.find((s) => s.key === confirmTarget)?.label ?? 'this list'
      : 'all marketing emails';

  const confirmUnsubscribe = () => {
    if (!streams || !confirmTarget) return;
    const target = confirmTarget;
    setConfirmTarget(null);
    const next: StreamState =
      target === 'all'
        ? { home_care: false, buy_remodel: false, announcements: false }
        : { ...streams, [target]: false };
    setStreams(next);
    save(
      next,
      streams,
      target === 'all'
        ? "You've been unsubscribed from all marketing emails."
        : `You've been unsubscribed from ${confirmLabel}.`,
    );
  };

  const allOff = streams && !streams.home_care && !streams.buy_remodel && !streams.announcements;

  return (
    <div style={{ minHeight: '100vh', background: '#eef0ea' }} className="py-10 px-4">
      <div className="mx-auto" style={{ maxWidth: 560 }}>
        {/* Branded header */}
        <div style={{ background: '#002855' }} className="rounded-t-2xl px-6 py-5 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} width={40} height={40} alt="La Vaca" style={{ borderRadius: 10, background: '#fff' }} />
          <div>
            <div className="text-white font-extrabold text-lg leading-tight">Email preferences</div>
            <div style={{ color: '#FFCB8E' }} className="text-[11px] font-bold tracking-widest uppercase mt-0.5">
              La Vaca General Contractors
            </div>
          </div>
        </div>

        <div className="bg-white rounded-b-2xl px-6 py-6 shadow-sm">
          {loading ? (
            <p className="text-muted-foreground py-8 text-center">Loading your preferences…</p>
          ) : invalid ? (
            <div className="py-6 text-center" data-testid="invalid-state">
              <h1 className="text-xl font-bold mb-2">This link isn&apos;t valid</h1>
              <p className="text-muted-foreground">
                The link may have expired or been mistyped. You can manage your emails from the
                footer of any email we&apos;ve sent you.
              </p>
            </div>
          ) : loadError ? (
            <div className="py-6 text-center" data-testid="load-error-state">
              <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
              <p className="text-muted-foreground mb-4">
                We couldn&apos;t load your preferences right now. Please try again shortly.
              </p>
              <Button variant="outline" size="sm" onClick={load} data-testid="load-retry">
                Try again
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-1">
                Managing preferences for
              </p>
              <p className="font-semibold mb-5 break-all" data-testid="pref-email">
                {email}
              </p>

              {confirmTarget && streams && (
                <div
                  className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3"
                  data-testid="confirm-unsubscribe"
                >
                  <p className="text-sm font-semibold text-amber-900 mb-2">
                    Unsubscribe from {confirmLabel}?
                  </p>
                  <p className="text-xs text-amber-800 mb-3">
                    Nothing has changed yet — confirm below, or keep your subscription and adjust
                    individual lists instead.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={confirmUnsubscribe}
                      disabled={saving}
                      data-testid="confirm-unsubscribe-yes"
                    >
                      Yes, unsubscribe
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmTarget(null)}
                      disabled={saving}
                      data-testid="confirm-unsubscribe-keep"
                    >
                      Keep my subscription
                    </Button>
                  </div>
                </div>
              )}

              {savedMsg && (
                <div
                  className={`mb-4 rounded-md border text-sm px-3 py-2 ${
                    savedMsg.kind === 'error'
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  }`}
                  data-testid="saved-msg"
                >
                  {savedMsg.text}
                </div>
              )}

              <div className="space-y-3">
                {STREAMS.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-start justify-between gap-4 rounded-lg border p-4"
                    data-testid={`stream-${s.key}`}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold">{s.label}</div>
                      <div className="text-sm text-muted-foreground">{s.description}</div>
                    </div>
                    <Switch
                      checked={streams?.[s.key] ?? false}
                      disabled={saving}
                      onCheckedChange={() => toggle(s.key)}
                      aria-label={`Toggle ${s.label}`}
                      data-testid={`switch-${s.key}`}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  You&apos;ll still get important account &amp; project emails (like estimates and
                  booking confirmations) — those aren&apos;t marketing.
                </p>
                {!allOff && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={unsubscribeAll}
                    disabled={saving}
                    data-testid="unsubscribe-all"
                    className="flex-shrink-0"
                  >
                    Unsubscribe from all
                  </Button>
                )}
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          La Vaca General Contractors · Northern New Jersey · NJ HIC# 13VH13373800
        </p>
      </div>
    </div>
  );
}
