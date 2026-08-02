import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { Providers } from '@/components/providers'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import CookieConsent from '@/components/CookieConsent'
import Analytics from '@/components/Analytics'
import StructuredData from '@/components/StructuredData'
import ReviewToast from '@/components/ReviewToast'
import { ClientLeadGenWidgets } from '@/components/ClientLeadGenWidgets'
import StickyCTA from '@/components/StickyCTA'
import SectionTracker from '@/components/SectionTracker'
import VisitorTracker from '@/components/VisitorTracker'
import SmartBanner from '@/components/SmartBanner'
import { RecaptchaChallengeProvider } from '@/components/recaptcha/RecaptchaChallengeProvider'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://www.lavacagc.com'),
  title: {
    default: 'Home Renovation & Remodeling Contractor NJ | Kitchen, Bathroom & Additions',
    template: '%s | La Vaca General Contractors'
  },
  description: 'Transform your NJ home with La Vaca GC\'s expert kitchen & bathroom remodeling, home additions, and renovation services. Licensed contractors. Free estimates. Call today!',
  keywords: ['home remodeling', 'kitchen renovation', 'bathroom remodeling', 'basement finishing', 'Northern New Jersey contractor', 'Alpine', 'Short Hills', 'Saddle River', 'Essex Fells'],
  authors: [{ name: 'La Vaca General Contractors, LLC' }],
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/logo.png', type: 'image/png' },
    ],
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.lavacagc.com',
    siteName: 'La Vaca General Contractors',
    title: 'Home Renovation & Remodeling Contractor NJ | Kitchen, Bathroom & Additions',
    description: 'Transform your NJ home with La Vaca GC\'s expert kitchen & bathroom remodeling, home additions, and renovation services. Licensed contractors. Free estimates. Call today!',
    images: [
      {
        url: '/logo.png',
        width: 800,
        height: 800,
        alt: 'La Vaca General Contractors - Home Renovation NJ',
      }
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Home Renovation & Remodeling Contractor NJ | Kitchen, Bathroom & Additions',
    description: 'Transform your NJ home with La Vaca GC\'s expert kitchen & bathroom remodeling, home additions, and renovation services. Licensed contractors. Free estimates. Call today!',
    images: ['/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/logo.webp" type="image/webp" />
        <link rel="alternate icon" href="/logo.png" type="image/png" />
        <meta name="theme-color" content="#EE9639" />
        {/* Preconnect to Supabase storage for faster asset loading */}
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        {/* Preload hero video for faster LCP */}
        <link 
          rel="preload" 
          href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/hero-videos/hero-background-1.mp4`} 
          as="video" 
          type="video/mp4"
        />
      </head>
      <body className={inter.className}>
        {/* Microsoft Clarity - session recordings + heatmaps (free) */}
        {/* Microsoft Clarity — production only, skip Vercel preview deploys */}
        {/* Clarity auto-filters bot sessions — no need to block client-side */}
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`if(window.location.hostname==='www.lavacagc.com' && !navigator.globalPrivacyControl){
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "vxrwpc3fhq");
          }`}
        </Script>
        {/* Facebook Pixel (1461944528853241) — hardcoded, GTM malware scanner kept killing it */}
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
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img height="1" width="1" style={{display:'none'}}
            src="https://www.facebook.com/tr?id=1461944528853241&ev=PageView&noscript=1" alt="" />
        </noscript>

        {/* Server-side structured data for SEO - visible to crawlers */}
        <StructuredData type="organization" />

        {/* Skip to main content link for keyboard accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded focus:outline-none"
        >
          Skip to main content
        </a>
        <Providers>
          <TooltipProvider>
            <RecaptchaChallengeProvider>
              <Analytics />
              {children}
              <Toaster />
              <Sonner />
              <CookieConsent />
              <ReviewToast />
              <ClientLeadGenWidgets />
              <StickyCTA />
              <SectionTracker />
              <VisitorTracker />
              <SmartBanner />
            </RecaptchaChallengeProvider>
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  )
}
