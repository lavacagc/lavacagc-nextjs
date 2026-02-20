import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms and Conditions | La Vaca General Contractors',
  description: 'Read our terms and conditions for home remodeling services in Northern New Jersey at La Vaca General Contractors.',
  alternates: {
    canonical: 'https://www.lavacagc.com/terms-and-conditions',
  },
  openGraph: {
    title: 'Terms and Conditions | La Vaca General Contractors',
    description: 'Read our terms and conditions for home remodeling services in Northern New Jersey at La Vaca General Contractors.',
    url: 'https://www.lavacagc.com/terms-and-conditions',
  },
}

export default function TermsAndConditionsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
