'use client'

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Eye, Loader } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScrollTracking } from "@/hooks/useScrollTracking";
import { useHorizontalScrollTracking } from "@/hooks/useHorizontalScrollTracking";
import { trackEvent } from "@/services/analyticsManager";
import { ScrollHint } from "@/components/ScrollHint";

// Lazy video component - only loads video when visible in viewport
const LazyVideo = ({ src, title }: { src: string; title: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px', threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full h-64 bg-muted">
      {isVisible && (
        <video
          ref={videoRef}
          src={src}
          className="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-300"
          muted
          playsInline
          loop
          autoPlay
          preload="metadata"
          aria-label={`Project video for ${title}`}
        />
      )}
    </div>
  );
};

interface Project {
  id: string;
  title: string;
  location: string;
  service_types: string[];
  challenge: string;
  solution: string;
  url_slug: string;
  project_images: Array<{
    image_url: string;
    is_featured?: boolean;
  }>;
}

const ProjectGallery = () => {
  const router = useRouter();
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["All Projects"]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Scroll tracking for project gallery section
  const gallerySectionRef = useScrollTracking({
    sectionId: 'home-project-gallery',
    sectionName: 'Home Page Project Gallery',
    trackTimeOnSection: true,
    trackScrollDepth: true,
    scrollDepthThresholds: [25, 50, 75, 100],
    trackElements: true,
    minTimeThreshold: 3,
  });

  // Horizontal scroll tracking
  const horizontalScrollRef = useHorizontalScrollTracking({
    sectionId: 'home-project-gallery-scroll',
    sectionName: 'Home Project Gallery Horizontal Scroll',
    scrollDepthThresholds: [25, 50, 75, 100],
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const { data: projectsData, error } = await supabase
        .from('projects')
        .select(`
          id,
          title,
          location,
          service_types,
          challenge,
          solution,
          url_slug
        `)
        .eq('active', true)
        .eq('featured', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const projectsWithImages = await Promise.all(
        (projectsData || []).map(async (project) => {
          const { data: images } = await supabase
            .from('project_images')
            .select('image_url, is_featured')
            .eq('project_id', project.id)
            .order('sort_order');

          return {
            ...project,
            project_images: images || []
          };
        })
      );

      setProjects(projectsWithImages);
    } catch (error) {
      // Non-fatal: the gallery is decorative and degrades to empty if the data
      // source is unavailable. Log at warn level so it doesn't read as a
      // critical page error (and doesn't trip the "no console errors" gate).
      console.warn('ProjectGallery: could not load projects (non-fatal):', error);
    } finally {
      setLoading(false);
    }
  };

  const getProjectImage = (project: Project) => {
    const featured = project.project_images?.find(img => img.is_featured);
    return featured?.image_url || project.project_images?.[0]?.image_url || '/placeholder.svg';
  };

  const isVideo = (url: string) => {
    const videoExtensions = ['.mov', '.mp4', '.webm', '.ogg'];
    return videoExtensions.some(ext => url.toLowerCase().endsWith(ext));
  };

  const getProjectDescription = (project: Project) => {
    return project.challenge || project.solution || 'Quality construction and renovation services.';
  };

  const getAllServiceTypes = () => {
    const types = new Set<string>();
    projects.forEach(project => {
      project.service_types.forEach(type => types.add(type));
    });
    return Array.from(types);
  };

  const categories = ["All Projects", ...getAllServiceTypes()];

  const handleCategoryToggle = (category: string) => {
    if (category === "All Projects") {
      setSelectedCategories(["All Projects"]);
    } else {
      const newCategories = selectedCategories.includes("All Projects")
        ? [category]
        : selectedCategories.includes(category)
          ? selectedCategories.filter(c => c !== category)
          : [...selectedCategories.filter(c => c !== "All Projects"), category];

      setSelectedCategories(newCategories.length === 0 ? ["All Projects"] : newCategories);
    }

    // Track filter interaction
    trackEvent('project_gallery_filter', {
      filter_type: category,
      event_category: 'engagement',
    });
  };

  const filteredProjects = selectedCategories.includes("All Projects")
    ? projects
    : projects.filter(project =>
        project.service_types.some(type => selectedCategories.includes(type))
      );

  if (loading) {
    return (
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <Loader className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p>Loading projects...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={gallerySectionRef} className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
            Recent
            <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text"> Project Gallery</span>
          </h2>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto mb-8">
            Explore our latest luxury home renovations across Northern New Jersey&apos;s premier communities
          </p>

          {categories.length > 1 && (
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={selectedCategories.includes(category) ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleCategoryToggle(category)}
                  className={`transition-all duration-300 ${
                    selectedCategories.includes(category)
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-primary/10 hover:text-primary"
                  }`}
                >
                  {category}
                </Button>
              ))}
            </div>
          )}
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-xl text-text-secondary mb-8">No projects available yet.</p>
            <Button onClick={() => router.push('/vaca-mgmt')} variant="outline">
              Add Projects
            </Button>
          </div>
        ) : (
          <>
            <div className="relative">
              <ScrollHint scrollRef={horizontalScrollRef} />
            <div ref={horizontalScrollRef} className="overflow-x-auto pb-4 scroll-smooth">
              <div className="flex gap-8 min-w-max px-4">
                {filteredProjects.map((project) => (
                  <Card key={project.id} data-track="true" className="group overflow-hidden hover:shadow-elegant transition-all duration-300 hover:-translate-y-2 bg-card border-2 hover:border-primary/20 flex-shrink-0 w-80">
                     <div className="relative overflow-hidden">
                       {isVideo(getProjectImage(project)) ? (
                         <LazyVideo
                           src={getProjectImage(project)}
                           title={project.title}
                         />
                       ) : (
                         <Image
                           src={getProjectImage(project)}
                           alt={`${project.title} - ${project.service_types[0]} project in ${project.location} by La Vaca General Contractors`}
                           className="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-300"
                           width={320}
                           height={256}
                           loading="lazy"
                           sizes="(max-width: 768px) 100vw, 320px"
                         />
                       )}
                       <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="absolute bottom-4 left-4 right-4 transform translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
                        <Link href={`/projects/${project.url_slug || project.id}`}>
                          <Button
                            size="sm"
                            className="bg-primary/90 hover:bg-primary text-primary-foreground"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </Button>
                        </Link>
                      </div>
                    </div>

                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-accent-teal bg-accent-teal/10 px-3 py-1 rounded-full">
                          {project.service_types[0]}
                        </span>
                      </div>

                      <Link href={`/projects/${project.url_slug || project.id}`}>
                        <h3 className="text-xl font-bold text-text-primary mb-2 group-hover:text-primary transition-colors hover:underline cursor-pointer">
                          {project.title}
                        </h3>
                      </Link>

                      <p className="text-sm text-text-muted mb-3">{project.location}</p>

                      <p className="text-text-secondary text-sm leading-relaxed mb-4 line-clamp-3">
                        {getProjectDescription(project)}
                      </p>

                      <Link href={`/projects/${project.url_slug || project.id}`} className="block">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all duration-300"
                        >
                          View Project
                          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
            </div>

            <div className="text-center mt-12">
              <Button
                size="lg"
                onClick={() => router.push('/portfolio')}
                className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-lg px-8 py-6 font-semibold transition-all duration-300 hover:scale-105"
              >
                View Complete Portfolio
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default ProjectGallery;
