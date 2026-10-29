/**
 * Request schemas for the article routes Claude Code uses
 * (/api/articles/ingest/*, docs/articles-ingest.md).
 *
 * Client-safe: zod only. The admin editor builds its own payload today; these
 * are the one place an article body is validated server-side.
 */
import { z } from 'zod';

export const ARTICLE_SLUG_MAX = 80;
export const ARTICLE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const FAQ_MAX_ITEMS = 10;

const optionalText = (max: number) => z.string().trim().max(max).nullish();

/** One question and its answer, rendered as a FAQ section and FAQPage JSON-LD. */
export const faqItemSchema = z.object({
  q: z.string().trim().min(1, 'A FAQ question cannot be empty').max(300),
  a: z.string().trim().min(1, 'A FAQ answer cannot be empty').max(2000),
}).strict();
export type FaqItem = z.infer<typeof faqItemSchema>;

/** `"a, b"` or `["a", "b"]`; stored the way the editor stores it, comma-separated. */
const keywords = z.union([
  z.string().trim().max(500),
  z.array(z.string().trim().min(1).max(80)).max(20).transform((list) => list.join(', ')),
]).nullish();

const articleFieldShape = {
  title: z.string().trim().min(1, 'Title is required').max(200),
  slug: z.string().trim().max(ARTICLE_SLUG_MAX)
    .regex(ARTICLE_SLUG_PATTERN, 'Lowercase letters, digits and hyphens only')
    .optional(),
  content: z.string().trim().min(1, 'Content is required').max(200_000),
  category: z.string().trim().min(1, 'Category is required').max(80),
  excerpt: optionalText(500),
  meta_title: optionalText(120),
  meta_description: optionalText(320),
  meta_keywords: keywords,
  featured_image: z.string().trim().url().max(2048)
    .refine((u) => /^https:\/\//i.test(u) || /^http:\/\/(127\.0\.0\.1|localhost)[:/]/i.test(u), 'Must be an https URL')
    .nullish(),
  faq: z.array(faqItemSchema).max(FAQ_MAX_ITEMS).nullish(),
  /** The content_actions row this article answers (decision: Claude produces the queue's drafts). */
  action_id: z.string().uuid('action_id must be a content_actions id').optional(),
};

export const articleCreateSchema = z.object(articleFieldShape).strict();
export type ArticleCreate = z.infer<typeof articleCreateSchema>;

/** Every field optional, at least one present. `published` is not a field: publish and unpublish have their own routes. */
export const articleUpdateSchema = z.object(articleFieldShape).partial().strict()
  .refine((v) => Object.keys(v).some((k) => k !== 'action_id'), { message: 'Send at least one field to change' });
export type ArticleUpdate = z.infer<typeof articleUpdateSchema>;

export const articlePublishSchema = z.object({
  action_id: z.string().uuid('action_id must be a content_actions id').optional(),
  /**
   * The social copy file (docs/social/<slug>.md) as markdown, from
   * `ingest-article.mjs publish --social <file>` (decision 006, Q22).
   * Checked by src/lib/articles/socialCopy.ts before anything is written.
   */
  social: z.string().min(1).max(16 * 1024, 'The social copy file is over 16 KB').optional(),
}).strict();

/** `?days=` for the feedback route: 7 to 90 (SEC3), default 28. */
export const FEEDBACK_DEFAULT_DAYS = 28;
export const FEEDBACK_MAX_DAYS = 90;
export const FEEDBACK_MIN_DAYS = 7;

export function parseFeedbackDays(raw: string | null): number | null {
  if (raw === null || raw === '') return FEEDBACK_DEFAULT_DAYS;
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= FEEDBACK_MIN_DAYS && n <= FEEDBACK_MAX_DAYS ? n : null;
}

/** The posts' rows store FAQ as jsonb; anything that is not a clean list renders as no FAQ. */
export function readFaq(value: unknown): FaqItem[] {
  const parsed = z.array(faqItemSchema).max(FAQ_MAX_ITEMS).safeParse(value);
  return parsed.success ? parsed.data : [];
}
