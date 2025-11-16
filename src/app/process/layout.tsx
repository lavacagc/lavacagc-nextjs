import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Our Remodeling Process - La Vaca General Contractors | Northern NJ",
  description: "Discover La Vaca General Contractors' proven 6-step remodeling process. From initial consultation to project completion, we ensure transparency and quality at every stage.",
  openGraph: {
    title: "Our Remodeling Process - La Vaca General Contractors | Northern NJ",
    description: "Discover La Vaca General Contractors' proven 6-step remodeling process. From initial consultation to project completion, we ensure transparency and quality at every stage.",
    url: "https://www.lavacagc.com/process",
  },
}

export default function ProcessLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
