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
  verona: 'Verona\'s Most Trusted Renovation Contractor',
};

// UTM content → personalized landing page content
// This maps each ad's utm_content tag to messaging that continues the ad's story
const UTM_CONTENT_MAP: Record<string, {
  headline: string;
  subheadline: string;
  service?: string;
  city?: string;
  formHeading?: string;
  formSubheading?: string;
}> = {
  // === Hot Conversion / Review ads ===
  'sean-conversion-B': {
    headline: '"No Hidden Fees. The Kitchen Came Out Exactly as Promised."',
    subheadline: 'See why Sean rated us 5 stars. Get the same transparent pricing — your free, itemized estimate is one click away.',
    service: 'kitchen',
    formHeading: 'Get Your Itemized Estimate',
    formSubheading: 'Every cost broken down. No surprises, no hidden fees.',
  },
  'njs-highest-rated-choice': {
    headline: 'NJ\'s Highest-Rated General Contractor',
    subheadline: '5.0★ on Google with every review verified. See what transparent pricing and daily updates look like.',
    formHeading: 'Get Your Free Estimate',
    formSubheading: 'Join our 5-star clients. We respond within 2 hours.',
  },
  'top-rated-contractors-in-fort-lee': {
    headline: 'Fort Lee\'s Top-Rated Renovation Contractor',
    subheadline: 'Licensed, insured, and trusted by your neighbors. Get a free, detailed estimate for your project.',
    formHeading: 'Get Your Free Estimate',
    formSubheading: 'Serving Fort Lee and Northern NJ. We respond within 2 hours.',
  },
  'review-sean-hot-wetbar-b': {
    headline: 'From Unfinished Basement to Stunning Wet Bar',
    subheadline: '"Transparent pricing from day one. No surprise charges." — Sean M., ★★★★★. Get the same experience.',
    service: 'basement',
    formHeading: 'Get Your Basement Estimate',
    formSubheading: 'Wet bars, home theaters, legal living space — we do it all.',
  },
  'review-sean-hot-enhanced-b': {
    headline: 'On Time. On Budget. Exactly as Promised.',
    subheadline: '"The kitchen came out exactly as promised — on time and on budget." — Sean M., ★★★★★',
    service: 'kitchen',
    formHeading: 'Get Your Free Kitchen Estimate',
    formSubheading: 'Itemized quote with every cost broken down.',
  },
  'transparency-estimate-B': {
    headline: 'Know Exactly What Your Renovation Will Cost',
    subheadline: 'Itemized quote with every cost broken down. No hidden fees, no surprise charges. 100% transparent pricing.',
    formHeading: 'Get Your Itemized Estimate',
    formSubheading: 'Every line item detailed. No surprises.',
  },
  // === Spring Urgency ads ===
  'spring-schedules-filling-up': {
    headline: 'Spring Schedules Are Filling Up Fast',
    subheadline: 'Lock in spring pricing before summer rates kick in. Free estimate, no obligation — start as early as next month.',
    formHeading: 'Lock In Spring Pricing',
    formSubheading: 'Limited spring spots available. We respond within 2 hours.',
  },
  'spring-slots-B': {
    headline: 'Only a Few Spring Slots Left',
    subheadline: 'Contractors get fully booked by May. Lock in spring pricing now — free estimate, no obligation.',
    formHeading: 'Reserve Your Spring Spot',
    formSubheading: 'Free estimate. Start as early as next month.',
  },
  // === Educational / ROI ads ===
  'roi-calculator-B': {
    headline: 'What\'s the Real ROI on Your Renovation?',
    subheadline: 'Kitchen remodel: 75-80% ROI. Bathroom: 70-78%. Find out exactly what your project would cost — and how much value it adds.',
    service: 'kitchen',
    formHeading: 'Get Your Free ROI Analysis',
    formSubheading: 'Cost breakdown + home value impact included.',
  },
  // === Local City ads ===
  'verona-social-A': {
    headline: 'Verona Homeowners Trust La Vaca',
    subheadline: 'Join your neighbors who got transparent pricing, daily updates, and results they love.',
    city: 'verona',
    formHeading: 'Get Your Free Estimate',
    formSubheading: 'Serving Verona and all of Northern NJ.',
  },
  'verona-transparency-B': {
    headline: 'Verona\'s Most Transparent Contractor',
    subheadline: 'Itemized quotes. No hidden fees. Written timelines. Every cost broken down before work begins.',
    city: 'verona',
    formHeading: 'Get Your Itemized Estimate',
    formSubheading: 'Every cost broken down. No surprises.',
  },
  'millburn-roi-A': {
    headline: 'Premium Renovations for Millburn Homeowners',
    subheadline: 'Kitchen ROI: 75-80%. Bathroom: 70-78%. Find out what your Millburn renovation would cost — and the value it adds.',
    city: 'millburn',
    formHeading: 'Get Your Free ROI Estimate',
    formSubheading: 'Cost + home value analysis included.',
  },
  'millburn-review-B': {
    headline: '"Transparent Pricing From Day One" — Sean M.',
    subheadline: 'No surprise charges, no hidden fees. Serving Millburn & Short Hills. Get the same 5-star experience.',
    city: 'millburn',
    service: 'kitchen',
    formHeading: 'Get Your Free Kitchen Estimate',
    formSubheading: 'Serving Millburn & Short Hills homeowners.',
  },
  'montclair-social-A': {
    headline: 'Montclair Homeowners Trust La Vaca',
    subheadline: 'Kitchen, bathroom, or basement — get transparent pricing and daily updates on your project.',
    city: 'montclair',
    formHeading: 'Get Your Free Estimate',
    formSubheading: 'Serving Montclair and all of Northern NJ.',
  },
  'montclair-spring-B': {
    headline: 'Montclair — Spring Projects Are Booking Now',
    subheadline: 'Lock in spring pricing before summer rates kick in. Free estimate, no obligation.',
    city: 'montclair',
    formHeading: 'Lock In Spring Pricing',
    formSubheading: 'Limited spring spots. We respond within 2 hours.',
  },
  'alpine-stats-B': {
    headline: 'Alpine\'s Trusted Renovation Contractor',
    subheadline: '50+ NJ projects completed. 5.0★ Google rating. 24-hour response time guaranteed.',
    city: 'alpine',
    formHeading: 'Get Your Free Estimate',
    formSubheading: 'Serving Alpine and Bergen County.',
  },
  // === Home Additions ===
  'additions-value-A': {
    headline: 'A Home Addition Adds $75K–$150K to Your Home Value',
    subheadline: 'Avg. cost per sq ft in NJ: $200–$350. Typical ROI: 50–65%. Find out exactly what your addition would cost.',
    formHeading: 'Get Your Free Addition Estimate',
    formSubheading: 'Floor plan + cost breakdown + ROI projection included.',
  },
  'additions-cost-B': {
    headline: 'What Does a Home Addition Actually Cost in NJ?',
    subheadline: 'Full architectural planning, all permits handled, itemized costs — no surprises. Get your free detailed estimate.',
    formHeading: 'Get Your Free Cost Breakdown',
    formSubheading: 'Floor plan • Cost breakdown • Timeline • ROI projection.',
  },
  // === Basement ads ===
  'basement-value-B': {
    headline: 'Your Unfinished Basement Is Costing You $40K+',
    subheadline: 'That unused space could be adding serious value to your home. Find out exactly what a finished basement would cost.',
    service: 'basement',
    formHeading: 'Get Your Basement Estimate',
    formSubheading: 'Legal basements, home theaters, wet bars — we do it all.',
  },
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
    media_type?: string;
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
      .select('project_id, image_url, image_category, alt_text, is_featured, media_type')
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
  
  // Check UTM content for ad-specific personalization first
  const utmMatch = params.utm_content ? UTM_CONTENT_MAP[params.utm_content] : null;
  
  const service = utmMatch?.service || params.service || 'general';
  const city = utmMatch?.city || params.city;
  const config = SERVICE_CONFIG[service] || SERVICE_CONFIG.general;

  // Priority: UTM match headline > city headline > service headline
  const headline = utmMatch?.headline
    ? utmMatch.headline
    : city && CITY_HEADLINES[city]
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
      subheadline={utmMatch?.subheadline}
      service={service}
      city={city}
      projects={projects}
      reviews={reviews}
      blogPost={blogPost}
      utmCampaign={params.utm_campaign}
      utmContent={params.utm_content}
      defaultFilter={defaultFilter}
      formHeading={utmMatch?.formHeading}
      formSubheading={utmMatch?.formSubheading}
    />
  );
}
