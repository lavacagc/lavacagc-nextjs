'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { isAnalyticsExcluded } from '@/lib/analytics/excluded';

/**
 * Microsoft Clarity (session recording) and the Meta Pixel.
 *
 * CM-05: these used to sit as bare <Script> tags in the root layout, gated
 * only on hostname and Global Privacy Control - no path condition at all. So
 * Clarity was replaying /crew/confirm/[token], a page showing a customer's
 * name, phone and address, with the capability token in the recorded URL. On
 * those pages the token IS the credential.
 *
 * A client component is needed because the root layout is a server component
 * and cannot read the pathname. The exclusion list itself lives in
 * lib/analytics/excluded.ts and is shared with Analytics.tsx - two lists is
 * how the original one drifted out of date.
 *
 * TWO guards, because either alone leaks:
 *
 *  1. Not rendering the scripts keeps them off any excluded page loaded
 *     DIRECTLY - which is how these pages are almost always reached, since
 *     their links arrive by email.
 *  2. Client-side navigation from an ordinary page into an excluded one would
 *     otherwise leave an already-loaded Clarity running, so the effect below
 *     stops it on arrival. Meta's pixel only reports on explicit calls, and
 *     Analytics.tsx already skips those for the same paths.
 */
export function ThirdPartyAnalytics() {
  const pathname = usePathname();
  const excluded = isAnalyticsExcluded(pathname);

  useEffect(() => {
    if (!excluded) return;
    // Already-running recorder, reached by client-side navigation.
    const w = window as unknown as { clarity?: (...args: unknown[]) => void };
    try {
      w.clarity?.('stop');
    } catch {
      // Clarity absent or already stopped - nothing to do.
    }
  }, [excluded, pathname]);

  if (excluded) return null;

  return (
    <>
      {/* Microsoft Clarity - session recordings + heatmaps (free).
          Production only; Clarity auto-filters bot sessions. */}
      <Script id="microsoft-clarity" strategy="afterInteractive">
        {`if(window.location.hostname==='www.lavacagc.com' && !navigator.globalPrivacyControl){
          (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "vxrwpc3fhq");
        }`}
      </Script>
      {/* Facebook Pixel (1461944528853241) - hardcoded, GTM malware scanner kept killing it */}
      <Script id="facebook-pixel" strategy="afterInteractive">
        {`if(window.location.hostname==='www.lavacagc.com' && !navigator.globalPrivacyControl){
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
          document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init','1461944528853241');
          fbq('track','PageView');
        }`}
      </Script>
    </>
  );
}
