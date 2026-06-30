import { cookies } from 'next/headers';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import HomeCareBookingForm, { type BookingPrefill } from '@/components/homecare/HomeCareBookingForm';
import { HC_ACCESS_COOKIE, verifyHomeAccess } from '@/lib/homecare/accessCookie';
import { findHomeownerById } from '@/lib/homecare/homeowners';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface CatalogRow {
  key: string;
  title: string;
  blurb: string;
}

export default async function BookPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const sp = await searchParams;
  const taskKey = (sp?.task ?? '').slice(0, 80);

  // Look up the requested task (falls back to a generic maintenance request).
  let task: CatalogRow | null = null;
  if (taskKey) {
    const rows = await supabaseRest<CatalogRow[]>('GET', `maintenance_catalog?select=key,title,blurb&key=eq.${encodeURIComponent(taskKey)}&limit=1`);
    task = rows?.[0] ?? null;
  }
  const taskTitle = task?.title ?? 'Seasonal home maintenance';

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
            <h1 className="text-3xl md:text-4xl font-bold text-text-primary mb-2">Book us for {taskTitle.toLowerCase()}</h1>
            {task?.blurb && <p className="text-lg text-text-secondary">{task.blurb}</p>}
          </div>
        </section>
        <section className="py-8">
          <div className="container mx-auto px-4 max-w-2xl">
            <HomeCareBookingForm taskKey={taskKey || 'general'} taskTitle={taskTitle} prefill={prefill} />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
