'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Filter, Eye, ArrowRight, Expand } from 'lucide-react';
import { ImageLightbox } from '@/components/ImageLightbox';
import { useScrollTracking } from '@/hooks/useScrollTracking';
import { useHorizontalScrollTracking } from '@/hooks/useHorizontalScrollTracking';
import { trackEvent } from '@/services/analyticsManager';

interface Project {
  id: string;
  title: string;
  location: string;
  service_types: string[];
  challenge: string;
  solution: string;
  featured_image_id: string;
  url_slug: string;
  project_images: Array<{
    image_url: string;
    image_category: string;
    alt_text: string;
    media_type?: 'image' | 'video';
  }>;
}

interface PortfolioContentProps {
  projects: Project[];
}

export default function PortfolioContent({ projects }: PortfolioContentProps) {
  const [selectedFilter, setSelectedFilter] = useState('All Projects');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<
    Array<{ url: string; alt?: string; category?: string; media_type?: 'image' | 'video' }>
  >([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const router = useRouter();

  // Scroll tracking for portfolio section
  const portfolioSectionRef = useScrollTracking({
    sectionId: 'portfolio-grid',
    sectionName: 'Portfolio Grid',
    trackTimeOnSection: true,
    trackScrollDepth: true,
    scrollDepthThresholds: [25, 50, 75, 100],
    trackElements: true,
    minTimeThreshold: 3,
  });

  // Horizontal scroll tracking for project cards
  const horizontalScrollRef = useHorizontalScrollTracking({
    sectionId: 'portfolio-horizontal-scroll',
    sectionName: 'Portfolio Horizontal Gallery',
    scrollDepthThresholds: [25, 50, 75, 100],
  });

  const getProjectImage = (project: Project) => {
    return project.project_images?.[0]?.image_url || '/placeholder.svg';
  };

  const getProjectDescription = (project: Project) => {
    return project.challenge || project.solution || 'Quality construction and renovation services.';
  };

  const getAllServiceTypes = () => {
    const types = new Set<string>();
    projects.forEach((project) => {
      project.service_types.forEach((type) => types.add(type));
    });
    return Array.from(types);
  };

  const categories = ['All Projects', ...getAllServiceTypes()];

  const filteredProjects =
    selectedFilter === 'All Projects'
      ? projects
      : projects.filter((project) => project.service_types.includes(selectedFilter));

  const openLightbox = (project: Project, imageIndex: number = 0) => {
    const images = project.project_images.map((img) => ({
      url: img.image_url,
      alt: img.alt_text,
      category: img.image_category,
      media_type: img.media_type,
    }));
    setLightboxImages(images);
    setLightboxIndex(imageIndex);
    setLightboxOpen(true);
  };

  if (projects.length === 0) {
    return (
      <section className="py-8 md:py-16">
        <div className="container mx-auto px-4">
          <div className="text-center py-16">
            <p className="text-xl text-text-secondary mb-8">No projects available yet.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* Filter Section */}
      <section className="py-8 bg-white sticky top-[88px] z-40 border-b">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-text-secondary" />
              <span className="font-medium text-text-primary">Filter by Type:</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Button
                  key={category}
                  onClick={() => {
                    setSelectedFilter(category);
                    // Track filter interaction
                    trackEvent('portfolio_filter', {
                      filter_type: category,
                      event_category: 'engagement',
                    });
                  }}
                  variant={selectedFilter === category ? 'default' : 'outline'}
                  size="sm"
                  className={selectedFilter === category ? 'bg-primary' : ''}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Projects Grid */}
      <section ref={portfolioSectionRef} className="py-8 md:py-16">
        <div className="container mx-auto px-4">
          <div ref={horizontalScrollRef} className="overflow-x-auto pb-4">
            <div className="flex gap-8 min-w-max px-4">
              {filteredProjects.map((project) => (
                <Card
                  key={project.id}
                  data-track="true"
                  className="group overflow-hidden hover:shadow-elegant transition-all duration-300 hover:-translate-y-2 bg-card border-2 hover:border-primary/20 flex-shrink-0 w-80"
                >
                  <div
                    className="relative overflow-hidden cursor-pointer"
                    onClick={() => {
                      openLightbox(project, 0);
                      // Track lightbox open
                      trackEvent('portfolio_lightbox_open', {
                        project_title: project.title,
                        project_id: project.id,
                        event_category: 'engagement',
                      });
                    }}
                  >
                    {project.project_images?.[0]?.media_type === 'video' ? (
                      <video
                        src={getProjectImage(project)}
                        className="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-300"
                        autoPlay
                        muted
                        loop
                        playsInline
                      />
                    ) : (
                      <img
                        src={getProjectImage(project)}
                        alt={`${project.title} - ${project.service_types[0]} renovation project in ${project.location} by La Vaca General Contractors`}
                        className="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="bg-white/90 p-3 rounded-full">
                        <Expand className="w-6 h-6 text-primary" />
                      </div>
                    </div>
                    <div className="absolute bottom-4 left-4 right-4 transform translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
                      <Button
                        size="sm"
                        className="bg-primary/90 hover:bg-primary text-primary-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/projects/${project.url_slug || project.id}`);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                    </div>
                  </div>

                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-accent-teal bg-accent-teal/10 px-3 py-1 rounded-full">
                        {project.service_types[0]}
                      </span>
                    </div>

                    <h3 className="text-xl font-bold text-text-primary mb-2 group-hover:text-primary transition-colors">
                      {project.title}
                    </h3>

                    <p className="text-sm text-text-muted mb-3">{project.location}</p>

                    <p className="text-text-secondary text-sm leading-relaxed mb-4 line-clamp-3">
                      {getProjectDescription(project)}
                    </p>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all duration-300"
                      onClick={() => router.push('/')}
                    >
                      Get Free Estimate
                      <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Image Lightbox */}
      <ImageLightbox
        images={lightboxImages}
        currentIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onNavigate={setLightboxIndex}
      />
    </>
  );
}
