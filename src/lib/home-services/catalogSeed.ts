/**
 * The day-one rows of `public.home_services`: what the Phase 2 migration
 * seeded (supabase/migrations/20261030000000_phase_2.sql, generated from this
 * file by scripts/seed-home-services.ts). After that day the table is the
 * source of truth and the admin edits it under Services & Prices; this file is
 * NOT edited to change a price.
 *
 * Who reads it:
 * - scripts/seed-home-services.ts, to print the migration's INSERT;
 * - tests/home-services-catalog.spec.ts, which pins migration == this file;
 * - tests/home-services-landing.spec.ts, for the prices it expects on a seeded
 *   database;
 * - catalogData.ts, ONLY when SUPABASE_SECRET_KEY is not configured (the
 *   stub-backed test build and CI), so those pages still render. Production
 *   always has the key and always reads the table.
 *
 * Never imported by a client component: tests/home-services-catalog.spec.ts
 * (CAT7) greps the client chunks for this copy.
 *
 * Prices are the "starting at" figures from docs/home-services/spec-landing-page.md
 * (NJ 2026 market ranges) plus $100 on every flat price and on the exterior
 * painting job minimum (Alex, 2026-10-29, docs/decisions/005).
 */
import type { HomeServiceContent, L, ServiceFaqItem } from './catalog';

/**
 * AEO: every service answers "how much does X cost in NJ?" first and in full,
 * with the price, what it covers and what moves it, so an answer engine can
 * quote the answer and a homeowner can decide without a call.
 */
const costFaq = (service: L, answer: L): ServiceFaqItem => ({
  q: { en: `How much does ${service.en} cost in NJ?`, es: `¿Cuánto cuesta ${service.es} en NJ?` },
  a: answer,
});

/** One stop: every service page says the same thing about bundling, naming a pairing that fits the service. */
const oneStopFaq = (pairing: L): ServiceFaqItem => ({
  q: { en: 'Can I add other services to the same request?', es: '¿Puedo agregar otros servicios a la misma solicitud?' },
  a: {
    en: `Yes. Tick ${pairing.en}, or anything else on the list, and send one request. You get one firm price, one schedule and one point of contact; the crews come in order while you sit back.`,
    es: `Sí. Marque ${pairing.es}, o cualquier otro servicio de la lista, y envíe una sola solicitud. Recibe un solo precio firme, una sola agenda y un solo contacto; los equipos llegan en orden mientras usted se relaja.`,
  },
});

export const HOME_SERVICES_SEED: HomeServiceContent[] = [
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
    seo: {
      title: { en: 'Cabinet Painting in Essex, Morris, Bergen & Union NJ, $2,095', es: 'Pintar gabinetes en Essex, Morris, Bergen y Union, $2,095' },
      description: {
        en: 'Cabinet repainting costs from $2,095 in Essex, Morris, Bergen and Union NJ. Sprayed enamel, two coats, firm quote from your photos the same day.',
        es: 'Repintado de gabinetes desde $2,095 en Essex, Morris, Bergen y Union NJ. Esmalte con pistola, dos capas y cotización firme con sus fotos el mismo día.',
      },
      keywords: ['cabinet painting NJ', 'how much does cabinet painting cost in NJ', 'cabinet painting near me', 'cabinet refinishing Essex County', 'kitchen cabinet painting Morris County', 'cabinet painters Bergen County', 'cabinet painting Union County'],
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
    seo: {
      title: { en: 'HVAC Cleaning in Essex, Morris, Bergen & Union NJ from $299', es: 'Limpieza de HVAC en Essex, Morris, Bergen y Union desde $299' },
      description: {
        en: 'HVAC cleaning costs from $299 per system in Essex, Morris, Bergen and Union NJ: coil, blower and drain line cleaned, filter changed. Firm price.',
        es: 'Limpieza de HVAC desde $299 por sistema en Essex, Morris, Bergen y Union NJ: serpentín, ventilador y drenaje limpios, filtro nuevo. Precio firme.',
      },
      keywords: ['HVAC cleaning NJ', 'how much does HVAC cleaning cost', 'HVAC cleaning near me', 'AC coil cleaning Essex County', 'furnace cleaning Morris County', 'HVAC tune up Bergen County', 'HVAC cleaning Union County'],
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
    seo: {
      title: { en: 'Air Duct Cleaning in Essex, Morris, Bergen & Union from $449', es: 'Limpieza de ductos: Essex, Morris, Bergen y Union, $449' },
      description: {
        en: 'Air duct cleaning costs from $449 for up to 10 vents in Essex, Morris, Bergen and Union NJ. Vacuumed and sanitized in one visit, firm price from your photos.',
        es: 'Limpieza de ductos desde $449 por hasta 10 rejillas en Essex, Morris, Bergen y Union NJ. Aspirado y desinfectado en una visita, precio firme con sus fotos.',
      },
      keywords: ['duct cleaning NJ', 'how much does duct cleaning cost', 'air duct cleaning near me', 'air duct cleaning Essex County', 'vent cleaning Morris County', 'duct cleaning Bergen County', 'air duct cleaning Union County'],
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
    seo: {
      title: { en: 'Home Cleaning in Essex, Morris, Bergen & Union NJ from $259', es: 'Limpieza de casa en Essex, Morris, Bergen y Union desde $259' },
      description: {
        en: 'House cleaning costs from $259 for up to 2 bedrooms and 1 bath in Essex, Morris, Bergen and Union NJ. Vetted crews, firm price up front, one-time or recurring.',
        es: 'Limpieza de casa desde $259 para hasta 2 recámaras y 1 baño en Essex, Morris, Bergen y Union NJ. Equipos verificados, precio firme, una vez o recurrente.',
      },
      keywords: ['house cleaning NJ', 'how much does house cleaning cost in NJ', 'house cleaning near me', 'home cleaning Essex County', 'cleaning service Morris County', 'house cleaners Bergen County', 'house cleaning Union County'],
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
    seo: {
      title: { en: 'Exterior Painting $2.95/sq ft: Essex, Morris, Bergen & Union', es: 'Pintura exterior: Essex, Morris, Bergen y Union, $2.95/pie²' },
      description: {
        en: 'Exterior painting costs $2.95 per sq ft, $3,600 minimum, in Essex, Morris, Bergen and Union NJ. Power wash, prime, two coats, firm quote from photos.',
        es: 'Pintura exterior a $2.95 por pie², mínimo $3,600, en Essex, Morris, Bergen y Union NJ. Lavado a presión, imprimación y dos capas, precio firme con fotos.',
      },
      keywords: ['exterior painting NJ', 'how much does exterior painting cost in NJ', 'exterior painters near me', 'house painters Essex County', 'exterior painters Morris County', 'exterior painting Bergen County', 'exterior painting Union County'],
    },
    faq: [
      costFaq({ en: 'exterior painting', es: 'la pintura exterior' }, {
        en: '$2.95 per square foot of painted wall, with a $3,600 job minimum: power wash, scrape and prime bare spots, two coats. Trim, doors and three-story work add to it, and the price is firm before a brush touches the house.',
        es: '$2.95 por pie cuadrado de pared pintada, con un mínimo de $3,600 por trabajo: lavado a presión, raspado e imprimación de zonas desnudas y dos capas. Molduras, puertas y tres pisos suben el precio, y el precio es firme antes de empezar.',
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
    seo: {
      title: { en: 'Gutter Cleaning in Essex, Morris, Bergen & Union from $279', es: 'Limpieza de canaletas en Essex, Morris, Bergen y Union, $279' },
      description: {
        en: 'Gutter cleaning costs from $279 single story, $349 two story, in Essex, Morris, Bergen and Union NJ. Cleared, flushed, checked and photographed, firm price.',
        es: 'Limpieza de canaletas desde $279 un piso, $349 dos pisos, en Essex, Morris, Bergen y Union NJ. Despejadas, enjuagadas, revisadas y con fotos, precio firme.',
      },
      keywords: ['gutter cleaning NJ', 'how much does gutter cleaning cost', 'gutter cleaning near me', 'gutter cleaning Essex County', 'gutter cleaning Morris County', 'gutter cleaning Bergen County', 'gutter cleaning Union County'],
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
    seo: {
      title: { en: 'Drywall Repair in Essex, Morris, Bergen & Union NJ from $349', es: 'Reparación de drywall en Essex, Morris, Bergen y Union, $349' },
      description: {
        en: 'Drywall repair costs from $349 for the first patch in Essex, Morris, Bergen and Union NJ: patched, taped, primed and painted to blend. Firm price.',
        es: 'Reparación de drywall desde $349 por el primer parche en Essex, Morris, Bergen y Union NJ: parchado, encintado, imprimado y pintado. Precio firme.',
      },
      keywords: ['drywall repair NJ', 'how much does drywall repair cost', 'drywall repair near me', 'drywall patching Essex County', 'drywall repair Morris County', 'drywall contractor Bergen County', 'drywall repair Union County'],
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
