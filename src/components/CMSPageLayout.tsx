import LandingPageHeader from '@/components/LandingPageHeader';
import CMSPageRenderer from '@/components/CMSPageRenderer';
import type { CMSSection } from '@/types/cms';

interface CMSPageLayoutProps {
  sections: CMSSection[];
}

export default function CMSPageLayout({ sections }: CMSPageLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <LandingPageHeader />
      <main id="main-content">
        <CMSPageRenderer sections={sections} />
      </main>
      <footer className="bg-secondary/95 text-secondary-foreground/70 py-6 text-center text-sm">
        <div className="container mx-auto px-4">
          <p>&copy; {new Date().getFullYear()} La Vaca General Contractors, LLC. All rights reserved.</p>
          <p className="mt-1">Licensed, Bonded, &amp; Insured | HIC# 13VH13373800</p>
        </div>
      </footer>
    </div>
  );
}
