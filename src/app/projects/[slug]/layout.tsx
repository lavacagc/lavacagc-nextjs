import type { Metadata } from 'next'
import { supabase } from '@/integrations/supabase/client'

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = params

  try {
    // Fetch project data for metadata
    let { data: project } = await supabase
      .from('projects')
      .select('title, seo_title, meta_description, challenge, project_images(image_url)')
      .eq('url_slug', slug)
      .eq('active', true)
      .maybeSingle()

    // Try by ID if not found by slug
    if (!project) {
      const { data } = await supabase
        .from('projects')
        .select('title, seo_title, meta_description, challenge, project_images(image_url)')
        .eq('id', slug)
        .eq('active', true)
        .maybeSingle()

      project = data
    }

    if (!project) {
      return {
        title: 'Project Not Found - La Vaca General Contractors',
        description: 'The project you are looking for could not be found.',
      }
    }

    const title = project.seo_title || `${project.title} - Project Portfolio | La Vaca General Contractors`
    const description = project.meta_description || project.challenge || `View details of our ${project.title} project.`
    const imageUrl = Array.isArray(project.project_images) && project.project_images.length > 0
      ? project.project_images[0].image_url
      : undefined

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `https://www.lavacagc.com/projects/${slug}`,
        ...(imageUrl && {
          images: [
            {
              url: imageUrl,
              alt: project.title,
            },
          ],
        }),
      },
    }
  } catch (error) {
    console.error('Error generating metadata:', error)
    return {
      title: 'Project - La Vaca General Contractors',
      description: 'View our project portfolio.',
    }
  }
}

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
