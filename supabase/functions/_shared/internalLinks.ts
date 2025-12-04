import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Allowed origins for CORS
export const ALLOWED_ORIGINS = [
  'https://www.lavacagc.com',
  'https://lavacagc.com',
  'https://lavaca.link',
  'https://www.lavaca.link',
  'https://vacamoo.com',
  'https://www.vacamoo.com',
  'https://lavacagc-nextjs-138k.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

export const getCorsHeaders = (origin: string | null) => {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "X-XSS-Protection": "1; mode=block",
  };
};

// Available internal links for SEO
export const INTERNAL_LINKS = {
  services: [
    { name: "Kitchen Remodeling", url: "/services/kitchen-remodeling" },
    { name: "Bathroom Renovation", url: "/services/bathroom-renovation" },
    { name: "Basement Finishing", url: "/services/basement-finishing" },
    { name: "Home Additions", url: "/services/home-additions" },
  ],
  locations: [
    { name: "Alpine", url: "/locations/alpine" },
    { name: "Caldwell", url: "/locations/caldwell" },
    { name: "Essex Fells", url: "/locations/essex-fells" },
    { name: "Ho-Ho-Kus", url: "/locations/ho-ho-kus" },
    { name: "Livingston", url: "/locations/livingston" },
    { name: "Millburn", url: "/locations/millburn" },
    { name: "Montclair", url: "/locations/montclair" },
    { name: "Morristown", url: "/locations/morristown" },
    { name: "Saddle River", url: "/locations/saddle-river" },
    { name: "Short Hills", url: "/locations/short-hills" },
    { name: "Verona", url: "/locations/verona" },
    { name: "West Caldwell", url: "/locations/west-caldwell" },
    { name: "West Orange", url: "/locations/west-orange" },
  ],
  keyPages: [
    { name: "Project Calculator", url: "/project-calculator", description: "Get an instant estimate" },
    { name: "Our Process", url: "/process", description: "Learn how we work" },
    { name: "Contact Us", url: "/contact", description: "Get in touch" },
    { name: "Our Portfolio", url: "/projects", description: "View completed projects" },
    { name: "About Us", url: "/about", description: "Learn about La Vaca" },
  ],
};

// Fetch recent blog posts from Supabase
export async function fetchRecentPosts(supabaseClient: ReturnType<typeof createClient>) {
  try {
    const { data, error } = await supabaseClient
      .from('blog_posts')
      .select('title, slug')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error("Error fetching posts:", error);
      return [];
    }

    return data?.map(post => ({
      title: post.title,
      url: `/blog/${post.slug}`
    })) || [];
  } catch (err) {
    console.error("Failed to fetch recent posts:", err);
    return [];
  }
}

// Fetch recent projects from Supabase
export async function fetchRecentProjects(supabaseClient: ReturnType<typeof createClient>) {
  try {
    const { data, error } = await supabaseClient
      .from('projects')
      .select('title, url_slug, service_types, location')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error("Error fetching projects:", error);
      return [];
    }

    return data?.map(project => ({
      title: project.title,
      url: `/projects/${project.url_slug}`,
      serviceTypes: project.service_types,
      location: project.location
    })) || [];
  } catch (err) {
    console.error("Failed to fetch recent projects:", err);
    return [];
  }
}

// Build internal links context for AI prompts
export function buildLinksContext(
  recentPosts: { title: string; url: string }[],
  recentProjects: { title: string; url: string; serviceTypes?: string[]; location?: string }[],
  linkCount: string = "3-5"
): string {
  return `
AVAILABLE INTERNAL LINKS FOR SEO (use ${linkCount} naturally throughout the article):

Services (link when discussing specific remodeling types):
${INTERNAL_LINKS.services.map(s => `- "${s.name}": ${s.url}`).join('\n')}

NJ Locations (link when mentioning towns we serve):
${INTERNAL_LINKS.locations.map(l => `- "${l.name}": ${l.url}`).join('\n')}

Key Pages:
${INTERNAL_LINKS.keyPages.map(p => `- "${p.name}" (${p.description}): ${p.url}`).join('\n')}

${recentPosts.length > 0 ? `Related Blog Posts (link when referencing topics we've covered):
${recentPosts.map(p => `- "${p.title}": ${p.url}`).join('\n')}` : ''}

${recentProjects.length > 0 ? `Portfolio Projects (link when discussing similar work, showcasing examples, or referencing completed renovations):
${recentProjects.map(p => `- "${p.title}" (${p.location || 'NJ'}): ${p.url}`).join('\n')}` : ''}

INTERNAL LINKING GUIDELINES:
1. Include ${linkCount} internal links naturally within the article
2. Use descriptive anchor text that flows with the sentence (not "click here")
3. Link to services when discussing remodeling types
4. Link to locations when mentioning NJ towns
5. Link to portfolio projects when discussing similar work or showcasing examples
6. Include at least one link to the project calculator or contact page as a soft CTA
7. Links should enhance the reader's journey, not interrupt it
8. Use markdown link format: [anchor text](/path)

EXAMPLE NATURAL LINK INTEGRATIONS:
- "If you're planning a [kitchen renovation](/services/kitchen-remodeling), consider..."
- "Homeowners in [Short Hills](/locations/short-hills) often choose..."
- "Ready to start planning? Our [project calculator](/project-calculator) can help..."
- "As we covered in our guide to [bathroom trends](/blog/bathroom-trends-2025)..."
- "See how we transformed this [Montclair kitchen](/projects/montclair-kitchen-remodel) into a chef's dream..."
`;
}

// Special formatting instructions for blog posts
export const SPECIAL_FORMATTING = `
SPECIAL FORMATTING (use these for visual variety):

For important lists or checklists, use this format:
> <!-- checklist -->
> **Title Here**
> - First item
> - Second item
> - Third item

For informational callouts:
> <!-- info -->
> **Did You Know?**
> Interesting fact or tip here.

For warnings or important notes:
> <!-- warning -->
> **Important Consideration**
> Warning or caution content here.
`;
