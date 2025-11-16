import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '5-Year Warranty Information | La Vaca General Contractors',
  description: 'Learn about our comprehensive 5-year warranty on home remodeling projects. Quality craftsmanship backed by our commitment to excellence.',
  openGraph: {
    title: '5-Year Warranty Information | La Vaca General Contractors',
    description: 'Learn about our comprehensive 5-year warranty on home remodeling projects. Quality craftsmanship backed by our commitment to excellence.',
    url: 'https://www.lavacagc.com/warranty',
  },
}

export default function WarrantyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
