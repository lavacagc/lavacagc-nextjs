import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Good bots — allow everything except admin/auth
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/admin/', '/auth/', '/insurance', '/bond', '/license'],
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
        disallow: ['/admin/', '/auth/', '/insurance', '/bond', '/license'],
      },
      {
        userAgent: 'facebookexternalhit',
        allow: '/',
      },
      {
        userAgent: 'facebookcatalog',
        allow: '/',
      },
      // Bad bots — block everything
      { userAgent: 'SemrushBot', disallow: '/' },
      { userAgent: 'AhrefsBot', disallow: '/' },
      { userAgent: 'MJ12bot', disallow: '/' },
      { userAgent: 'DotBot', disallow: '/' },
      { userAgent: 'BLEXBot', disallow: '/' },
      { userAgent: 'PetalBot', disallow: '/' },
      { userAgent: 'ByteSpider', disallow: '/' },
      { userAgent: 'Sogou', disallow: '/' },
      { userAgent: 'YandexBot', disallow: '/' },
      { userAgent: 'MegaIndex', disallow: '/' },
      { userAgent: 'SEOkicks', disallow: '/' },
      { userAgent: 'serpstatbot', disallow: '/' },
      { userAgent: 'DataForSeoBot', disallow: '/' },
      { userAgent: 'ZoominfoBot', disallow: '/' },
      // Default — allow with restrictions
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/auth/', '/_next/', '/private/', '/insurance', '/bond', '/license', '/brand-kit'],
      },
    ],
    sitemap: 'https://www.lavacagc.com/sitemap.xml',
  }
}
