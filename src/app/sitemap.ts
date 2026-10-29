import { MetadataRoute } from 'next'
import { unstable_cache } from 'next/cache'
import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/integrations/supabase/types'
import { getAllResourceSlugs } from '@/data/resourceData'
import { SERVICE_SLUGS } from '@/lib/home-services/catalog'
import { getCatalog } from '@/lib/home-services/catalogData'
import { SITEMAP_TAG } from '@/lib/revalidate'

// Create a static client for build-time data fetching (no cookies/SSR)
function getStaticSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createSupabaseClient<Database>(supabaseUrl, supabaseKey)
}

const isBuildOffVercel = () => process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD && !process.env.VERCEL

// Each database list is cached under SITEMAP_TAG, which every blog and project
// writer expires. A failed read throws inside the cache, so it is never stored.
function cachedRows<T>(
  key: string,
  read: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): () => Promise<T[]> {
  return unstable_cache(async () => {
    const { data, error } = await read()
    if (error) throw new Error(error.message)
    return data ?? []
  }, ['sitemap', key], { tags: [SITEMAP_TAG], revalidate: 3600 })
}

const readPosts = cachedRows('blog-posts', () => getStaticSupabaseClient()
  .from('blog_posts')
  .select('slug, updated_at, published')
  .eq('published', true)
  .order('updated_at', { ascending: false }))

const readProjects = cachedRows('projects', () => getStaticSupabaseClient()
  .from('projects')
  .select('url_slug, updated_at, active')
  .eq('active', true)
  .order('updated_at', { ascending: false }))

async function readOrThrow<T>(what: string, read: () => Promise<T[]>): Promise<T[]> {
  try {
    return await read()
  } catch (err) {
    const failure = err instanceof Error ? err.message : err
    console.error(`sitemap: ${what} read failed:`, failure)
    if (isBuildOffVercel()) return []
    throw new Error(`sitemap: ${what} read failed: ${String(failure)}`)
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.lavacagc.com'
  const currentDate = new Date()
  // Only the services the admin has switched on get an entry (CAT4). The read
  // is the same tagged cache the pages use; if it fails the seven fixed slugs
  // stand in, so a database blip never empties the sitemap.
  const homeServiceSlugs = await getCatalog()
    .then((services) => services.map((service) => service.slug))
    .catch((err) => {
      console.error('sitemap: home services read failed, listing every slug:', err instanceof Error ? err.message : String(err))
      return [...SERVICE_SLUGS]
    })
  // Home services pages come in English and Spanish (?lang=es); both entries
  // carry the same hreflang set the pages declare in <head>.
  const homeServicesAlternates = (suffix: string) => ({
    languages: {
      en: `${baseUrl}/home-services${suffix}`,
      es: `${baseUrl}/home-services${suffix}?lang=es`,
      'x-default': `${baseUrl}/home-services${suffix}`,
    },
  })

  // Static routes
  const routes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/services`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/home-services`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: homeServicesAlternates(''),
    },
    // One page per active priced home service (LP10, CAT4), from the table so
    // a service switched off in the admin leaves the sitemap with its page.
    ...homeServiceSlugs.map((slug) => ({
      url: `${baseUrl}/home-services/${slug}`,
      lastModified: currentDate,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
      alternates: homeServicesAlternates(`/${slug}`),
    })),
    // The Spanish versions are their own canonical URLs (?lang=es), the ones
    // Spanish listing links use, so they are listed too.
    ...['', ...homeServiceSlugs.map((slug) => `/${slug}`)].map((suffix) => ({
      url: `${baseUrl}/home-services${suffix}?lang=es`,
      lastModified: currentDate,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
      alternates: homeServicesAlternates(suffix),
    })),
    {
      url: `${baseUrl}/commercial-services`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/request-estimate`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/portfolio`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/process`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/warranty`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/free-estimate`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/reviews`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/locations`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/referral`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/home-care`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/home-care/whats-new`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/home-care/guides/spring`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/home-care/guides/summer`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/home-care/guides/fall`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/home-care/guides/winter`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/resources`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ]

  // Resource article pages
  const resourceSlugs = getAllResourceSlugs()
  resourceSlugs.forEach(slug => {
    routes.push({
      url: `${baseUrl}/resources/${slug}`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.7,
    })
  })

  // Service pages
  const services = ['kitchen-remodeling', 'bathroom-renovation', 'basement-finishing', 'home-additions', 'whole-home-remodeling', 'interior-finishing']
  services.forEach(service => {
    routes.push({
      url: `${baseUrl}/services/${service}`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.9,
    })
  })

  // Location pages - must match VALID_CITIES in location page components
  const locations = [
    'alpine', 'bloomfield', 'caldwell', 'clifton', 'essex-fells', 'ho-ho-kus',
    'livingston', 'madison', 'maplewood', 'millburn', 'montclair', 'morristown',
    'parsippany', 'saddle-river', 'short-hills', 'verona', 'west-caldwell', 'west-orange'
  ]
  locations.forEach(location => {
    routes.push({
      url: `${baseUrl}/locations/${location}`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.7,
    })
    // City services hub page
    routes.push({
      url: `${baseUrl}/locations/${location}/services`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.7,
    })
  })

  // Service-location combination pages (e.g., /locations/alpine/services/kitchen-remodeling)
  // These are the actual page URLs - the old format (/kitchen-remodeling-alpine-nj) redirects to these
  //
  // NOTE: must stay in sync with the SERVICES map in
  // src/app/locations/[city]/services/[service]/page.tsx. 'whole-home-remodeling'
  // is deliberately NOT a city-level page - next.config.ts 301s those 18 URLs to
  // /services/whole-home-remodeling - so listing it here would advertise 18
  // permanently-redirecting URLs in the sitemap.
  const cityServices = services.filter(s => s !== 'whole-home-remodeling')
  cityServices.forEach(service => {
    locations.forEach(location => {
      routes.push({
        url: `${baseUrl}/locations/${location}/services/${service}`,
        lastModified: currentDate,
        changeFrequency: 'monthly',
        priority: 0.8,
      })
    })
  })

  // A failed read throws rather than listing nothing: during an ISR
  // regeneration Next then keeps serving the last good sitemap, and a deploy
  // build on Vercel fails instead of shipping one without posts or projects.
  // Builds off Vercel (pre-push, CI, the gate) point at a stub or at nothing,
  // so there the database entries are left out and the build goes on.
  const [posts, projects] = await Promise.all([
    readOrThrow('blog posts', readPosts),
    readOrThrow('projects', readProjects),
  ])

  posts.forEach(post => {
    routes.push({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: new Date(post.updated_at),
      changeFrequency: 'monthly',
      priority: 0.7,
    })
  })

  projects.forEach(project => {
    routes.push({
      url: `${baseUrl}/projects/${project.url_slug}`,
      lastModified: new Date(project.updated_at),
      changeFrequency: 'yearly',
      priority: 0.6,
    })
  })

  return routes
}


// ISR, explicit: the sitemap regenerates at least hourly. On-demand refresh
// does NOT come from revalidatePath('/sitemap.xml'): on Vercel that call does
// not take effect for this metadata route (2026-10-29, an article published at
// 20:47Z was still missing at 21:00Z, x-vercel-cache HIT, while the hourly
// regeneration at 20:37Z had picked up one published at 20:28Z). So the post
// and project reads above are cached under SITEMAP_TAG, and every blog and
// project writer (revalidateArticlePages, revalidateProjectPages and
// /api/admin/revalidate) expires that tag alongside the path.
export const revalidate = 3600;
