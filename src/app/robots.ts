import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/auth/', '/_next/', '/private/', '/insurance', '/bond', '/license', '/brand-kit'],
      },
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
    ],
    sitemap: 'https://www.lavacagc.com/sitemap.xml',
  }
}
