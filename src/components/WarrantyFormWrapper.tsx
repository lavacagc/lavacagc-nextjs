'use client';

import dynamic from 'next/dynamic';

// Dynamically import WarrantyForm with no SSR to avoid browser-only dependency issues
const WarrantyForm = dynamic(() => import('@/components/WarrantyForm'), {
  ssr: false,
  loading: () => <div className="text-center py-8">Loading form...</div>,
});

export default function WarrantyFormWrapper() {
  return <WarrantyForm />;
}
