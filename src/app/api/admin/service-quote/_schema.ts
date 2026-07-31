import { z } from 'zod';

/**
 * Payload shapes for the service-quote admin routes.
 *
 * `estimateUrl` stays required: the owner chose to keep QuickBooks in the loop
 * for service work, so every quote carries a real QBO estimate and
 * `estimate_emails.estimate_url` (NOT NULL) is never violated.
 */
export const serviceQuoteSchema = z.object({
  leadId: z.string().uuid().optional().nullable(),
  recipientName: z.string().trim().min(1, 'Recipient name is required').max(120),
  recipientEmail: z
    .string().trim().max(255).optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.string().email('Invalid recipient email').optional()),
  ccEmails: z
    .union([z.string(), z.array(z.string())]).optional()
    .transform((v) => {
      if (!v) return undefined;
      const arr = Array.isArray(v) ? v : v.split(',');
      const cleaned = arr.map((s) => s.trim()).filter(Boolean);
      return cleaned.length > 0 ? cleaned : undefined;
    })
    .pipe(z.array(z.string().email('Invalid CC email')).max(5).optional()),

  /** Plain-language scope. This is the sentence the customer reads. */
  scopeSummary: z.string().trim().min(1, 'Scope summary is required').max(300),
  /** Catalog keys behind the scope, kept for scheduling and history. */
  taskKeys: z.array(z.string().regex(/^[a-z0-9_]+$/i).max(80)).max(20).optional(),
  visitLength: z.string().trim().max(120).optional().or(z.literal('').transform(() => undefined)),

  estimateUrl: z
    .string().trim().url('Invalid estimate URL')
    .refine((u) => u.startsWith('https://'), 'Estimate URL must use https'),

  /** ISO date; defaults to +30 days when omitted. */
  validUntil: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional()
    .or(z.literal('').transform(() => undefined)),

  personalNote: z.string().trim().max(1000).optional().or(z.literal('').transform(() => undefined)),
  isTest: z.boolean().optional(),
}).refine(
  (d) => d.isTest === true || (typeof d.recipientEmail === 'string' && d.recipientEmail.length > 0),
  { message: 'Recipient email is required (unless this is a test send)', path: ['recipientEmail'] },
);

export type ServiceQuoteInput = z.infer<typeof serviceQuoteSchema>;

export const scheduleSchema = z.object({
  email: z.string().trim().email('Valid customer email required').max(255),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal('').transform(() => undefined)),
  taskKeys: z.array(z.string().regex(/^[a-z0-9_]+$/i).max(80)).min(1, 'Pick at least one service').max(20),
  /**
   * Full ISO instants for the arrival window.
   *
   * There is deliberately no `season` alongside them: it is derived server-side
   * from the visit date reconciled against each task's own catalog seasons,
   * which only the server reads - and it comes out per TASK, so there is no
   * single value a caller could send. The route returns what it filed each task
   * under, and "mark complete" passes that back.
   */
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  address: z.string().trim().min(1, 'A service address is required for the calendar invite').max(300),
  city: z.string().trim().max(120).optional().or(z.literal('').transform(() => undefined)),
  zip: z.string().trim().max(20).optional().or(z.literal('').transform(() => undefined)),
}).refine((d) => new Date(d.end).getTime() > new Date(d.start).getTime(), {
  message: 'The end of the window must be after the start', path: ['end'],
});

export type ScheduleInput = z.infer<typeof scheduleSchema>;

/**
 * Query params for cancelling ONE visit (DELETE).
 *
 * `email` is validated here for the same reason the POST body validates it: it
 * is handed to the reminder cancel, and an address is the only thing scoping
 * that cancel to one customer. A raw query string would otherwise let a
 * wildcard through where the POST path rejects it.
 */
export const cancelVisitSchema = z.object({
  homeownerId: z.string().uuid(),
  email: z.string().trim().email('Valid customer email required').max(255),
  /**
   * The window this cancel targets, so it can never clear the whole season.
   * (homeowner, window) is the whole filter: one visit's tasks can be filed
   * under different seasons, so a season would narrow it wrongly.
   */
  start: z.string().datetime({ offset: true }),
});

export type CancelVisitInput = z.infer<typeof cancelVisitSchema>;

export const completeSchema = z.object({
  homeownerId: z.string().uuid(),
  taskKeys: z.array(z.string().regex(/^[a-z0-9_]+$/i).max(80)).min(1).max(20),
  /**
   * Where each task was filed, as returned by /schedule. A fallback only: the
   * booked row is the source of truth, and this covers a task with no booking.
   */
  seasons: z.record(z.string(), z.enum(['spring', 'summer', 'fall', 'winter'])).optional(),
  /** Skip the feedback email (e.g. re-marking an old job). */
  skipFeedback: z.boolean().optional(),
});

export type CompleteInput = z.infer<typeof completeSchema>;
