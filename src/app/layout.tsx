import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://www.lavacagc.com'),
  title: {
    default: 'Home Renovation & Remodeling Contractor NJ | Kitchen, Bathroom & Additions',
    template: '%s | Lavaca General Contracting'
  },
  description: 'Transform your NJ home with La Vaca GC\'s expert kitchen & bathroom remodeling, home additions, and renovation services. Licensed contractors. Free estimates. Call today!',
  keywords: ['home remodeling', 'kitchen renovation', 'bathroom remodeling', 'basement finishing', 'Northern New Jersey contractor', 'Alpine', 'Short Hills', 'Saddle River', 'Essex Fells'],
  authors: [{ name: 'La Vaca General Contractors, LLC' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.lavacagc.com',
    siteName: 'Lavaca General Contracting',
    title: 'Home Renovation & Remodeling Contractor NJ | Kitchen, Bathroom & Additions',
    description: 'Transform your NJ home with La Vaca GC\'s expert kitchen & bathroom remodeling, home additions, and renovation services. Licensed contractors. Free estimates. Call today!',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Lavaca General Contracting',
      }
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Home Renovation & Remodeling Contractor NJ | Kitchen, Bathroom & Additions',
    description: 'Transform your NJ home with La Vaca GC\'s expert kitchen & bathroom remodeling, home additions, and renovation services. Licensed contractors. Free estimates. Call today!',
    images: ['/og-image.jpg'],
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
      </head>
      <body className={inter.className}>
        <Providers>
          <TooltipProvider>
            {children}
            <Toaster />
            <Sonner />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  )
}
