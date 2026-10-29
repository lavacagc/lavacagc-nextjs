/**
 * Do we serve this property? THE one predicate for the home services request
 * flow: the address step asks it on blur, and /api/home-services/request asks
 * it again before anything is saved. Both import this function, so the browser
 * can never be warm about a ZIP the server then declines.
 *
 * It reuses the lead scorer's lists (src/lib/leadScoring.ts) rather than a
 * third copy: a request accepted here and then scored as out of area would be
 * a contradiction in the same owner alert.
 *
 * The ZIP list is the gate (acceptance-criteria.md, "Service area"). The town
 * list only rescues a request whose ZIP is missing from the list but whose town
 * the scorer already treats as ours.
 *
 * Import-light: no server code, safe in client components.
 */
import { SERVICE_AREAS, SERVICE_ZIPS, cityInServiceArea } from '@/lib/leadScoring';

export const ZIP_RE = /^\d{5}$/;

/** A five-digit US ZIP, from whatever was typed ("07042-1234" -> "07042"). */
export function normalizeZip(raw: string | null | undefined): string {
  const match = String(raw ?? '').match(/\d{5}/);
  return match ? match[0] : '';
}

export function isInServiceArea(input: { zip?: string | null; town?: string | null }): boolean {
  const zip = normalizeZip(input.zip);
  if (zip && SERVICE_ZIPS.includes(zip)) return true;
  const town = String(input.town ?? '').trim().toLowerCase();
  return town.length > 0 && cityInServiceArea(town);
}

export { SERVICE_AREAS, SERVICE_ZIPS };
