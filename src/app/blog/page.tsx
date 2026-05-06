import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import BlogPostGrid from '@/components/BlogPostGrid';

// Revalidate every 60 seconds (ISR - Incremental Static Regeneration)
export const revalidate = 60;

// Server-side Supabase client (trim to handle any whitespace in env vars)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()
);

export const metadata: Metadata = {
  title: 'Home Remodeling Blog & Resources | La Vaca General Contractors',
  description: 'Expert insights on home remodeling trends, costs, and permits in Northern NJ. Get professional advice on kitchen renovations, bathroom upgrades, and home additions from licensed contractors.',
  keywords: 'home remodeling blog, NJ renovation tips, kitchen remodel cost, bathroom renovation guide, home addition permits NJ',
  openGraph: {
    title: 'Home Remodeling Blog & Resources | La Vaca General Contractors',
    description: 'Expert insights on home remodeling trends, costs, and permits in Northern NJ.',
    type: 'website',
    url: 'https://www.lavacagc.com/blog',
    images: [
      {
        url: 'https://www.lavacagc.com/og-blog.jpg',
        width: 1200,
        height: 630,
        alt: 'La Vaca General Contractors Blog',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Home Remodeling Blog | La Vaca GC',
    description: 'Expert insights on home remodeling in Northern NJ',
  },
  alternates: {
    canonical: 'https://www.lavacagc.com/blog',
  },
};

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  author: string;
  category: string;
  featured_image: string;
  created_at: string;
}

async function getBlogPosts(): Promise<BlogPost[]> {
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, title, slug, excerpt, author, category, featured_image, created_at')
      .eq('published', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading blog posts:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Failed to fetch blog posts:', err);
    return [];
  }
}

export default async function Blog() {
  const blogPosts = await getBlogPosts();

  // JSON-LD Schema for Blog
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'La Vaca General Contractors Blog',
    description: 'Expert insights on home remodeling trends, costs, and permits in Northern NJ',
    url: 'https://www.lavacagc.com/blog',
    publisher: {
      '@type': 'Organization',
      name: 'La Vaca General Contractors',
      url: 'https://www.lavacagc.com',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.lavacagc.com/logo.png',
      },
    },
    blogPost: blogPosts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt,
      url: `https://www.lavacagc.com/blog/${post.slug}`,
      datePublished: post.created_at,
      author: {
        '@type': 'Person',
        name: post.author,
      },
      image: post.featured_image || 'https://www.lavacagc.com/default-blog-image.jpg',
    })),
  };

  return (
    <>
      <Header />

      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="min-h-screen bg-background">
        {/* Hero Section */}
        <section className="bg-gradient-to-br from-secondary via-secondary to-accent-teal py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center text-white">
              <h1 className="text-4xl md:text-5xl font-bold mb-6">
                Home Remodeling Blog & Resources
              </h1>
              <p className="text-xl md:text-2xl text-white/90 mb-8">
                Expert insights, trends, and guides for your Northern NJ home renovation projects
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Badge variant="secondary" className="px-4 py-2 text-sm">
                  Kitchen Trends
                </Badge>
                <Badge variant="secondary" className="px-4 py-2 text-sm">
                  Cost Guides
                </Badge>
                <Badge variant="secondary" className="px-4 py-2 text-sm">
                  Permit Help
                </Badge>
              </div>
            </div>
          </div>
        </section>

        {/* Blog Posts Grid - Client Component for interactivity */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            {blogPosts.length > 0 ? (
              <BlogPostGrid posts={blogPosts} />
            ) : (
              <div className="text-center py-12">
                <h2 className="text-2xl font-semibold mb-4">No Blog Posts Yet</h2>
                <p className="text-muted-foreground">
                  Check back soon for expert insights on home remodeling!
                </p>
              </div>
            )}
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-background-soft">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Ready to Start Your Remodeling Project?
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                Get expert advice and a free consultation from Northern NJ&apos;s trusted contractors
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8"
                >
                  Get Free Estimate
                </Link>
                <a
                  href="/about"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-11 px-8"
                >
                  Learn About Us
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
