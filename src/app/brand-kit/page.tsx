import type { Metadata } from "next";
import Image from "next/image";
import { CopyButton } from "./copy-button";

export const metadata: Metadata = {
  title: "Brand Kit — La Vaca General Contractors",
  description: "La Vaca GC brand guidelines, logos, colors, and typography.",
  robots: { index: false, follow: false },
};

const colors = [
  { name: "Primary Orange", hex: "#EE9639", hsl: "HSL 26 84% 58.4%" },
  { name: "Primary Light", hex: "#F0AD66", hsl: "HSL 26 84% 68.4%" },
  { name: "Primary Dark", hex: "#C87A22", hsl: "HSL 26 84% 48.4%" },
  { name: "Accent Teal", hex: "#146356", hsl: "HSL 165 59% 32%" },
  { name: "Accent Sunset", hex: "#FF6F31", hsl: "HSL 15 100% 59%" },
  { name: "Accent Tangerine", hex: "#FF9051", hsl: "HSL 22 100% 65%" },
  { name: "Text Primary", hex: "#1A1A1A", hsl: "HSL 0 0% 10%" },
  { name: "Text Secondary", hex: "#303030", hsl: "HSL 0 0% 19%" },
];

function ColorSwatch({ name, hex, hsl }: { name: string; hex: string; hsl: string }) {
  return (
    <CopyButton text={hex}>
      <div className="group flex flex-col items-center">
        <div
          className="w-28 h-28 rounded-2xl shadow-md border border-gray-200 transition-transform group-hover:scale-105"
          style={{ backgroundColor: hex }}
        />
        <p className="mt-3 font-semibold text-sm text-gray-900">{name}</p>
        <p className="text-xs font-mono text-gray-600">{hex}</p>
        <p className="text-xs font-mono text-gray-400">{hsl}</p>
        <p className="text-[10px] text-gray-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Click to copy</p>
      </div>
    </CopyButton>
  );
}

export default function BrandKitPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-10 flex items-center gap-5">
          <Image src="/brand/logo.png" alt="La Vaca GC" width={64} height={64} className="rounded-xl" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Brand Kit</h1>
            <p className="text-gray-500 mt-1">La Vaca General Contractors brand guidelines</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-16 space-y-24">
        {/* Logo Section */}
        <section>
          <h2 className="text-2xl font-bold mb-2">Logo</h2>
          <p className="text-gray-500 mb-8 max-w-2xl">
            The La Vaca GC logo features our signature orange bull mascot wearing a hard hat and sunglasses — friendly, tough, and ready to build.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Light */}
            <div className="rounded-2xl border border-gray-200 p-10 flex flex-col items-center gap-4 bg-white">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Light Background</p>
              <Image src="/brand/logo.png" alt="La Vaca GC logo" width={120} height={120} />
            </div>
            {/* Dark */}
            <div className="rounded-2xl border border-gray-800 p-10 flex flex-col items-center gap-4 bg-gray-950">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Dark Background</p>
              <Image src="/brand/logo.png" alt="La Vaca GC logo" width={120} height={120} />
            </div>
            {/* Photo */}
            <div className="rounded-2xl overflow-hidden relative flex flex-col items-center justify-center gap-4" style={{ background: "linear-gradient(135deg, #EE9639, #FF6F31)" }}>
              <p className="text-xs font-medium text-white/70 uppercase tracking-wider">On Brand Gradient</p>
              <Image src="/brand/logo.png" alt="La Vaca GC logo" width={120} height={120} />
            </div>
          </div>

          <div className="flex gap-4 mt-8">
            <a href="/brand/logo.png" download className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors" style={{ backgroundColor: "#EE9639" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Download PNG
            </a>
          </div>
        </section>

        {/* Color Palette */}
        <section>
          <h2 className="text-2xl font-bold mb-2">Color Palette</h2>
          <p className="text-gray-500 mb-8">Click any swatch to copy the hex value. Warm, trustworthy tones that reflect craftsmanship.</p>

          <div className="flex flex-wrap gap-8">
            {colors.map((c) => (
              <ColorSwatch key={c.hex + c.name} {...c} />
            ))}
          </div>
        </section>

        {/* Typography */}
        <section>
          <h2 className="text-2xl font-bold mb-2">Typography</h2>
          <p className="text-gray-500 mb-8">La Vaca uses <strong>Inter</strong> — a clean, highly readable sans-serif that works across web, print, and signage.</p>

          <div className="space-y-6">
            <div className="rounded-2xl border border-gray-200 p-8">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Inter</p>
              <p className="text-4xl font-bold mb-2">La Vaca General Contractors</p>
              <p className="text-2xl font-semibold mb-2">Your Neighbor Who Builds It Right</p>
              <p className="text-lg font-medium mb-2">ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
              <p className="text-base text-gray-600">abcdefghijklmnopqrstuvwxyz 0123456789</p>
            </div>
            <div className="rounded-2xl border border-gray-100 p-8 bg-gray-50">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">Type Scale</p>
              <div className="space-y-3">
                <p className="text-xs text-gray-400">48px / Bold — <span className="text-5xl font-bold text-gray-900">Display</span></p>
                <p className="text-xs text-gray-400">32px / Bold — <span className="text-3xl font-bold text-gray-900">Heading 1</span></p>
                <p className="text-xs text-gray-400">24px / Semibold — <span className="text-2xl font-semibold text-gray-900">Heading 2</span></p>
                <p className="text-xs text-gray-400">16px / Regular — <span className="text-base text-gray-900">Body text for paragraphs and descriptions</span></p>
                <p className="text-xs text-gray-400">14px / Medium — <span className="text-sm font-medium text-gray-900">Labels and supporting text</span></p>
              </div>
            </div>
          </div>
        </section>

        {/* Gradients */}
        <section>
          <h2 className="text-2xl font-bold mb-2">Gradients</h2>
          <p className="text-gray-500 mb-8">Two brand gradients for hero sections, banners, and CTAs.</p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <div className="h-40 w-full" style={{ background: "linear-gradient(135deg, #EE9639, #FF9051)" }} />
              <div className="p-6 bg-gray-50 border-t border-gray-200">
                <p className="font-semibold text-sm">Primary Gradient</p>
                <p className="text-xs font-mono text-gray-500 mt-1">linear-gradient(135deg, #EE9639, #FF9051)</p>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <div className="h-40 w-full" style={{ background: "linear-gradient(135deg, #EE9639, #FF6F31)" }} />
              <div className="p-6 bg-gray-50 border-t border-gray-200">
                <p className="font-semibold text-sm">Hero Gradient</p>
                <p className="text-xs font-mono text-gray-500 mt-1">linear-gradient(135deg, #EE9639, #FF6F31)</p>
              </div>
            </div>
          </div>
        </section>

        {/* Photography Style */}
        <section>
          <h2 className="text-2xl font-bold mb-2">Photography Style</h2>
          <p className="text-gray-500 mb-8">Visual guidelines for project photos and marketing materials.</p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-8">
              <p className="text-green-700 font-bold text-lg mb-4">✓ Preferred</p>
              <ul className="space-y-3 text-sm text-green-800">
                <li>Real project photos from actual job sites</li>
                <li>Before &amp; after comparisons</li>
                <li>Warm, natural lighting</li>
                <li>Detail shots of craftsmanship and materials</li>
                <li>Team members in action (with permission)</li>
                <li>Finished rooms and spaces</li>
              </ul>
            </div>
            <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-8">
              <p className="text-red-700 font-bold text-lg mb-4">✗ Avoid</p>
              <ul className="space-y-3 text-sm text-red-800">
                <li>Generic stock photography</li>
                <li>AI-generated faces or hands</li>
                <li>Overly staged or unrealistic scenes</li>
                <li>Low-resolution or blurry images</li>
                <li>Photos without proper lighting</li>
                <li>Competitor or unrelated project photos</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Do's & Don'ts */}
        <section>
          <h2 className="text-2xl font-bold mb-2">Do&rsquo;s &amp; Don&rsquo;ts</h2>
          <p className="text-gray-500 mb-8">Keep the La Vaca brand strong and consistent.</p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-8">
              <p className="text-green-700 font-bold text-lg mb-4">✓ Do</p>
              <ul className="space-y-3 text-sm text-green-800">
                <li>Use the logo on clean, uncluttered backgrounds</li>
                <li>Add a dark overlay when placing the logo over photos</li>
                <li>Keep the bull mascot upright and proportional</li>
                <li>Maintain clear space equal to the logo height around it</li>
                <li>Keep the logo at a minimum of 60px wide</li>
                <li>Always include &ldquo;Licensed &amp; Insured&rdquo; on official materials</li>
              </ul>
            </div>
            <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-8">
              <p className="text-red-700 font-bold text-lg mb-4">✗ Don&rsquo;t</p>
              <ul className="space-y-3 text-sm text-red-800">
                <li>Stretch, skew, or rotate the logo</li>
                <li>Change the mascot&rsquo;s colors or remove accessories</li>
                <li>Place the logo on busy backgrounds without an overlay</li>
                <li>Add shadows, outlines, or extra effects</li>
                <li>Use the logo smaller than 60px</li>
                <li>Recreate or approximate the bull mascot</li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-10">
        <div className="max-w-5xl mx-auto px-6 text-center text-sm text-gray-400">
          <p>© {new Date().getFullYear()} La Vaca General Contractors LLC. All rights reserved.</p>
          <p className="mt-1">HIC# 13VH13373800 · Licensed &amp; Insured</p>
          <p className="mt-1">For brand inquiries, contact <a href="mailto:alex@vacamoo.com" className="hover:underline cursor-pointer" style={{ color: "#EE9639" }}>alex@vacamoo.com</a></p>
        </div>
      </footer>
    </div>
  );
}
