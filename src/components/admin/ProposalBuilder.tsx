'use client';

/**
 * Build a proposal by hand - no estimator CSV required (round 4, 2026-08-08).
 *
 * Four steps: customer (the shared CustomerSearch), details, line items
 * grouped by cost category, review & create. Bundling reuses the SAME pure
 * module the CSV importer uses (composeBundle / toStoredMembers), so a
 * hand-built package obeys the identical rules: one client-facing price, the
 * members' sum, locked the moment any member is locked. Categories come from
 * the merged library (/api/admin/proposal-categories): the built-in trade
 * list plus admin-created ones; creating a new category is admin-only and a
 * collaborator is told to ask their admin.
 *
 * The create POST is the importer's own endpoint - a hand-built proposal is
 * indistinguishable from an imported one downstream (client page, send,
 * revoke, re-import all unchanged).
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Check, Lock, Boxes, Trash2, Undo2, GripVertical } from 'lucide-react';
import { CustomerSearch, type CustomerHit } from '@/components/admin/CustomerSearch';
import { composeBundle, toStoredMembers, type PreviewBundleMember } from '@/lib/proposals/bundles';
import { type BuilderCategory } from '@/lib/proposals/builderCategories';
import { usd } from '@/lib/proposals/money';

interface BuilderRow {
  uid: number;
  title: string;
  description: string;
  priceCents: number;
  categoryKey: string;
  optional: boolean;
  /** Present on a bundle row: the client sees one line; these are inside it. */
  members?: PreviewBundleMember[];
  /** Builder-side only: the original rows, so Unbundle restores categories. */
  memberRows?: BuilderRow[];
}

/** "$3,200.50", "3200", "3,200" - all become integer cents; null = unparsable. */
export function parsePriceToCents(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!cleaned || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** A stored line as the edit-mode GET returns it. */
export interface EditableStoredLine {
  title: string;
  description: string;
  price_cents: number;
  optional: boolean;
  category: string;
  bundle_members: { title: string; price_cents: number }[] | null;
}

interface ProposalBuilderProps {
  onCreated: () => void;
  onClose: () => void;
  /** Scrolls the admin to the CSV importer - the side door. */
  onImportInstead: () => void;
  /**
   * Edit mode (round 9's "Open & modify"): the builder loads this proposal's
   * lines and Save replaces them on the SAME proposal - the client's link
   * shows the update. Title and client identity stay fixed (re-import
   * semantics); revoked proposals are refused by the write side.
   */
  edit?: { id: string; title: string; clientName: string; clientEmail: string | null; lines: EditableStoredLine[] };
  /** "New proposal for X": step 1 is already answered. */
  initialCustomer?: CustomerHit | null;
}

const STEPS = ['Customer', 'Details', 'Line items', 'Review & create'] as const;

let nextUid = 1;

/** Stored lines back into builder rows - bundles keep their members; the
 * members' builder-side rows are synthesized in the line's own category (the
 * per-trade sub-areas of a portion are not stored, as the mock disclosed). */
function rowsFromStoredLines(lines: EditableStoredLine[]): BuilderRow[] {
  return lines.map((l) => {
    if (l.bundle_members && l.bundle_members.length >= 2) {
      const memberRows: BuilderRow[] = l.bundle_members.map((m) => ({
        uid: nextUid++,
        title: m.title,
        description: '',
        priceCents: m.price_cents,
        categoryKey: l.category,
        optional: l.optional,
      }));
      return {
        uid: nextUid++,
        title: l.title,
        description: l.description,
        priceCents: l.price_cents,
        categoryKey: l.category,
        optional: l.optional,
        members: l.bundle_members.map((m) => ({ title: m.title, price_cents: m.price_cents })),
        memberRows,
      };
    }
    return {
      uid: nextUid++,
      title: l.title,
      description: l.description,
      priceCents: l.price_cents,
      categoryKey: l.category,
      optional: l.optional,
    };
  });
}

export function ProposalBuilder({ onCreated, onClose, onImportInstead, edit, initialCustomer }: ProposalBuilderProps) {
  const [step, setStep] = useState(edit ? 2 : initialCustomer ? 1 : 0);
  const [customer, setCustomer] = useState<CustomerHit | null>(initialCustomer ?? null);
  const [clientName, setClientName] = useState(edit?.clientName ?? initialCustomer?.name ?? '');
  const [clientEmail, setClientEmail] = useState(edit?.clientEmail ?? initialCustomer?.email ?? '');
  const [title, setTitle] = useState(edit?.title ?? '');
  const [rows, setRows] = useState<BuilderRow[]>(() => (edit ? rowsFromStoredLines(edit.lines) : []));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bundleName, setBundleName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Category library: built-ins + admin-created, one fetch.
  const [library, setLibrary] = useState<BuilderCategory[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/proposal-categories');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load categories');
        if (!cancelled) setLibrary(data.categories || []);
      } catch (err) {
        if (!cancelled) {
          toast({
            title: 'Could not load the category library',
            description: err instanceof Error ? err.message : String(err),
            variant: 'destructive',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const libraryByKey = useMemo(() => new Map(library.map((c) => [c.key, c])), [library]);

  // Categories currently on the proposal, in the order they were added.
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() =>
    edit ? [...new Set(edit.lines.map((l) => l.category))] : [],
  );
  const [catQuery, setCatQuery] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const catMatches = useMemo(() => {
    const q = catQuery.trim().toLowerCase();
    const unused = library.filter((c) => !categoryOrder.includes(c.key));
    if (!q) return unused;
    return unused.filter((c) => c.label.toLowerCase().includes(q) || c.key.includes(q));
  }, [catQuery, library, categoryOrder]);

  const exactMatch = useMemo(
    () => library.find((c) => c.label.toLowerCase() === catQuery.trim().toLowerCase()),
    [library, catQuery],
  );

  const addCategory = (key: string) => {
    setCategoryOrder((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setCatQuery('');
  };

  // Hybrid create: no library match for the typed name → offer to create it.
  // The server answers 403 with the ask-your-admin line for non-admins.
  const createCategory = async () => {
    const label = catQuery.trim();
    if (!label) return;
    setIsCreatingCategory(true);
    try {
      const res = await fetch('/api/admin/proposal-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create the category');
      setLibrary((prev) => [...prev, data.category]);
      addCategory(data.category.key);
      toast({ title: 'Category created', description: `"${data.category.label}" is in your library now.` });
    } catch (err) {
      toast({
        title: 'Could not create the category',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setIsCreatingCategory(false);
    }
  };

  // ---- line entry ----------------------------------------------------------
  const [draftByCat, setDraftByCat] = useState<Record<string, { title: string; description: string; price: string }>>({});
  const draftFor = (key: string) => draftByCat[key] ?? { title: '', description: '', price: '' };
  const setDraft = (key: string, patch: Partial<{ title: string; description: string; price: string }>) =>
    setDraftByCat((prev) => ({ ...prev, [key]: { ...draftFor(key), ...patch } }));

  const addLine = (categoryKey: string) => {
    const draft = draftFor(categoryKey);
    const cents = parsePriceToCents(draft.price);
    if (!draft.title.trim()) {
      toast({ title: 'The line needs a title', variant: 'destructive' });
      return;
    }
    if (cents === null) {
      toast({ title: 'Price not understood', description: 'Try a number like 3200 or $3,200.50.', variant: 'destructive' });
      return;
    }
    const cat = libraryByKey.get(categoryKey);
    setRows((prev) => [
      ...prev,
      {
        uid: nextUid++,
        title: draft.title.trim(),
        description: draft.description.trim(),
        priceCents: cents,
        categoryKey,
        optional: cat?.optional ?? false,
      },
    ]);
    setDraft(categoryKey, { title: '', description: '', price: '' });
  };

  const removeRow = (uid: number) => {
    setRows((prev) => prev.filter((r) => r.uid !== uid));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(uid);
      return next;
    });
  };

  const toggleSelected = (uid: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  const toggleOptional = (uid: number) =>
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, optional: !r.optional } : r)));

  // ---- bundling ------------------------------------------------------------
  // Compose one bundle row from picked rows. The pure module names the
  // category by keyword-guessing the member title; here the admin PICKED every
  // category, so the package lands where its first locked member lives
  // (structure wins), else its first member.
  const composeRowsIntoBundle = (picked: BuilderRow[], name?: string): BuilderRow | null => {
    const composed = composeBundle(
      picked.map((r) => ({
        title: r.title,
        description: r.description,
        priceCents: r.priceCents,
        optional: r.optional,
        members: r.members,
      })),
      name,
    );
    if (!composed) return null;
    const firstLocked = picked.find((r) => !r.optional);
    return {
      uid: nextUid++,
      title: composed.title,
      description: '',
      priceCents: composed.priceCents,
      categoryKey: (firstLocked ?? picked[0]).categoryKey,
      optional: composed.optional,
      members: composed.members,
      memberRows: picked.flatMap((r) => r.memberRows ?? [r]),
    };
  };

  const bundleSelected = () => {
    const picked = rows.filter((r) => selected.has(r.uid));
    if (picked.length < 2) return;
    const bundleRow = composeRowsIntoBundle(picked, bundleName.trim() || undefined);
    if (!bundleRow) return;
    const firstIdx = rows.findIndex((r) => selected.has(r.uid));
    setRows((prev) => {
      const rest = prev.filter((r) => !selected.has(r.uid));
      rest.splice(Math.min(firstIdx, rest.length), 0, bundleRow);
      return rest;
    });
    setSelected(new Set());
    setBundleName('');
  };

  const unbundle = (uid: number) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.uid === uid);
      const bundle = prev[idx];
      if (!bundle?.memberRows) return prev;
      const next = prev.filter((r) => r.uid !== uid);
      next.splice(idx, 0, ...bundle.memberRows);
      return next;
    });
  };

  // Pop ONE member out of a bundle (owner round 6: "if something needs to be
  // taken out"). The bundle re-sums from what remains; down to one member it
  // dissolves entirely - a package of one is just a line.
  const takeOutMember = (bundleUid: number, memberUid: number) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.uid === bundleUid);
      const bundle = prev[idx];
      if (!bundle?.memberRows) return prev;
      const taken = bundle.memberRows.find((m) => m.uid === memberUid);
      const remaining = bundle.memberRows.filter((m) => m.uid !== memberUid);
      if (!taken) return prev;
      const next = prev.filter((r) => r.uid !== bundleUid);
      if (remaining.length >= 2) {
        const recomposed = composeRowsIntoBundle(remaining, bundle.title);
        if (recomposed) next.splice(idx, 0, recomposed, taken);
        else next.splice(idx, 0, ...remaining, taken);
      } else {
        // One member left: the bundle dissolves into its last line + the taken one.
        next.splice(idx, 0, ...remaining, taken);
      }
      return next;
    });
  };

  const renameBundle = (uid: number, name: string) => {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, title: name } : r)));
  };

  // ---- drag and drop (round 6) --------------------------------------------
  // Native HTML5, the same gesture family the CSV importer's preview already
  // uses. One drag, four outcomes, decided by where it lands:
  //   onto a line            -> the two become a new bundle (instant, auto-named)
  //   onto a bundle block    -> joins that package (keeps the package's name)
  //   onto a category header -> the row moves to that category
  //   onto a row's top edge  -> reorders in front of it (and adopts its category)
  const dragUid = useRef<number | null>(null);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);

  const clearDrag = () => {
    dragUid.current = null;
    setHoverTarget(null);
  };

  const dropOnRow = (targetUid: number, zone: 'onto' | 'before') => {
    const fromUid = dragUid.current;
    clearDrag();
    if (fromUid === null || fromUid === targetUid) return;
    setRows((prev) => {
      const dragged = prev.find((r) => r.uid === fromUid);
      const targetIdx = prev.findIndex((r) => r.uid === targetUid);
      const target = prev[targetIdx];
      if (!dragged || !target) return prev;

      if (zone === 'before') {
        const without = prev.filter((r) => r.uid !== fromUid);
        const insertAt = without.findIndex((r) => r.uid === targetUid);
        without.splice(insertAt, 0, { ...dragged, categoryKey: target.categoryKey });
        return without;
      }

      // 'onto': join the target bundle, or fuse two rows into a new package.
      const composed = target.members
        ? composeRowsIntoBundle([target, dragged], target.title)
        : composeRowsIntoBundle([target, dragged]);
      if (!composed) return prev;
      const next = prev.filter((r) => r.uid !== fromUid && r.uid !== targetUid);
      next.splice(Math.min(targetIdx, next.length), 0, composed);
      return next;
    });
  };

  const dropOnCategory = (categoryKey: string) => {
    const fromUid = dragUid.current;
    clearDrag();
    if (fromUid === null) return;
    setRows((prev) => prev.map((r) => (r.uid === fromUid ? { ...r, categoryKey } : r)));
  };

  const rowDragProps = (r: BuilderRow) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      dragUid.current = r.uid;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(r.uid));
    },
    onDragEnd: clearDrag,
    onDragOver: (e: React.DragEvent) => {
      if (dragUid.current === null || dragUid.current === r.uid) return;
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const zone = e.clientY - rect.top < rect.height * 0.3 ? 'before' : 'onto';
      setHoverTarget(`row-${r.uid}-${zone}`);
    },
    onDragLeave: () => setHoverTarget((h) => (h?.startsWith(`row-${r.uid}-`) ? null : h)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const zone = e.clientY - rect.top < rect.height * 0.3 ? 'before' : 'onto';
      dropOnRow(r.uid, zone);
    },
  });

  const categoryDropProps = (key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (dragUid.current === null) return;
      e.preventDefault();
      setHoverTarget(`cat-${key}`);
    },
    onDragLeave: () => setHoverTarget((h) => (h === `cat-${key}` ? null : h)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      dropOnCategory(key);
    },
  });

  // ---- whole-section drag (round 7) ---------------------------------------
  // Sections drag too: drop one on another's TOP EDGE to reorder the proposal,
  // or on its body to COMBINE the two into a locked-together portion - one
  // bundle holding every line of both, rendered with each trade as its own
  // sub-area. Client-side (owner's decision): one package, one price, with the
  // includes list.
  const dragCat = useRef<string | null>(null);
  // A member being rearranged INSIDE a portion - scoped to its own sub-area.
  const memberDrag = useRef<{ portionUid: number; memberUid: number; categoryKey: string } | null>(null);

  const isPortion = (r: BuilderRow) =>
    !!r.memberRows && new Set(r.memberRows.map((m) => m.categoryKey)).size > 1;

  const combineCategories = (targetKey: string, draggedKey: string) => {
    if (targetKey === draggedKey) return;
    // Computed from the render's rows, not inside the setter: the category
    // must only leave the board when the portion actually composed, or a lone
    // line could be stranded in a section the board no longer renders.
    const targetRows = rows.filter((r) => r.categoryKey === targetKey);
    const draggedRows = rows.filter((r) => r.categoryKey === draggedKey);
    if (targetRows.length + draggedRows.length < 2) return;
    const targetLabel = libraryByKey.get(targetKey)?.label ?? targetKey;
    const draggedLabel = libraryByKey.get(draggedKey)?.label ?? draggedKey;
    const portion = composeRowsIntoBundle(
      [...targetRows, ...draggedRows],
      `${targetLabel} + ${draggedLabel}`,
    );
    if (!portion) return;
    portion.categoryKey = targetKey;
    const firstIdx = rows.findIndex((r) => r.categoryKey === targetKey || r.categoryKey === draggedKey);
    const next = rows.filter((r) => r.categoryKey !== targetKey && r.categoryKey !== draggedKey);
    next.splice(Math.min(firstIdx, next.length), 0, portion);
    setRows(next);
    // The dragged trade's rows now live inside the portion; its empty section
    // leaves the board (Split apart brings it back).
    setCategoryOrder((prev) => prev.filter((k) => k !== draggedKey));
  };

  const reorderCategoryBefore = (targetKey: string, draggedKey: string) => {
    if (targetKey === draggedKey) return;
    setCategoryOrder((prev) => {
      const without = prev.filter((k) => k !== draggedKey);
      const at = without.indexOf(targetKey);
      without.splice(at === -1 ? without.length : at, 0, draggedKey);
      return without;
    });
  };

  const sectionDragProps = (key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (dragCat.current === null || dragCat.current === key) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const zone = e.clientY - rect.top < rect.height * 0.25 ? 'before' : 'combine';
      setHoverTarget(`sec-${key}-${zone}`);
    },
    onDragLeave: () => setHoverTarget((h) => (h?.startsWith(`sec-${key}-`) ? null : h)),
    onDrop: (e: React.DragEvent) => {
      if (dragCat.current === null) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const zone = e.clientY - rect.top < rect.height * 0.25 ? 'before' : 'combine';
      const dragged = dragCat.current;
      dragCat.current = null;
      setHoverTarget(null);
      if (zone === 'before') reorderCategoryBefore(key, dragged);
      else combineCategories(key, dragged);
    },
  });

  const sectionHandleProps = (key: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      dragCat.current = key;
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `section:${key}`);
    },
    onDragEnd: () => {
      dragCat.current = null;
      setHoverTarget(null);
    },
  });

  // Split a portion back into its trades: rows return to their own categories,
  // and any category that had left the board comes back at its old spot.
  const splitPortion = (uid: number) => {
    const portion = rows.find((r) => r.uid === uid);
    if (portion?.memberRows) {
      const keys = [...new Set(portion.memberRows.map((m) => m.categoryKey))];
      setCategoryOrder((prev) => [...prev, ...keys.filter((k) => !prev.includes(k))]);
    }
    unbundle(uid);
  };

  // Reorder a member within ITS OWN sub-area of a portion (owner round 7: an
  // Electrical Rough line arranges inside Electrical Rough only).
  const reorderMemberBefore = (portionUid: number, targetMemberUid: number) => {
    const drag = memberDrag.current;
    memberDrag.current = null;
    setHoverTarget(null);
    if (!drag || drag.portionUid !== portionUid || drag.memberUid === targetMemberUid) return;
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.uid === portionUid);
      const portion = prev[idx];
      if (!portion?.memberRows) return prev;
      const dragged = portion.memberRows.find((m) => m.uid === drag.memberUid);
      const target = portion.memberRows.find((m) => m.uid === targetMemberUid);
      // Scoped: a member only moves within its own trade area.
      if (!dragged || !target || dragged.categoryKey !== target.categoryKey) return prev;
      const without = portion.memberRows.filter((m) => m.uid !== drag.memberUid);
      const at = without.findIndex((m) => m.uid === targetMemberUid);
      without.splice(at, 0, dragged);
      const recomposed = composeRowsIntoBundle(without, portion.title);
      if (!recomposed) return prev;
      recomposed.categoryKey = portion.categoryKey;
      const next = [...prev];
      next[idx] = recomposed;
      return next;
    });
  };

  // ---- derived -------------------------------------------------------------
  const rowsByCategory = useMemo(() => {
    const m = new Map<string, BuilderRow[]>();
    for (const key of categoryOrder) m.set(key, []);
    for (const r of rows) {
      if (!m.has(r.categoryKey)) m.set(r.categoryKey, []);
      m.get(r.categoryKey)!.push(r);
    }
    return m;
  }, [rows, categoryOrder]);

  const totalCents = rows.reduce((a, r) => a + r.priceCents, 0);
  // Category order first, row order within - drag-reordering writes this order,
  // and it is exactly the order the client's page renders.
  const orderedRows = useMemo(
    () => [...rowsByCategory.entries()].flatMap(([, rs]) => rs),
    [rowsByCategory],
  );
  const stepReady = [
    !!customer || (clientName.trim().length > 0),
    clientName.trim().length > 0 && title.trim().length > 0,
    rows.length > 0,
    true,
  ];

  const selectCustomer = (hit: CustomerHit) => {
    setCustomer(hit);
    setClientName(hit.name ?? '');
    setClientEmail(hit.email ?? '');
    setStep(1);
  };

  // ---- create --------------------------------------------------------------
  const create = async () => {
    setIsCreating(true);
    try {
      const lines = orderedRows.map((r) => ({
        title: r.title,
        description: r.description,
        price_cents: r.priceCents,
        optional: r.optional,
        category: r.categoryKey,
        bundle_members: r.members ? toStoredMembers(r.members) : undefined,
      }));
      // Edit mode saves onto the SAME proposal via the re-import action - the
      // client's existing link shows the update.
      const res = edit
        ? await fetch(`/api/admin/proposals/${edit.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reimport', lines }),
        })
        : await fetch('/api/admin/proposals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: clientName.trim(),
            client_email: clientEmail.trim() || null,
            title: title.trim(),
            // `||`, not `??`: a client picked off an existing proposal has no
            // lead row, and arrives as a hit whose id is '' - that is "no
            // lead to link", not a lead id for the API to reject.
            lead_id: customer?.id || null,
            lines,
          }),
        });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (edit ? 'Save failed' : 'Create failed'));
      toast(
        edit
          ? { title: 'Proposal updated', description: `${clientName.trim()} - the client link now shows the new lines.` }
          : { title: 'Proposal created', description: `${clientName.trim()} - draft, ready to send from the roster.` },
      );
      onCreated();
    } catch (err) {
      toast({
        title: edit ? 'Could not save the proposal' : 'Could not create the proposal',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const catBadge = (key: string) => {
    const cat = libraryByKey.get(key);
    const optional = cat?.optional ?? false;
    return optional ? (
      <Badge variant="outline" className="rounded-[5px] text-teal-700 border-teal-600/40 text-[10px] uppercase">client can toggle</Badge>
    ) : (
      <Badge variant="outline" className="rounded-[5px] text-[10px] uppercase"><Lock className="w-3 h-3 mr-1" />locked for client</Badge>
    );
  };

  return (
    <Card data-testid="proposal-builder">
      <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap space-y-0">
        <div>
          <CardTitle>{edit ? `Edit: ${edit.title}` : 'New proposal'}</CardTitle>
          <CardDescription className="mt-1">
            {edit ? (
              <>Saving replaces this proposal&apos;s lines on the same client link. Title and client stay as they are.</>
            ) : (
              <>
                Build it line by line - or{' '}
                <button className="underline font-semibold text-primary" onClick={onImportInstead} data-testid="builder-import-instead">
                  import the estimator CSV instead
                </button>
                .
              </>
            )}
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Stepper. Edit mode fixes customer + details, so those two steps
            collapse into one static chip and only line items / review remain. */}
        <div className="flex gap-2 flex-wrap">
          {edit && (
            <span
              data-testid="builder-edit-client"
              className="inline-flex items-center gap-2 border border-green-600/50 rounded-lg px-3 py-1.5 text-sm font-semibold text-green-700"
            >
              <span className="w-5 h-5 rounded-full inline-flex items-center justify-center bg-green-600 text-white">
                <Check className="w-3 h-3" />
              </span>
              {clientName}{clientEmail ? ` (${clientEmail})` : ''}
            </span>
          )}
          {STEPS.map((label, i) => {
            if (edit && i < 2) return null;
            const done = i < step;
            const active = i === step;
            return (
              <button
                key={label}
                type="button"
                onClick={() => { if (i <= step || stepReady.slice(0, i).every(Boolean)) setStep(i); }}
                data-testid={`builder-step-${i}`}
                className={`inline-flex items-center gap-2 border rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  active ? 'border-primary bg-primary/10 text-primary' : done ? 'border-green-600/50 text-green-700' : 'border-border text-muted-foreground'
                }`}
              >
                <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[11px] font-bold ${
                  done ? 'bg-green-600 text-white' : active ? 'bg-primary text-white' : 'bg-muted'
                }`}>{done ? <Check className="w-3 h-3" /> : i + 1}</span>
                {i === 0 && customer ? `Customer: ${customer.name ?? customer.email}` : label}
              </button>
            );
          })}
        </div>

        {/* Step 1 - customer. Full width + grid results (owner's round-5 note). */}
        {step === 0 && (
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Find the customer, or save someone new - the proposal links to their record.
            </p>
            <CustomerSearch onSelect={selectCustomer} selectedId={customer?.id} />
          </div>
        )}

        {/* Step 2 - details */}
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <div className="space-y-1.5">
              <Label htmlFor="pb-client-name">Client name *</Label>
              <Input id="pb-client-name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pb-client-email">Client email</Label>
              <Input id="pb-client-email" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="pb-title">Proposal title *</Label>
              <Input id="pb-title" placeholder="Kitchen remodel - 12 Maple Ave" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="md:col-span-2 flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
              <Button onClick={() => setStep(2)} disabled={!stepReady[1]} data-testid="builder-to-lines">
                Continue to line items
              </Button>
            </div>
          </div>
        )}

        {/* Step 3 - line items */}
        {step === 2 && (
          <div className="space-y-4">
            {categoryOrder.length === 0 ? (
              <p className="text-sm text-muted-foreground">Start by adding a cost category below.</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Drag any line by its grip: onto another line to bundle them, onto a bundle to add it,
                onto a category header to move it, or onto a row&apos;s top edge to reorder. The checkboxes
                still work if you prefer buttons.
              </p>
            )}

            {categoryOrder.map((key) => {
              const cat = libraryByKey.get(key);
              const allCatRows = rowsByCategory.get(key) ?? [];
              // Cross-trade portions render as their own bounding boxes above
              // the section frame; everything else stays inside it.
              const portions = allCatRows.filter(isPortion);
              const catRows = allCatRows.filter((r) => !isPortion(r));
              const subtotal = allCatRows.reduce((a, r) => a + r.priceCents, 0);
              const draft = draftFor(key);
              return (
                <div key={key} {...sectionDragProps(key)} data-testid={`builder-section-${key}`}
                  className={hoverTarget === `sec-${key}-before` ? 'border-t-4 border-t-primary rounded-t' : ''}
                >
                  {portions.map((p) => {
                    const memberKeys = [...new Set((p.memberRows ?? []).map((m) => m.categoryKey))];
                    return (
                      <div
                        key={p.uid}
                        {...rowDragProps(p)}
                        data-testid={`builder-portion-${p.uid}`}
                        className="mb-3 rounded-xl border-2 border-primary/45 border-l-[6px] border-l-primary bg-primary/5 overflow-hidden cursor-grab"
                      >
                        <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-dashed border-primary/30 flex-wrap">
                          <GripVertical className="w-4 h-4 text-primary/50 flex-shrink-0" />
                          <input
                            value={p.title}
                            onChange={(e) => renameBundle(p.uid, e.target.value)}
                            aria-label="Portion name"
                            data-testid={`builder-portion-name-${p.uid}`}
                            className="font-extrabold text-sm text-primary bg-transparent border-0 border-b border-dashed border-primary/50 focus:outline-none focus:border-solid min-w-[140px] max-w-[280px]"
                          />
                          <span className="text-[10px] font-bold uppercase tracking-wide rounded-[5px] px-1.5 py-0.5 bg-primary/10 text-primary">
                            locked together
                          </span>
                          <span className="text-xs text-muted-foreground">portion total</span>
                          <span className="font-bold text-sm whitespace-nowrap">{usd(p.priceCents)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 ml-auto text-xs"
                            onClick={() => splitPortion(p.uid)}
                            data-testid={`builder-split-${p.uid}`}
                          >
                            <Undo2 className="w-3.5 h-3.5 mr-1" />
                            Split apart
                          </Button>
                        </div>
                        {memberKeys.map((mk) => {
                          const areaRows = (p.memberRows ?? []).filter((m) => m.categoryKey === mk);
                          const areaTotal = areaRows.reduce((a, m) => a + m.priceCents, 0);
                          return (
                            <div key={mk} className="m-2 border rounded-lg overflow-hidden bg-white">
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-b text-xs font-bold">
                                {libraryByKey.get(mk)?.label ?? mk}
                                <span className="ml-auto font-semibold text-muted-foreground">{usd(areaTotal)}</span>
                              </div>
                              {areaRows.map((m) => (
                                <div
                                  key={m.uid}
                                  draggable
                                  onDragStart={(e) => {
                                    memberDrag.current = { portionUid: p.uid, memberUid: m.uid, categoryKey: m.categoryKey };
                                    e.stopPropagation();
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('text/plain', `member:${m.uid}`);
                                  }}
                                  onDragEnd={() => { memberDrag.current = null; setHoverTarget(null); }}
                                  onDragOver={(e) => {
                                    const d = memberDrag.current;
                                    if (!d || d.portionUid !== p.uid || d.categoryKey !== m.categoryKey || d.memberUid === m.uid) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setHoverTarget(`member-${m.uid}`);
                                  }}
                                  onDragLeave={() => setHoverTarget((h) => (h === `member-${m.uid}` ? null : h))}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    reorderMemberBefore(p.uid, m.uid);
                                  }}
                                  className={`flex items-center gap-2.5 px-3 py-1.5 text-[12.5px] border-b last:border-0 flex-wrap cursor-grab ${
                                    hoverTarget === `member-${m.uid}` ? 'border-t-2 border-t-primary' : ''
                                  }`}
                                >
                                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
                                  <span className="flex-1 min-w-[130px]">{m.title}</span>
                                  <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">{usd(m.priceCents)}</span>
                                  <button
                                    type="button"
                                    onClick={() => takeOutMember(p.uid, m.uid)}
                                    data-testid={`builder-takeout-${m.uid}`}
                                    className="text-[11px] font-semibold text-muted-foreground border rounded-[5px] px-2 py-0.5 hover:border-primary hover:text-primary"
                                  >
                                    Take out
                                  </button>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                        <div className="px-3.5 pb-2 pt-0.5 text-[11.5px] text-muted-foreground">
                          The client sees ONE line: {p.title} - {usd(p.priceCents)}, listing everything above as included.
                          Item grips reorder within their own trade area only.
                        </div>
                      </div>
                    );
                  })}

                  <div className="border rounded-lg overflow-hidden" data-testid={`builder-cat-${key}`}>
                  <div
                    {...categoryDropProps(key)}
                    className={`flex items-center gap-2 flex-wrap px-4 py-2.5 bg-muted/60 border-b transition-colors ${
                      hoverTarget === `cat-${key}` ? 'outline-dashed outline-2 outline-primary -outline-offset-2' : ''
                    } ${hoverTarget === `sec-${key}-combine` ? 'outline-dashed outline-2 outline-primary -outline-offset-2' : ''}`}
                  >
                    <span {...sectionHandleProps(key)} className="cursor-grab inline-flex" title="Drag the whole section: drop on another to combine, on its top edge to reorder">
                      <GripVertical className="w-4 h-4 text-muted-foreground/60" />
                    </span>
                    <span className="font-bold text-sm">{cat?.label ?? key}</span>
                    {catBadge(key)}
                    {hoverTarget === `cat-${key}` && (
                      <span className="text-[10px] font-bold uppercase text-primary">drop to move here</span>
                    )}
                    {hoverTarget === `sec-${key}-combine` && (
                      <span className="text-[10px] font-bold uppercase text-primary">drop to combine into one portion</span>
                    )}
                    <span className="ml-auto text-xs font-semibold text-muted-foreground">
                      subtotal {usd(subtotal)}
                    </span>
                  </div>
                  {catRows.map((r) =>
                    r.members ? (
                      /* The bundle: its own colored block, contents visible and
                         editable (owner round 6). */
                      <div
                        key={r.uid}
                        {...rowDragProps(r)}
                        data-testid={`builder-bundle-${r.uid}`}
                        className={`m-2 rounded-lg border-[1.5px] border-primary/40 border-l-4 border-l-primary bg-primary/5 overflow-hidden cursor-grab ${
                          hoverTarget === `row-${r.uid}-onto` ? 'outline-dashed outline-2 outline-primary -outline-offset-2' : ''
                        } ${hoverTarget === `row-${r.uid}-before` ? 'border-t-4 border-t-primary' : ''}`}
                      >
                        <div className="flex items-center gap-2.5 px-3 py-2 border-b border-dashed border-primary/30 flex-wrap">
                          <GripVertical className="w-4 h-4 text-primary/50 flex-shrink-0" />
                          <input
                            value={r.title}
                            onChange={(e) => renameBundle(r.uid, e.target.value)}
                            aria-label="Bundle name"
                            data-testid={`builder-bundle-name-${r.uid}`}
                            className="font-extrabold text-sm text-primary bg-transparent border-0 border-b border-dashed border-primary/50 focus:outline-none focus:border-solid min-w-[120px] max-w-[240px]"
                          />
                          <span className="text-[11px] text-muted-foreground">client sees ONE line at</span>
                          <span className="font-bold text-sm whitespace-nowrap">{usd(r.priceCents)}</span>
                          <button
                            type="button"
                            onClick={() => toggleOptional(r.uid)}
                            className={`text-[10px] font-bold uppercase rounded-[5px] border px-1.5 py-0.5 ${
                              r.optional ? 'text-teal-700 border-teal-600/40' : 'text-muted-foreground border-border'
                            }`}
                            title="Flip whether the client can toggle this package"
                          >
                            {r.optional ? 'optional' : 'locked'}
                          </button>
                          {hoverTarget === `row-${r.uid}-onto` && (
                            <span className="text-[10px] font-bold uppercase text-primary">drop to add</span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 ml-auto text-xs"
                            onClick={() => unbundle(r.uid)}
                            data-testid={`builder-unbundle-${r.uid}`}
                          >
                            <Undo2 className="w-3.5 h-3.5 mr-1" />
                            Unbundle all
                          </Button>
                        </div>
                        {(r.memberRows ?? []).map((m) => (
                          <div
                            key={m.uid}
                            className="flex items-center gap-2.5 pl-9 pr-3 py-1.5 text-[13px] border-b border-primary/10 last:border-0 flex-wrap"
                          >
                            <span className="flex-1 min-w-[140px]">{m.title}</span>
                            <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">{usd(m.priceCents)}</span>
                            <button
                              type="button"
                              onClick={() => takeOutMember(r.uid, m.uid)}
                              data-testid={`builder-takeout-${m.uid}`}
                              className="text-[11px] font-semibold text-muted-foreground border rounded-[5px] px-2 py-0.5 hover:border-primary hover:text-primary"
                            >
                              Take out
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        key={r.uid}
                        {...rowDragProps(r)}
                        className={`flex items-center gap-3 px-4 py-2 border-b text-sm flex-wrap cursor-grab bg-white ${
                          hoverTarget === `row-${r.uid}-onto` ? 'outline-dashed outline-2 outline-primary -outline-offset-2 rounded' : ''
                        } ${hoverTarget === `row-${r.uid}-before` ? 'border-t-2 border-t-primary' : ''}`}
                      >
                        <GripVertical className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                        <input
                          type="checkbox"
                          aria-label="Select for bundling"
                          checked={selected.has(r.uid)}
                          onChange={() => toggleSelected(r.uid)}
                          className="w-4 h-4 accent-[hsl(26,84%,58%)]"
                        />
                        <div className="flex-1 min-w-[150px]">
                          <span className="font-medium">{r.title}</span>
                          {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                        </div>
                        {hoverTarget === `row-${r.uid}-onto` && (
                          <span className="text-[10px] font-bold uppercase text-primary">drop to bundle</span>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleOptional(r.uid)}
                          className={`text-[10px] font-bold uppercase rounded-[5px] border px-1.5 py-0.5 ${
                            r.optional ? 'text-teal-700 border-teal-600/40' : 'text-muted-foreground border-border'
                          }`}
                          title="Flip whether the client can toggle this line"
                        >
                          {r.optional ? 'optional' : 'locked'}
                        </button>
                        <span className="font-bold whitespace-nowrap">{usd(r.priceCents)}</span>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => removeRow(r.uid)} title="Remove line">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ),
                  )}
                  <div className="flex gap-2 px-4 py-2.5 flex-wrap">
                    <Input
                      placeholder="Line title"
                      className="flex-1 min-w-[150px] h-9"
                      value={draft.title}
                      onChange={(e) => setDraft(key, { title: e.target.value })}
                      data-testid={`builder-line-title-${key}`}
                    />
                    <Input
                      placeholder="Description (optional)"
                      className="flex-1 min-w-[150px] h-9"
                      value={draft.description}
                      onChange={(e) => setDraft(key, { description: e.target.value })}
                    />
                    <Input
                      placeholder="$"
                      className="w-28 h-9"
                      value={draft.price}
                      onChange={(e) => setDraft(key, { price: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') addLine(key); }}
                      data-testid={`builder-line-price-${key}`}
                    />
                    <Button variant="outline" size="sm" className="h-9" onClick={() => addLine(key)} data-testid={`builder-add-line-${key}`}>
                      Add line
                    </Button>
                  </div>
                  </div>
                </div>
              );
            })}

            {/* Bundle bar */}
            {selected.size >= 2 && (
              <div className="flex items-center gap-2 flex-wrap border border-primary/40 bg-primary/5 rounded-lg px-4 py-2.5" data-testid="builder-bundle-bar">
                <Boxes className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">{selected.size} lines selected</span>
                <Input
                  placeholder="Bundle name (e.g. Kitchen package)"
                  className="flex-1 min-w-[180px] h-9"
                  value={bundleName}
                  onChange={(e) => setBundleName(e.target.value)}
                  data-testid="builder-bundle-name"
                />
                <Button size="sm" onClick={bundleSelected} data-testid="builder-bundle-button">
                  Bundle - client sees one price
                </Button>
              </div>
            )}

            {/* Category picker: hybrid typeahead */}
            <div className="border border-dashed rounded-lg p-4">
              <Label htmlFor="pb-cat" className="text-sm">Add a cost category</Label>
              <Input
                id="pb-cat"
                placeholder="Type to search the library..."
                className="mt-1.5 max-w-sm"
                value={catQuery}
                onChange={(e) => setCatQuery(e.target.value)}
                data-testid="builder-cat-query"
              />
              <div className="flex gap-1.5 flex-wrap mt-2.5">
                {catMatches.slice(0, 14).map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => addCategory(c.key)}
                    data-testid={`builder-cat-pick-${c.key}`}
                    className="border rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    {c.label}
                    {c.custom && <span className="ml-1 text-[9px] uppercase text-primary">yours</span>}
                  </button>
                ))}
                {catQuery.trim() && !exactMatch && (
                  <button
                    type="button"
                    onClick={createCategory}
                    disabled={isCreatingCategory}
                    data-testid="builder-cat-create"
                    className="border border-primary rounded-full px-3 py-1 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                  >
                    {isCreatingCategory ? 'Creating…' : `Create "${catQuery.trim()}" (admin only)`}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">
                {categoryOrder.length} categor{categoryOrder.length === 1 ? 'y' : 'ies'} · {rows.length} line{rows.length === 1 ? '' : 's'}
              </span>
              <span className="text-base font-bold">Total {usd(totalCents)}</span>
            </div>
            <div className={`flex ${edit ? 'justify-end' : 'justify-between'}`}>
              {!edit && <Button variant="outline" onClick={() => setStep(1)}>Back</Button>}
              <Button onClick={() => setStep(3)} disabled={!stepReady[2]} data-testid="builder-to-review">
                {edit ? 'Review & save' : 'Review & create'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4 - review */}
        {step === 3 && (
          <div className="space-y-4 max-w-2xl">
            <div className="border rounded-lg p-4">
              <p className="font-bold">{title.trim() || '(untitled)'}</p>
              <p className="text-sm text-muted-foreground">
                for {clientName.trim()}{clientEmail.trim() ? ` (${clientEmail.trim()})` : ''}
              </p>
            </div>
            {[...rowsByCategory.entries()].filter(([, rs]) => rs.length > 0).map(([key, rs]) => (
              <div key={key} className="border rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-muted/60 border-b flex items-center gap-2">
                  <span className="font-bold text-sm">{libraryByKey.get(key)?.label ?? key}</span>
                  {catBadge(key)}
                </div>
                {rs.map((r) => (
                  <div key={r.uid} className="px-4 py-2 border-b last:border-0 text-sm flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-medium">{r.title}</span>
                      {r.optional && <span className="ml-2 text-[10px] font-bold uppercase text-teal-700">optional</span>}
                      {r.members && (
                        <ul className="text-xs text-muted-foreground list-disc list-inside mt-0.5">
                          {r.members.map((m, i) => <li key={i}>{m.title}</li>)}
                        </ul>
                      )}
                    </div>
                    <span className="font-bold whitespace-nowrap">{usd(r.priceCents)}</span>
                  </div>
                ))}
              </div>
            ))}
            <div className="flex justify-end text-base font-bold">Total {usd(totalCents)}</div>
            <p className="text-xs text-muted-foreground">
              Bundles show the client one price; the item titles above are what their page lists as included.
              {edit
                ? ' Saving replaces the lines on this proposal - the client’s existing link shows the update.'
                : ' Creating makes a DRAFT - you still review and send it from the roster like any imported proposal.'}
            </p>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={create} disabled={isCreating} data-testid="builder-create">
                {isCreating ? (edit ? 'Saving…' : 'Creating…') : edit ? 'Save changes' : 'Create draft proposal'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
