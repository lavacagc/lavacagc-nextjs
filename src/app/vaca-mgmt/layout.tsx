import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Content Management | Admin Dashboard',
  description: 'Admin dashboard for managing website content',
  robots: 'noindex, nofollow',
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
