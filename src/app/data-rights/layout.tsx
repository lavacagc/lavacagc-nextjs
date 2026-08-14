import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Data Rights Request',
  description: 'Exercise your data privacy rights. Request access, deletion, or correction of your personal information.',
  robots: 'noindex, follow',
  alternates: {
    canonical: 'https://www.lavacagc.com/data-rights',
  },
}

export default function DataRightsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
