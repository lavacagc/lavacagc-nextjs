import { z } from 'zod';

/**
 * Shared payload schema for estimate-email send + preview routes.
 *
 * The same shape powers both endpoints because /preview is essentially
 * "what would /send produce?" without the side effects.
 */
export const estimateEmailSchema = z.object({
  // Optional FK: if the admin selected a lead from search, we link it for
  // audit. One-off sends without a lead row are allowed.
  leadId: z.string().uuid().optional().nullable(),

  recipientName: z.string().trim().min(1, 'Recipient name is required').max(120),

  // Optional in test mode (the send route redirects to alex@lavacagc.com),
  // required for real sends. The cross-field check below enforces that.
  // We accept empty string and normalize to undefined so an empty form field
  // doesn't fail email-format validation when isTest=true.
  recipientEmail: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.string().email('Invalid recipient email').optional()),

  // Comma-separated string from the form, or already-split array. We accept
  // either and normalize before sending.
  ccEmails: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const arr = Array.isArray(v) ? v : v.split(',');
      const cleaned = arr.map((s) => s.trim()).filter(Boolean);
      return cleaned.length > 0 ? cleaned : undefined;
    })
    .pipe(z.array(z.string().email('Invalid CC email')).max(5).optional()),

  replyTo: z
    .string()
    .trim()
    .email('Invalid reply-to email')
    .max(255)
    .optional()
    .or(z.literal('').transform(() => undefined)),

  projectType: z.string().trim().min(1, 'Project type is required').max(120),

  // QBO estimate URL — must be https for safety. We don't validate the
  // intuit.com host because QBO sometimes ships short links.
  estimateUrl: z
    .string()
    .trim()
    .url('Invalid estimate URL')
    .refine((u) => u.startsWith('https://'), 'Estimate URL must use https'),

  portalUrl: z
    .string()
    .trim()
    .url('Invalid portal URL')
    .refine((u) => u.startsWith('https://'), 'Portal URL must use https')
    .optional()
    .or(z.literal('').transform(() => undefined)),

  updateCadence: z.enum(['daily', 'weekly']).optional(),

  personalNote: z
    .string()
    .trim()
    .max(1000, 'Personal note must be under 1000 characters')
    .optional()
    .or(z.literal('').transform(() => undefined)),

  // True for the admin's "Send a test to me" button.
  isTest: z.boolean().optional(),
}).refine(
  // Real sends must have a recipient email. Test sends are allowed to skip
  // it because the send route redirects to alex@lavacagc.com regardless.
  (data) => data.isTest === true || (typeof data.recipientEmail === 'string' && data.recipientEmail.length > 0),
  {
    message: 'Recipient email is required (unless this is a test send)',
    path: ['recipientEmail'],
  },
);

export type EstimateEmailInput = z.infer<typeof estimateEmailSchema>;
