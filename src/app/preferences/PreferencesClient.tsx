'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { STREAMS, type StreamKey } from '@/lib/preferences/preferences';

type StreamState = Record<StreamKey, boolean>;

const LOGO = 'https://www.lavacagc.com/logo.png';

export default function PreferencesClient() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const justDone = params.get('done');

  const [email, setEmail] = useState<string | null>(null);
  const [streams, setStreams] = useState<StreamState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(
    justDone ? 'Your preferences have been updated.' : null,
  );

  const load = useCallback(async () => {
    if (!token) {
      setInvalid(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/preferences?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        setInvalid(true);
        return;
      }
      const data = await res.json();
      setEmail(data.email);
      setStreams(data.streams);
    } catch {
      setInvalid(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (next: StreamState, message: string) => {
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
        setSavedMsg(message);
      } catch {
        setSavedMsg('Something went wrong saving your preferences. Please try again.');
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
    save(next, 'Saved.');
  };

  const unsubscribeAll = () => {
    if (!streams) return;
    const next: StreamState = { home_care: false, buy_remodel: false, announcements: false };
    setStreams(next);
    save(next, "You've been unsubscribed from all marketing emails.");
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
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-1">
                Managing preferences for
              </p>
              <p className="font-semibold mb-5 break-all" data-testid="pref-email">
                {email}
              </p>

              {savedMsg && (
                <div
                  className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm px-3 py-2"
                  data-testid="saved-msg"
                >
                  {savedMsg}
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
