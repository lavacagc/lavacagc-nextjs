/**
 * ZIP codes of the four counties the home services pages promise to serve:
 * Essex, Morris and Bergen (docs/home-services/spec-website-build.md), and
 * Union since decision 006 Q21.
 *
 * The remodel scorer's SERVICE_ZIPS in leadScoring.ts lists about thirty ZIPs
 * around the towns La Vaca works most, which is right for scoring a remodel
 * lead and wrong as a gate for a page that says "Essex, Morris and Bergen
 * Counties": most of Bergen was being declined. This table is the county-wide
 * gate for the request flow; the scorer keeps its own list.
 *
 * Source: USPS ZIP allocations by county, compiled 2026-10-29. Newark and the
 * Oranges are included because they are Essex County; whether to serve them
 * is Alex's call and is one line to change. Alex should review this list once.
 *
 * Union: the 30 ZIPs zip-codes.com lists for Union County, NJ (26 standard,
 * 4 PO box: 07061, 07091, 07207, 07902), checked 2026-10-29, the same way the
 * other counties include their PO box ZIPs. 07060, 07062 and 07063 (Plainfield) also
 * deliver to North Plainfield in Somerset County, so a North Plainfield
 * address reads as Union here; the ZIP is the gate, as for the other counties.
 */
import type { County } from './catalog';

const ESSEX = [
  '07003', '07004', '07006', '07009', '07017', '07018', '07019', '07021', '07028',
  '07039', '07040', '07041', '07042', '07043', '07044', '07050', '07051', '07052',
  '07068', '07078', '07079', '07101', '07102', '07103', '07104', '07105', '07106',
  '07107', '07108', '07109', '07110', '07111', '07112', '07114',
];

const MORRIS = [
  '07005', '07034', '07035', '07045', '07046', '07054', '07058', '07082', '07405',
  '07440', '07444', '07457', '07801', '07802', '07803', '07806', '07828', '07834',
  '07836', '07842', '07845', '07847', '07849', '07850', '07852', '07853', '07856',
  '07857', '07866', '07869', '07870', '07876', '07878', '07885', '07926', '07927',
  '07928', '07930', '07932', '07933', '07935', '07936', '07940', '07945', '07946',
  '07950', '07960', '07961', '07962', '07963', '07970', '07976', '07980', '07981',
];

const BERGEN = [
  '07010', '07020', '07022', '07024', '07026', '07031', '07057', '07070', '07071',
  '07072', '07073', '07074', '07075', '07401', '07407', '07410', '07417', '07423',
  '07430', '07432', '07436', '07446', '07450', '07451', '07452', '07458', '07463',
  '07481', '07495', '07601', '07602', '07603', '07604', '07605', '07606', '07607',
  '07608', '07620', '07621', '07624', '07626', '07627', '07628', '07630', '07631',
  '07632', '07640', '07641', '07642', '07643', '07644', '07645', '07646', '07647',
  '07648', '07649', '07650', '07652', '07653', '07656', '07657', '07660', '07661',
  '07662', '07663', '07666', '07670', '07675', '07676', '07677',
];

const UNION = [
  '07016', '07023', '07027', '07033', '07036', '07060', '07061', '07062', '07063',
  '07065', '07066', '07076', '07081', '07083', '07088', '07090', '07091', '07092',
  '07201', '07202', '07203', '07204', '07205', '07206', '07207', '07208', '07901',
  '07902', '07922', '07974',
];

const BY_ZIP: ReadonlyMap<string, County> = new Map<string, County>([
  ...ESSEX.map((z): [string, County] => [z, 'Essex']),
  ...MORRIS.map((z): [string, County] => [z, 'Morris']),
  ...BERGEN.map((z): [string, County] => [z, 'Bergen']),
  ...UNION.map((z): [string, County] => [z, 'Union']),
]);

/** The county a five-digit ZIP belongs to, or null when it is outside the four. */
export function countyForZip(zip: string | null | undefined): County | null {
  if (!zip) return null;
  const five = zip.trim().slice(0, 5);
  return BY_ZIP.get(five) ?? null;
}

export function zipInServiceCounties(zip: string | null | undefined): boolean {
  return countyForZip(zip) !== null;
}

export const SERVICE_COUNTY_ZIPS: readonly string[] = [...BY_ZIP.keys()];
