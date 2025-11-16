import { readFileSync } from 'fs';
import { join } from 'path';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Breadcrumb from '@/components/Breadcrumb';
import { MarkdownContent } from '@/components/MarkdownContent';

export default function PrivacyPolicy() {
  // Read markdown content at build time (server-side)
  const privacyContent = readFileSync(
    join(process.cwd(), 'src', 'content', 'privacy-policy-content.md'),
    'utf-8'
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-grow">
        <section className="bg-background-subtle py-4">
          <div className="container mx-auto px-4">
            <Breadcrumb />
          </div>
        </section>

        <div className="container mx-auto px-4 py-10 md:py-16">
          <div className="max-w-4xl mx-auto">
            <MarkdownContent content={privacyContent} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
