'use client';

/**
 * The thread itself. Mobile first, because that is where a lead who just filled
 * in a form on their phone will open it.
 *
 * Every button press is one POST that returns the next question. There is no
 * model in the loop, so the "typing" pause is a deliberate 450ms of theatre to
 * stop three bubbles landing at once - not a request we are waiting on.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Send, Loader2 } from 'lucide-react';
import type { Step, StepOption } from '@/lib/intake/flow';

interface Bubble {
  id: string;
  who: 'bot' | 'me' | 'note';
  text: string;
}

const TYPING_MS = 450;

export default function IntakeThread({
  token,
  initialStep,
  finished,
  firstName,
}: {
  token: string;
  initialStep: Step;
  finished: boolean;
  firstName: string;
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>(() =>
    initialStep.say.map((text, i) => ({ id: `init-${i}`, who: 'bot' as const, text })),
  );
  const [step, setStep] = useState<Step>(initialStep);
  const [done, setDone] = useState(finished);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [bubbles, typing]);

  const push = useCallback((who: Bubble['who'], text: string) => {
    setBubbles((prev) => [...prev, { id: `${who}-${seq.current++}`, who, text }]);
  }, []);

  /** Land the bot's lines one after another rather than in a block. */
  const sayAll = useCallback(async (lines: string[]) => {
    for (const line of lines) {
      setTyping(true);
      await new Promise((r) => setTimeout(r, TYPING_MS));
      setTyping(false);
      setBubbles((prev) => [...prev, { id: `bot-${seq.current++}`, who: 'bot', text: line }]);
    }
  }, []);

  async function submitAnswer(value: string, echo: string) {
    if (busy || done) return;
    setBusy(true);
    setError(null);
    push('me', echo);

    try {
      const res = await fetch(`/api/intake/${encodeURIComponent(token)}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: value }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // The server distinguishes "did not save" from "not valid". Show
        // whichever it actually said rather than a generic apology.
        setError(data.error || "That didn't go through. Try once more.");
        setBusy(false);
        return;
      }

      await sayAll(data.step.say as string[]);
      setStep(data.step as Step);
      if (data.done) setDone(true);
    } catch {
      setError("That didn't go through. Check your connection and try once more.");
    } finally {
      setBusy(false);
    }
  }

  async function submitText() {
    const value = draft.trim();
    if (!value || busy || done) return;

    // At a button step, typed text is a question, not an answer. This is the
    // WEB-017 branch: it never gets answered, only acknowledged and routed.
    if (step.kind === 'buttons') {
      setDraft('');
      setBusy(true);
      setError(null);
      push('me', value);
      try {
        const res = await fetch(`/api/intake/${encodeURIComponent(token)}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "We couldn't pass that along. Please ask it on the call.");
        } else {
          await sayAll(data.reply as string[]);
          await sayAll([reAsk(data.step as Step)]);
        }
      } catch {
        setError("We couldn't pass that along. Please ask it on the call.");
      } finally {
        setBusy(false);
      }
      return;
    }

    setDraft('');
    await submitAnswer(value, value);
  }

  async function uploadPhotos(files: FileList) {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    const form = new FormData();
    Array.from(files).forEach((f) => form.append('photos', f));

    try {
      const res = await fetch(`/api/intake/${encodeURIComponent(token)}/photo`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Those photos didn't upload.");
      } else if (data.failed > 0) {
        push('note', `${data.uploaded} added, ${data.failed} couldn't be uploaded`);
      } else {
        push('note', `${data.uploaded} photo${data.uploaded === 1 ? '' : 's'} added`);
      }
    } catch {
      setError("Those photos didn't upload. You can show Alex on the call instead.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const showComposer = !done && (step.kind === 'text' || step.kind === 'buttons');
  const showPhoto = !done && step.field === 'message';

  return (
    <main className="flex min-h-screen flex-col bg-[#F6F7F9]">
      <header className="flex items-center gap-3 bg-[#002855] px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-white">
          LV
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold leading-tight text-white">La Vaca General Contractors</div>
          <div className="text-[11px] leading-tight text-[#9DB4D0]">Assistant</div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4" data-testid="intake-thread">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-2.5">
          {bubbles.map((b) =>
            b.who === 'note' ? (
              <div key={b.id} className="self-center text-center text-[11px] text-text-muted">
                {b.text}
              </div>
            ) : (
              <div
                key={b.id}
                data-role={b.who}
                className={
                  b.who === 'bot'
                    ? 'max-w-[86%] self-start rounded-2xl rounded-bl-md border border-[#E4E7EC] bg-white px-3.5 py-2.5 text-[15px] leading-relaxed text-text-primary'
                    : 'max-w-[86%] self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[15px] leading-relaxed text-white'
                }
              >
                {b.text}
              </div>
            ),
          )}

          {typing && (
            <div className="flex gap-1 self-start rounded-2xl rounded-bl-md border border-[#E4E7EC] bg-white px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#C3C7CE]"
                  style={{ animationDelay: `${i * 140}ms` }}
                />
              ))}
            </div>
          )}

          {!typing && !done && step.kind === 'buttons' && (step.options?.length ?? 0) > 0 && (
            <div className="flex max-w-full flex-wrap gap-2 self-start pt-1" data-testid="intake-options">
              {step.options!.map((o: StepOption) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={busy}
                  onClick={() => submitAnswer(o.value, o.label)}
                  className={
                    o.soft
                      ? 'min-h-[44px] rounded-full border-[1.5px] border-border bg-white px-3.5 text-[13px] font-semibold text-text-secondary transition-colors hover:border-primary disabled:opacity-50'
                      : 'min-h-[44px] rounded-full border-[1.5px] border-primary bg-white px-3.5 text-[13px] font-bold text-primary-dark transition-colors hover:bg-primary/5 disabled:opacity-50'
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="self-center rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-center text-[13px] leading-relaxed text-red-700"
            >
              {error}
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      {showComposer && (
        <div className="border-t border-[#E4E7EC] bg-white px-3 py-2.5">
          <div className="mx-auto flex w-full max-w-lg items-center gap-2">
            {showPhoto && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && uploadPhotos(e.target.files)}
                />
                <button
                  type="button"
                  aria-label="Add photos"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F2F4] text-text-secondary transition-colors hover:bg-[#E7E9EC] disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
              </>
            )}
            <input
              type="text"
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitText();
                }
              }}
              placeholder={step.kind === 'text' ? step.placeholder || 'Type your answer' : 'Or ask us something'}
              aria-label={step.kind === 'text' ? step.placeholder || 'Your answer' : 'Ask a question'}
              className="min-h-[44px] w-full min-w-0 rounded-full bg-[#F1F2F4] px-4 text-[15px] text-text-primary outline-none placeholder:text-[#9AA0A8] focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="button"
              aria-label="Send"
              disabled={busy || !draft.trim()}
              onClick={submitText}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-opacity disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {done && (
        <div className="border-t border-[#E4E7EC] bg-white px-4 py-4 text-center">
          <p className="text-sm font-semibold text-text-primary">
            Nothing else needed{firstName ? `, ${firstName}` : ''}.
          </p>
          <a
            href="tel:2012124917"
            className="mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-text-primary transition-colors hover:border-primary"
          >
            Call us on (201) 212-4917
          </a>
        </div>
      )}
    </main>
  );
}

/** Re-ask the current question after an off-script detour. */
function reAsk(step: Step): string {
  const last = step.say[step.say.length - 1] ?? '';
  return `Back to where we were: ${last.charAt(0).toLowerCase()}${last.slice(1)}`;
}
