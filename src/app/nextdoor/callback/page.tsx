import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import CopyCodeButton from './CopyCodeButton';

// OAuth redirect target registered with the Nextdoor Publish API.
// Nextdoor sends the browser here with ?code=... after the owner approves
// access. Nothing is stored server-side: the page shows the code so it can be
// pasted into the token script that runs on the office machine.
export const metadata: Metadata = {
  title: 'Nextdoor authorization',
  robots: { index: false, follow: false },
};

export default async function NextdoorCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string; error_description?: string }>;
}) {
  const { code, error, error_description } = await searchParams;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-16 max-w-2xl">
        <h1 className="text-3xl font-bold mb-6">Nextdoor authorization</h1>

        {code ? (
          <>
            <p className="mb-4">
              Nextdoor approved the connection. Copy this code into the token script.
              It is single use and expires in a few minutes.
            </p>
            <pre className="bg-muted rounded-md p-4 overflow-x-auto text-sm break-all whitespace-pre-wrap">
              {code}
            </pre>
            <div className="mt-4">
              <CopyCodeButton code={code} />
            </div>
          </>
        ) : error ? (
          <>
            <p className="mb-2 font-medium">Nextdoor returned an error.</p>
            <pre className="bg-muted rounded-md p-4 overflow-x-auto text-sm whitespace-pre-wrap">
              {error}
              {error_description ? `\n${error_description}` : ''}
            </pre>
          </>
        ) : (
          <p>
            This page receives the authorization code from Nextdoor. There is nothing to
            do here unless you arrived from a Nextdoor consent screen.
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}
