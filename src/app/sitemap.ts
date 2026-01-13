import { MetadataRoute } from 'next'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/integrations/supabase/types'

// Create a static client for build-time data fetching (no cookies/SSR)
function getStaticSupabaseClient() {
  const supabaseUrl = "https://xrvbrnrbnyfdwkfdoepq.supabase.co"
  const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhydmJybnJibnlmZHdrZmRvZXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NzIyNTAsImV4cCI6MjA3NDM0ODI1MH0.TL9cUCyaApPjWl8YEW455JgCUSa6S2qsoRpZ8iATl10"
  return createSupabaseClient<Database>(supabaseUrl, supabaseKey)
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.lavacagc.com'
  const currentDate = new Date()

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
      url: `${baseUrl}/project-calculator`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.7,
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
  ]

  // Service pages
  const services = ['kitchen-remodeling', 'bathroom-renovation', 'basement-finishing', 'home-additions', 'whole-home-remodeling']
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
  services.forEach(service => {
    locations.forEach(location => {
      routes.push({
        url: `${baseUrl}/locations/${location}/services/${service}`,
        lastModified: currentDate,
        changeFrequency: 'monthly',
        priority: 0.8,
      })
    })
  })

  // Fetch dynamic blog posts from Supabase (using static client)
  try {
    const supabase = getStaticSupabaseClient()
    const { data: posts } = await supabase
      .from('blog_posts')
      .select('slug, updated_at, published')
      .eq('published', true)
      .order('updated_at', { ascending: false })

    if (posts && posts.length > 0) {
      posts.forEach(post => {
        routes.push({
          url: `${baseUrl}/blog/${post.slug}`,
          lastModified: new Date(post.updated_at),
          changeFrequency: 'monthly',
          priority: 0.7,
        })
      })
    }
  } catch (error) {
    console.error('Error fetching blog posts for sitemap:', error)
  }

  // Fetch dynamic project pages from Supabase (using static client)
  try {
    const supabase = getStaticSupabaseClient()
    const { data: projects } = await supabase
      .from('projects')
      .select('url_slug, updated_at, active')
      .eq('active', true)
      .order('updated_at', { ascending: false })

    if (projects && projects.length > 0) {
      projects.forEach(project => {
        routes.push({
          url: `${baseUrl}/projects/${project.url_slug}`,
          lastModified: new Date(project.updated_at),
          changeFrequency: 'yearly',
          priority: 0.6,
        })
      })
    }
  } catch (error) {
    console.error('Error fetching projects for sitemap:', error)
  }

  return routes
}
