import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import FreeEstimateLanding from '@/components/FreeEstimateLanding';

export const revalidate = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim()
);

// Service config for dynamic content
const SERVICE_CONFIG: Record<string, { title: string; headline: string; description: string; serviceFilter: string[] }> = {
  basement: {
    title: 'Basement Finishing & Remodeling in NJ',
    headline: 'Transform Your Basement Into Living Space',
    description: 'Expert basement finishing and remodeling in Northern NJ. Legal basements, home theaters, wet bars, and more. Licensed, bonded & insured.',
    serviceFilter: ['Basement Finishing', 'Basement Remodeling', 'basement'],
  },
  kitchen: {
    title: 'Kitchen Remodeling in Northern NJ',
    headline: 'The Kitchen You\'ve Always Wanted',
    description: 'Custom kitchen remodeling in Northern NJ. Cabinets, countertops, layouts — built right by licensed contractors.',
    serviceFilter: ['Kitchen Remodeling', 'Kitchen Renovation', 'kitchen'],
  },
  bathroom: {
    title: 'Bathroom Renovation in Northern NJ',
    headline: 'Your Bathroom, Completely Reimagined',
    description: 'Full bathroom renovations in Northern NJ. Tile, fixtures, vanities, walk-in showers — licensed and insured.',
    serviceFilter: ['Bathroom Renovation', 'Bathroom Remodeling', 'bathroom'],
  },
  general: {
    title: 'Home Renovation in Northern NJ',
    headline: 'Quality Renovations by Licensed NJ Contractors',
    description: 'Full-service home remodeling in Northern NJ. Kitchens, bathrooms, basements, additions — licensed, bonded & insured.',
    serviceFilter: [],
  },
};

const CITY_HEADLINES: Record<string, string> = {
  alpine: 'Trusted by Homeowners in Alpine',
  'saddle-river': 'Trusted by Your Neighbors in Saddle River',
  millburn: 'Millburn\'s Go-To Renovation Contractor',
  livingston: 'Livingston Homeowners Trust La Vaca',
  montclair: 'Montclair\'s Favorite General Contractor',
  'west-orange': 'West Orange\'s Renovation Experts',
  'short-hills': 'Short Hills Premium Home Renovations',
  summit: 'Summit\'s Trusted Remodeling Contractor',
};

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ service?: string; city?: string }> }): Promise<Metadata> {
  const params = await searchParams;
  const service = params.service || 'general';
  const config = SERVICE_CONFIG[service] || SERVICE_CONFIG.general;

  return {
    title: `${config.title} | Free Estimate | La Vaca GC`,
    description: config.description,
    robots: { index: false, follow: false },
    openGraph: {
      title: `${config.title} | La Vaca General Contractors`,
      description: config.description,
      url: 'https://www.lavacagc.com/free-estimate',
    },
    alternates: { canonical: 'https://www.lavacagc.com/free-estimate' },
  };
}

interface Project {
  id: string;
  title: string;
  location: string;
  service_types: string[];
  challenge: string;
  solution: string;
  url_slug: string;
  project_images: Array<{
    image_url: string;
    image_category: string;
    alt_text: string;
    is_featured?: boolean;
  }>;
}

interface GoogleReview {
  id: string;
  reviewer_name: string | null;
  star_rating: number;
  comment: string | null;
  create_time: string | null;
}

async function getProjects(): Promise<Project[]> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        id, title, location, service_types, challenge, solution, url_slug
      `)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    type ProjectRow = typeof data[number];
    const projectIds = data.map((p: ProjectRow) => p.id);

    // Fetch all images for all projects
    const { data: images } = await supabase
      .from('project_images')
      .select('project_id, image_url, image_category, alt_text, is_featured')
      .in('project_id', projectIds);

    const projectsWithImages: Project[] = data.map((p: ProjectRow) => ({
      ...p,
      project_images: (images || []).filter((img: { project_id: string }) => img.project_id === p.id),
    }));

    return projectsWithImages;
  } catch {
    return [];
  }
}

async function getReviews(): Promise<GoogleReview[]> {
  try {
    const { data, error } = await supabase
      .from('google_reviews')
      .select('id, reviewer_name, star_rating, comment, create_time')
      .gte('star_rating', 4)
      .not('comment', 'is', null)
      .order('create_time', { ascending: false });

    if (error || !data) return [];
    // Filter to reviews with substantive comments (>50 chars)
    return data.filter((r: GoogleReview) => r.comment && r.comment.length > 50);
  } catch {
    return [];
  }
}

async function getBlogPost(service: string): Promise<{ title: string; slug: string; excerpt: string } | null> {
  try {
    // Map service to relevant blog search terms
    const searchTerms: Record<string, string> = {
      basement: 'basement',
      kitchen: 'kitchen',
      bathroom: 'bathroom',
      general: 'renovation',
    };
    const term = searchTerms[service] || 'renovation';

    const { data, error } = await supabase
      .from('blog_posts')
      .select('title, slug, excerpt')
      .eq('status', 'published')
      .ilike('title', `%${term}%`)
      .limit(1)
      .single();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export default async function FreeEstimatePage({ searchParams }: { searchParams: Promise<{ service?: string; city?: string; utm_campaign?: string; utm_content?: string }> }) {
  const params = await searchParams;
  const service = params.service || 'general';
  const city = params.city;
  const config = SERVICE_CONFIG[service] || SERVICE_CONFIG.general;

  // Determine headline: city override > service headline
  const headline = city && CITY_HEADLINES[city]
    ? CITY_HEADLINES[city]
    : config.headline;

  // Map service param to portfolio filter name
  const SERVICE_TO_FILTER: Record<string, string> = {
    basement: 'Basement Finishing',
    kitchen: 'Kitchen Remodeling',
    bathroom: 'Bathroom Renovation',
    general: 'All Projects',
  };
  const defaultFilter = SERVICE_TO_FILTER[service] || 'All Projects';

  const [projects, reviews, blogPost] = await Promise.all([
    getProjects(),
    getReviews(),
    getBlogPost(service),
  ]);

  return (
    <FreeEstimateLanding
      headline={headline}
      service={service}
      city={city}
      projects={projects}
      reviews={reviews}
      blogPost={blogPost}
      utmCampaign={params.utm_campaign}
      utmContent={params.utm_content}
      defaultFilter={defaultFilter}
    />
  );
}
