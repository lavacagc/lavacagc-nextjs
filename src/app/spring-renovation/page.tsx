import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SpringRenovationClient from './SpringRenovationClient'

export const metadata: Metadata = {
  title: 'Spring 2026 Renovation Special | Free Consultation | La Vaca GC',
  description:
    'Transform your home this spring with La Vaca General Contractors. Limited-time free consultation for kitchen, bathroom, and basement renovations in Northern NJ. Licensed & insured.',
  keywords:
    'spring renovation NJ, spring home remodel New Jersey, spring kitchen renovation, spring bathroom remodel NJ, home renovation deals NJ, 2026 renovation specials',
  openGraph: {
    title: 'Spring 2026 Renovation Special | La Vaca General Contractors',
    description:
      'Limited-time free consultation for your spring renovation project. Kitchen, bathroom, basement, and more. Northern NJ\'s trusted contractor.',
    url: 'https://www.lavacagc.com/spring-renovation',
  },
  alternates: {
    canonical: 'https://www.lavacagc.com/spring-renovation',
  },
}

export default function SpringRenovationPage() {
  return (
    <>
      <Header />
      <main id="main-content">
        <SpringRenovationClient />
      </main>
      <Footer />
    </>
  )
}
