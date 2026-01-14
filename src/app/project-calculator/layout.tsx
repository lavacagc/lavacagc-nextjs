import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Project Calculator | Get Your Free Estimate | La Vaca General Contractors',
  description: 'Calculate your home renovation project cost instantly. Get accurate estimates for kitchen remodeling, bathroom renovation, basement finishing, and home additions in Northern NJ.',
  openGraph: {
    title: 'Project Calculator | Free Home Renovation Estimate | La Vaca GC',
    description: 'Calculate your home renovation project cost instantly. Get accurate estimates for your remodeling project.',
    url: 'https://www.lavacagc.com/project-calculator',
  },
  alternates: {
    canonical: 'https://www.lavacagc.com/project-calculator',
  },
};

export default function ProjectCalculatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
