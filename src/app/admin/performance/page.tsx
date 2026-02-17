'use client';

import dynamic from 'next/dynamic';

const PageSpeedMonitor = dynamic(() => import('@/components/admin/PageSpeedMonitor'), { ssr: false });

export default function PerformancePage() {
  return <PageSpeedMonitor />;
}
