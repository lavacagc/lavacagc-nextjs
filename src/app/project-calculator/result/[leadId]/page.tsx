'use client'

import dynamic from 'next/dynamic';

// Use dynamic import with ssr: false since this needs params and client-side data
const CalculatorResultsPage = dynamic(() => import('@/components/CalculatorResultsPage'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  )
});

export default function ResultPage() {
  return <CalculatorResultsPage />;
}
