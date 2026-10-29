/**
 * Markup and sub-pay rules from the spec ("Markup and Contracts"):
 *   customer price = sub pay x 1.43 (keeps profit at or above the 30% floor)
 *   sub pay can never exceed 70% of the customer price.
 *
 * Pure functions over integer cents so the admin bid screen, the API that
 * creates offers, the counter-offer review and the tests all agree to the cent.
 */

export const SUB_MARKUP = 1.43;
export const SUB_PAY_MAX_SHARE = 0.7;
export const OFFER_TTL_HOURS = 24;

/** Customer price for a given sub pay, rounded to the nearest dollar. */
export function customerPriceForSubPay(subPayCents: number): number {
  return Math.round((subPayCents * SUB_MARKUP) / 100) * 100;
}

/** The most a sub can be paid on a job sold at this customer price. */
export function maxSubPayForCustomerPrice(customerPriceCents: number): number {
  return Math.floor(customerPriceCents * SUB_PAY_MAX_SHARE);
}

/** Margin in cents and as a share of the customer price. */
export function margin(customerPriceCents: number, subPayCents: number): { cents: number; share: number } {
  const cents = customerPriceCents - subPayCents;
  return { cents, share: customerPriceCents > 0 ? cents / customerPriceCents : 0 };
}

/**
 * The admin area blocks offers or counters above the 70% share. Returns null
 * when the pair is allowed, otherwise the reason to show.
 */
export function subPayViolation(customerPriceCents: number, subPayCents: number): string | null {
  if (!Number.isInteger(customerPriceCents) || customerPriceCents <= 0) return 'Customer price must be a positive whole number of cents.';
  if (!Number.isInteger(subPayCents) || subPayCents <= 0) return 'Sub pay must be a positive whole number of cents.';
  const max = maxSubPayForCustomerPrice(customerPriceCents);
  if (subPayCents > max) {
    return `Sub pay ${formatDollars(subPayCents)} is above 70% of the ${formatDollars(customerPriceCents)} customer price (max ${formatDollars(max)}).`;
  }
  return null;
}

export function formatDollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });
}

/** Parse "1,400", "$1400.50" or "1400" into cents; null when it is not a money amount. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
