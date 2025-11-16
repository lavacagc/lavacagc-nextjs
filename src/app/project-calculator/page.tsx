'use client'

import dynamic from 'next/dynamic';

// Use dynamic import with ssr: false since this is a complex client-side form
const UnifiedCalculator = dynamic(() => import('@/components/UnifiedCalculator'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  )
});

export default function ProjectCalculatorPage() {
  return <UnifiedCalculator />;
}
