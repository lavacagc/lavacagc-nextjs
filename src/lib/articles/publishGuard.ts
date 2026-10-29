/**
 * The publish guard (decision 004, Q10): the one check every publish path runs
 * before a post goes live.
 *
 * ============================================================================
 * STUB - slice F ships this as an always-pass placeholder. Slice G replaces the
 * body of checkPublishable with the real checks (docs/phase-2/acceptance-criteria.md,
 * "Publish guard", PG1 to PG5): validateDraft, price claims, legal claims and
 * shape, in that order. Until then EVERY post passes.
 * ============================================================================
 *
 * The signature is the contract slice G keeps: pure (no I/O), handed the post
 * as it would go live and the facts the route loaded, returning plain-sentence
 * reasons. The publish route (/api/articles/ingest/[id]/publish) already turns
 * `ok: false` into a 409 with `review_hold` written, so slice G changes only
 * this file and its callers in the admin editor, list and publish cron.
 */
import type { Fact } from '@/lib/seo/draftGuardrails';
import type { FaqItem } from './schemas';

/** The post as it would be published: after any pending action draft is applied. */
export interface PublishCandidate {
  title: string;
  slug: string;
  content: string;
  category: string;
  excerpt?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  faq?: FaqItem[] | null;
}

/** What the route loads for the guard. Slice G may add fields (the catalog prices). */
export interface PublishFacts {
  contentFacts: Fact[];
}

export interface PublishVerdict {
  ok: boolean;
  /** Plain sentences naming the matched text, e.g. `Price claim: "from $9,000" in paragraph 4`. */
  reasons: string[];
}

/** Marker slice G removes; a spec pins that the stub is still the stub until then. */
export const PUBLISH_GUARD_IS_STUB = true;

export function checkPublishable(post: PublishCandidate, facts: PublishFacts): PublishVerdict {
  // STUB (slice G replaces this body): the inputs are part of the contract
  // but nothing is checked yet.
  void post;
  void facts;
  return { ok: true, reasons: [] };
}
