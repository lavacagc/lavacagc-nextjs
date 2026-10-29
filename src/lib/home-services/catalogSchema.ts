/**
 * What the Services & Prices editor may write to one `home_services` row
 * (PATCH /api/admin/home-services/[slug]; docs/phase-2/acceptance-criteria.md,
 * "Admin Services & Prices editor", CAT5). Pure, so the route and the tests
 * share it.
 *
 * Every field is optional (a PATCH), unknown keys are refused (`slug`, `trade`,
 * `sort`, `updated_by` are not the editor's to change), and a failure names the
 * field so the form can put the message next to it. Nothing is written unless
 * the whole body passes.
 */
import { z } from 'zod';

const MAX_PRICE_CENTS = 10_000_000;

const text = (label: string, max: number) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} is at most ${max} characters`);

const lines = (label: string) =>
  z.array(text(`Each ${label} line`, 200), { error: `${label} must be a list of lines` }).max(12, `${label} has at most 12 lines`);

const cents = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .int(`${label} must be whole cents`)
    .min(1, `${label} must be at least 1 cent`)
    .max(MAX_PRICE_CENTS, `${label} must be at most $100,000`);

/** An empty note clears it (stored as null). */
const note = (label: string) =>
  z
    .union([z.string().trim().max(160, `${label} is at most 160 characters`), z.null()])
    .transform((v) => (v ? v : null));

const faqItem = z.object({
  q: z.object({ en: text('English question', 300), es: text('Spanish question', 300) }).strict(),
  a: z.object({ en: text('English answer', 1200), es: text('Spanish answer', 1200) }).strict(),
}).strict();

export const ServicePatchSchema = z
  .object({
    active: z.boolean({ error: 'Active must be true or false' }),
    starting_price_cents: cents('Starting price'),
    minimum_cents: z.union([cents('Job minimum'), z.null()]),
    price_display_en: text('English price display', 40),
    price_display_es: text('Spanish price display', 40),
    price_unit_en: text('English price unit', 120),
    price_unit_es: text('Spanish price unit', 120),
    price_note_en: note('English price note'),
    price_note_es: note('Spanish price note'),
    name_en: text('English name', 80),
    name_es: text('Spanish name', 80),
    description_en: text('English description', 400),
    description_es: text('Spanish description', 400),
    included_en: lines('English included'),
    included_es: lines('Spanish included'),
    raises_en: lines('English raises-the-price'),
    raises_es: lines('Spanish raises-the-price'),
    seo_title_en: text('English SEO title', 60),
    seo_title_es: text('Spanish SEO title', 60),
    seo_description_en: text('English SEO description', 160),
    seo_description_es: text('Spanish SEO description', 160),
    seo_keywords: z.array(text('Each keyword', 80)).max(10, 'At most 10 keywords'),
    faq: z.array(faqItem).max(12, 'At most 12 FAQ entries'),
  })
  .partial()
  .strict()
  .superRefine((body, ctx) => {
    if (Object.keys(body).length === 0) ctx.addIssue({ code: 'custom', message: 'Nothing to save', path: [] });
    // The page pairs the two lists line by line, so they travel and count together.
    for (const [en, es, label] of [
      ['included_en', 'included_es', 'included'],
      ['raises_en', 'raises_es', 'raises-the-price'],
    ] as const) {
      const a = body[en];
      const b = body[es];
      if ((a === undefined) !== (b === undefined)) {
        ctx.addIssue({ code: 'custom', message: `Send the English and Spanish ${label} lists together`, path: [a === undefined ? en : es] });
      } else if (a && b && a.length !== b.length) {
        ctx.addIssue({ code: 'custom', message: `The Spanish ${label} list needs one line per English line (${a.length})`, path: [es] });
      }
    }
  });

export type ServicePatch = z.infer<typeof ServicePatchSchema>;

/** `{ field: first message }`, keyed by the top-level field (a FAQ problem is keyed `faq`). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
