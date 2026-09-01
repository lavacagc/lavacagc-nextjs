import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
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
import { ThirdPartyAnalytics } from '@/components/ThirdPartyAnalytics';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://www.lavacagc.com'),
  title: {
    default: 'Home Remodeling Contractor in Northern NJ | La Vaca GC',
    template: '%s | La Vaca GC'
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
        {/* Preconnect to Supabase storage for faster asset loading.
            Also the probe tests/helpers/assert-test-build.ts reads to tell which
            NEXT_PUBLIC_SUPABASE_URL the SERVED build was baked with - keep it the
            first preconnect link and keep it rendered from that value, or update
            that helper alongside. */}
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
        {/*
          Cloudflare Scrape Shield's Email Address Obfuscation rewrites every
          address it finds in our HTML at the edge, then restores it in the DOM
          with an injected script (/cdn-cgi/scripts/.../email-decode.min.js).
          That restore races React hydration, and on /contact it lost: the TCPA
          consent label in ContactForm renders the address as BARE TEXT, which
          Cloudflare replaces with an <a class="__cf_email__">[email protected]</a>
          ELEMENT, so React found markup where it had sent text and threw
          minified error #418 on production - regenerating the whole page tree
          on the client. Reproduced 2026-08-06 on www.lavacagc.com/contact.

          <!--email_off--> is Cloudflare's documented opt-out, and it has to be
          an HTML comment, which is why this is dangerouslySetInnerHTML: React
          has no API for comment nodes. Bracketing the whole body covers the
          addresses in CMS-authored pages too (/privacy-policy carries 11), not
          just the ones we render from components.

          Nothing is given up by opting out. The obfuscation was already
          defeated on this site: `info@lavacagc.com` appears 8 times in plain
          text in the production HTML of /contact - in the JSON-LD business
          schema and in the RSC flight payload - and Cloudflare rewrites
          neither. It cost us hydration and bought no protection.
        */}
        <span hidden dangerouslySetInnerHTML={{ __html: '<!--email_off-->' }} />

        {/* CM-05: Clarity + Meta Pixel, excluded from token-authenticated
            pages. See src/lib/analytics/excluded.ts. */}
        <ThirdPartyAnalytics />
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
        {/* Closes the Cloudflare email-obfuscation opt-out opened at the top of
            <body>. Both markers must be present: an unclosed <!--email_off-->
            is undefined behaviour, not a permanent opt-out. */}
        <span hidden dangerouslySetInnerHTML={{ __html: '<!--email_on-->' }} />
      </body>
    </html>
  )
}
