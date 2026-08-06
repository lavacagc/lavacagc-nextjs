'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, ClipboardList, Sparkles, History, X, EyeOff, RotateCcw, PartyPopper, Share2, Copy, MapPin, Wrench, Home, ChevronDown, Pencil, Trash2, Undo2 } from 'lucide-react';
import { hasGuideItem } from '@/lib/homecare/guides';
import { prevSeason, seasonStart, SEASONS, type Season } from '@/lib/homecare/season';
import { getFactForTask, HOME_FACTS, factValueSummary } from '@/lib/homecare/records';
import HomeCareRecordCapture, { type RecordValue } from '@/components/homecare/HomeCareRecordCapture';
import DiyKitShelf from '@/components/homecare/DiyKitShelf';
import { useToast } from '@/hooks/use-toast';
import { taskChoice, shelfVisible, requestedTaskKeys } from '@/lib/homecare/taskChoice';
import type { HomeCareProduct } from '@/lib/homecare/products';

const SHARE_URL = 'https://www.lavacagc.com/home-care?utm_source=member_share&utm_medium=portal&utm_campaign=home_care_share';
const SHARE_TEXT = 'I use this free seasonal checklist to stay on top of the house — takes 20 seconds to set up, no account.';

export interface ChecklistTask {
  key: string;
  title: string;
  blurb: string;
  diy_or_pro: 'diy' | 'pro' | 'either';
  bookable: boolean;
  /**
   * A `diy` task La Vaca will also do on request. Only meaningful alongside
   * `diy_or_pro`; see `taskChoice` for the three shapes a card can take.
   *
   * No `est_cost_*` here on purpose: the member checklist no longer quotes a
   * price anywhere (owner decision 2026-08-06). The columns still exist and the
   * admin quoting tools still read them - this surface stopped being a reader,
   * so it does not ask for them.
   */
  pro_optional?: boolean;
  seasons: string[];
  frequency: string;
  starter: boolean;
  stages?: string[];
}

const SEASON_LABEL: Record<string, string> = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' };
const FREQ_LABEL: Record<string, string> = { quarterly: 'Every few months', annual: 'Once a year' };

// Seasonal "project spotlight" — tees up the right big remodel for the moment.
const SEASON_SPOTLIGHTS: Record<string, { eyebrow: string; title: string; body: string }> = {
  winter: {
    eyebrow: 'Winter · design season',
    title: 'The best spring projects start now',
    body: 'Winter is when we design kitchens, baths, and additions — so we can break ground the moment the weather turns.',
  },
  spring: {
    eyebrow: 'Spring · outdoor season',
    title: 'Prime time for decks, patios & windows',
    body: 'Spring is the moment for decks, patios, siding, and windows — and our build calendar fills fast.',
  },
  summer: {
    eyebrow: 'Summer · space season',
    title: 'Add the room you’ve been wanting',
    body: 'Long summer days are made for additions, finished basements, and bonus rooms — comfortable indoor work while the weather’s great outside.',
  },
  fall: {
    eyebrow: 'Fall · host-ready season',
    title: 'Refresh the spaces you gather in',
    body: 'Fall is the time for kitchens, flooring, mudrooms, and finished basements — done and dusted before the holidays.',
  },
};

const id = (key: string, season: string) => `${key}|${season}`;

/**
 * One line of blurb, with the way to open it INLINE at the end of that line.
 *
 * Two things about this are deliberate.
 *
 * ONE LINE, not two. The blurb explains why a task matters, which most members
 * only need once; the title carries the rest. Clamping it is the other half of
 * how a six-row card became three.
 *
 * THE AFFORDANCE IS INLINE, and it is not its own button. A truncated line with
 * no visible way to open it is not a control, it is a trap - and globals.css
 * gives every `button` a 44px floor, so a "more" button of its own would cost
 * more height than the clamp saves. Instead the whole line is one block button
 * with `min-h-0` overriding that floor and `py-1` keeping the tap target above
 * the 24px WCAG AA minimum, with "more" as a plain span riding at the end of
 * the text.
 */
function ClampedBlurb({ text, expanded, onToggle }: { text: string; expanded: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    // Measure only while clamped - an expanded blurb never reports overflow.
    if (expanded) return;
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [text, expanded]);

  const body = (
    // line-clamp needs its own -webkit-box display, so only use block when expanded.
    <span ref={ref} className={`text-[13px] leading-snug text-text-secondary ${expanded ? 'block' : 'line-clamp-1'}`}>
      {text}
    </span>
  );

  // Nothing to open: no control, and no phantom "more" on a blurb that fits.
  if (!overflows && !expanded) return <span className="mt-0.5 block">{body}</span>;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      data-testid="blurb-toggle"
      className="mt-0.5 flex w-full min-h-0 cursor-pointer items-baseline gap-1.5 py-1 text-left"
    >
      <span className="min-w-0 flex-1">{body}</span>
      <span className="shrink-0 text-[11px] font-extrabold text-primary">{expanded ? 'less' : 'more'}</span>
    </button>
  );
}
// Dismissal is scoped to this season of this year, so the card comes back next season.
const catchUpDismissKey = (season: string) => `hc-catchup-dismissed:${seasonStart().getUTCFullYear()}-${season}`;

export default function HomeCareChecklistClient({
  tasks,
  doneItems,
  dismissedKeys = [],
  showStarter = true,
  currentSeason,
  showCatchUp = false,
  autoAddKey,
  lavacaCompleted: lavacaCompletedFromServer,
  modes: modesFromServer = {},
  homeRecordPrefill = {},
  homeDetailsConsentGiven = false,
  productShelves = {},
  affiliateTag = null,
}: {
  tasks: ChecklistTask[];
  doneItems: { task_key: string; season: string }[];
  dismissedKeys?: string[];
  showStarter?: boolean;
  currentSeason: string;
  showCatchUp?: boolean;
  autoAddKey?: string;
  /**
   * `task_key|season` -> ISO date, for work LA VACA performed. Keyed per season
   * like `done` is, so a completion never labels the same task in another
   * season. A task the member ticked themselves is absent here and renders no
   * label - that distinction is the whole point of completed_by.
   */
  lavacaCompleted?: Record<string, string>;
  /**
   * `task_key|season` -> who the member said is doing it. Keyed per season like
   * `done`, and absent for every task they have not decided about - which is
   * the state a card opens in, and the reason the gear shelf is not on screen
   * before anyone has said they are doing the work themselves.
   */
  modes?: Record<string, 'diy' | 'pro'>;
  /** Saved home facts keyed by canonical fact_key, for prefilling capture panels. */
  homeRecordPrefill?: Record<string, RecordValue>;
  /** Whether the homeowner has already consented to saving home details (skip the checkbox). */
  homeDetailsConsentGiven?: boolean;
  /**
   * DIY Kit shelves, keyed by task_key. Only the tasks the owner has stocked
   * appear here, so a task with no entry renders exactly as it did before the
   * feature existed - no empty strip, no zero count, no layout shift.
   */
  productShelves?: Record<string, HomeCareProduct[]>;
  /** AMAZON_ASSOCIATES_TAG, read server-side. Absent renders untagged links. */
  affiliateTag?: string | null;
}) {
  // Local, because re-ticking a task moves the attribution to the member and
  // the server has already agreed: /api/home-care/task writes
  // completed_by='homeowner'. Left as a plain prop, the open tab would keep
  // reading "Completed by La Vaca" over work the member just did themselves -
  // which is the exact case the attribution exists to distinguish.
  const { toast } = useToast();
  const [lavacaCompleted, setLavacaCompleted] = useState<Record<string, string>>(lavacaCompletedFromServer ?? {});
  const [done, setDone] = useState<Set<string>>(new Set(doneItems.map((d) => id(d.task_key, d.season))));
  const [dismissed, setDismissed] = useState<Set<string>>(new Set(dismissedKeys));
  /**
   * Tasks put on the request by hand: the ＋ circle on a pro-only card, and the
   * `?add=` deep link. Everything the member chose with "La Vaca does it" is
   * NOT here - that lives in `modes`, and `selected` below unions the two.
   */
  const [picked, setPicked] = useState<Set<string>>(() => new Set(autoAddKey ? [autoAddKey] : []));
  const [busy, setBusy] = useState<string | null>(null);
  /** The task the hide icon just removed, so the undo bar can name it. */
  const [lastHidden, setLastHidden] = useState<{ key: string; title: string } | null>(null);
  const [activeSeason, setActiveSeason] = useState<string>(SEASONS.includes(currentSeason as (typeof SEASONS)[number]) ? currentSeason : 'spring');
  const [catchUpDismissed, setCatchUpDismissed] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle');
  const [stickyTop, setStickyTop] = useState(0);
  const [expandedBlurbs, setExpandedBlurbs] = useState<Set<string>>(new Set());
  /** `task_key|season` -> 'diy' | 'pro'. Absent means undecided. */
  const [modes, setModes] = useState<Record<string, 'diy' | 'pro'>>(modesFromServer);

  /**
   * The consolidated request, derived rather than stored - see
   * `requestedTaskKeys`, which owns the rule and is unit-tested.
   *
   * Everything downstream reads this: the card tint, the ＋ circle's pressed
   * state, `requestUrl`, and the sticky pill. That is the point. A chip reading
   * "On your request" is the same fact as the pill's count, so they are read
   * from the same place and cannot disagree - not after a reload, not across
   * two seasons of the same task, and not after the chip's reset.
   */
  const selected = useMemo(
    () => requestedTaskKeys({ tasks, modes, picked, dismissed }),
    [tasks, modes, picked, dismissed],
  );

  /**
   * Where keyboard focus must land after a choice: `chip|<task|season>` or
   * `toggle|<task|season>`.
   *
   * Picking a side unmounts the control that was pressed - the segmented toggle
   * folds into the chip, and the chip's reset unfolds it again - so left alone,
   * focus drops to <body> and a keyboard or screen-reader member loses their
   * place mid-list. Set on the write and again on a failed write's revert,
   * because that swaps the control back a second time.
   *
   * The target is HELD until a focus can actually land. Its replacement mounts
   * in the same batched render that sets `busy`, so it mounts disabled, and a
   * disabled button is not a focusable area - focusing it there is a silent
   * no-op. `busy` is therefore a dependency: the write settling re-runs this,
   * and only then is the target cleared.
   */
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const choiceRefs = useRef(new Map<string, HTMLButtonElement | null>());
  useEffect(() => {
    if (!focusTarget) return;
    const el = choiceRefs.current.get(focusTarget);
    if (el?.disabled) return;
    el?.focus();
    setFocusTarget(null);
  }, [focusTarget, busy]);

  const toggleBlurb = (k: string) => {
    setExpandedBlurbs((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  // My Home Systems: an overlay of saved facts keyed by canonical fact_key, so a
  // save from one task row immediately prefills (and flips the label on) every
  // sibling row that maps to the same fact. consentGiven flips to true after the
  // first successful save so later panels skip the consent checkbox.
  const [records, setRecords] = useState<Map<string, RecordValue>>(() => new Map(Object.entries(homeRecordPrefill)));
  const [consentGiven, setConsentGiven] = useState(homeDetailsConsentGiven);
  const [capturePanelOpen, setCapturePanelOpen] = useState<Set<string>>(new Set());

  const toggleCapture = (k: string) => {
    setCapturePanelOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const handleRecordSaved = (factKey: string, value: RecordValue) => {
    setRecords((prev) => new Map(prev).set(factKey, value));
    setConsentGiven(true);
  };

  // "My Home" recap delete: fulfills the "view or delete anytime" consent
  // promise. Optimistic with revert, and a two-tap confirm so a saved detail is
  // never lost by an accidental tap.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);

  const handleRecordDelete = async (factKey: string) => {
    const prev = records.get(factKey);
    setDeleteError(null);
    setRecords((m) => {
      const next = new Map(m);
      next.delete(factKey);
      return next;
    });
    setCapturePanelOpen((s) => {
      const next = new Set(s);
      next.delete(`recap:${factKey}`);
      return next;
    });
    setConfirmDelete(null);
    try {
      const res = await fetch('/api/home-care/record', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ fact_key: factKey }),
      });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
    } catch {
      // Revert so the homeowner never silently loses a saved detail.
      if (prev) setRecords((m) => new Map(m).set(factKey, prev));
      setDeleteError(factKey);
      setRecapOpen(true);
    }
  };

  // The plan header sticks just below the site header, whose height varies by
  // breakpoint — measure it instead of hardcoding offsets.
  useEffect(() => {
    const header = document.querySelector('header');
    if (!header) {
      setStickyTop(0);
      return;
    }
    const measure = () => setStickyTop(Math.round(header.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const shareResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (shareResetTimer.current != null) clearTimeout(shareResetTimer.current);
    };
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(catchUpDismissKey(currentSeason)) === '1') setCatchUpDismissed(true);
    } catch {
      // localStorage unavailable (e.g. blocked storage) — fall back to session-only dismissal
    }
  }, [currentSeason]);

  // A ?add= deep-link pre-selects a task; if it's a seasonal task that lives
  // in another season, jump to the first season it applies to so the member
  // can see the row they were promised. Starter/essentials tasks render in
  // their own section regardless of season, so they never need a switch.
  const autoAddApplied = useRef(false);
  useEffect(() => {
    if (autoAddApplied.current || !autoAddKey) return;
    autoAddApplied.current = true;
    const task = tasks.find((t) => t.key === autoAddKey);
    if (!task || task.starter || task.seasons.includes(activeSeason)) return;
    const target = SEASONS.find((s) => task.seasons.includes(s));
    if (target) setActiveSeason(target);
  }, [autoAddKey, tasks, activeSeason]);

  const dismissCatchUp = () => {
    setCatchUpDismissed(true);
    try {
      window.localStorage.setItem(catchUpDismissKey(currentSeason), '1');
    } catch {
      // localStorage unavailable — dismissal lasts for this page view only
    }
  };

  // What slipped last season: applicable recurring tasks the member never
  // checked off. Recomputed from live state so checking one shrinks the list.
  const lastSeason = prevSeason(currentSeason as Season);
  const missedTasks = tasks.filter((t) => !t.starter && t.seasons.includes(lastSeason) && !done.has(id(t.key, lastSeason)) && !dismissed.has(t.key));
  const showCatchUpCard = showCatchUp && !catchUpDismissed && missedTasks.length > 0 && activeSeason === currentSeason;

  const starterTasks = tasks.filter((t) => t.starter && !dismissed.has(t.key));
  const seasonTasks = tasks.filter((t) => !t.starter && t.seasons.includes(activeSeason) && !dismissed.has(t.key));
  const hiddenTasks = tasks.filter((t) => dismissed.has(t.key));
  const showStarterSection = showStarter && starterTasks.length > 0;
  // Can ANYTHING on this list reach the request, and by which route. No longer
  // the same question as `bookable`: a `diy` + `pro_optional` task is
  // requestable through the "La Vaca does it" toggle while its bookable column
  // stays false on purpose, because bookable also drives the admin walk-in
  // dropdown and the newsletter CTA. Read through `taskChoice` so the hint
  // tracks the card shapes rather than a column that no longer means this.
  const hasChoice = tasks.some((t) => taskChoice(t) === 'choose');
  const hasPlusAdd = tasks.some((t) => taskChoice(t) === 'pro_only' && t.bookable);
  // Saved home facts for the "My Home" recap, in registry order (stable).
  const savedFacts = HOME_FACTS.filter((f) => records.has(f.key));

  // Plan progress: the active season's tasks plus (for members who see them)
  // the one-time essentials — one bar for the whole visible plan, dismissed
  // tasks out of the denominator.
  const trackedStarter = showStarterSection ? starterTasks : [];
  const seasonDone = seasonTasks.filter((t) => done.has(id(t.key, activeSeason))).length;
  const starterDone = trackedStarter.filter((t) => done.has(id(t.key, 'starter'))).length;
  const planTotal = seasonTasks.length + trackedStarter.length;
  const planDone = seasonDone + starterDone;
  const planPct = planTotal > 0 ? Math.round((planDone / planTotal) * 100) : 0;
  const planComplete = planTotal > 0 && planDone === planTotal;
  const planLabel = trackedStarter.length > 0 ? `${SEASON_LABEL[activeSeason]} + essentials` : SEASON_LABEL[activeSeason];

  /** Writes the hide/unhide and reports whether it landed, so a caller can undo its own UI. */
  const setDismissState = async (key: string, dismiss: boolean): Promise<boolean> => {
    setDismissed((prev) => {
      const next = new Set(prev);
      if (dismiss) next.add(key);
      else next.delete(key);
      return next;
    });
    if (dismiss) {
      // Only the hand-made pick needs clearing; a `pro` mode drops off the
      // request on its own, because `requestedTaskKeys` skips dismissed tasks.
      setPicked((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
    setBusy(`dismiss|${key}`);
    try {
      const res = await fetch('/api/home-care/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ task_key: key, dismiss }),
      });
      if (!res.ok) throw new Error(`dismiss failed: ${res.status}`);
      return true;
    } catch {
      setDismissed((prev) => {
        const revert = new Set(prev);
        if (dismiss) revert.delete(key);
        else revert.add(key);
        return revert;
      });
      return false;
    } finally {
      setBusy(null);
    }
  };

  /**
   * Hide a task and say so, with one tap to take it back.
   *
   * The hide control lost its "Not relevant" label when it became an icon
   * (owner, 5 Aug 2026), and an unlabelled control that makes a row vanish is
   * exactly the shape a mis-tap takes on a phone. The Hidden strip at the foot
   * of the page can always restore it, but a member who does not know what they
   * just pressed will not go looking for a strip they have never seen. The undo
   * bar sits in the sticky header, where their thumb already is.
   *
   * The bar goes up optimistically and comes back down if the write did not
   * land - an offline phone, an expired cookie. Leaving it up would have the
   * header announcing "Hidden: <task>" with an Undo button while the row is
   * plainly still on the page, and pressing that Undo would POST an unhide for
   * a task that was never hidden. Keyed, so a second hide that succeeded while
   * this one was failing keeps its own bar.
   */
  const dismissWithUndo = (key: string, title: string) => {
    setLastHidden({ key, title });
    void setDismissState(key, true).then((ok) => {
      if (!ok) setLastHidden((prev) => (prev?.key === key ? null : prev));
    });
  };

  const shareHomeCare = async () => {
    // Native share sheet only where it's a real UX (touch devices) — on
    // desktop the sheet is rare/awkward and copy-link is what people expect.
    const touchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    if (touchDevice && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'La Vaca Home Care', text: SHARE_TEXT, url: SHARE_URL });
        return;
      } catch (err) {
        // AbortError = the user closed the share sheet — done. Anything else
        // falls through to copy.
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    const payload = `${SHARE_TEXT} ${SHARE_URL}`;
    let copied = false;
    try {
      await navigator.clipboard.writeText(payload);
      copied = true;
    } catch {
      // Clipboard API blocked (permissions, older browsers) — legacy path.
      const ta = document.createElement('textarea');
      ta.value = payload;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      } finally {
        ta.remove();
      }
    }
    if (!copied) return;
    setShareState('copied');
    if (shareResetTimer.current != null) clearTimeout(shareResetTimer.current);
    shareResetTimer.current = setTimeout(() => setShareState('idle'), 2500);
  };

  const toggleDone = async (key: string, season: string) => {
    const k = id(key, season);
    const nowDone = !done.has(k);
    setDone((prev) => {
      const next = new Set(prev);
      if (nowDone) next.add(k);
      else next.delete(k);
      return next;
    });
    // The write reassigns the row to the member, so its La Vaca attribution
    // goes with it - kept here so it can be put back if the write fails.
    const heldAttribution = lavacaCompleted[k];
    if (heldAttribution) {
      setLavacaCompleted((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    }
    setBusy(k);
    try {
      const res = await fetch('/api/home-care/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ task_key: key, season, done: nowDone }),
      });
      if (!res.ok) throw new Error(`task update failed: ${res.status}`);
    } catch {
      setDone((prev) => {
        const revert = new Set(prev);
        if (nowDone) revert.delete(k);
        else revert.add(k);
        return revert;
      });
      if (heldAttribution) setLavacaCompleted((prev) => ({ ...prev, [k]: heldAttribution }));
    } finally {
      setBusy(null);
    }
  };

  /** The ＋ circle on a pro-only card. A `choose` task goes on via `setMode`. */
  const togglePicked = (key: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /**
   * Record who is doing a task, and put it on (or take it off) the request.
   *
   * Picking "La Vaca does it" IS adding it to the request - one tap, not two
   * (owner decision 2026-08-06). That is also what let the card lose a row:
   * the choice control and the old "Add to request" button were the same
   * action, so only one of them survives. Nothing is sent to anyone until the
   * member checks the request out, so this stays fully reversible.
   *
   * Tapping the current choice again clears it, which is the only way back to
   * undecided - and it takes the task off the request if it was on it, because
   * "I have not decided" cannot mean "please come and do it". The chip a decided
   * card collapses into calls exactly this with the mode it is showing, so
   * "change your mind" is one persisted reversal rather than a local unhide that
   * a reload would undo.
   *
   * Nothing is written about the request itself: membership is DERIVED from
   * these modes (see `requestedTaskKeys`), so the pill follows the chip by
   * construction instead of by a second write that could miss.
   *
   * Optimistic, with a revert: the member's tap must feel instant, and a failed
   * write that silently kept the new state would tell them we are coming when
   * nobody knows we are.
   */
  const setMode = async (key: string, season: string, next: 'diy' | 'pro') => {
    const k = id(key, season);
    const previous = modes[k];
    const value = previous === next ? undefined : next;

    setModes((prev) => {
      const copy = { ...prev };
      if (value) copy[k] = value;
      else delete copy[k];
      return copy;
    });
    setFocusTarget(`${value ? 'chip' : 'toggle'}|${k}`);

    setBusy(`mode|${k}`);
    try {
      const res = await fetch('/api/home-care/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ task_key: key, season, mode: value ?? null }),
      });
      if (!res.ok) throw new Error(`mode update failed: ${res.status}`);
    } catch {
      setModes((prev) => {
        const copy = { ...prev };
        if (previous) copy[k] = previous;
        else delete copy[k];
        return copy;
      });
      setFocusTarget(`${previous ? 'chip' : 'toggle'}|${k}`);
      toast({
        title: 'Could not save that',
        description: 'We could not record who is doing this task. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  /**
   * Take a task off the consolidated request outright.
   *
   * The deep links - the newsletter's "Add to plan", a guide's "Add this on my
   * checklist", any `?add=` - put a task on the request before the member has
   * said anything about who is doing it, and they KEEP it there afterwards:
   * saying "I'll do it" this season is not a withdrawal of the ask (owner
   * decision 2026-08-06). That is only honest while there is a way back off,
   * because a `choose` card has no ＋ circle to un-press.
   *
   * Removal has to hold against a recompute, so it clears every input that
   * could put the task back: the hand-made pick, and any season still storing
   * `pro`. Those are per (task, season) and the request is per task, so a
   * summer "La Vaca does it" left standing would silently re-add the task the
   * member just took off. Each is cleared through `setMode`, re-sending the
   * mode it already holds - the "tap the current choice again" path - so the
   * reversal is persisted and reverts on failure like any other.
   *
   * `focusKey` is resolved by the card that owns the button, because only it
   * knows which control it will be left showing once `isSel` flips and the
   * button unmounts. It cannot be inferred here: the seasons this clears are by
   * definition NOT the one on screen (the button only renders where the active
   * season is not already saying "On your request"), so the targets `setMode`
   * sets on the way through point at cards no tab is currently rendering. It is
   * therefore set last, after those, so the card the member is actually looking
   * at is the one that wins.
   */
  const clearing = useRef<Set<string>>(new Set());
  const clearFromRequest = async (key: string, focusKey: string) => {
    // One at a time per task. `setMode` clears a season by re-sending the mode
    // it already holds, which a re-entrant call reading the pre-click `modes`
    // would send as a fresh 'pro' - putting back the task it was asked to take
    // off. A second tap while the first is settling has nothing left to do.
    if (clearing.current.has(key)) return;
    clearing.current.add(key);
    try {
      setPicked((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      const proSeasons = Object.entries(modes)
        .filter(([panelKey, m]) => m === 'pro' && panelKey.slice(0, panelKey.lastIndexOf('|')) === key)
        .map(([panelKey]) => panelKey.slice(panelKey.lastIndexOf('|') + 1));
      for (const season of proSeasons) {
        await setMode(key, season, 'pro');
      }
    } finally {
      clearing.current.delete(key);
      setFocusTarget(focusKey);
    }
  };

  const requestUrl = `/home-care/book?tasks=${[...selected].map(encodeURIComponent).join(',')}`;

  // Finished tasks sink to the bottom of their group (stable within each half,
  // so the catalog's priority order is preserved on both sides of the split).
  const sinkDone = (list: ChecklistTask[], season: string) =>
    [...list].sort((a, b) => Number(done.has(id(a.key, season))) - Number(done.has(id(b.key, season))));

  // When the whole visible plan is complete, the list minimizes by default —
  // the member can peek with "Show completed"; new tasks (a new season, a
  // restore) bring the list back automatically because planComplete flips.
  const [showCompleted, setShowCompleted] = useState(false);
  useEffect(() => {
    if (planComplete) setShowCompleted(false);
  }, [planComplete]);
  const listMinimized = planComplete && !showCompleted;

  const Row = (t: ChecklistTask, season: string) => {
    const panelKey = id(t.key, season);
    const isDone = done.has(panelKey);
    const isSel = selected.has(t.key);
    const freq = FREQ_LABEL[t.frequency];
    // Which of the three card shapes this task takes, and what the member has
    // said about it. Both drive the row-3 control and whether the gear shows.
    const choice = taskChoice(t);
    const mode = modes[panelKey];
    // Whether a control on this card already tells the member the task is on
    // the request, in its own words. Where none does, one has to be added.
    const saysOnRequest = (choice === 'choose' && mode === 'pro') || (choice === 'pro_only' && t.bookable);
    // My Home Systems: the canonical fact this task can capture (if any), whether
    // it's already saved, and whether its inline panel is open.
    const fact = getFactForTask(t.key);
    // The DIY Kit shelf, if the owner has stocked this task. Empty for every
    // task they have not, which is most of them and the point.
    const shelf = productShelves[t.key] ?? [];
    // Icon-only (owner, 5 Aug 2026). The accessible name carries the meaning a
    // phone cannot hover to read, `title` gives the pointer tooltip, and the
    // undo bar in the sticky header pays for the lost label: an icon a member
    // mis-taps has to be recoverable in the same breath, not only through the
    // Hidden strip at the foot of the page.
    const hideButton = (
      <button
        type="button"
        onClick={() => dismissWithUndo(t.key, t.title)}
        disabled={busy === `dismiss|${t.key}`}
        aria-label={`Not relevant - hide ${t.title}`}
        title="Not relevant - hide for me"
        data-testid={`hide-task-${t.key}`}
        className="group -mx-2 -my-2 flex shrink-0 items-center justify-center"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors group-hover:bg-muted group-hover:text-slate-600">
          <EyeOff className="h-4 w-4" />
        </span>
      </button>
    );
    const captureOpen = capturePanelOpen.has(panelKey);
    const saved = fact ? records.has(fact.key) : false;
    return (
      <div key={`${t.key}-${season}`} className={`rounded-xl border bg-card p-3.5 shadow-card transition-colors ${isSel ? 'border-primary bg-primary/5' : 'border-border'} ${isDone ? 'opacity-70' : ''}`}>
        {/* ROW 1 - checkbox, title, and the two icon affordances.
            Three rows, not six (owner, 6 Aug 2026): a member needs to know what
            the task is, say who is doing it, and tick it off. Everything else
            that used to have a row of its own is either an icon up here or one
            tap inside the blurb. */}
        {/* `gap-3`, with every icon button carrying `-mx-2`. globals.css gives
            each of them a 44px MINIMUM WIDTH as well as height, so left alone
            two icons plus the checkbox took ~100px out of a 328px card and the
            title wrapped where it had no need to. The negative margins let the
            tap targets overlap the gaps and the card padding instead of pushing
            the text column - the same trick the checkbox already used. */}
        <div className="flex items-start gap-3">
          <button
            type="button"
            ref={(el) => { choiceRefs.current.set(`done|${panelKey}`, el); }}
            onClick={() => toggleDone(t.key, season)}
            disabled={busy === id(t.key, season)}
            aria-label={isDone ? 'Mark not done' : 'Mark done'}
            className="group -my-2.5 -ml-3 -mr-1 flex shrink-0 items-center justify-center"
          >
            {/* 20px visible box inside a 44px-tall button. Muted, and not a
                statement about completion, once the member has handed the job
                to us: the crew flow is what stamps that row, and inviting a
                tick that means nothing is how "Completed by La Vaca" ends up
                contradicting itself. */}
            <span className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${isDone ? 'border-secondary bg-secondary text-white' : mode === 'pro' ? 'border-slate-200' : 'border-slate-300 group-hover:border-primary'}`}>
              {isDone && <Check className="h-3.5 w-3.5" />}
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <h3 className={`text-[15px] font-bold leading-snug text-text-primary ${isDone ? 'line-through' : ''}`}>{t.title}</h3>
            {/* ROW 2 - one line of blurb with the affordance INLINE.
                `min-h-0` is deliberate and load-bearing: globals.css gives every
                button a 44px floor, which on a one-line blurb would cost more
                height than clamping it saves. `py-1` keeps the tap target above
                the 24px WCAG AA minimum without paying the full 44. */}
            <ClampedBlurb
              text={t.blurb}
              expanded={expandedBlurbs.has(panelKey)}
              onToggle={() => toggleBlurb(panelKey)}
            />
          </div>

          {/* My Home Systems, promoted from its own row to an icon that costs no
              height (owner decision 2026-08-06). Teal once something is saved,
              so the card still says at a glance that we know this house. */}
          {fact && (
            <button
              type="button"
              onClick={() => toggleCapture(panelKey)}
              aria-expanded={captureOpen}
              aria-label={saved ? `Edit saved home detail for ${t.title}` : fact.kind === 'location' ? `Add where this is for ${t.title}` : `Add details for ${t.title}`}
              title={saved ? 'Saved home detail - edit' : fact.kind === 'location' ? 'Add where this is' : 'Add details'}
              data-testid={`home-detail-${t.key}`}
              className="group -mx-2 -my-2 flex shrink-0 items-center justify-center"
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${saved ? 'bg-accent-teal/10 text-accent-teal' : 'text-slate-400 group-hover:bg-muted group-hover:text-accent-teal'}`}>
                {fact.kind === 'location' ? <MapPin className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
              </span>
            </button>
          )}
          {!isDone && hideButton}
        </div>

        {/* Attribution. The timezone is pinned because this component is
            server-rendered too: without it the server formats in UTC and the
            browser in the member's zone, so a late-evening completion renders a
            different day on each and hydration mismatches. */}
        {isDone && lavacaCompleted?.[id(t.key, season)] && (
          <div className="mt-1 text-xs font-bold text-primary" data-testid="completed-by-lavaca">
            Completed by La Vaca &middot;{' '}
            {new Date(lavacaCompleted[id(t.key, season)]).toLocaleDateString('en-US', {
              day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/New_York',
            })}
          </div>
        )}

        {/* ROW 3 - who is doing it, and the frequency.
            On a `choose` task this control replaces BOTH the old DIY/PRO badge
            and the add-to-request pair, because picking "La Vaca does it" is
            adding it to the request. That is where most of the height went. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {choice === 'choose' ? (
            mode ? (
              // Decided: the toggle folds into a chip so a returning member's
              // list is two rows per task, not three. Tapping it re-sends the
              // mode it is showing, which `setMode` reads as "clear this" - so
              // the reversal is written, drops the task off the request, and
              // survives a reload, rather than hiding a chip the server still
              // believes in. The accessible name says it is a control: "On your
              // request" alone reads as a status, and the member arriving here
              // by keyboard has just been moved onto it.
              <button
                type="button"
                ref={(el) => { choiceRefs.current.set(`chip|${panelKey}`, el); }}
                onClick={() => setMode(t.key, season, mode)}
                disabled={busy === `mode|${panelKey}`}
                aria-label={`Change who is doing ${t.title}`}
                data-testid={`choice-chip-${t.key}`}
                className="group -my-1 inline-flex items-center justify-start"
              >
                <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-extrabold ${mode === 'pro' ? 'bg-primary/10 text-primary' : 'bg-emerald-50 text-emerald-700'}`}>
                  <Check className="h-3 w-3" />
                  {mode === 'pro' ? 'On your request' : "You've got this"}
                </span>
              </button>
            ) : (
              <span className="inline-flex rounded-[10px] bg-muted p-0.5" role="group" aria-label={`Who is doing ${t.title}`}>
                <button
                  type="button"
                  ref={(el) => { choiceRefs.current.set(`toggle|${panelKey}`, el); }}
                  onClick={() => setMode(t.key, season, 'diy')}
                  aria-pressed={false}
                  disabled={busy === `mode|${panelKey}`}
                  data-testid={`choose-diy-${t.key}`}
                  className="-my-1.5 rounded-lg px-3 text-[12px] font-extrabold text-text-secondary transition-colors hover:text-emerald-700"
                >
                  I&apos;ll do it
                </button>
                <button
                  type="button"
                  onClick={() => setMode(t.key, season, 'pro')}
                  aria-pressed={false}
                  disabled={busy === `mode|${panelKey}`}
                  data-testid={`choose-pro-${t.key}`}
                  className="-my-1.5 rounded-lg px-3 text-[12px] font-extrabold text-text-secondary transition-colors hover:text-primary"
                >
                  La Vaca does it
                </button>
              </span>
            )
          ) : (
            // No choice to make, so the catalog's own verdict stays a label.
            <span className={`text-[11px] font-extrabold ${choice === 'pro_only' ? 'text-amber-700' : 'text-emerald-700'}`}>
              {choice === 'pro_only' ? 'PRO' : 'DIY'}
            </span>
          )}

          {/* A pro-only task keeps the ＋ circle: it is bookable, and with no
              toggle on the card this is the only way onto the request. */}
          {choice === 'pro_only' && t.bookable && (
            <button
              type="button"
              onClick={() => togglePicked(t.key)}
              aria-pressed={isSel}
              className="group -my-1 inline-flex items-center justify-start"
            >
              <span className="inline-flex items-center gap-1 text-xs font-bold text-primary group-hover:underline">
                {isSel ? <><Check className="h-3.5 w-3.5" /> Added to request</> : <><Plus className="h-3.5 w-3.5" /> Add to request</>}
              </span>
            </button>
          )}

          {/* The card is not allowed to sit on the request without saying so.
              Two controls already say it in their own words - the `pro` chip
              and the ＋ circle's "Added to request" - and anywhere else that is
              a card tinted `border-primary` and counted by the pill with
              nothing on it to explain why or take it back. That is reachable
              through every deep link, and most sharply right after "I'll do
              it": a green "You've got this" chip on a job still queued for us
              to quote. So the state is stated, and the statement is the way
              out. */}
          {/* Tapping this unmounts it, so it hands on the control this card is
              left showing: the chip or the toggle where there is a choice to
              make, and the done box where there is not. The active season's
              mode is never one of the ones cleared, so the chip and toggle both
              outlive the tap. */}
          {isSel && !saysOnRequest && (
            <button
              type="button"
              onClick={() => void clearFromRequest(t.key, choice === 'choose' ? `${mode ? 'chip' : 'toggle'}|${panelKey}` : `done|${panelKey}`)}
              disabled={busy === `mode|${panelKey}`}
              aria-label={`Remove ${t.title} from your request`}
              data-testid={`remove-from-request-${t.key}`}
              className="group -my-1 inline-flex items-center justify-start"
            >
              <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-extrabold text-primary">
                Still on your request
                <span className="inline-flex items-center gap-0.5 text-text-secondary group-hover:text-destructive">
                  <X className="h-3 w-3" /> remove
                </span>
              </span>
            </button>
          )}

          {freq && <span className="whitespace-nowrap text-[11px] text-slate-400">{freq}</span>}
          {hasGuideItem(season, t.key) && (
            <a href={`/home-care/guides/${season}#${t.key}`} className="text-[11px] font-bold text-primary hover:underline">
              Learn more
            </a>
          )}
        </div>

        {/* The gear shelf is the reward for saying you are doing it yourself.
            Before that it is not on screen at all, which is both the biggest
            height saving here and the honest thing to show someone who has just
            asked us to do the job. */}
        {shelf.length > 0 && shelfVisible(choice, mode) && (
          <DiyKitShelf taskKey={t.key} products={shelf} affiliateTag={affiliateTag} />
        )}
        {fact && captureOpen && (
          <div className="mt-3">
            <HomeCareRecordCapture
              fact={fact}
              sourceTaskKey={t.key}
              prefill={records.get(fact.key)}
              showConsent={!consentGiven}
              onSaved={(value) => handleRecordSaved(fact.key, value)}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-24">
      {/* "My Home" recap: everything the homeowner has saved about their home,
          collapsed by default. Lets them review, edit in place, or delete a
          detail (the "view or delete anytime" half of the consent promise). */}
      {savedFacts.length > 0 && (
        <details open={recapOpen} onToggle={(e) => setRecapOpen(e.currentTarget.open)} className="group rounded-2xl border border-accent-teal/30 bg-accent-teal/5 px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden">
            <Home className="h-4 w-4 shrink-0 text-accent-teal" />
            <span className="min-w-0 flex-1 text-sm text-text-secondary">
              <span className="font-bold text-text-primary">My Home</span> · {savedFacts.length} detail{savedFacts.length === 1 ? '' : 's'} saved
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 border-t border-accent-teal/20 pt-1">
            {savedFacts.map((fact) => {
              const val = records.get(fact.key);
              if (!val) return null;
              const editKey = `recap:${fact.key}`;
              const editing = capturePanelOpen.has(editKey);
              const summary = factValueSummary(fact, val);
              return (
                <div key={fact.key}>
                  {/* One compact line per saved detail: label + a short value,
                      with pencil/trash actions that surface on hover; the whole
                      row highlights on hover. */}
                  <div className={`group/row flex items-center gap-2 rounded-lg px-2 transition-colors ${editing ? 'bg-accent-teal/10' : 'hover:bg-accent-teal/10'}`}>
                    <div className="flex min-w-0 flex-1 items-baseline gap-2 py-1">
                      <span className="shrink-0 text-sm font-bold text-text-primary">{fact.label}</span>
                      {summary && <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{summary}</span>}
                    </div>
                    {confirmDelete === fact.key ? (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <span className="text-xs font-semibold text-text-secondary">Remove?</span>
                        <button type="button" onClick={() => handleRecordDelete(fact.key)} aria-label={`Confirm remove ${fact.label}`} className="group/y flex items-center justify-center">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md text-destructive group-hover/y:bg-destructive/10"><Check className="h-4 w-4" /></span>
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(null)} aria-label="Cancel remove" className="group/n flex items-center justify-center">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted group-hover/n:bg-muted"><X className="h-4 w-4" /></span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover/row:opacity-100">
                        <button type="button" onClick={() => toggleCapture(editKey)} aria-expanded={editing} aria-label={`Edit ${fact.label}`} className="group/e flex items-center justify-center">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md text-accent-teal group-hover/e:bg-accent-teal/15"><Pencil className="h-3.5 w-3.5" /></span>
                        </button>
                        <button type="button" onClick={() => { setConfirmDelete(fact.key); setDeleteError(null); }} aria-label={`Remove ${fact.label}`} className="group/d flex items-center justify-center">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted group-hover/d:bg-destructive/10 group-hover/d:text-destructive"><Trash2 className="h-3.5 w-3.5" /></span>
                        </button>
                      </div>
                    )}
                  </div>
                  {deleteError === fact.key && (
                    <p className="px-2 pt-0.5 text-xs font-semibold text-destructive">Could not remove that. Please try again.</p>
                  )}
                  {editing && (
                    <div className="px-2 pb-2 pt-1">
                      <HomeCareRecordCapture
                        fact={fact}
                        sourceTaskKey={fact.taskKeys[0]}
                        prefill={val}
                        showConsent={!consentGiven}
                        onSaved={(v) => { handleRecordSaved(fact.key, v); toggleCapture(editKey); }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Sticky plan header: season tabs + one progress bar for the whole
          visible plan (season + essentials). Sits just below the site header
          (measured at runtime) so progress stays visible while checking off. */}
      <div
        className="sticky z-30 -mx-4 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:-mx-1 sm:rounded-xl sm:border sm:px-3"
        style={{ top: stickyTop }}
      >
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {SEASONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActiveSeason(s)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${activeSeason === s ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-text-secondary hover:bg-muted/70'}`}
            >
              {SEASON_LABEL[s]}{s === currentSeason ? ' · now' : ''}
            </button>
          ))}
        </div>
        {planTotal > 0 && (
          <div className="mt-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-bold text-text-primary">
                <ClipboardList className="h-4 w-4 text-primary" />
                {planLabel} · {planDone} of {planTotal} done
              </span>
              <span className="text-xs font-bold text-text-secondary">{planPct}%</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={planPct} aria-valuemin={0} aria-valuemax={100} aria-label={`${planLabel} progress`}>
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent-sunset transition-all duration-500" style={{ width: `${planPct}%` }} />
            </div>
            <p className="mt-1 text-xs text-text-muted">
              {planComplete ? 'Everything handled — progress is saved.' : `${planTotal - planDone} to go — progress is saved.`}
            </p>
          </div>
        )}
        {/* Undo for the icon-only hide. Lives inside the sticky header so it
            stays on screen wherever the row they tapped has scrolled to. */}
        {lastHidden && (
          <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5" role="status">
            <EyeOff className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-text-secondary">
              Hidden: {lastHidden.title}
            </span>
            <button
              type="button"
              onClick={() => { setDismissState(lastHidden.key, false); setLastHidden(null); }}
              data-testid="undo-hide"
              className="group -my-2 flex shrink-0 items-center justify-center"
            >
              <span className="inline-flex items-center gap-1 text-xs font-bold text-primary group-hover:underline">
                <Undo2 className="h-3.5 w-3.5" /> Undo
              </span>
            </button>
            <button
              type="button"
              onClick={() => setLastHidden(null)}
              aria-label="Dismiss this message"
              className="group -my-2 -mr-1 flex shrink-0 items-center justify-center"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted group-hover:bg-background">
                <X className="h-3.5 w-3.5" />
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Plan 100% celebration */}
      {planComplete && activeSeason === currentSeason && (
        <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 to-accent-sunset/10 p-5 text-center">
          <PartyPopper className="mx-auto h-8 w-8 text-primary" />
          <h3 className="mt-2 text-lg font-extrabold text-text-primary">{SEASON_LABEL[activeSeason]}: done.</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-text-secondary">
            {trackedStarter.length > 0
              ? 'Every task in your plan is handled — essentials and all. Your house officially likes you.'
              : `Every ${SEASON_LABEL[activeSeason].toLowerCase()} task is handled — your house officially likes you.`}{' '}
            Know someone who&apos;d want this kind of peace of mind?
          </p>
          <button
            type="button"
            onClick={shareHomeCare}
            aria-live="polite"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-bold text-secondary-foreground shadow-button transition-all hover:-translate-y-px"
          >
            <Share2 className="h-4 w-4" /> {shareState === 'copied' ? 'Link copied' : 'Share Home Care'}
          </button>
        </div>
      )}

      {/* Catch-up: what slipped last season (returning members only) */}
      {showCatchUpCard && (
        <div className="rounded-2xl border-2 border-amber-300/70 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 mb-1">
              <History className="h-5 w-5 text-amber-700" />
              <h2 className="text-lg font-extrabold text-text-primary">
                Left over from {SEASON_LABEL[lastSeason]}: {missedTasks.length} task{missedTasks.length === 1 ? '' : 's'}
              </h2>
            </div>
            <button
              type="button"
              onClick={dismissCatchUp}
              aria-label="Dismiss catch-up"
              className="group flex shrink-0 items-start justify-center"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-amber-700/70 group-hover:bg-amber-100 group-hover:text-amber-900 transition-colors">
                <X className="h-4 w-4" />
              </span>
            </button>
          </div>
          <p className="text-sm text-text-secondary mb-3">
            These didn&apos;t get checked off last season. Most still matter — knock them out (or check off the ones you already did) before diving into {SEASON_LABEL[activeSeason]}.
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {missedTasks.slice(0, 4).map((t) => (
              <span key={t.key} className="rounded-full bg-white border border-amber-200 text-xs font-semibold text-text-secondary px-2.5 py-1">{t.title}</span>
            ))}
            {missedTasks.length > 4 && (
              <span className="rounded-full bg-white border border-amber-200 text-xs font-semibold text-text-secondary px-2.5 py-1">+{missedTasks.length - 4} more</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setActiveSeason(lastSeason)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-4 py-2.5 text-sm font-bold text-secondary-foreground shadow-button transition-all hover:-translate-y-px"
          >
            Review {SEASON_LABEL[lastSeason]} →
          </button>
        </div>
      )}

      {/* How to get something onto the request, named as the card actually
          offers it. Most cards are now a choice, where the way in is the
          "La Vaca does it" toggle - a ＋ circle is only the mechanism on a
          pro-only card, so promising one where none exists sends the member
          hunting for a glyph that is not on their list. */}
      {(hasChoice || hasPlusAdd) && selected.size === 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs font-semibold text-text-secondary">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-primary/40 text-primary">
            {hasChoice ? <ClipboardList className="h-3 w-3" /> : <Plus className="h-3.5 w-3.5" />}
          </span>
          {hasChoice
            ? 'Tap “La Vaca does it” on anything you’d like us to handle, then send them all as one request.'
            : 'Add any task you’d like us to handle, then send them all as one request.'}
        </div>
      )}

      {/* All done: the list minimizes until new tasks show up */}
      {listMinimized && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text-secondary">
            <Check className="h-4 w-4 shrink-0 text-secondary" />
            All {planTotal} tasks handled — nothing left to do right now.
          </span>
          <button
            type="button"
            onClick={() => setShowCompleted(true)}
            className="group flex shrink-0 items-center justify-center"
          >
            <span className="inline-flex items-center rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-primary group-hover:border-primary/50 transition-colors">
              Show completed
            </span>
          </button>
        </div>
      )}

      <div className="space-y-3">
        {/* One-time essentials, part of the same list so the plan bar tracks them */}
        {showStarterSection && !listMinimized && (
          <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-extrabold text-text-primary">New Homeowner Essentials</h2>
            </div>
            <p className="text-sm text-text-secondary mb-3">One-time setup for a home you just bought — knock these out first, then the seasonal stuff is a breeze.</p>
            <div className="space-y-3">{sinkDone(starterTasks, 'starter').map((t) => Row(t, 'starter'))}</div>
          </div>
        )}
        {SEASON_SPOTLIGHTS[activeSeason] && (
          <div className="rounded-2xl border border-accent-sunset/30 bg-gradient-to-br from-primary/5 to-accent-sunset/10 p-4">
            <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent-sunset">{SEASON_SPOTLIGHTS[activeSeason].eyebrow}</p>
            <h3 className="text-base font-extrabold text-text-primary">{SEASON_SPOTLIGHTS[activeSeason].title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">{SEASON_SPOTLIGHTS[activeSeason].body}</p>
            <a
              href={`/free-estimate?utm_source=home_care&utm_medium=portal&utm_campaign=seasonal_project&season=${activeSeason}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-accent-sunset px-4 py-2.5 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-px"
            >
              Book a free design consult →
            </a>
          </div>
        )}
        {listMinimized ? null : seasonTasks.length === 0 ? (
          <p className="text-text-secondary">Nothing for {SEASON_LABEL[activeSeason]} with your current home details.</p>
        ) : (
          sinkDone(seasonTasks, activeSeason).map((t) => Row(t, activeSeason))
        )}
      </div>

      {/* Hidden ("not relevant") tasks — collapsed strip with one-tap restore */}
      {hiddenTasks.length > 0 && (
        <details className="group rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-text-secondary [&::-webkit-details-marker]:hidden">
            <EyeOff className="h-4 w-4" />
            Hidden ({hiddenTasks.length}) — marked not relevant to your home
            <span className="ml-auto text-xs font-bold text-primary group-open:hidden">show</span>
            <span className="ml-auto hidden text-xs font-bold text-primary group-open:inline">hide</span>
          </summary>
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            {hiddenTasks.map((t) => (
              <div key={t.key} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-text-secondary">{t.title}</span>
                <button
                  type="button"
                  onClick={() => setDismissState(t.key, false)}
                  disabled={busy === `dismiss|${t.key}`}
                  className="group/r flex shrink-0 items-center justify-center"
                >
                  <span className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-primary group-hover/r:border-primary/50 transition-colors">
                    <RotateCcw className="h-3 w-3" /> Restore
                  </span>
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Share card — members are the best ad channel */}
      <div className="rounded-2xl bg-secondary p-5 text-secondary-foreground">
        <h3 className="text-base font-extrabold">Know someone drowning in house stuff?</h3>
        <p className="mt-1 text-sm text-secondary-foreground/75">
          Home Care is free for any Northern NJ homeowner — send it to a friend or neighbor.
        </p>
        <button
          type="button"
          onClick={shareHomeCare}
          aria-live="polite"
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent-sunset px-4 py-2.5 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-px"
        >
          {shareState === 'copied' ? <Copy className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
          {shareState === 'copied' ? 'Link copied — paste it anywhere' : 'Share Home Care'}
        </button>
      </div>

      {selected.size > 0 && (
        <a
          href={requestUrl}
          aria-label={`Review your request for ${selected.size} selected service${selected.size > 1 ? 's' : ''}`}
          className="fixed right-4 bottom-6 z-[60] inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine py-3 pl-5 pr-3 text-sm font-bold text-white shadow-button hover:-translate-y-px transition-all"
        >
          <ClipboardList className="h-4 w-4" /> Review request
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-extrabold text-primary">{selected.size}</span>
        </a>
      )}
    </div>
  );
}
