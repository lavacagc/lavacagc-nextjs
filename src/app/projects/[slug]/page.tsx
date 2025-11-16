import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ProjectDetailClient from '@/components/ProjectDetailClient';

// Revalidate every 60 seconds (ISR - Incremental Static Regeneration)
export const revalidate = 60;

// Server-side Supabase client (trim to handle any whitespace in env vars)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim()
);

interface ProjectData {
  id: string;
  title: string;
  location: string;
  service_types: string[];
  challenge: string;
  solution: string;
  materials_used: string[];
  special_features: string[];
  duration: string;
  date_completed: string;
  testimonial_text: string;
  testimonial_rating: number;
  client_first_name: string;
  seo_title: string;
  meta_description: string;
  budget_range: string;
  url_slug: string;
  project_images: Array<{
    id: string;
    image_url: string;
    image_category: string;
    alt_text: string;
    is_featured: boolean;
    media_type?: 'image' | 'video';
  }>;
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getProject(slug: string): Promise<ProjectData | null> {
  try {
    // First try to find by URL slug
    let { data, error } = await supabase
      .from('projects')
      .select(
        `
        *,
        project_images!project_images_project_id_fkey(*)
      `
      )
      .eq('url_slug', slug)
      .eq('active', true)
      .maybeSingle();

    // If not found by slug, try by ID
    if (!data && !error) {
      const { data: projectById, error: errorById } = await supabase
        .from('projects')
        .select(
          `
          *,
          project_images!project_images_project_id_fkey(*)
        `
        )
        .eq('id', slug)
        .eq('active', true)
        .maybeSingle();

      data = projectById;
      error = errorById;
    }

    if (error) {
      console.error('Database error:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    // Ensure project_images is always an array with proper type casting
    const projectImages = Array.isArray(data.project_images)
      ? data.project_images
      : data.project_images
        ? [data.project_images]
        : [];

    const projectData: ProjectData = {
      id: data.id,
      title: data.title,
      location: data.location,
      service_types: data.service_types || [],
      challenge: data.challenge || '',
      solution: data.solution || '',
      materials_used: data.materials_used || [],
      special_features: data.special_features || [],
      duration: data.duration || '',
      date_completed: data.date_completed || '',
      testimonial_text: data.testimonial_text || '',
      testimonial_rating: data.testimonial_rating || 0,
      client_first_name: data.client_first_name || '',
      seo_title: data.seo_title || '',
      meta_description: data.meta_description || '',
      budget_range: data.budget_range || '',
      url_slug: data.url_slug || data.id,
      project_images: projectImages.map((img: Record<string, unknown>) => ({
        id: img.id as string,
        image_url: img.image_url as string,
        image_category: img.image_category as string,
        alt_text: img.alt_text as string,
        is_featured: img.is_featured as boolean,
        media_type: (img.media_type as 'image' | 'video') || 'image',
      })),
    };

    return projectData;
  } catch (err) {
    console.error('Failed to fetch project:', err);
    return null;
  }
}

// Generate static params for pre-rendering
export async function generateStaticParams() {
  const { data: projects } = await supabase
    .from('projects')
    .select('url_slug, id')
    .eq('active', true)
    .limit(50);

  return (projects || []).map((project) => ({
    slug: project.url_slug || project.id,
  }));
}

// Dynamic metadata for SEO
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProject(slug);

  if (!project) {
    return {
      title: 'Project Not Found | La Vaca General Contractors',
      description: 'The requested project could not be found.',
    };
  }

  const title =
    project.seo_title ||
    `${project.title} - ${project.service_types[0] || 'Renovation'} in ${project.location} | La Vaca GC`;
  const description =
    project.meta_description ||
    project.challenge ||
    `View our ${project.service_types[0] || 'renovation'} project in ${project.location}. Quality craftsmanship by La Vaca General Contractors.`;
  const keywords = `${project.service_types.join(', ')}, ${project.location}, home renovation, NJ contractor, La Vaca General Contractors`;

  const featuredImage = project.project_images.find((img) => img.is_featured) || project.project_images[0];

  return {
    title,
    description,
    keywords,
    openGraph: {
      title: project.title,
      description,
      type: 'article',
      url: `https://www.lavacagc.com/projects/${project.url_slug}`,
      images: featuredImage
        ? [
            {
              url: featuredImage.image_url,
              width: 1200,
              height: 630,
              alt: featuredImage.alt_text || project.title,
            },
          ]
        : [],
      siteName: 'La Vaca General Contractors',
    },
    twitter: {
      card: 'summary_large_image',
      title: project.title,
      description,
      images: featuredImage ? [featuredImage.image_url] : [],
    },
    alternates: {
      canonical: `https://www.lavacagc.com/projects/${project.url_slug}`,
    },
  };
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const project = await getProject(slug);

  if (!project) {
    notFound();
  }

  // JSON-LD Schema for Service/Product
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: project.title,
    description: project.challenge || project.solution,
    provider: {
      '@type': 'LocalBusiness',
      name: 'La Vaca General Contractors',
      url: 'https://www.lavacagc.com',
      telephone: '(201) 212-4917',
      address: {
        '@type': 'PostalAddress',
        addressLocality: project.location,
        addressRegion: 'NJ',
        addressCountry: 'US',
      },
      aggregateRating: project.testimonial_rating
        ? {
            '@type': 'AggregateRating',
            ratingValue: project.testimonial_rating,
            bestRating: 5,
            ratingCount: 1,
          }
        : undefined,
    },
    areaServed: {
      '@type': 'City',
      name: project.location,
    },
    serviceType: project.service_types,
    url: `https://www.lavacagc.com/projects/${project.url_slug}`,
    image: project.project_images.map((img) => img.image_url),
    ...(project.testimonial_text && {
      review: {
        '@type': 'Review',
        reviewRating: {
          '@type': 'Rating',
          ratingValue: project.testimonial_rating,
          bestRating: 5,
        },
        author: {
          '@type': 'Person',
          name: project.client_first_name || 'Client',
        },
        reviewBody: project.testimonial_text,
      },
    }),
  };

  // Breadcrumb Schema
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://www.lavacagc.com',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Portfolio',
        item: 'https://www.lavacagc.com/portfolio',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: project.title,
        item: `https://www.lavacagc.com/projects/${project.url_slug}`,
      },
    ],
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* JSON-LD Structured Data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <main className="flex-1">
        {/* Interactive Project Content - Client Component */}
        <ProjectDetailClient project={project} />
      </main>

      <Footer />
    </div>
  );
}
