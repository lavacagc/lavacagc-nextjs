import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { MarkdownContent } from '@/components/MarkdownContent';
import { ArrowLeft, Calendar, User, Tag } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

// Revalidate every 60 seconds (ISR - Incremental Static Regeneration)
export const revalidate = 60;

// Server-side Supabase client (trim to handle any whitespace in env vars)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim()
);

// Note: Draft preview is handled at /blog/preview/[slug] using client-side auth
// This page only shows published posts for SEO

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  author: string;
  category: string;
  featured_image: string;
  meta_title: string;
  meta_description: string;
  meta_keywords: string;
  published: boolean;
  created_at: string;
  updated_at: string;
}

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}

async function getBlogPost(slug: string, allowPreview: boolean = false): Promise<BlogPost | null> {
  let query = supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug);

  // Only filter by published if not in preview mode
  if (!allowPreview) {
    query = query.eq('published', true);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('Error loading blog post:', error);
    return null;
  }

  return data;
}

// Generate static params for pre-rendering
export async function generateStaticParams() {
  const { data: posts } = await supabase
    .from('blog_posts')
    .select('slug')
    .eq('published', true)
    .limit(50);

  return (posts || []).map((post) => ({
    slug: post.slug,
  }));
}

// Dynamic metadata for SEO
export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { preview } = await searchParams;
  const isPreview = preview === 'true';
  const post = await getBlogPost(slug, isPreview);

  if (!post) {
    return {
      title: 'Blog Post Not Found | La Vaca General Contractors',
      description: 'The requested blog post could not be found.',
    };
  }

  const title = post.meta_title || `${post.title} | La Vaca General Contractors`;
  const description = post.meta_description || post.excerpt;
  const keywords = post.meta_keywords || `${post.category}, home remodeling, NJ contractors`;

  return {
    title,
    description,
    keywords,
    authors: [{ name: post.author }],
    openGraph: {
      title: post.title,
      description,
      type: 'article',
      url: `https://www.lavacagc.com/blog/${post.slug}`,
      publishedTime: post.created_at,
      modifiedTime: post.updated_at,
      authors: [post.author],
      images: post.featured_image
        ? [
            {
              url: post.featured_image,
              width: 1200,
              height: 630,
              alt: post.title,
            },
          ]
        : [],
      siteName: 'La Vaca General Contractors',
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
      images: post.featured_image ? [post.featured_image] : [],
    },
    alternates: {
      canonical: `https://www.lavacagc.com/blog/${post.slug}`,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  // Note: Draft previews are handled at /blog/preview/[slug] with client-side auth
  // This public page only shows published posts for SEO
  const post = await getBlogPost(slug, false);

  if (!post) {
    notFound();
  }

  // JSON-LD Schema for BlogPosting
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    image: post.featured_image || 'https://www.lavacagc.com/default-blog-image.jpg',
    datePublished: post.created_at,
    dateModified: post.updated_at,
    author: {
      '@type': 'Person',
      name: post.author,
    },
    publisher: {
      '@type': 'Organization',
      name: 'La Vaca General Contractors',
      url: 'https://www.lavacagc.com',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.lavacagc.com/logo.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://www.lavacagc.com/blog/${post.slug}`,
    },
    keywords: post.meta_keywords || post.category,
    articleSection: post.category,
    wordCount: post.content.split(/\s+/).length,
  };

  // Breadcrumb Schema
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://www.lavacagc.com',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: 'https://www.lavacagc.com/blog',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: post.title,
        item: `https://www.lavacagc.com/blog/${post.slug}`,
      },
    ],
  };

  return (
    <>
      <Header />

      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-12">
          {/* Preview Mode Banner */}
          {!post.published && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-yellow-800 font-medium">
                Preview Mode - This post is not published yet and is only visible with the preview link.
              </p>
            </div>
          )}

          {/* Back to Blog Button */}
          <div className="mb-8">
            <Link
              href="/blog"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Blog
            </Link>
          </div>

          {/* Article */}
          <article className="max-w-4xl mx-auto">
            <header className="mb-12">
              {/* Breadcrumb for SEO */}
              <nav aria-label="Breadcrumb" className="mb-6">
                <ol className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <li>
                    <Link href="/" className="hover:text-primary">
                      Home
                    </Link>
                  </li>
                  <li>/</li>
                  <li>
                    <Link href="/blog" className="hover:text-primary">
                      Blog
                    </Link>
                  </li>
                  <li>/</li>
                  <li className="text-foreground font-medium truncate max-w-[200px]">
                    {post.title}
                  </li>
                </ol>
              </nav>

              <div className="flex items-center gap-4 mb-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Tag className="w-4 h-4" />
                  <span className="bg-primary/10 text-primary px-2 py-1 rounded-full">
                    {post.category}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <time dateTime={post.created_at}>
                    {format(new Date(post.created_at), 'MMMM d, yyyy')}
                  </time>
                </div>
                <div className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  <span>{post.author}</span>
                </div>
              </div>

              <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6">{post.title}</h1>

              {post.excerpt && (
                <p className="text-xl text-muted-foreground leading-relaxed">{post.excerpt}</p>
              )}
            </header>

            {/* Featured Image */}
            {post.featured_image && (
              <figure className="mb-12">
                <Image
                  src={post.featured_image}
                  alt={post.title}
                  width={1200}
                  height={384}
                  className="w-full h-96 object-cover rounded-lg shadow-lg"
                  priority
                />
                <figcaption className="text-center text-sm text-muted-foreground mt-2">
                  {post.title}
                </figcaption>
              </figure>
            )}

            {/* Article Content */}
            <div className="prose prose-lg max-w-none">
              <MarkdownContent content={post.content} />
            </div>

            {/* Call to Action */}
            <aside className="mt-16 p-8 bg-primary/5 rounded-lg border border-primary/10">
              <div className="text-center">
                <h3 className="text-2xl font-semibold mb-4">Ready to Start Your Project?</h3>
                <p className="text-muted-foreground mb-6">
                  Contact us today for a free consultation and estimate on your home remodeling
                  project.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link
                    href="/#estimate"
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8"
                  >
                    Get Free Estimate
                  </Link>
                  <Link
                    href="/about"
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-11 px-8"
                  >
                    Learn More About Us
                  </Link>
                </div>
              </div>
            </aside>
          </article>
        </div>
      </main>

      <Footer />
    </>
  );
}
