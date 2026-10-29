'use client';

import dynamic from 'next/dynamic';
import { ArrowRight } from 'lucide-react';
import type { HomeService, Lang } from '@/lib/home-services/catalog';
import { s } from '@/lib/home-services/i18n';
import { preloadRequestFlow, useRequestFlow } from './useRequestFlow';

const RequestFlow = dynamic(() => import('./RequestFlow'), { ssr: false });

/** "Request this service" on a per-service page (LP8): opens the same flow with that service preselected. */
export default function RequestServiceButton({ service, lang, className }: { service: HomeService; lang: Lang; className?: string }) {
  const flow = useRequestFlow({ openOnHash: true });
  return (
    <>
      <button
        type="button"
        onClick={flow.openFlow}
        onPointerEnter={preloadRequestFlow}
        onFocus={preloadRequestFlow}
        data-testid="request-this"
        className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-secondary px-6 py-3 text-[17px] font-bold text-white shadow-button transition-transform hover:-translate-y-[1px] focus:outline-none focus-visible:ring-4 focus-visible:ring-secondary/40 ${className ?? ''}`}
      >
        {s('requestThis', lang)}
        <ArrowRight aria-hidden className="h-5 w-5" />
      </button>
      {flow.mounted && <RequestFlow open={flow.open} lang={lang} services={[service.slug]} catalog={[service]} onClose={flow.closeFlow} />}
    </>
  );
}
