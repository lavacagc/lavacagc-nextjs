import { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PortfolioContent from '@/components/PortfolioContent';

// Revalidate every 60 seconds
export const revalidate = 60;

// Server-side Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
);

export const metadata: Metadata = {
  title: 'Project Portfolio | Home Renovation Case Studies | La Vaca General Contractors',
  description:
    'Explore our completed home renovation projects in Northern NJ. View before/after photos, budgets, timelines, and client testimonials. Kitchen remodels, bathroom renovations, and more.',
  keywords:
    'home renovation portfolio, NJ remodeling projects, before after photos, kitchen remodel examples, bathroom renovation gallery, contractor portfolio',
  openGraph: {
    title: 'Project Portfolio | La Vaca General Contractors',
    description:
      'Explore our completed home renovation projects with detailed case studies, before/after photos, and client testimonials.',
    type: 'website',
    url: 'https://www.lavacagc.com/portfolio',
    images: [
      {
        url: 'https://www.lavacagc.com/og-portfolio.jpg',
        width: 1200,
        height: 630,
        alt: 'La Vaca General Contractors Project Portfolio',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Project Portfolio | La Vaca GC',
    description: 'Home renovation case studies with before/after photos',
  },
  alternates: {
    canonical: 'https://www.lavacagc.com/portfolio',
  },
};

interface Project {
  id: string;
  title: string;
  location: string;
  service_types: string[];
  challenge: string;
  solution: string;
  featured_image_id: string;
  url_slug: string;
  project_images: Array<{
    image_url: string;
    image_category: string;
    alt_text: string;
    media_type?: 'image' | 'video';
    is_featured?: boolean;
  }>;
}

async function getProjects(): Promise<Project[]> {
  try {
    const { data: projectsData, error } = await supabase
      .from('projects')
      .select(
        `
        id,
        title,
        location,
        service_types,
        challenge,
        solution,
        featured_image_id,
        url_slug
      `
      )
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading projects:', error);
      return [];
    }

    // Fetch project images separately
    const projectsWithImages = await Promise.all(
      (projectsData || []).map(async (project) => {
        const { data: images } = await supabase
          .from('project_images')
          .select('image_url, image_category, alt_text, media_type, is_featured')
          .eq('project_id', project.id)
          .order('sort_order');

        return {
          ...project,
          project_images: (images || []).map((img) => ({
            ...img,
            media_type: (img.media_type as 'image' | 'video') || 'image',
          })),
        };
      })
    );

    return projectsWithImages;
  } catch (err) {
    console.error('Failed to fetch projects:', err);
    return [];
  }
}

export default async function Portfolio() {
  const projects = await getProjects();

  // JSON-LD Schema for Portfolio/Collection
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'La Vaca General Contractors Project Portfolio',
    description:
      'Completed home renovation projects in Northern New Jersey with case studies and testimonials',
    url: 'https://www.lavacagc.com/portfolio',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: projects.length,
      itemListElement: projects.slice(0, 10).map((project, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Service',
          name: project.title,
          description: project.challenge || project.solution,
          provider: {
            '@type': 'LocalBusiness',
            name: 'La Vaca General Contractors',
          },
          areaServed: {
            '@type': 'City',
            name: project.location,
          },
          url: `https://www.lavacagc.com/projects/${project.url_slug}`,
          image: project.project_images?.find(img => img.is_featured)?.image_url || project.project_images?.[0]?.image_url,
        },
      })),
    },
    provider: {
      '@type': 'LocalBusiness',
      name: 'La Vaca General Contractors',
      url: 'https://www.lavacagc.com',
      telephone: '(201) 212-4917',
      address: {
        '@type': 'PostalAddress',
        addressRegion: 'NJ',
        addressCountry: 'US',
      },
    },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="flex-1">
        {/* Hero Section - Server Rendered for SEO */}
        <section className="py-8 md:py-16 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
                Project Portfolio
              </h1>
              <p className="text-xl text-text-secondary leading-relaxed mb-8">
                Explore our completed projects with detailed case studies, before/after photos,
                budgets, and client testimonials. See the quality and craftsmanship that sets us
                apart.
              </p>

              {/* Portfolio Stats */}
              <div className="grid grid-cols-2 gap-8 max-w-xl mx-auto">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">{projects.length}+</div>
                  <div className="text-text-secondary">Completed Projects</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">100%</div>
                  <div className="text-text-secondary">Client Satisfaction</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Portfolio Content - Client Component */}
        <PortfolioContent projects={projects} />

        {/* CTA Section - Server Rendered */}
        <section className="py-8 md:py-16 bg-primary">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-6 text-primary-foreground">
                Ready to Start Your Dream Project?
              </h2>
              <p className="text-xl mb-8 text-primary-foreground/90">
                Let&apos;s create a custom solution that fits your vision and budget.
              </p>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-background text-text-primary hover:bg-background/90 h-11 px-8"
              >
                Get Your Free Estimate
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
