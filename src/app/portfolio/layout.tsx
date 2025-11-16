import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Project Portfolio - La Vaca General Contractors | Northern NJ",
  description: "Explore La Vaca General Contractors' portfolio of completed projects. See detailed case studies, before/after photos, budgets, and client testimonials from Northern NJ.",
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
