'use client';

import dynamic from 'next/dynamic';

const ConversionDashboard = dynamic(() => import('@/components/admin/ConversionDashboard'), { ssr: false });

export default function AnalyticsPage() {
  return <ConversionDashboard />;
}
