import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Admin Authentication | La Vaca General Contractors',
  description: 'Sign in to access the admin dashboard',
  robots: 'noindex, nofollow',
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
