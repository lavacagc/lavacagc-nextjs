import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | La Vaca General Contractors',
  description: 'Read our privacy policy to understand how we collect, use, and protect your personal information at La Vaca General Contractors.',
  alternates: {
    canonical: 'https://www.lavacagc.com/privacy-policy',
  },
  openGraph: {
    title: 'Privacy Policy | La Vaca General Contractors',
    description: 'Read our privacy policy to understand how we collect, use, and protect your personal information at La Vaca General Contractors.',
    url: 'https://www.lavacagc.com/privacy-policy',
  },
}

export default function PrivacyPolicyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
