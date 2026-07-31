/**
 * La Vaca Home Care - lifecycle emails (pure, testable).
 *
 * The two emails a member gets before the monthly newsletter ever fires:
 * the double opt-in confirmation, and the welcome once they've confirmed.
 * Both used to render an older 560px shell with a different header and no
 * postal address; they now share `emailShell` with everything else, so a new
 * member's first three emails look like the same company.
 *
 * Kept as pure builders (like `buildNewsletter`) so they can be rendered and
 * asserted without sending anything.
 */
import {
  homeCareEmailShell,
  licenceBar,
  brandRow,
  pill,
  headline,
  intro,
  cta,
  callBlock,
  panel,
  footer,
  textFooter,
  esc,
  ORANGE_DEEP,
  INK,
} from './emailShell';

export interface VerificationEmailArgs {
  firstName?: string | null;
  verifyUrl: string;
  unsubscribeUrl: string;
}

/**
 * Double opt-in confirmation. Deliberately single-CTA: no call block, no
 * share line, nothing competing with the one action that unblocks the member.
 */
export function buildVerificationEmail(args: VerificationEmailArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const { firstName, verifyUrl, unsubscribeUrl } = args;
  const name = firstName ? esc(firstName) : '';
  const hi = firstName ? `Hi ${name},` : 'Hi there,';

  const rows = [
    licenceBar(),
    brandRow(),
    pill(['La Vaca Home Care', 'Northern New Jersey']),
    headline('One click and', 'your plan is ready.'),
    intro(
      hi,
      `Confirm your email and we'll build your free, personalized seasonal home-maintenance plan - a short checklist of what your house actually needs each season, with a one-tap way to hand any of it to us.`,
    ),
    // cta() escapes the label, so pass it raw.
    cta('Confirm & get my plan', verifyUrl, 'Free &nbsp;&middot;&nbsp; No account &nbsp;&middot;&nbsp; Nothing to download'),
    panel(
      `This link expires in <strong style="color:${INK}">48 hours</strong>. If you didn't ask for this, just ignore this email - nothing happens until you confirm.`,
    ),
    footer({
      reason: `You're getting this because someone asked for a free La Vaca Home Care plan with this address.`,
      unsubscribeUrl,
    }),
  ].join('\n');

  const html = homeCareEmailShell({
    preheader: `Confirm your email and your free seasonal home plan is ready.`,
    rows,
  });

  const text =
    `${hi}\n\nConfirm your email to set up your free seasonal home-maintenance plan from La Vaca:\n${verifyUrl}\n\n` +
    `Free · No account · Nothing to download\n\nThis link expires in 48 hours. If you didn't ask for this, ignore this email - nothing happens until you confirm.\n` +
    textFooter(
      `You're getting this because someone asked for a free La Vaca Home Care plan with this address.`,
      unsubscribeUrl,
    );

  return { subject: 'Confirm your email - your La Vaca Home Care plan', html, text };
}

export interface WelcomeEmailArgs {
  firstName?: string | null;
  checklistUrl: string;
  unsubscribeUrl: string;
  preferencesUrl?: string | null;
  /** Absolute site origin, for the member-share link. */
  baseUrl?: string;
}

/** Sent the moment a member confirms. Their first look at the real program. */
export function buildWelcomeEmail(args: WelcomeEmailArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const { firstName, checklistUrl, unsubscribeUrl, preferencesUrl, baseUrl = 'https://www.lavacagc.com' } = args;
  const name = firstName ? esc(firstName) : '';
  const hi = firstName ? `Hi ${name},` : 'Hi there,';
  const shareUrl = `${baseUrl}/home-care?utm_source=member_share&utm_medium=email&utm_campaign=home_care_share`;

  const rows = [
    licenceBar(),
    brandRow(),
    pill([firstName ? `${name}'s Home Care` : 'La Vaca Home Care', 'Northern New Jersey']),
    headline(`You're in.`, 'Your plan is ready.'),
    intro(
      hi,
      `Your seasonal checklist is live - a short, personalized list of what your home needs right now, each item tagged <strong style="color:${INK}">DIY or pro</strong> so you know what's worth handing off. Check things off as you go; your progress is always saved.`,
    ),
    cta('See my checklist', checklistUrl, 'Free &nbsp;&middot;&nbsp; No account &nbsp;&middot;&nbsp; Nothing to download'),
    callBlock(
      'Rather we handled it?',
      `Tap "Add to request" on anything you'd rather not do yourself, and we'll price it in one go.`,
    ),
    panel(
      `Know someone who&rsquo;d want this? Forward this email - they can get their own free plan at <a href="${shareUrl}" style="color:${ORANGE_DEEP};font-weight:bold;text-decoration:none">lavacagc.com/home-care</a>.`,
    ),
    footer({
      reason: `You're getting this because you joined La Vaca Home Care.`,
      unsubscribeUrl,
      preferencesUrl: preferencesUrl ?? undefined,
    }),
  ].join('\n');

  const html = homeCareEmailShell({
    preheader: `Your seasonal checklist is ready - here's what your home needs now.`,
    rows,
  });

  const text =
    `${hi}\n\nYour La Vaca Home Care checklist is ready: ${checklistUrl}\n\n` +
    `A short, personalized list of what your home needs right now - each item tagged DIY or pro. Check things off as you go; your progress is saved.\n\n` +
    `Rather we handled it? Call (201) 212-4917 - 24-hour response guaranteed.\n\n` +
    `Know someone who'd want this? They can get their own free plan: ${baseUrl}/home-care\n` +
    textFooter(
      `You're getting this because you joined La Vaca Home Care.`,
      unsubscribeUrl,
      preferencesUrl ?? undefined,
    );

  return { subject: "You're in - your La Vaca Home Care checklist is ready", html, text };
}
