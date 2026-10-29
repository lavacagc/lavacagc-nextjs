'use client';

import { useState } from 'react';

export default function VetoButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const veto = async () => {
    setState('busy');
    try {
      const res = await fetch('/api/experiments/veto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; kept?: string };
      if (res.ok) {
        setState('done');
        setMessage(`Vetoed. Control ${body.kept ?? ''} stays on the page.`.replace('  ', ' '));
      } else {
        setState('error');
        setMessage(body.error ?? 'Could not veto. Try again, or use the admin Experiments tab.');
      }
    } catch {
      setState('error');
      setMessage('Could not reach the site. Try again.');
    }
  };

  if (state === 'done') {
    return <p role="status" className="mt-5 rounded-lg bg-[#E8F3EC] p-3 text-sm font-bold text-[#1F5132]" data-testid="veto-done">{message}</p>;
  }
  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => void veto()}
        disabled={state === 'busy'}
        className="min-h-[48px] w-full rounded-lg bg-[#B42318] px-5 text-base font-bold text-white disabled:opacity-60"
      >
        {state === 'busy' ? 'Vetoing...' : 'Veto'}
      </button>
      {state === 'error' && <p role="alert" className="mt-3 text-sm text-[#B42318]">{message}</p>}
    </div>
  );
}
