import { Suspense } from 'react';
import type { Metadata } from 'next';
import PreferencesClient from './PreferencesClient';

export const metadata: Metadata = {
  title: 'Email preferences · La Vaca General Contractors',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function PreferencesPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', background: '#eef0ea' }} className="py-10 px-4">
          <p className="text-center text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <PreferencesClient />
    </Suspense>
  );
}
