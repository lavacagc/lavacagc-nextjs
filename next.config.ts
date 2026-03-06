import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // TODO: Remove once all type errors are fixed — ~54 pre-existing issues from canary→stable migration
  typescript: {
    ignoreBuildErrors: true,
  },

  // Image optimization
  images: {
    formats: ['image/webp', 'image/avif'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'xrvbrnrbnyfdwkfdoepq.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Compression
  compress: true,

  // Headers for security and performance
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://api.ipify.org https://www.google.com https://www.gstatic.com https://www.recaptcha.net https://recaptcha.google.com https://connect.facebook.net",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https: http:",
              "font-src 'self' https://fonts.gstatic.com https://r2cdn.perplexity.ai",
              "media-src 'self' https://xrvbrnrbnyfdwkfdoepq.supabase.co",
              "connect-src 'self' data: blob: https://xrvbrnrbnyfdwkfdoepq.supabase.co https://www.google-analytics.com https://www.googletagmanager.com https://api.ipify.org https://www.google.com https://www.recaptcha.net https://recaptcha.google.com https://www.facebook.com https://connect.facebook.net",
              "worker-src 'self' blob:",
              "frame-src 'self' https://www.googletagmanager.com https://www.google.com https://www.recaptcha.net https://recaptcha.google.com",
              "frame-ancestors 'self'",
              "form-action 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "upgrade-insecure-requests"
            ].join('; ')
          }
        ],
      },
      // Cache static assets for 1 year
      {
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Cache images for 1 week
      {
        source: '/:all*(svg|jpg|jpeg|png|webp|avif|gif|ico)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400',
          },
        ],
      },
    ]
  },

  // Redirects for legacy URLs from old website
  async redirects() {
    return [
      // ============================================
      // NON-WWW → WWW REDIRECT (SEO consolidation)
      // ============================================
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'lavacagc.com' }],
        destination: 'https://www.lavacagc.com/:path*',
        permanent: true,
      },
      // ============================================
      // OLD SERVICE + CITY URL FORMAT REDIRECTS
      // Pattern: /service-city-nj → /locations/city/services/service
      // ============================================

      // Kitchen Remodeling
      { source: '/kitchen-remodeling-alpine-nj', destination: '/locations/alpine/services/kitchen-remodeling', permanent: true },
      { source: '/kitchen-remodeling-caldwell-nj', destination: '/locations/caldwell/services/kitchen-remodeling', permanent: true },
      { source: '/kitchen-remodeling-essex-fells-nj', destination: '/locations/essex-fells/services/kitchen-remodeling', permanent: true },
      { source: '/kitchen-remodeling-ho-ho-kus-nj', destination: '/locations/ho-ho-kus/services/kitchen-remodeling', permanent: true },
      { source: '/kitchen-remodeling-livingston-nj', destination: '/locations/livingston/services/kitchen-remodeling', permanent: true },
      { source: '/kitchen-remodeling-millburn-nj', destination: '/locations/millburn/services/kitchen-remodeling', permanent: true },
      { source: '/kitchen-remodeling-montclair-nj', destination: '/locations/montclair/services/kitchen-remodeling', permanent: true },
      { source: '/kitchen-remodeling-morristown-nj', destination: '/locations/morristown/services/kitchen-remodeling', permanent: true },
      { source: '/kitchen-remodeling-saddle-river-nj', destination: '/locations/saddle-river/services/kitchen-remodeling', permanent: true },
      { source: '/kitchen-remodeling-short-hills-nj', destination: '/locations/short-hills/services/kitchen-remodeling', permanent: true },
      { source: '/kitchen-remodeling-verona-nj', destination: '/locations/verona/services/kitchen-remodeling', permanent: true },
      { source: '/kitchen-remodeling-west-caldwell-nj', destination: '/locations/west-caldwell/services/kitchen-remodeling', permanent: true },
      { source: '/kitchen-remodeling-west-orange-nj', destination: '/locations/west-orange/services/kitchen-remodeling', permanent: true },

      // Bathroom Renovation
      { source: '/bathroom-renovation-alpine-nj', destination: '/locations/alpine/services/bathroom-renovation', permanent: true },
      { source: '/bathroom-renovation-caldwell-nj', destination: '/locations/caldwell/services/bathroom-renovation', permanent: true },
      { source: '/bathroom-renovation-essex-fells-nj', destination: '/locations/essex-fells/services/bathroom-renovation', permanent: true },
      { source: '/bathroom-renovation-ho-ho-kus-nj', destination: '/locations/ho-ho-kus/services/bathroom-renovation', permanent: true },
      { source: '/bathroom-renovation-livingston-nj', destination: '/locations/livingston/services/bathroom-renovation', permanent: true },
      { source: '/bathroom-renovation-millburn-nj', destination: '/locations/millburn/services/bathroom-renovation', permanent: true },
      { source: '/bathroom-renovation-montclair-nj', destination: '/locations/montclair/services/bathroom-renovation', permanent: true },
      { source: '/bathroom-renovation-morristown-nj', destination: '/locations/morristown/services/bathroom-renovation', permanent: true },
      { source: '/bathroom-renovation-saddle-river-nj', destination: '/locations/saddle-river/services/bathroom-renovation', permanent: true },
      { source: '/bathroom-renovation-short-hills-nj', destination: '/locations/short-hills/services/bathroom-renovation', permanent: true },
      { source: '/bathroom-renovation-verona-nj', destination: '/locations/verona/services/bathroom-renovation', permanent: true },
      { source: '/bathroom-renovation-west-caldwell-nj', destination: '/locations/west-caldwell/services/bathroom-renovation', permanent: true },
      { source: '/bathroom-renovation-west-orange-nj', destination: '/locations/west-orange/services/bathroom-renovation', permanent: true },

      // Basement Finishing
      { source: '/basement-finishing-alpine-nj', destination: '/locations/alpine/services/basement-finishing', permanent: true },
      { source: '/basement-finishing-caldwell-nj', destination: '/locations/caldwell/services/basement-finishing', permanent: true },
      { source: '/basement-finishing-essex-fells-nj', destination: '/locations/essex-fells/services/basement-finishing', permanent: true },
      { source: '/basement-finishing-ho-ho-kus-nj', destination: '/locations/ho-ho-kus/services/basement-finishing', permanent: true },
      { source: '/basement-finishing-livingston-nj', destination: '/locations/livingston/services/basement-finishing', permanent: true },
      { source: '/basement-finishing-millburn-nj', destination: '/locations/millburn/services/basement-finishing', permanent: true },
      { source: '/basement-finishing-montclair-nj', destination: '/locations/montclair/services/basement-finishing', permanent: true },
      { source: '/basement-finishing-morristown-nj', destination: '/locations/morristown/services/basement-finishing', permanent: true },
      { source: '/basement-finishing-saddle-river-nj', destination: '/locations/saddle-river/services/basement-finishing', permanent: true },
      { source: '/basement-finishing-short-hills-nj', destination: '/locations/short-hills/services/basement-finishing', permanent: true },
      { source: '/basement-finishing-verona-nj', destination: '/locations/verona/services/basement-finishing', permanent: true },
      { source: '/basement-finishing-west-caldwell-nj', destination: '/locations/west-caldwell/services/basement-finishing', permanent: true },
      { source: '/basement-finishing-west-orange-nj', destination: '/locations/west-orange/services/basement-finishing', permanent: true },

      // Home Additions
      { source: '/home-additions-alpine-nj', destination: '/locations/alpine/services/home-additions', permanent: true },
      { source: '/home-additions-caldwell-nj', destination: '/locations/caldwell/services/home-additions', permanent: true },
      { source: '/home-additions-essex-fells-nj', destination: '/locations/essex-fells/services/home-additions', permanent: true },
      { source: '/home-additions-ho-ho-kus-nj', destination: '/locations/ho-ho-kus/services/home-additions', permanent: true },
      { source: '/home-additions-livingston-nj', destination: '/locations/livingston/services/home-additions', permanent: true },
      { source: '/home-additions-millburn-nj', destination: '/locations/millburn/services/home-additions', permanent: true },
      { source: '/home-additions-montclair-nj', destination: '/locations/montclair/services/home-additions', permanent: true },
      { source: '/home-additions-morristown-nj', destination: '/locations/morristown/services/home-additions', permanent: true },
      { source: '/home-additions-saddle-river-nj', destination: '/locations/saddle-river/services/home-additions', permanent: true },
      { source: '/home-additions-short-hills-nj', destination: '/locations/short-hills/services/home-additions', permanent: true },
      { source: '/home-additions-verona-nj', destination: '/locations/verona/services/home-additions', permanent: true },
      { source: '/home-additions-west-caldwell-nj', destination: '/locations/west-caldwell/services/home-additions', permanent: true },
      { source: '/home-additions-west-orange-nj', destination: '/locations/west-orange/services/home-additions', permanent: true },

      // ============================================
      // OLD BLOG URL FORMAT REDIRECTS
      // Pattern: /our-blog/slug → /blog
      // ============================================
      { source: '/our-blog/:slug*', destination: '/blog', permanent: true },

      // Legacy blog posts that no longer exist - redirect to blog listing
      { source: '/blog/permit-requirements-northern-nj', destination: '/blog', permanent: true },
      { source: '/blog/permit-requirements-northern-n', destination: '/blog', permanent: true },
      { source: '/blog/bathroom-remodeling-costs-essex-county', destination: '/blog', permanent: true },
      { source: '/blog/bathroom-remodeling-costs-essex-countyj', destination: '/blog', permanent: true },

      // ============================================
      // OLD "NEAR ME" URL FORMAT REDIRECTS
      // Specific cities that exist - redirect to proper location pages
      // ============================================
      { source: '/near-me/kitchen-remodeling/livingston', destination: '/locations/livingston/services/kitchen-remodeling', permanent: true },
      { source: '/near-me/kitchen-remodeling/montclair', destination: '/locations/montclair/services/kitchen-remodeling', permanent: true },
      { source: '/near-me/kitchen-remodeling/millburn', destination: '/locations/millburn/services/kitchen-remodeling', permanent: true },
      { source: '/near-me/kitchen-remodeling/short-hills', destination: '/locations/short-hills/services/kitchen-remodeling', permanent: true },
      { source: '/near-me/kitchen-remodeling/west-orange', destination: '/locations/west-orange/services/kitchen-remodeling', permanent: true },
      { source: '/near-me/bathroom-remodeling/montclair', destination: '/locations/montclair/services/bathroom-renovation', permanent: true },
      { source: '/near-me/bathroom-remodeling/livingston', destination: '/locations/livingston/services/bathroom-renovation', permanent: true },
      { source: '/near-me/bathroom-remodeling/west-orange', destination: '/locations/west-orange/services/bathroom-renovation', permanent: true },
      { source: '/near-me/home-remodeling/montclair', destination: '/locations/montclair/services/kitchen-remodeling', permanent: true },
      { source: '/near-me/home-remodeling/livingston', destination: '/locations/livingston/services/kitchen-remodeling', permanent: true },

      // Unknown cities - redirect to services listing page instead of 404
      { source: '/near-me/kitchen-remodeling/:city', destination: '/services', permanent: true },
      { source: '/near-me/bathroom-remodeling/:city', destination: '/services', permanent: true },
      { source: '/near-me/basement-finishing/:city', destination: '/services', permanent: true },
      { source: '/near-me/home-remodeling/:city', destination: '/services', permanent: true },
      { source: '/near-me/home-additions/:city', destination: '/services', permanent: true },
      { source: '/near-me/:path*', destination: '/services', permanent: true },

      // ============================================
      // SPANISH (ES) URL REDIRECTS
      // All Spanish URLs redirect to English equivalents
      // ============================================
      { source: '/es/portfolio-collections/:path*', destination: '/portfolio', permanent: true },
      { source: '/es/our-blog/:slug*', destination: '/blog', permanent: true },
      { source: '/es/near-me/:path*', destination: '/services', permanent: true },
      { source: '/es/:path*', destination: '/', permanent: true },

      // ============================================
      // LEGACY PAGE REDIRECTS
      // ============================================
      { source: '/free-consultation', destination: '/project-calculator', permanent: true },
      { source: '/consultation', destination: '/project-calculator', permanent: true },
      { source: '/estimate', destination: '/project-calculator', permanent: true },
      { source: '/quote', destination: '/project-calculator', permanent: true },

      // ============================================
      // MALFORMED / MISC REDIRECTS
      // ============================================
      { source: '/&', destination: '/', permanent: true },

      // ============================================
      // LEGACY PAGES WITHOUT REDIRECTS (from GSC 404s)
      // ============================================
      { source: '/pricing-plans/:path*', destination: '/services', permanent: true },
      { source: '/financing', destination: '/project-calculator', permanent: true },
      { source: '/portfolio-collections/:path*', destination: '/portfolio', permanent: true },

      // ============================================
      // OLD PROJECT URL REDIRECTS (from GSC 404s)
      // Pattern: /projects/old-slug → /portfolio
      // ============================================
      { source: '/projects/spa-like-master-bathroom', destination: '/portfolio', permanent: true },
      { source: '/projects/entertainment-basement', destination: '/portfolio', permanent: true },
      { source: '/projects/modern-kitchen-renovation', destination: '/portfolio', permanent: true },
      { source: '/projects/luxury-bathroom-remodel', destination: '/portfolio', permanent: true },
      { source: '/projects/basement-transformation', destination: '/portfolio', permanent: true },
      { source: '/projects/home-addition-project', destination: '/portfolio', permanent: true },

      // ============================================
      // ADDITIONAL NEAR-ME CITY REDIRECTS (from GSC 404s/Soft 404s)
      // Cities that don't have dedicated pages → services listing
      // ============================================
      { source: '/near-me/home-remodeling/tenafly', destination: '/services', permanent: true },
      { source: '/near-me/bathroom-remodeling/franklin-lakes', destination: '/services', permanent: true },
      { source: '/near-me/bathroom-remodeling/chatham', destination: '/services', permanent: true },
      { source: '/near-me/kitchen-remodeling/franklin-lakes', destination: '/services', permanent: true },
      { source: '/near-me/home-remodeling/franklin-lakes', destination: '/services', permanent: true },
      { source: '/near-me/basement-finishing/tenafly', destination: '/services', permanent: true },
      { source: '/near-me/kitchen-remodeling/chatham', destination: '/services', permanent: true },
      { source: '/near-me/home-remodeling/chatham', destination: '/services', permanent: true },

      // ============================================
      // ADDITIONAL ES (SPANISH) SPECIFIC REDIRECTS
      // ============================================
      { source: '/es/free-consultation', destination: '/project-calculator', permanent: true },
      { source: '/es/consultation', destination: '/project-calculator', permanent: true },
      { source: '/es/contact', destination: '/contact', permanent: true },
      { source: '/es/about', destination: '/about', permanent: true },
      { source: '/es/services', destination: '/services', permanent: true },

      // Typo redirects
      { source: '/home-additions-west-orge-nj', destination: '/locations/west-orange/services/home-additions', permanent: true },
    ]
  },

  // Output configuration
  output: 'standalone',
};

export default nextConfig;
