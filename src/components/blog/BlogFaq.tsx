import type { FaqItem } from '@/lib/articles/schemas';

/**
 * The FAQ block under a blog post (ART10). Plain <details> elements: no
 * client JavaScript, and the answers stay in the HTML for crawlers.
 * Used by the public post page and the admin preview, so both look the same.
 */
export function BlogFaq({ items }: { items: FaqItem[] }) {
  if (items.length === 0) return null;
  return (
    <section id="faq" aria-labelledby="faq-heading" className="mt-16">
      <h2 id="faq-heading" className="text-2xl md:text-3xl font-semibold mb-6">
        Frequently asked questions
      </h2>
      <div className="divide-y divide-border rounded-lg border border-border">
        {items.map((item) => (
          <details key={item.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-start justify-between gap-4 text-lg font-medium">
              <span>{item.q}</span>
              <span aria-hidden="true" className="mt-1 text-muted-foreground transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-muted-foreground leading-relaxed whitespace-pre-line">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
