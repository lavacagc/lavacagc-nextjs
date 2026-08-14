import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Home, Search } from 'lucide-react';

export const metadata = {
  title: '404 - Page Not Found',
  description: 'The page you are looking for could not be found.',
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-grow flex items-center justify-center px-4 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <div className="mb-8">
            <h1 className="text-9xl font-bold text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text mb-4">
              404
            </h1>
            <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
              Page Not Found
            </h2>
            <p className="text-xl text-text-secondary mb-8">
              Oops! The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </p>
          </div>

          <div className="bg-background-subtle rounded-lg p-8 mb-8">
            <h3 className="text-xl font-semibold text-text-primary mb-4">
              Here&apos;s what you can do:
            </h3>
            <ul className="text-left space-y-3 text-text-secondary max-w-md mx-auto">
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Check the URL for typos</span>
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Return to our homepage and navigate from there</span>
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Browse our services and recent projects</span>
              </li>
              <li className="flex items-start">
                <span className="text-primary mr-2">•</span>
                <span>Contact us if you need assistance finding something</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/">
              <Button size="lg" className="w-full sm:w-auto">
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </Button>
            </Link>
            <Link href="/services">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                <Search className="w-4 h-4 mr-2" />
                Browse Services
              </Button>
            </Link>
          </div>

          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-sm text-text-muted mb-4">
              Need help with a home remodeling project?
            </p>
            <Link href="/#estimate">
              <Button variant="link" className="text-primary">
                Get a Free Estimate →
              </Button>
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
