import type { Metadata } from 'next'
import { supabase } from '@/integrations/supabase/client'

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = params

  try {
    // Convert slug to title format
    const titleFromSlug = slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')

    const { data: service } = await supabase
      .from('services')
      .select('title, description')
      .eq('active', true)
      .ilike('title', `%${titleFromSlug}%`)
      .maybeSingle()

    if (!service) {
      return {
        title: 'Service Not Found - La Vaca General Contractors',
        description: 'The service you are looking for could not be found.',
      }
    }

    const title = `${service.title} - La Vaca General Contractors | Northern NJ`
    const description = service.description || `Professional ${service.title.toLowerCase()} services in Northern New Jersey.`

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `https://www.lavacagc.com/services/${slug}`,
      },
    }
  } catch (error) {
    console.error('Error generating metadata:', error)
    return {
      title: 'Service - La Vaca General Contractors',
      description: 'Professional remodeling services in Northern NJ.',
    }
  }
}

export default function ServiceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
