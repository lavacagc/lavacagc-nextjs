/**
 * Do we serve this property? THE one predicate for the home services request
 * flow: the address step asks it on blur, and /api/home-services/request asks
 * it again before anything is saved. Both import this function, so the browser
 * can never be warm about a ZIP the server then declines.
 *
 * When a five-digit ZIP is present it decides by itself (review D11, Fable's
 * ruling): in area when it is in Essex, Morris, Bergen or Union County
 * (countyZips.ts, the counties the page copy promises) or in the remodel
 * scorer's SERVICE_ZIPS (leadScoring.ts, so nothing the scorer calls local is
 * declined here: Clifton, Rahway). A town cannot rescue a ZIP the lists
 * decline, so a crafted request cannot claim "Montclair" for a Basking Ridge
 * ZIP. Only when the ZIP is missing or malformed does the town decide, against
 * the scorer's SERVICE_AREAS.
 *
 * Import-light: no server code, safe in client components.
 */
import { SERVICE_AREAS, SERVICE_ZIPS, cityInServiceArea } from '@/lib/leadScoring';
import { countyForZip, zipInServiceCounties } from './countyZips';

export const ZIP_RE = /^\d{5}$/;

/** A five-digit US ZIP, from whatever was typed ("07042-1234" -> "07042"). */
export function normalizeZip(raw: string | null | undefined): string {
  const match = String(raw ?? '').match(/\d{5}/);
  return match ? match[0] : '';
}

export function isInServiceArea(input: { zip?: string | null; town?: string | null }): boolean {
  const zip = normalizeZip(input.zip);
  if (ZIP_RE.test(zip)) return zipInServiceCounties(zip) || SERVICE_ZIPS.includes(zip);
  const town = String(input.town ?? '').trim().toLowerCase();
  return town.length > 0 && cityInServiceArea(town);
}

export { SERVICE_AREAS, SERVICE_ZIPS, countyForZip };
