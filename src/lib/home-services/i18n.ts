/**
 * UI strings for the home services landing page, the request flow and the
 * sub offer page. Bilingual by construction: every key carries both languages,
 * so a missing translation is a type error, not a blank on the Spanish page.
 *
 * Service names, prices, descriptions and questions live in catalog.ts.
 */
import type { L, Lang } from './catalog';

export const STRINGS = {
  // Landing page
  heroEyebrow: { en: 'Home services, priced up front', es: 'Servicios para el hogar con precios claros' },
  heroTitle: { en: 'Pick what you need. See the starting price. Get a firm quote from your photos.', es: 'Elija lo que necesita. Vea el precio inicial. Reciba una cotización firme con sus fotos.' },
  heroBody: { en: 'Licensed NJ contractor, vetted crews, one point of contact. Serving Essex, Morris and Bergen Counties.', es: 'Contratista con licencia en NJ, equipos verificados, un solo contacto. Servimos los condados de Essex, Morris y Bergen.' },
  servicesTitle: { en: 'Seven services, starting prices shown', es: 'Siete servicios con precio inicial' },
  servicesIntro: { en: 'Tap the services you want, then request them together. Tap a price to see what it includes.', es: 'Toque los servicios que quiere y solicítelos juntos. Toque un precio para ver qué incluye.' },
  startingAt: { en: 'Starting at', es: 'Desde' },
  whatsIncluded: { en: "What's included", es: 'Qué incluye' },
  raisesPrice: { en: 'What raises the price', es: 'Qué sube el precio' },
  selected: { en: 'Selected', es: 'Seleccionado' },
  select: { en: 'Select', es: 'Seleccionar' },
  requestThese: { en: 'Request these', es: 'Solicitar estos' },
  requestThis: { en: 'Request this service', es: 'Solicitar este servicio' },
  requestCount: { en: '{n} selected', es: '{n} seleccionados' },
  howItWorks: { en: 'How it works', es: 'Cómo funciona' },
  step1: { en: 'Request a quote', es: 'Solicite una cotización' },
  step1Body: { en: 'Tap the services, answer a few taps, add photos.', es: 'Toque los servicios, responda unos toques, agregue fotos.' },
  step2: { en: 'Get a firm price', es: 'Reciba un precio firme' },
  step2Body: { en: 'Alex reviews your photos and texts a firm price, usually the same day.', es: 'Alex revisa sus fotos y le envía un precio firme por texto, normalmente el mismo día.' },
  step3: { en: 'Schedule', es: 'Agende' },
  step3Body: { en: 'Pick a start window that works for you.', es: 'Elija una ventana de inicio que le convenga.' },
  step4: { en: 'Done', es: 'Listo' },
  step4Body: { en: 'Vetted crew does the work. You pay La Vaca, never the crew.', es: 'Un equipo verificado hace el trabajo. Usted le paga a La Vaca, nunca al equipo.' },
  trustTitle: { en: 'Licensed, insured, local', es: 'Con licencia, asegurados, locales' },
  trustHic: { en: 'NJ HIC# 13VH13373800', es: 'NJ HIC# 13VH13373800' },
  trustInsured: { en: 'Insured, with a one-year workmanship warranty', es: 'Asegurados, con garantía de mano de obra de un año' },
  trustArea: { en: 'Essex, Morris and Bergen Counties', es: 'Condados de Essex, Morris y Bergen' },
  faqTitle: { en: 'Questions people ask', es: 'Preguntas frecuentes' },
  faqPriceQ: { en: 'What changes the price?', es: '¿Qué cambia el precio?' },
  faqPriceA: { en: 'Size, access and condition. Each service card lists exactly what moves it. The price we text you is firm unless the site differs from your photos, and then you sign off on any change first.', es: 'Tamaño, acceso y condición. Cada tarjeta indica exactamente qué lo mueve. El precio que le enviamos es firme, salvo que el sitio difiera de sus fotos; en ese caso usted aprueba cualquier cambio primero.' },
  faqSpeedQ: { en: 'How fast can you schedule?', es: '¿Qué tan rápido pueden agendar?' },
  faqSpeedA: { en: 'Most services start within one to two weeks. Tell us if it is urgent and we will say what is possible.', es: 'La mayoría de los servicios empiezan en una o dos semanas. Díganos si es urgente y le diremos qué es posible.' },
  faqPayQ: { en: 'How do I pay?', es: '¿Cómo pago?' },
  faqPayA: { en: '70% when you sign the quote, 30% when the job is done and you are happy. You pay La Vaca directly; the crew never bills you.', es: '70% al firmar la cotización y 30% cuando el trabajo esté terminado y usted satisfecho. Le paga directamente a La Vaca; el equipo nunca le cobra.' },
  homeCareTitle: { en: 'Want the small stuff handled all year?', es: '¿Quiere que lo pequeño se atienda todo el año?' },
  homeCareBody: { en: 'La Vaca Home Care is a free seasonal checklist for your home, with one-tap booking when you want us to handle an item.', es: 'La Vaca Home Care es una lista de mantenimiento gratuita por temporada para su casa, con reserva de un toque cuando quiera que lo hagamos nosotros.' },
  homeCarePrice: { en: 'Free seasonal plan', es: 'Plan de temporada gratis' },
  homeCareCta: { en: 'Get my free plan', es: 'Quiero mi plan gratis' },
  callUs: { en: 'Call (201) 212-4917', es: 'Llame al (201) 212-4917' },
  backToServices: { en: 'All home services', es: 'Todos los servicios' },
  language: { en: 'Español', es: 'English' },

  // Request flow
  flowTitle: { en: 'Request a quote', es: 'Solicitar cotización' },
  stepOf: { en: 'Step {n} of 2', es: 'Paso {n} de 2' },
  detailsTitle: { en: 'A few taps about the job', es: 'Unos toques sobre el trabajo' },
  photosLabel: { en: 'Photos (optional, up to 10)', es: 'Fotos (opcional, hasta 10)' },
  photosHint: { en: 'A couple of photos lets us quote without a visit.', es: 'Un par de fotos nos permite cotizar sin visita.' },
  takePhoto: { en: 'Take a photo', es: 'Tomar foto' },
  choosePhotos: { en: 'Choose photos', es: 'Elegir fotos' },
  uploading: { en: 'Uploading', es: 'Subiendo' },
  addressLabel: { en: 'Property address', es: 'Dirección de la propiedad' },
  addressPlaceholder: { en: 'Street, town', es: 'Calle, ciudad' },
  zipLabel: { en: 'ZIP', es: 'Código postal' },
  outOfArea: { en: "We don't serve that ZIP yet. We cover Essex, Morris and Bergen Counties. Sorry we can't help this time.", es: 'Aún no atendemos ese código postal. Cubrimos los condados de Essex, Morris y Bergen. Lamentamos no poder ayudar esta vez.' },
  continue: { en: 'Continue', es: 'Continuar' },
  back: { en: 'Back', es: 'Atrás' },
  contactTitle: { en: 'Where should Alex send the price?', es: '¿A dónde enviamos el precio?' },
  nameLabel: { en: 'Name', es: 'Nombre' },
  phoneLabel: { en: 'Mobile phone', es: 'Celular' },
  emailLabel: { en: 'Email (optional)', es: 'Correo (opcional)' },
  timingLabel: { en: 'When do you want it done?', es: '¿Cuándo quiere hacerlo?' },
  notesLabel: { en: 'Anything else? (optional)', es: '¿Algo más? (opcional)' },
  consentLabel: { en: 'Text and email me about this request. Message and data rates may apply. Reply STOP to opt out.', es: 'Envíenme mensajes de texto y correo sobre esta solicitud. Pueden aplicar tarifas. Responda STOP para cancelar.' },
  submit: { en: 'Send my request', es: 'Enviar mi solicitud' },
  submitting: { en: 'Sending', es: 'Enviando' },
  requiredName: { en: 'Please enter your name.', es: 'Escriba su nombre.' },
  requiredPhone: { en: 'Please enter a mobile number.', es: 'Escriba un número de celular.' },
  requiredAddress: { en: 'Please enter the property address.', es: 'Escriba la dirección de la propiedad.' },
  requiredConsent: { en: 'Please tick the box so we can text you the price.', es: 'Marque la casilla para poder enviarle el precio por texto.' },
  errorGeneric: { en: "Something went wrong on our side. Call (201) 212-4917 and we'll take it by phone.", es: 'Algo falló de nuestro lado. Llame al (201) 212-4917 y lo atendemos por teléfono.' },
  errorRate: { en: 'Too many requests from this connection. Try again in a minute.', es: 'Demasiadas solicitudes desde esta conexión. Intente en un minuto.' },
  doneTitle: { en: 'Got it.', es: 'Recibido.' },
  doneBody: { en: 'Alex will look at your photos and text you a firm price, usually the same day.', es: 'Alex revisará sus fotos y le enviará un precio firme por texto, normalmente el mismo día.' },
  doneMerged: { en: 'We already had a request for this address and service from today, so we added this to it.', es: 'Ya teníamos una solicitud para esta dirección y servicio de hoy, así que la agregamos a esa.' },
  verifyTitle: { en: 'We texted you a 4-digit code', es: 'Le enviamos un código de 4 dígitos' },
  verifyBody: { en: 'Enter it to confirm this is your number. You can also just wait for our text.', es: 'Ingréselo para confirmar que es su número. También puede simplemente esperar nuestro mensaje.' },
  verifyButton: { en: 'Confirm', es: 'Confirmar' },
  verifyResend: { en: 'Resend code', es: 'Reenviar código' },
  verifyWrong: { en: "That code didn't match. Try again.", es: 'El código no coincide. Intente otra vez.' },
  verifyDone: { en: 'Number confirmed. Thanks.', es: 'Número confirmado. Gracias.' },
  close: { en: 'Close', es: 'Cerrar' },

  // Sub offer page
  offerTitle: { en: 'Job offer from La Vaca', es: 'Oferta de trabajo de La Vaca' },
  offerPay: { en: 'Your pay', es: 'Su pago' },
  offerTown: { en: 'Town', es: 'Ciudad' },
  offerStart: { en: 'Start window', es: 'Ventana de inicio' },
  offerExpires: { en: 'Expires', es: 'Vence' },
  offerAccept: { en: 'Accept this job', es: 'Aceptar este trabajo' },
  offerRespond: { en: 'Respond', es: 'Responder' },
  offerCounter: { en: "I'll do it for", es: 'Lo hago por' },
  offerDetails: { en: 'I need more details', es: 'Necesito más detalles' },
  offerDecline: { en: 'Decline', es: 'Rechazar' },
  offerDeclineWhy: { en: 'Why? (optional)', es: '¿Por qué? (opcional)' },
  declinePayTooLow: { en: 'Pay too low', es: 'Pago muy bajo' },
  declineTooFar: { en: 'Too far', es: 'Muy lejos' },
  declineSchedule: { en: 'Schedule', es: 'Agenda' },
  declineScopeUnclear: { en: 'Scope unclear', es: 'Alcance poco claro' },
  declineOther: { en: 'Other', es: 'Otro' },
  offerTaken: { en: 'This job has been taken by another sub. Thanks for looking.', es: 'Otro subcontratista tomó este trabajo. Gracias por revisarlo.' },
  offerExpired: { en: 'This offer expired. Alex will resend if the job is still open.', es: 'Esta oferta venció. Alex la reenviará si el trabajo sigue abierto.' },
  offerAccepted: { en: 'You are on this job. The full address is below and Alex will confirm by text.', es: 'El trabajo es suyo. La dirección completa está abajo y Alex confirmará por texto.' },
  offerSignUp: { en: 'Sign up on SpecNook to accept jobs', es: 'Regístrese en SpecNook para aceptar trabajos' },
  offerSignUpBody: { en: 'You can see this job, but only approved subs can accept. Signup takes about ten minutes.', es: 'Puede ver este trabajo, pero solo los subcontratistas aprobados pueden aceptar. El registro toma unos diez minutos.' },
  offerConfirmTitle: { en: 'Alex accepted your price', es: 'Alex aceptó su precio' },
  offerConfirmBody: { en: 'Confirm you will do the work at this price and the job is yours.', es: 'Confirme que hará el trabajo por este precio y el trabajo es suyo.' },
  offerConfirm: { en: 'Confirm at this price', es: 'Confirmar por este precio' },
} satisfies Record<string, L>;

export type StringKey = keyof typeof STRINGS;

export function s(key: StringKey, lang: Lang, vars?: Record<string, string | number>): string {
  let text = STRINGS[key][lang] || STRINGS[key].en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v));
  }
  return text;
}
