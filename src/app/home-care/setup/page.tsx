import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { HC_ACCESS_COOKIE, verifyHomeAccess } from '@/lib/homecare/accessCookie';
import { findHomeownerById } from '@/lib/homecare/homeowners';
import { sanitizeSystems, stageFromLegacyType, type Stage, type HomeSystems } from '@/lib/homecare/profile';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import HomeCareSetupWizard from '@/components/homecare/HomeCareSetupWizard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Set up your home plan | La Vaca Home Care', robots: { index: false } };

interface ProfileRow {
  stage: Stage | null;
  systems: HomeSystems | null;
  homeowner_type: string | null;
}

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const sp = await searchParams;
  const isEdit = sp?.edit === '1';

  const cookieStore = await cookies();
  const access = await verifyHomeAccess(cookieStore.get(HC_ACCESS_COOKIE)?.value);
  if (!access) redirect('/home-care');
  const homeowner = await findHomeownerById(access.homeownerId);
  if (!homeowner || homeowner.status === 'unsubscribed') redirect('/home-care');

  // Prefill from any existing profile (so the program bar's "Edit" re-entry resumes state).
  let initialStage: Stage | null = null;
  let initialSystems: HomeSystems = {};
  try {
    const rows = await supabaseRest<ProfileRow[]>('GET', `home_profiles?select=stage,systems,homeowner_type&homeowner_id=eq.${homeowner.id}&limit=1`);
    const row = rows?.[0];
    if (row) {
      initialStage = row.stage ?? stageFromLegacyType(row.homeowner_type);
      initialSystems = sanitizeSystems(row.systems);
    }
  } catch {
    /* no profile yet — start blank */
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 bg-gradient-subtle">
        <section className="py-8 md:py-12">
          <div className="container mx-auto px-4">
            <HomeCareSetupWizard initial={{ stage: initialStage, systems: initialSystems }} firstName={homeowner.first_name} isEdit={isEdit} />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
