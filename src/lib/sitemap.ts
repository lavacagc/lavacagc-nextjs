/**
 * Every entry of the public sitemap, served as XML by the route handler at
 * src/app/api/sitemap/route.ts and reached at /sitemap.xml through a rewrite
 * in next.config.ts. Why it is not a src/app/sitemap.ts metadata route any
 * more is explained there.
 *
 * The database lists are the only parts that change between deploys. Each is
 * cached under SITEMAP_TAG, which every blog and project writer expires
 * (revalidateArticlePages, revalidateProjectPages and /api/admin/revalidate)
 * along with revalidatePath('/api/sitemap').
 */
import type { MetadataRoute } from 'next'
import { unstable_cache } from 'next/cache'
import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'
import { getAllResourceSlugs } from '@/data/resourceData'
import { SERVICE_SLUGS } from '@/lib/home-services/catalog'
import { getCatalog } from '@/lib/home-services/catalogData'
import { SITEMAP_TAG } from '@/lib/revalidate'

export const SITE_URL = 'https://www.lavacagc.com'

export type SitemapDb = SupabaseClient<Database>
export type SitemapPost = { slug: string; updated_at: string }
export type SitemapProject = { url_slug: string; updated_at: string }

/** Where the changing parts of the sitemap come from. */
export interface SitemapSources {
  posts: () => Promise<SitemapPost[]>
  projects: () => Promise<SitemapProject[]>
  homeServiceSlugs: () => Promise<string[]>
}

// A static client for data fetching (no cookies), so the route stays cacheable.
function getStaticSupabaseClient(): SitemapDb {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createSupabaseClient<Database>(supabaseUrl, supabaseKey)
}

const isBuildOffVercel = () => process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD && !process.env.VERCEL

type RowsResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** Published blog posts only: a draft or an unpublished post is never listed. */
export function selectPublishedPosts(db: SitemapDb): RowsResult<SitemapPost> {
  return db
    .from('blog_posts')
    .select('slug, updated_at, published')
    .eq('published', true)
    .order('updated_at', { ascending: false })
}

/** Active projects only: a draft project is never listed. */
export function selectActiveProjects(db: SitemapDb): RowsResult<SitemapProject> {
  return db
    .from('projects')
    .select('url_slug, updated_at, active')
    .eq('active', true)
    .order('updated_at', { ascending: false })
}

async function rowsOrThrow<T>(read: () => RowsResult<T>): Promise<T[]> {
  const { data, error } = await read()
  if (error) throw new Error(error.message)
  return data ?? []
}

// Each database list is cached under SITEMAP_TAG, which every blog and project
// writer expires. A failed read throws inside the cache, so it is never stored.
function cachedRows<T>(key: string, read: () => RowsResult<T>): () => Promise<T[]> {
  return unstable_cache(() => rowsOrThrow(read), ['sitemap', key], { tags: [SITEMAP_TAG], revalidate: 3600 })
}

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

/**
 * The sources the live sitemap uses: the tagged caches above, and the home
 * services catalog (the same tagged cache the pages use). If the catalog read
 * fails the seven fixed slugs stand in, so a database blip never empties the
 * sitemap of its service pages.
 */
export const cachedSitemapSources: SitemapSources = {
  posts: cachedRows('blog-posts', () => selectPublishedPosts(getStaticSupabaseClient())),
  projects: cachedRows('projects', () => selectActiveProjects(getStaticSupabaseClient())),
  homeServiceSlugs: async () => {
    try {
      return (await getCatalog()).map((service) => service.slug)
    } catch (err) {
      console.error('sitemap: home services read failed, listing every slug:', err instanceof Error ? err.message : String(err))
      return [...SERVICE_SLUGS]
    }
  },
}

/** Uncached sources over a given client (scripts and unit tests, outside Next). */
export function sitemapSourcesFrom(db: SitemapDb, homeServiceSlugs: readonly string[] = SERVICE_SLUGS): SitemapSources {
  return {
    posts: () => rowsOrThrow(() => selectPublishedPosts(db)),
    projects: () => rowsOrThrow(() => selectActiveProjects(db)),
    homeServiceSlugs: async () => [...homeServiceSlugs],
  }
}

export async function buildSitemapEntries(sources: SitemapSources = cachedSitemapSources): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL
  const currentDate = new Date()
  // Only the services the admin has switched on get an entry (CAT4).
  const homeServiceSlugs = await sources.homeServiceSlugs()
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
    readOrThrow('blog posts', sources.posts),
    readOrThrow('projects', sources.projects),
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
