import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Renovation Portfolio: NJ Before & After',
  description: 'Completed kitchen, bath and whole-home projects across Northern NJ with before and after photos, real budgets and client feedback.',
  openGraph: {
    title: "Project Portfolio - La Vaca General Contractors | Northern NJ",
    description: "Explore La Vaca General Contractors' portfolio of completed projects. See detailed case studies, before/after photos, budgets, and client testimonials from Northern NJ.",
    url: "https://www.lavacagc.com/portfolio",
  },
}

export default function PortfolioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
