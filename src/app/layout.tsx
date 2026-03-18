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
import ChatWidget from '@/components/ChatWidget'
import ReviewToast from '@/components/ReviewToast'
import { ClientLeadGenWidgets } from '@/components/ClientLeadGenWidgets'
import StickyCTA from '@/components/StickyCTA'

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
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "vxrwpc3fhq");`}
        </Script>
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
            <Analytics />
            {children}
            <Toaster />
            <Sonner />
            <CookieConsent />
            <ChatWidget />
            <ReviewToast />
            <ClientLeadGenWidgets />
            <StickyCTA />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  )
}
