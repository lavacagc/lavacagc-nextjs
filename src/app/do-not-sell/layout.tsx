import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Do Not Sell or Share My Personal Information | La Vaca General Contractors',
  description: 'California residents: Exercise your right to opt out of the sale or sharing of your personal information under CCPA/CPRA.',
  robots: 'noindex, follow',
  alternates: {
    canonical: 'https://www.lavacagc.com/do-not-sell',
  },
  openGraph: {
    title: 'Do Not Sell or Share My Personal Information | La Vaca General Contractors',
    description: 'California residents: Exercise your right to opt out of the sale or sharing of your personal information under CCPA/CPRA.',
    url: 'https://www.lavacagc.com/do-not-sell',
  },
}

export default function DoNotSellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
