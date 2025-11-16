import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Home Remodeling Blog & Resources | La Vaca General Contractors',
  description: 'Expert insights on home remodeling trends, costs, and permits in Northern NJ. Get professional advice from Bergen County\'s trusted contractors.',
  keywords: 'home remodeling blog, kitchen trends Bergen County, bathroom costs Essex County, NJ permits, construction advice',
  openGraph: {
    title: 'Home Remodeling Blog & Resources | La Vaca General Contractors',
    description: 'Expert insights on home remodeling trends, costs, and permits in Northern NJ. Get professional advice from Bergen County\'s trusted contractors.',
    url: 'https://www.lavacagc.com/blog',
  },
}

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
