/**
 * The seven home services, their starting prices, and the tap questions the
 * request flow asks for each. THE source of truth for prices on the site:
 * the landing page, the per-service pages, the sub bid screen and the
 * pricing report all read from here. Nothing else carries a price.
 *
 * Prices are the "starting at" figures from docs/home-services/spec-landing-page.md
 * (NJ 2026 market ranges) plus $100 on every flat price and on the exterior
 * painting job minimum (Alex, 2026-10-29, docs/decisions/005). There is room
 * for the 43% markup over sub pay - see pricing.ts. Prices are never an A/B
 * variable (005). Phase 2 moves this data into an admin-edited table.
 *
 * Every customer-facing string is bilingual (en / es). Spanish is kept next to
 * the English so a copy change cannot drift between the two.
 *
 * Import-light on purpose: no React, no Supabase, so server routes, the sub
 * offer email and client components can all import it.
 */

export type Lang = 'en' | 'es';
export type L = Record<Lang, string>;

/** A trade = who gets the bid request. One service maps to one trade. */
export type Trade =
  | 'cabinet_painting'
  | 'hvac'
  | 'duct_cleaning'
  | 'home_cleaning'
  | 'exterior_painting'
  | 'gutter_cleaning'
  | 'drywall';

export const TRADE_LABEL: Record<Trade, L> = {
  cabinet_painting: { en: 'Cabinet painting', es: 'Pintura de gabinetes' },
  hvac: { en: 'HVAC service', es: 'Servicio de HVAC' },
  duct_cleaning: { en: 'Duct cleaning', es: 'Limpieza de ductos' },
  home_cleaning: { en: 'Home cleaning', es: 'Limpieza de casa' },
  exterior_painting: { en: 'Exterior painting', es: 'Pintura exterior' },
  gutter_cleaning: { en: 'Gutter cleaning', es: 'Limpieza de canaletas' },
  drywall: { en: 'Drywall', es: 'Reparación de drywall' },
};

export const COUNTIES = ['Essex', 'Morris', 'Bergen'] as const;
export type County = (typeof COUNTIES)[number];

export interface ServiceQuestionOption {
  value: string;
  label: L;
}

export interface ServiceQuestion {
  key: string;
  label: L;
  options: ServiceQuestionOption[];
}

export interface HomeService {
  /** URL slug: /home-services/<slug>. Also the key stored in home_service_requests.services. */
  slug: string;
  trade: Trade;
  name: L;
  /** Lucide icon name rendered by the card (no photography exists for these yet). */
  icon: 'paint-roller' | 'fan' | 'wind' | 'sparkles' | 'house' | 'cloud-rain' | 'hammer';
  /** Optional photo under /public; cards render the icon panel when absent. */
  image?: string;
  /** Starting price in cents. For per-unit prices this is the unit price. */
  startingPriceCents: number;
  /** How the price is displayed, e.g. "$1,995" or "$2.95 / sq ft". */
  priceDisplay: L;
  /** What the starting price covers, one short line. */
  priceUnit: L;
  /** Optional second price line (gutters: two story). */
  priceNote?: L;
  /** Minimum job total in cents, when the service is priced per unit. */
  minimumCents?: number;
  /** Two-line card description from the build spec. */
  description: L;
  /** "What's included" sheet. */
  included: L[];
  /** "What raises the price" sheet. */
  raisesPrice: L[];
  /** Exactly three tap groups per service (grill decision 001 Q4). */
  questions: ServiceQuestion[];
  seo: {
    title: L;
    description: L;
    keywords: string[];
  };
  faq: Array<{ q: L; a: L }>;
}

const yesNo = (key: string, label: L): ServiceQuestion => ({
  key,
  label,
  options: [
    { value: 'yes', label: { en: 'Yes', es: 'Sí' } },
    { value: 'no', label: { en: 'No', es: 'No' } },
  ],
});

const stories = (): ServiceQuestion => ({
  key: 'stories',
  label: { en: 'How many stories?', es: '¿Cuántos pisos?' },
  options: [
    { value: '1', label: { en: '1', es: '1' } },
    { value: '2', label: { en: '2', es: '2' } },
    { value: '3+', label: { en: '3+', es: '3+' } },
  ],
});

/**
 * AEO: every service answers "how much does X cost in NJ?" first and in full,
 * with the price, what it covers and what moves it, so an answer engine can
 * quote the answer and a homeowner can decide without a call.
 */
const costFaq = (service: L, answer: L): HomeService['faq'][number] => ({
  q: { en: `How much does ${service.en} cost in NJ?`, es: `¿Cuánto cuesta ${service.es} en NJ?` },
  a: answer,
});

/** One stop: every service page says the same thing about bundling, naming a pairing that fits the service. */
const oneStopFaq = (pairing: L): HomeService['faq'][number] => ({
  q: { en: 'Can I add other services to the same request?', es: '¿Puedo agregar otros servicios a la misma solicitud?' },
  a: {
    en: `Yes. Tick ${pairing.en}, or anything else on the list, and send one request. You get one firm price, one schedule and one point of contact; the crews come in order while you sit back.`,
    es: `Sí. Marque ${pairing.es}, o cualquier otro servicio de la lista, y envíe una sola solicitud. Recibe un solo precio firme, una sola agenda y un solo contacto; los equipos llegan en orden mientras usted se relaja.`,
  },
});

export const HOME_SERVICES_CATALOG: HomeService[] = [
  {
    slug: 'cabinet-repainting',
    trade: 'cabinet_painting',
    name: { en: 'Cabinet repainting', es: 'Repintado de gabinetes' },
    icon: 'paint-roller',
    startingPriceCents: 209500,
    priceDisplay: { en: '$2,095', es: '$2,095' },
    priceUnit: { en: 'per kitchen, up to 25 doors and drawers', es: 'por cocina, hasta 25 puertas y cajones' },
    description: {
      en: 'Clean, sand, prime and spray paint existing cabinet doors and boxes. Price covers a standard kitchen up to 25 doors and drawers.',
      es: 'Limpiamos, lijamos, imprimamos y pintamos con pistola las puertas y cajas de gabinetes existentes. El precio cubre una cocina estándar de hasta 25 puertas y cajones.',
    },
    included: [
      { en: 'Degrease, sand and prime every door, drawer front and box face', es: 'Desengrasar, lijar e imprimar cada puerta, frente de cajón y cara de caja' },
      { en: 'Two coats of cabinet enamel, sprayed', es: 'Dos capas de esmalte para gabinetes, con pistola' },
      { en: 'Hardware removed and reinstalled', es: 'Herrajes retirados y reinstalados' },
      { en: 'Masking and cleanup', es: 'Protección de superficies y limpieza' },
    ],
    raisesPrice: [
      { en: 'More than 25 doors and drawers', es: 'Más de 25 puertas y cajones' },
      { en: 'A color change from dark to light', es: 'Cambio de color de oscuro a claro' },
      { en: 'Islands, glass doors or heavy damage', es: 'Islas, puertas de vidrio o daños importantes' },
    ],
    questions: [
      {
        key: 'doors',
        label: { en: 'Doors and drawers', es: 'Puertas y cajones' },
        options: [
          { value: 'up_to_25', label: { en: 'Up to 25', es: 'Hasta 25' } },
          { value: '26_40', label: { en: '26 to 40', es: '26 a 40' } },
          { value: '40_plus', label: { en: '40+', es: '40+' } },
        ],
      },
      {
        key: 'color_change',
        label: { en: 'Color', es: 'Color' },
        options: [
          { value: 'same', label: { en: 'Same color', es: 'Mismo color' } },
          { value: 'new', label: { en: 'New color', es: 'Color nuevo' } },
        ],
      },
      yesNo('island', { en: 'Island included?', es: '¿Incluye isla?' }),
    ],
    seo: {
      title: { en: 'Cabinet Repainting in Essex, Morris & Bergen NJ from $2,095', es: 'Pintura de gabinetes en Essex, Morris y Bergen desde $2,095' },
      description: {
        en: 'Cabinet repainting costs from $2,095 in Essex, Morris and Bergen Counties NJ. Sprayed enamel, two coats, firm quote from your photos the same day.',
        es: 'Repintado de gabinetes desde $2,095 en Essex, Morris y Bergen NJ. Esmalte con pistola, dos capas y cotización firme con sus fotos el mismo día.',
      },
      keywords: ['cabinet painting NJ', 'how much does cabinet painting cost in NJ', 'cabinet painting near me', 'cabinet refinishing Essex County', 'kitchen cabinet painting Morris County', 'cabinet painters Bergen County'],
    },
    faq: [
      costFaq({ en: 'cabinet repainting', es: 'el repintado de gabinetes' }, {
        en: 'From $2,095 for a standard kitchen of up to 25 doors and drawers: degreased, sanded, primed and sprayed with two coats of cabinet enamel. More doors, an island or a dark-to-light color change add to it, and you get the firm price from your photos before anything starts.',
        es: 'Desde $2,095 por una cocina estándar de hasta 25 puertas y cajones: desengrasada, lijada, imprimada y pintada con pistola con dos capas de esmalte. Más puertas, una isla o un cambio de oscuro a claro suben el precio, y recibe el precio firme con sus fotos antes de empezar.',
      }),
      { q: { en: 'How long does it take?', es: '¿Cuánto tarda?' }, a: { en: 'Three to five working days for most kitchens. The doors are sprayed off site, so your kitchen stays usable in between.', es: 'De tres a cinco días hábiles en la mayoría de las cocinas. Las puertas se pintan fuera del sitio, así que la cocina sigue siendo usable mientras tanto.' } },
      { q: { en: 'Can I change the color?', es: '¿Puedo cambiar el color?' }, a: { en: 'Yes. Dark to light needs extra primer coats, which is one of the things that moves the price.', es: 'Sí. De oscuro a claro requiere capas extra de imprimación, y eso es parte de lo que mueve el precio.' } },
      oneStopFaq({ en: 'drywall patching or a deep clean', es: 'reparación de drywall o una limpieza profunda' }),
    ],
  },
  {
    slug: 'hvac-cleaning',
    trade: 'hvac',
    name: { en: 'HVAC cleaning', es: 'Limpieza de HVAC' },
    icon: 'fan',
    startingPriceCents: 29900,
    priceDisplay: { en: '$299', es: '$299' },
    priceUnit: { en: 'per system', es: 'por sistema' },
    description: {
      en: 'Coil, blower and drain line cleaning plus filter change. One system; add systems at checkout.',
      es: 'Limpieza de serpentín, ventilador y línea de drenaje, más cambio de filtro. Un sistema; agregue sistemas al solicitar.',
    },
    included: [
      { en: 'Evaporator and condenser coil cleaning', es: 'Limpieza de serpentín evaporador y condensador' },
      { en: 'Blower and drain line cleared', es: 'Ventilador y línea de drenaje despejados' },
      { en: 'Standard filter replaced', es: 'Filtro estándar reemplazado' },
      { en: 'System run test', es: 'Prueba de funcionamiento del sistema' },
    ],
    raisesPrice: [
      { en: 'Each additional system', es: 'Cada sistema adicional' },
      { en: 'Rooftop or attic units with difficult access', es: 'Unidades en techo o ático de difícil acceso' },
      { en: 'Repairs found during the service (quoted separately)', es: 'Reparaciones encontradas durante el servicio (se cotizan aparte)' },
    ],
    questions: [
      {
        key: 'systems',
        label: { en: 'Systems', es: 'Sistemas' },
        options: [
          { value: '1', label: { en: '1', es: '1' } },
          { value: '2', label: { en: '2', es: '2' } },
          { value: '3+', label: { en: '3+', es: '3+' } },
        ],
      },
      {
        key: 'age',
        label: { en: 'System age', es: 'Edad del sistema' },
        options: [
          { value: 'under_10', label: { en: 'Under 10 years', es: 'Menos de 10 años' } },
          { value: '10_20', label: { en: '10 to 20 years', es: '10 a 20 años' } },
          { value: 'over_20', label: { en: '20+ years', es: 'Más de 20 años' } },
        ],
      },
      {
        key: 'last_service',
        label: { en: 'Last serviced', es: 'Último servicio' },
        options: [
          { value: 'under_1y', label: { en: 'Within a year', es: 'Hace menos de un año' } },
          { value: '1_3y', label: { en: '1 to 3 years ago', es: 'Hace 1 a 3 años' } },
          { value: 'longer', label: { en: 'Longer or not sure', es: 'Más tiempo o no sé' } },
        ],
      },
    ],
    seo: {
      title: { en: 'HVAC Cleaning in Essex, Morris & Bergen NJ from $299', es: 'Limpieza de HVAC en Essex, Morris y Bergen NJ desde $299' },
      description: {
        en: 'HVAC cleaning costs from $299 per system in Essex, Morris and Bergen NJ: coil, blower and drain line cleaned, filter changed. Firm price, fast scheduling.',
        es: 'Limpieza de HVAC desde $299 por sistema en Essex, Morris y Bergen NJ: serpentín, ventilador y drenaje limpios, filtro nuevo. Precio firme y agenda rápida.',
      },
      keywords: ['HVAC cleaning NJ', 'how much does HVAC cleaning cost', 'HVAC cleaning near me', 'AC coil cleaning Essex County', 'furnace cleaning Morris County', 'HVAC tune up Bergen County'],
    },
    faq: [
      costFaq({ en: 'HVAC cleaning', es: 'la limpieza de HVAC' }, {
        en: 'From $299 per system: the evaporator coil, blower and condensate drain line cleaned, a new filter fitted and the system checked. A second system or a heavily clogged coil adds to it, and the price is firm before the visit.',
        es: 'Desde $299 por sistema: serpentín, ventilador y línea de drenaje limpios, filtro nuevo y revisión del sistema. Un segundo sistema o un serpentín muy obstruido suben el precio, y el precio es firme antes de la visita.',
      }),
      { q: { en: 'Is this a repair visit?', es: '¿Es una visita de reparación?' }, a: { en: 'No. It is a cleaning and tune. Anything that needs parts is quoted separately before any work.', es: 'No. Es limpieza y ajuste. Cualquier pieza necesaria se cotiza aparte antes de hacer el trabajo.' } },
      { q: { en: 'How long does it take?', es: '¿Cuánto tarda?' }, a: { en: 'About two hours per system. You do not need to stay home once the tech is in.', es: 'Unas dos horas por sistema. No necesita quedarse en casa una vez que el técnico entra.' } },
      oneStopFaq({ en: 'duct cleaning or gutter cleaning', es: 'limpieza de ductos o de canaletas' }),
    ],
  },
  {
    slug: 'duct-and-vent-cleaning',
    trade: 'duct_cleaning',
    name: { en: 'Duct and vent cleaning', es: 'Limpieza de ductos y rejillas' },
    icon: 'wind',
    startingPriceCents: 44900,
    priceDisplay: { en: '$449', es: '$449' },
    priceUnit: { en: 'up to 10 vents', es: 'hasta 10 rejillas' },
    description: {
      en: 'Supply and return ducts vacuumed and sanitized. Additional vents priced per vent.',
      es: 'Ductos de suministro y retorno aspirados y desinfectados. Rejillas adicionales con precio por rejilla.',
    },
    included: [
      { en: 'Negative-pressure vacuuming of supply and return runs', es: 'Aspirado a presión negativa de ductos de suministro y retorno' },
      { en: 'Vent covers removed, cleaned and refitted', es: 'Rejillas retiradas, limpiadas y reinstaladas' },
      { en: 'Sanitizing fog', es: 'Desinfección por nebulización' },
    ],
    raisesPrice: [
      { en: 'More than 10 vents', es: 'Más de 10 rejillas' },
      { en: 'Dryer vent or furnace cleaning added', es: 'Limpieza de ducto de secadora o caldera' },
      { en: 'Heavy debris, pet hair or renovation dust', es: 'Mucho polvo, pelo de mascotas o polvo de obra' },
    ],
    questions: [
      {
        key: 'sqft',
        label: { en: 'Home size', es: 'Tamaño de la casa' },
        options: [
          { value: 'under_1500', label: { en: 'Under 1,500 sq ft', es: 'Menos de 1,500 pies²' } },
          { value: '1500_3000', label: { en: '1,500 to 3,000', es: '1,500 a 3,000' } },
          { value: 'over_3000', label: { en: '3,000+', es: '3,000+' } },
        ],
      },
      {
        key: 'vents',
        label: { en: 'Vents', es: 'Rejillas' },
        options: [
          { value: 'up_to_10', label: { en: 'Up to 10', es: 'Hasta 10' } },
          { value: '11_20', label: { en: '11 to 20', es: '11 a 20' } },
          { value: 'over_20', label: { en: '20+', es: '20+' } },
        ],
      },
      yesNo('pets', { en: 'Pets in the home?', es: '¿Mascotas en casa?' }),
    ],
    seo: {
      title: { en: 'Air Duct Cleaning in Essex, Morris & Bergen NJ from $449', es: 'Limpieza de ductos en Essex, Morris y Bergen NJ desde $449' },
      description: {
        en: 'Air duct cleaning costs from $449 for up to 10 vents in Essex, Morris and Bergen NJ. Vacuumed and sanitized in one visit, firm price from your photos.',
        es: 'Limpieza de ductos desde $449 por hasta 10 rejillas en Essex, Morris y Bergen NJ. Aspirado y desinfectado en una visita, precio firme con sus fotos.',
      },
      keywords: ['duct cleaning NJ', 'how much does duct cleaning cost', 'air duct cleaning near me', 'air duct cleaning Essex County', 'vent cleaning Morris County', 'duct cleaning Bergen County'],
    },
    faq: [
      costFaq({ en: 'air duct cleaning', es: 'la limpieza de ductos' }, {
        en: 'From $449 for up to 10 vents: supply and return ducts vacuumed with negative air, registers washed and the system sanitized. Extra vents and a second system add to it, and you get the firm price from your photos.',
        es: 'Desde $449 por hasta 10 rejillas: ductos de suministro y retorno aspirados con presión negativa, rejillas lavadas y sistema desinfectado. Rejillas extra o un segundo sistema suben el precio, y recibe el precio firme con sus fotos.',
      }),
      { q: { en: 'How often should ducts be cleaned?', es: '¿Cada cuánto se limpian los ductos?' }, a: { en: 'Every three to five years for most homes, sooner after a renovation or with pets.', es: 'Cada tres a cinco años en la mayoría de las casas; antes si hubo obra o hay mascotas.' } },
      { q: { en: 'How long does it take?', es: '¿Cuánto tarda?' }, a: { en: 'Two to four hours for a typical home, done in one visit.', es: 'De dos a cuatro horas en una casa típica, en una sola visita.' } },
      oneStopFaq({ en: 'HVAC cleaning or a home cleaning', es: 'limpieza de HVAC o limpieza de casa' }),
    ],
  },
  {
    slug: 'home-cleaning',
    trade: 'home_cleaning',
    name: { en: 'Home cleaning', es: 'Limpieza de casa' },
    icon: 'sparkles',
    startingPriceCents: 25900,
    priceDisplay: { en: '$259', es: '$259' },
    priceUnit: { en: 'up to 2 bed, 1 bath', es: 'hasta 2 recámaras, 1 baño' },
    description: {
      en: 'Full standard clean: kitchen, baths, floors, dusting. Larger homes and deep cleans quoted.',
      es: 'Limpieza estándar completa: cocina, baños, pisos y polvo. Casas más grandes y limpiezas profundas se cotizan.',
    },
    included: [
      { en: 'Kitchen surfaces, appliance exteriors and sink', es: 'Superficies de cocina, exterior de electrodomésticos y fregadero' },
      { en: 'Bathrooms scrubbed and sanitized', es: 'Baños tallados y desinfectados' },
      { en: 'Floors vacuumed and mopped, surfaces dusted', es: 'Pisos aspirados y trapeados, superficies sin polvo' },
    ],
    raisesPrice: [
      { en: 'Each extra bedroom or bathroom', es: 'Cada recámara o baño adicional' },
      { en: 'Deep clean, move-out clean or inside appliances', es: 'Limpieza profunda, de mudanza o interior de electrodomésticos' },
      { en: 'Recurring visits are priced lower per visit', es: 'Las visitas recurrentes tienen menor precio por visita' },
    ],
    questions: [
      {
        key: 'bedrooms',
        label: { en: 'Bedrooms', es: 'Recámaras' },
        options: [
          { value: '1_2', label: { en: '1 to 2', es: '1 a 2' } },
          { value: '3', label: { en: '3', es: '3' } },
          { value: '4+', label: { en: '4+', es: '4+' } },
        ],
      },
      {
        key: 'bathrooms',
        label: { en: 'Bathrooms', es: 'Baños' },
        options: [
          { value: '1', label: { en: '1', es: '1' } },
          { value: '2', label: { en: '2', es: '2' } },
          { value: '3+', label: { en: '3+', es: '3+' } },
        ],
      },
      {
        key: 'frequency',
        label: { en: 'How often', es: 'Frecuencia' },
        options: [
          { value: 'one_time', label: { en: 'One time', es: 'Una vez' } },
          { value: 'recurring', label: { en: 'Recurring', es: 'Recurrente' } },
        ],
      },
    ],
    seo: {
      title: { en: 'Home Cleaning in Essex, Morris & Bergen County NJ from $259', es: 'Limpieza de casa en Essex, Morris y Bergen NJ desde $259' },
      description: {
        en: 'House cleaning costs from $259 for up to 2 bedrooms and 1 bath in Essex, Morris and Bergen NJ. Vetted crews, firm price up front, one-time or recurring.',
        es: 'Limpieza de casa desde $259 para hasta 2 recámaras y 1 baño en Essex, Morris y Bergen NJ. Equipos verificados, precio firme, una vez o recurrente.',
      },
      keywords: ['house cleaning NJ', 'how much does house cleaning cost in NJ', 'house cleaning near me', 'home cleaning Essex County', 'cleaning service Morris County', 'house cleaners Bergen County'],
    },
    faq: [
      costFaq({ en: 'home cleaning', es: 'la limpieza de casa' }, {
        en: 'From $259 for a standard clean of up to two bedrooms and one bath: kitchen, baths, floors, surfaces and dusting. More rooms, a deep clean or a move-out clean add to it, and recurring visits are priced lower per visit.',
        es: 'Desde $259 por una limpieza estándar de hasta dos recámaras y un baño: cocina, baños, pisos, superficies y polvo. Más cuartos, una limpieza profunda o de mudanza suben el precio, y las visitas recurrentes cuestan menos por visita.',
      }),
      { q: { en: 'Do I need to be home?', es: '¿Tengo que estar en casa?' }, a: { en: 'No. Many clients leave a key or lockbox code; the crew sends photos when done.', es: 'No. Muchos clientes dejan una llave o código; el equipo envía fotos al terminar.' } },
      { q: { en: 'How soon can you come?', es: '¿Qué tan pronto pueden venir?' }, a: { en: 'Usually within the week. Tell us the day you want in the request and we confirm by text.', es: 'Normalmente dentro de la misma semana. Indique el día que quiere en la solicitud y confirmamos por texto.' } },
      oneStopFaq({ en: 'gutter cleaning or drywall patching', es: 'limpieza de canaletas o reparación de drywall' }),
    ],
  },
  {
    slug: 'exterior-painting',
    trade: 'exterior_painting',
    name: { en: 'Exterior painting', es: 'Pintura exterior' },
    icon: 'house',
    startingPriceCents: 295,
    minimumCents: 360000,
    priceDisplay: { en: '$2.95 / sq ft', es: '$2.95 / pie²' },
    priceUnit: { en: '$3,600 minimum', es: 'mínimo $3,600' },
    description: {
      en: 'Power wash, scrape, prime and two coats on siding and trim. Price from photos and square footage.',
      es: 'Lavado a presión, raspado, imprimación y dos capas en revestimiento y molduras. Precio según fotos y pies cuadrados.',
    },
    included: [
      { en: 'Power wash and scrape loose paint', es: 'Lavado a presión y raspado de pintura suelta' },
      { en: 'Spot prime bare wood, caulk gaps', es: 'Imprimación de madera expuesta y sellado de juntas' },
      { en: 'Two coats of exterior paint on siding and trim', es: 'Dos capas de pintura exterior en revestimiento y molduras' },
    ],
    raisesPrice: [
      { en: 'Three stories or steep access', es: 'Tres pisos o acceso difícil' },
      { en: 'Wood rot, heavy peeling or lead-safe prep', es: 'Madera podrida, mucha descascaración o preparación segura con plomo' },
      { en: 'Doors, shutters, decks and railings added', es: 'Puertas, contraventanas, terrazas y barandas' },
    ],
    questions: [
      stories(),
      {
        key: 'siding',
        label: { en: 'Siding', es: 'Revestimiento' },
        options: [
          { value: 'vinyl', label: { en: 'Vinyl or aluminum', es: 'Vinilo o aluminio' } },
          { value: 'wood', label: { en: 'Wood', es: 'Madera' } },
          { value: 'stucco', label: { en: 'Stucco or other', es: 'Estuco u otro' } },
        ],
      },
      yesNo('trim_doors', { en: 'Trim and doors included?', es: '¿Incluye molduras y puertas?' }),
    ],
    seo: {
      title: { en: 'Exterior Painting in Essex, Morris & Bergen NJ, $2.95/sq ft', es: 'Pintura exterior en Essex, Morris y Bergen desde $2.95/pie²' },
      description: {
        en: 'Exterior painting costs $2.95 per sq ft, $3,600 minimum, in Essex, Morris and Bergen NJ. Power wash, prime and two coats, firm quote from your photos.',
        es: 'Pintura exterior a $2.95 por pie², mínimo $3,600, en Essex, Morris y Bergen NJ. Lavado a presión, imprimación y dos capas, cotización firme con sus fotos.',
      },
      keywords: ['exterior painting NJ', 'how much does exterior painting cost in NJ', 'exterior painters near me', 'house painters Essex County', 'exterior painters Morris County', 'exterior painting Bergen County'],
    },
    faq: [
      costFaq({ en: 'exterior painting', es: 'la pintura exterior' }, {
        en: '$2.95 per square foot of painted wall, with a $3,600 job minimum: power wash, scrape and prime bare spots, two coats. A typical two-story colonial runs $6,000 to $9,000; trim, doors and three-story work add to it, and the price is firm before a brush touches the house.',
        es: '$2.95 por pie cuadrado de pared pintada, con un mínimo de $3,600 por trabajo: lavado a presión, raspado e imprimación de zonas desnudas y dos capas. Una casa colonial de dos pisos típica sale entre $6,000 y $9,000; molduras, puertas y tres pisos suben el precio, y el precio es firme antes de empezar.',
      }),
      { q: { en: 'How is square footage measured?', es: '¿Cómo se mide el área?' }, a: { en: 'Painted wall surface, not floor area. We confirm it from your photos and a quick site visit for larger homes.', es: 'Superficie de pared pintada, no área de piso. La confirmamos con sus fotos y una visita rápida en casas grandes.' } },
      { q: { en: 'When is painting season?', es: '¿Cuándo es la temporada de pintura?' }, a: { en: 'April to October in North Jersey, when nights stay above 50°F. Book early; crews fill up by May.', es: 'De abril a octubre en el norte de Nueva Jersey, cuando las noches se mantienen arriba de 50°F. Reserve temprano; los equipos se llenan en mayo.' } },
      oneStopFaq({ en: 'gutter cleaning or cabinet repainting', es: 'limpieza de canaletas o repintado de gabinetes' }),
    ],
  },
  {
    slug: 'gutter-cleaning',
    trade: 'gutter_cleaning',
    name: { en: 'Gutter cleaning', es: 'Limpieza de canaletas' },
    icon: 'cloud-rain',
    startingPriceCents: 27900,
    priceDisplay: { en: '$279', es: '$279' },
    priceUnit: { en: 'single story', es: 'un piso' },
    priceNote: { en: 'Two story from $349', es: 'Dos pisos desde $349' },
    description: {
      en: 'Clear gutters and downspouts, bag debris, flush and check for leaks.',
      es: 'Despejamos canaletas y bajantes, embolsamos los desechos, enjuagamos y revisamos fugas.',
    },
    included: [
      { en: 'All gutters cleared by hand and flushed', es: 'Todas las canaletas limpiadas a mano y enjuagadas' },
      { en: 'Downspouts tested for flow', es: 'Bajantes probados' },
      { en: 'Debris bagged and removed', es: 'Desechos embolsados y retirados' },
      { en: 'Photo report of any leak or loose hanger', es: 'Reporte con fotos de fugas o soportes sueltos' },
    ],
    raisesPrice: [
      { en: 'Two or three stories', es: 'Dos o tres pisos' },
      { en: 'Gutter guards that must be removed and refitted', es: 'Protectores que deban retirarse y reinstalarse' },
      { en: 'Repairs, resealing or new hangers', es: 'Reparaciones, resellado o soportes nuevos' },
    ],
    questions: [
      stories(),
      yesNo('guards', { en: 'Gutter guards?', es: '¿Protectores de canaleta?' }),
      {
        key: 'last_cleaned',
        label: { en: 'Last cleaned', es: 'Última limpieza' },
        options: [
          { value: 'under_1y', label: { en: 'Within a year', es: 'Hace menos de un año' } },
          { value: '1_2y', label: { en: '1 to 2 years ago', es: 'Hace 1 a 2 años' } },
          { value: 'longer', label: { en: 'Longer or not sure', es: 'Más tiempo o no sé' } },
        ],
      },
    ],
    seo: {
      title: { en: 'Gutter Cleaning in Essex, Morris & Bergen NJ from $279', es: 'Limpieza de canaletas en Essex, Morris y Bergen desde $279' },
      description: {
        en: 'Gutter cleaning costs from $279 single story, $349 two story, in Essex, Morris and Bergen NJ. Cleared, flushed, checked and photographed, firm price.',
        es: 'Limpieza de canaletas desde $279 un piso, $349 dos pisos, en Essex, Morris y Bergen NJ. Despejadas, enjuagadas, revisadas y con fotos, precio firme.',
      },
      keywords: ['gutter cleaning NJ', 'how much does gutter cleaning cost', 'gutter cleaning near me', 'gutter cleaning Essex County', 'gutter cleaning Morris County', 'gutter cleaning Bergen County'],
    },
    faq: [
      costFaq({ en: 'gutter cleaning', es: 'la limpieza de canaletas' }, {
        en: 'From $279 for a single-story home and $349 for two stories: every gutter cleared by hand, downspouts flushed, leaks and loose hangers noted with photos. Three stories, gutter guards and very long runs add to it, and the price is firm before the visit.',
        es: 'Desde $279 en una casa de un piso y $349 en dos pisos: cada canaleta limpiada a mano, bajantes enjuagados, fugas y soportes sueltos anotados con fotos. Tres pisos, protectores de canaleta y tramos muy largos suben el precio, y el precio es firme antes de la visita.',
      }),
      { q: { en: 'When is the best time?', es: '¿Cuál es la mejor época?' }, a: { en: 'Late fall after the leaves drop and again in spring. Before a storm is the second best time.', es: 'Fines de otoño cuando caen las hojas y otra vez en primavera. Antes de una tormenta es la segunda mejor opción.' } },
      { q: { en: 'Do I need to be home?', es: '¿Tengo que estar en casa?' }, a: { en: 'No. The crew works outside, bags the debris and texts you before-and-after photos when done.', es: 'No. El equipo trabaja afuera, embolsa los desechos y le envía fotos del antes y después al terminar.' } },
      oneStopFaq({ en: 'exterior painting or HVAC cleaning', es: 'pintura exterior o limpieza de HVAC' }),
    ],
  },
  {
    slug: 'drywall-patching',
    trade: 'drywall',
    name: { en: 'Drywall patching', es: 'Reparación de drywall' },
    icon: 'hammer',
    startingPriceCents: 34900,
    priceDisplay: { en: '$349', es: '$349' },
    priceUnit: { en: 'first patch up to 6 in, primed and painted', es: 'primer parche de hasta 6 pulg, imprimado y pintado' },
    description: {
      en: 'Patch, tape, mud, sand, prime and paint to blend. Additional patches priced each.',
      es: 'Parchamos, encintamos, aplicamos pasta, lijamos, imprimamos y pintamos para igualar. Parches adicionales con precio por unidad.',
    },
    included: [
      { en: 'One patch up to 6 inches, taped and finished', es: 'Un parche de hasta 6 pulgadas, encintado y terminado' },
      { en: 'Sanded smooth, primed and painted to blend', es: 'Lijado, imprimado y pintado para igualar' },
      { en: 'Texture matched where needed', es: 'Textura igualada cuando se requiera' },
    ],
    raisesPrice: [
      { en: 'Each additional patch', es: 'Cada parche adicional' },
      { en: 'Patches larger than 6 inches or on ceilings', es: 'Parches mayores de 6 pulgadas o en techos' },
      { en: 'Color matching when no leftover paint is on hand', es: 'Igualar el color cuando no hay pintura sobrante' },
    ],
    questions: [
      {
        key: 'patches',
        label: { en: 'How many patches?', es: '¿Cuántos parches?' },
        options: [
          { value: '1', label: { en: '1', es: '1' } },
          { value: '2_3', label: { en: '2 to 3', es: '2 a 3' } },
          { value: '4+', label: { en: '4+', es: '4+' } },
        ],
      },
      {
        key: 'size',
        label: { en: 'Largest patch', es: 'Parche más grande' },
        options: [
          { value: 'under_6', label: { en: 'Under 6 in', es: 'Menos de 6 pulg' } },
          { value: '6_12', label: { en: '6 to 12 in', es: '6 a 12 pulg' } },
          { value: 'over_12', label: { en: 'Over 12 in', es: 'Más de 12 pulg' } },
        ],
      },
      yesNo('paint_match', { en: 'Need the paint matched?', es: '¿Necesita igualar la pintura?' }),
    ],
    seo: {
      title: { en: 'Drywall Repair in Essex, Morris & Bergen NJ from $349', es: 'Reparación de drywall en Essex, Morris y Bergen desde $349' },
      description: {
        en: 'Drywall repair costs from $349 for the first patch in Essex, Morris and Bergen NJ: cut, patched, taped, primed and painted to blend. Firm price from photos.',
        es: 'Reparación de drywall desde $349 por el primer parche en Essex, Morris y Bergen NJ: cortado, parchado, encintado, imprimado y pintado. Precio firme con fotos.',
      },
      keywords: ['drywall repair NJ', 'how much does drywall repair cost', 'drywall repair near me', 'drywall patching Essex County', 'drywall repair Morris County', 'drywall contractor Bergen County'],
    },
    faq: [
      costFaq({ en: 'drywall repair', es: 'la reparación de drywall' }, {
        en: 'From $349 for the first patch up to 6 inches, taped, skimmed, sanded, primed and painted to blend. Each extra patch, large holes, ceilings and paint matching add to it, and you get the firm price from a photo of the damage.',
        es: 'Desde $349 por el primer parche de hasta 6 pulgadas, encintado, enmasillado, lijado, imprimado y pintado. Cada parche extra, hoyos grandes, techos e igualar la pintura suben el precio, y recibe el precio firme con una foto del daño.',
      }),
      { q: { en: 'Will the patch be invisible?', es: '¿Se notará el parche?' }, a: { en: 'On a flat wall with matched paint, yes. Heavy texture and old faded paint can leave a faint difference, which we tell you before starting.', es: 'En una pared lisa con pintura igualada, no se nota. Texturas gruesas y pintura vieja pueden dejar una ligera diferencia; se lo decimos antes de empezar.' } },
      { q: { en: 'How long does it take?', es: '¿Cuánto tarda?' }, a: { en: 'Two visits a day apart for most patches: one to patch and skim, one to sand, prime and paint once it has dried.', es: 'Dos visitas con un día de diferencia en la mayoría de los parches: una para parchar y enmasillar, otra para lijar, imprimar y pintar cuando haya secado.' } },
      oneStopFaq({ en: 'cabinet repainting or a home cleaning', es: 'repintado de gabinetes o limpieza de casa' }),
    ],
  },
];

export const SERVICE_SLUGS = HOME_SERVICES_CATALOG.map((s) => s.slug);

export function getService(slug: string): HomeService | undefined {
  return HOME_SERVICES_CATALOG.find((s) => s.slug === slug);
}

export function isServiceSlug(value: unknown): value is string {
  return typeof value === 'string' && SERVICE_SLUGS.includes(value);
}

/** Pick the string for a language, falling back to English. */
export function t(text: L | undefined, lang: Lang): string {
  if (!text) return '';
  return text[lang] || text.en;
}

/** Validate a lang query/cookie value. Anything else is English. */
export function toLang(value: unknown): Lang {
  return value === 'es' ? 'es' : 'en';
}

export const TIMING_OPTIONS: Array<{ value: 'this_week' | 'two_weeks' | 'flexible'; label: L }> = [
  { value: 'this_week', label: { en: 'This week', es: 'Esta semana' } },
  { value: 'two_weeks', label: { en: 'Next two weeks', es: 'Próximas dos semanas' } },
  { value: 'flexible', label: { en: 'Flexible', es: 'Flexible' } },
];

/**
 * Render a request's answers as readable lines for alerts, emails and the admin.
 * Unknown keys are kept verbatim so nothing a homeowner tapped is dropped.
 */
export function describeAnswers(
  services: string[],
  answers: Record<string, Record<string, string>>,
  lang: Lang = 'en',
): string[] {
  const lines: string[] = [];
  for (const slug of services) {
    const service = getService(slug);
    const serviceAnswers = answers[slug] ?? {};
    const parts: string[] = [];
    for (const [key, value] of Object.entries(serviceAnswers)) {
      const question = service?.questions.find((q) => q.key === key);
      const option = question?.options.find((o) => o.value === value);
      // A label that is a question ("How many stories?") reads as "How many stories: 2".
      const label = (question ? t(question.label, lang) : key).replace(/^¿+|\?+$/g, '');
      parts.push(`${label}: ${option ? t(option.label, lang) : value}`);
    }
    lines.push(`${service ? t(service.name, lang) : slug}${parts.length ? ' - ' + parts.join(', ') : ''}`);
  }
  return lines;
}
