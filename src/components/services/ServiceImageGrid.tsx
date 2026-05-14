import Image from "next/image";

export interface ServiceImageGridItem {
  src: string;
  alt: string;
  label: string;
  description: string;
}

interface ServiceImageGridProps {
  eyebrow?: string;
  title: string;
  intro?: string;
  items: ServiceImageGridItem[];
}

export default function ServiceImageGrid({
  eyebrow,
  title,
  intro,
  items,
}: ServiceImageGridProps) {
  return (
    <section className="bg-background py-16 md:py-20">
      <div className="container mx-auto px-4">
        <div className="mb-10 max-w-3xl md:mb-12">
          {eyebrow ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              {eyebrow}
            </span>
          ) : null}
          <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] tracking-tight text-text-primary md:text-4xl">
            {title}
          </h2>
          {intro ? (
            <p className="mt-4 text-base leading-relaxed text-text-secondary md:text-lg">
              {intro}
            </p>
          ) : null}
        </div>

        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <li
              key={item.label}
              className="group overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-[3px] hover:border-primary/30 hover:shadow-elegant"
            >
              <div className="relative aspect-square overflow-hidden bg-background-soft">
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <div className="px-5 py-5">
                <p className="text-base font-extrabold tracking-tight text-text-primary">
                  {item.label}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
                  {item.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
