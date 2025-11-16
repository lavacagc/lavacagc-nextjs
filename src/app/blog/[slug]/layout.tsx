import type { Metadata } from 'next'
import { supabase } from '@/integrations/supabase/client'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params

  try {
    const { data: post } = await supabase
      .from('blog_posts')
      .select('title, meta_title, excerpt, meta_description, meta_keywords, featured_image')
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle()

    if (!post) {
      return {
        title: 'Blog Post Not Found - La Vaca General Contractors',
        description: 'The blog post you are looking for could not be found.',
      }
    }

    const title = post.meta_title || post.title
    const description = post.meta_description || post.excerpt

    return {
      title,
      description,
      keywords: post.meta_keywords || undefined,
      openGraph: {
        title,
        description,
        type: 'article',
        url: `https://www.lavacagc.com/blog/${slug}`,
        ...(post.featured_image && {
          images: [
            {
              url: post.featured_image,
              alt: post.title,
            },
          ],
        }),
      },
    }
  } catch (error) {
    console.error('Error generating metadata:', error)
    return {
      title: 'Blog Post - La Vaca General Contractors',
      description: 'Read our blog for expert insights on home remodeling.',
    }
  }
}

export default function BlogPostLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
