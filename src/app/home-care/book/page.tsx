import { cookies } from 'next/headers';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import HomeCareBookingForm, { type BookingPrefill, type BookingService } from '@/components/homecare/HomeCareBookingForm';
import { HC_ACCESS_COOKIE, verifyHomeAccess } from '@/lib/homecare/accessCookie';
import { findHomeownerById } from '@/lib/homecare/homeowners';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface CatalogRow {
  key: string;
  title: string;
}

export default async function BookPage({ searchParams }: { searchParams: Promise<{ task?: string; tasks?: string }> }) {
  const sp = await searchParams;
  const rawKeys = (sp?.tasks || sp?.task || '')
    .split(',')
    .map((k) => k.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 20);

  // Look up the requested tasks (preserve the order the homeowner selected them).
  // Degrade gracefully: if the catalog lookup fails, fall back to a generic
  // service below rather than 500ing the booking page.
  let services: BookingService[] = [];
  if (rawKeys.length) {
    try {
      const rows = await supabaseRest<CatalogRow[]>('GET', `maintenance_catalog?select=key,title&key=in.(${rawKeys.map(encodeURIComponent).join(',')})`);
      const byKey = new Map((rows ?? []).map((r) => [r.key, r.title]));
      services = rawKeys.filter((k) => byKey.has(k)).map((k) => ({ key: k, title: byKey.get(k)! }));
    } catch {
      services = [];
    }
  }
  if (services.length === 0) services = [{ key: 'general', title: 'Seasonal home maintenance' }];
  const isMulti = services.length > 1;

  // Prefill contact info if the visitor is a verified homeowner.
  const cookieStore = await cookies();
  const access = await verifyHomeAccess(cookieStore.get(HC_ACCESS_COOKIE)?.value);
  let prefill: BookingPrefill = { first_name: '', email: '', phone: '', zip: '' };
  if (access) {
    const ho = await findHomeownerById(access.homeownerId);
    if (ho && ho.status !== 'unsubscribed') {
      prefill = { first_name: ho.first_name ?? '', email: ho.email ?? '', phone: ho.phone ?? '', zip: ho.zip ?? '' };
    }
  }

  const heading = isMulti ? 'Request an estimate' : `Book us for ${services[0].title.toLowerCase()}`;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="py-8 md:py-12 bg-gradient-subtle">
          <div className="container mx-auto px-4 max-w-2xl">
            <Link href="/home-care/checklist" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary mb-4">
              <ArrowLeft className="h-4 w-4" /> Back to my checklist
            </Link>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-primary mb-2">La Vaca Home Care · Booking</p>
            <h1 className="text-3xl md:text-4xl font-bold text-text-primary mb-2">{heading}</h1>
            <p className="text-lg text-text-secondary">
              {isMulti
                ? `Tell us how to reach you and we'll put together one estimate for the ${services.length} services you picked.`
                : "Tell us how to reach you and we'll handle the rest — no obligation."}
            </p>
          </div>
        </section>
        <section className="py-8">
          <div className="container mx-auto px-4 max-w-2xl">
            <HomeCareBookingForm services={services} prefill={prefill} />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
