'use client'

import dynamic from 'next/dynamic';

// Dynamically import AdminContent with no SSR to avoid browser-only dependency issues
const AdminContent = dynamic(() => import('@/components/AdminContent'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  )
});

export default function Admin() {
  return <AdminContent />;
}
