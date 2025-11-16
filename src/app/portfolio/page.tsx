'use client'

import React, { useEffect, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Filter, Star, Eye, ArrowRight, Loader, Expand, AlertCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { ImageLightbox } from "@/components/ImageLightbox";

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

export default function Portfolio() {
  const [selectedFilter, setSelectedFilter] = useState("All Projects");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<Array<{url: string; alt?: string; category?: string; media_type?: 'image' | 'video'}>>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const router = useRouter();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async (attempt = 1) => {
    try {
      setLoading(true);
      setError(null);

      const { data: projectsData, error } = await supabase
        .from('projects')
        .select(`
          id,
          title,
          location,
          service_types,
          challenge,
          solution,
          featured_image_id,
          url_slug
        `)
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch project images separately
      const projectsWithImages = await Promise.all(
        (projectsData || []).map(async (project) => {
          const { data: images } = await supabase
            .from('project_images')
            .select('image_url, image_category, alt_text, media_type')
            .eq('project_id', project.id)
            .order('sort_order');

          return {
            ...project,
            project_images: (images || []).map(img => ({
              ...img,
              media_type: (img.media_type as 'image' | 'video') || 'image'
            }))
          };
        })
      );

      setProjects(projectsWithImages);
    } catch (err) {
      console.error('Error fetching projects:', err);

      // Retry logic: try up to 3 times with exponential backoff
      if (attempt < 3) {
        const delay = Math.pow(2, attempt) * 1000;
        setTimeout(() => fetchProjects(attempt + 1), delay);
      } else {
        setError('Unable to load projects. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    fetchProjects(1);
  };

  const getProjectImage = (project: Project) => {
    // Use the first project image if available
    return project.project_images?.[0]?.image_url || '/placeholder.svg';
  };

  const getProjectDescription = (project: Project) => {
    // Create a brief description from challenge or solution
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

  const filteredProjects = selectedFilter === "All Projects"
    ? projects
    : projects.filter(project => project.service_types.includes(selectedFilter));

  const scrollToEstimate = () => {
    router.push('/#estimate');
  };

  const openLightbox = (project: Project, imageIndex: number = 0) => {
    const images = project.project_images.map(img => ({
      url: img.image_url,
      alt: img.alt_text,
      category: img.image_category,
      media_type: img.media_type
    }));
    setLightboxImages(images);
    setLightboxIndex(imageIndex);
    setLightboxOpen(true);
  };

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center px-4">
            <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-text-primary mb-2">Unable to Load Projects</h2>
            <p className="text-text-secondary mb-6 max-w-md mx-auto">{error}</p>
            <Button onClick={handleRetry} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p>Loading projects...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-8 md:py-16 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
                Project Portfolio
              </h1>
              <p className="text-xl text-text-secondary leading-relaxed mb-8">
                Explore our completed projects with detailed case studies, before/after photos,
                budgets, and client testimonials. See the quality and craftsmanship that sets us apart.
              </p>

              {/* Portfolio Stats */}
              <div className="grid grid-cols-2 gap-8 max-w-xl mx-auto">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">{projects.length}+</div>
                  <div className="text-text-secondary">Completed Projects</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">100%</div>
                  <div className="text-text-secondary flex items-center justify-center gap-1">
                    <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                    Average Rating
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

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
                    onClick={() => setSelectedFilter(category)}
                    variant={selectedFilter === category ? "default" : "outline"}
                    size="sm"
                    className={selectedFilter === category ? "bg-primary" : ""}
                  >
                    {category}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Featured Projects */}
        <section className="py-8 md:py-16">
          <div className="container mx-auto px-4">
            {projects.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-xl text-text-secondary mb-8">No projects available yet.</p>
                <Button onClick={() => router.push('/admin')} variant="outline">
                  Add Projects
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto pb-4">
                <div className="flex gap-8 min-w-max px-4">
                  {filteredProjects.map((project) => (
                     <Card key={project.id} className="group overflow-hidden hover:shadow-elegant transition-all duration-300 hover:-translate-y-2 bg-card border-2 hover:border-primary/20 flex-shrink-0 w-80">
                      <div
                        className="relative overflow-hidden cursor-pointer"
                        onClick={() => openLightbox(project, 0)}
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
            )}
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-8 md:py-16 bg-primary">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-6 text-primary-foreground">
                Ready to Start Your Dream Project?
              </h2>
              <p className="text-xl mb-8 text-primary-foreground/90">
                Let's create a custom solution that fits your vision and budget.
              </p>
              <Button
                onClick={() => router.push('/')}
                size="lg"
                variant="secondary"
                className="bg-background text-text-primary hover:bg-background/90"
              >
                Get Your Free Estimate
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      {/* Image Lightbox */}
      <ImageLightbox
        images={lightboxImages}
        currentIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onNavigate={setLightboxIndex}
      />
    </div>
  );
}
