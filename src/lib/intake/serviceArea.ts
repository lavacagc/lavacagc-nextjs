/**
 * Does a typed town sit in the area we actually serve?
 *
 * Used for one thing only: deciding whether the flow says "that's ten minutes
 * from us" after the town question. The owner's instruction was to keep that
 * line when the town matches and skip it when it does not, because saying it
 * about Princeton would be false, and a false pleasantry is worse than silence.
 *
 * It delegates to the scorer's own predicate rather than matching itself. A
 * second implementation would drift, and the flow would eventually greet
 * someone as a neighbour and then score them as out of area - a contradiction
 * the owner would see in a single alert email.
 */
import { cityInServiceArea } from '@/lib/leadScoring';

/**
 * Normalise what a person actually types before asking the shared predicate.
 * "West Orange, NJ", "west orange" and "West Orange Township 07052" all have to
 * reach the same answer, and the scorer only ever sees a tidy `city` column.
 */
export function normalizeTown(town: string): string {
  return town
    .toLowerCase()
    .replace(/,?\s*(nj|n\.j\.|new jersey)\b/gi, ' ')
    .replace(/\b(township|twp\.?|borough|boro|village)\b/gi, ' ')
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isServiceArea(town: string | null | undefined): boolean {
  if (!town) return false;
  return cityInServiceArea(normalizeTown(town));
}
