'use client'

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  Star,
  CheckCircle,
  Quote,
  Expand,
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ImageLightbox } from '@/components/ImageLightbox';
import { MarkdownContent } from '@/components/MarkdownContent';

interface ProjectData {
  id: string;
  title: string;
  location: string;
  service_types: string[];
  challenge: string;
  solution: string;
  materials_used: string[];
  special_features: string[];
  duration: string;
  date_completed: string;
  testimonial_text: string;
  testimonial_rating: number;
  client_first_name: string;
  seo_title: string;
  meta_description: string;
  budget_range: string;
  project_images: Array<{
    id: string;
    image_url: string;
    image_category: string;
    alt_text: string;
    is_featured: boolean;
    media_type?: 'image' | 'video';
  }>;
}

export default function ProjectDetail() {
  const params = useParams();
  const slug = params?.slug as string;
  const router = useRouter();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [galleryHeight, setGalleryHeight] = useState<number | null>(null);
  const contentColumnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to top when component mounts or slug changes
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

    if (slug) {
      fetchProject(slug);
    }
  }, [slug]);

  // Measure left column height and apply to gallery (desktop only)
  useEffect(() => {
    const updateGalleryHeight = () => {
      // Only apply height matching on large screens (desktop)
      if (window.innerWidth >= 1024 && contentColumnRef.current) {
        const height = contentColumnRef.current.offsetHeight;
        setGalleryHeight(height);
      } else {
        setGalleryHeight(null);
      }
    };

    updateGalleryHeight();
    window.addEventListener('resize', updateGalleryHeight);

    // Also update after images load
    const timer = setTimeout(updateGalleryHeight, 100);

    return () => {
      window.removeEventListener('resize', updateGalleryHeight);
      clearTimeout(timer);
    };
  }, [project]);

  const fetchProject = async (projectSlug: string) => {
    try {
      // First try to find by URL slug - specify the relationship to avoid ambiguity
      let { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          project_images!project_images_project_id_fkey(*)
        `)
        .eq('url_slug', projectSlug)
        .eq('active', true)
        .maybeSingle();

      // If not found by slug, try by ID
      if (!data && !error) {
        const { data: projectById, error: errorById } = await supabase
          .from('projects')
          .select(`
            *,
            project_images!project_images_project_id_fkey(*)
          `)
          .eq('id', projectSlug)
          .eq('active', true)
          .maybeSingle();

        data = projectById;
        error = errorById;
      }

      if (error) {
        console.error('Database error:', error);
        setNotFound(true);
        return;
      }

      if (!data) {
        setNotFound(true);
        return;
      }

      // Ensure project_images is always an array with proper type casting
      const projectImages = Array.isArray(data.project_images)
        ? data.project_images
        : data.project_images
          ? [data.project_images]
          : [];

      const projectData = {
        ...data,
        project_images: projectImages.map(img => ({
          id: img.id,
          image_url: img.image_url,
          image_category: img.image_category,
          alt_text: img.alt_text,
          is_featured: img.is_featured,
          media_type: (img.media_type as 'image' | 'video') || 'image'
        })),
        materials_used: data.materials_used || [],
        special_features: data.special_features || []
      };

      setProject(projectData);
    } catch (error) {
      console.error('Error fetching project:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const getProjectImages = (category?: string) => {
    if (!project?.project_images) return [];

    if (category) {
      return project.project_images.filter(img => img.image_category === category);
    }

    return project.project_images.sort((a, b) => {
      // Sort: featured first, then by category (before, during, after)
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;

      const order = { before: 0, during: 1, after: 2 };
      return (order[a.image_category as keyof typeof order] || 3) -
             (order[b.image_category as keyof typeof order] || 3);
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </main>
        <Footer />
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Project Not Found</h1>
            <p className="text-muted-foreground mb-6">The project you're looking for doesn't exist.</p>
            <Button onClick={() => router.push('/portfolio')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Portfolio
            </Button>
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
        {/* Header with Back Button */}
        <section className="bg-background border-b sticky top-0 z-40">
          <div className="container mx-auto px-4 md:px-10 py-4">
            <Button
              variant="ghost"
              onClick={() => router.push('/portfolio')}
              className="flex items-center gap-2 hover:bg-muted"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Portfolio
            </Button>
          </div>
        </section>

        {/* Hero Section - Two Column Layout */}
        <section className="py-10 md:py-16">
          <div className="container mx-auto px-4 md:px-10">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-8 lg:gap-16 items-start">
              {/* Left Column - Project Info (Sticky) */}
              <div className="lg:sticky lg:top-32">
                <div className="flex flex-wrap gap-2 mb-6">
                  {project.service_types.map(service => (
                    <Badge key={service} className="bg-primary text-primary-foreground px-5 py-1.5 text-xs font-semibold rounded-full">
                      {service}
                    </Badge>
                  ))}
                </div>

                <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 leading-tight">
                  {project.title}
                </h1>

                <div className="flex flex-wrap items-center gap-6 mb-5 text-muted-foreground text-sm md:text-base">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <span>{project.location}</span>
                  </div>
                  {project.date_completed && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {new Date(project.date_completed).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long'
                        })}
                      </span>
                    </div>
                  )}
                  {project.duration && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>{project.duration}</span>
                    </div>
                  )}
                </div>

                {project.testimonial_rating > 0 && (
                  <div className="flex items-center gap-3 mb-10">
                    <div className="flex text-2xl">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-6 h-6 ${
                            i < project.testimonial_rating
                              ? 'text-yellow-400 fill-yellow-400'
                              : 'text-muted'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-muted-foreground ml-2">
                      ({project.testimonial_rating}/5 stars)
                    </span>
                  </div>
                )}
              </div>

              {/* Right Column - Image Gallery */}
              <div className="w-full">
                {getProjectImages().length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-2xl overflow-hidden">
                    {/* Main Large Image */}
                    <div
                      className="relative group cursor-pointer md:row-span-2 h-[400px] md:h-auto overflow-hidden rounded-2xl"
                      onClick={() => {
                        setLightboxIndex(0);
                        setLightboxOpen(true);
                      }}
                    >
                      {getProjectImages()[0].media_type === 'video' ? (
                        <video
                          src={getProjectImages()[0].image_url}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          autoPlay
                          muted
                          loop
                          playsInline
                        />
                      ) : (
                        <img
                          src={getProjectImages()[0].image_url}
                          alt={getProjectImages()[0].alt_text || `${project.title} - Featured ${project.service_types[0]} project in ${project.location} by La Vaca General Contractors`}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
                        <div className="bg-white/0 group-hover:bg-white/90 p-0 group-hover:p-3 rounded-full transition-all duration-300">
                          <Expand className="w-6 h-6 text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        </div>
                      </div>
                    </div>

                    {/* Smaller Images */}
                    {getProjectImages().slice(1, 3).map((image, index) => (
                      <div
                        key={image.id}
                        className="relative group cursor-pointer h-[200px] overflow-hidden rounded-2xl"
                        onClick={() => {
                          setLightboxIndex(index + 1);
                          setLightboxOpen(true);
                        }}
                      >
                        {image.media_type === 'video' ? (
                          <video
                            src={image.image_url}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            autoPlay
                            muted
                            loop
                            playsInline
                          />
                        ) : (
                          <img
                            src={image.image_url}
                            alt={image.alt_text || `${project.title} - ${project.service_types[0]} project detail image ${index + 2} by La Vaca General Contractors in ${project.location}`}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
                          <div className="bg-white/0 group-hover:bg-white/90 p-0 group-hover:p-2 rounded-full transition-all duration-300">
                            <Expand className="w-5 h-5 text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Three Info Boxes Side by Side */}
        <section className="py-12">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Project Details */}
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-xl font-bold mb-4">Project Details</h3>
                  <div className="space-y-3">
                    {project.budget_range && (
                      <div>
                        <span className="text-sm font-medium">Budget Range:</span>
                        <p className="text-muted-foreground">{project.budget_range}</p>
                      </div>
                    )}
                    {project.duration && (
                      <div>
                        <span className="text-sm font-medium">Duration:</span>
                        <p className="text-muted-foreground">{project.duration}</p>
                      </div>
                    )}
                    {project.date_completed && (
                      <div>
                        <span className="text-sm font-medium">Completed:</span>
                        <p className="text-muted-foreground">
                          {new Date(project.date_completed).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Materials Used */}
              {project.materials_used && project.materials_used.length > 0 && (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="text-xl font-bold mb-4">Materials Used</h3>
                    <div className="space-y-2">
                      {project.materials_used.map((material, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                          <span className="text-sm">{material}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Special Features */}
              {project.special_features && project.special_features.length > 0 && (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="text-xl font-bold mb-4">Special Features</h3>
                    <div className="space-y-2">
                      {project.special_features.map((feature, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          <span className="text-sm">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </section>

        {/* Testimonial, Challenge & Solution with Gallery */}
        <section className="py-12 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-8 lg:items-start">
              {/* Left Column - Testimonial, Challenge & Solution (3/4) */}
              <div ref={contentColumnRef} className="space-y-8" id="content-column">
                {/* Client Testimonial - Moved to top */}
                {project.testimonial_text && (
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="text-xl font-bold mb-4">Client Testimonial</h3>
                      <div className="relative">
                        <Quote className="w-8 h-8 text-muted-foreground/30 absolute -top-2 -left-1" />
                        <blockquote className="text-muted-foreground italic pl-6">
                          "{project.testimonial_text}"
                        </blockquote>
                        <div className="flex items-center gap-3 mt-4 pl-6">
                          {project.client_first_name && (
                            <cite className="text-sm font-medium not-italic">
                              — {project.client_first_name}
                            </cite>
                          )}
                          {project.testimonial_rating > 0 && (
                            <div className="flex items-center gap-2">
                              <div className="flex">
                                {[...Array(5)].map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`w-4 h-4 ${
                                      i < project.testimonial_rating
                                        ? 'text-yellow-400 fill-yellow-400'
                                        : 'text-muted'
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                ({project.testimonial_rating}/5)
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Challenge */}
                {project.challenge && (
                  <Card>
                    <CardContent className="p-6">
                      <h2 className="text-2xl font-bold mb-4">The Challenge</h2>
                      {project.challenge.includes('\n- ') || project.challenge.startsWith('- ') ? (
                        <ul className="space-y-3">
                          {project.challenge.split('\n').filter(line => line.trim().startsWith('- ')).map((bullet, index) => (
                            <li key={index} className="flex items-start gap-3">
                              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                              <span className="text-muted-foreground leading-relaxed">
                                {bullet.replace(/^-\s*/, '')}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <MarkdownContent content={project.challenge} />
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Solution */}
                {project.solution && (
                  <Card>
                    <CardContent className="p-6">
                      <h2 className="text-2xl font-bold mb-4">Our Solution</h2>
                      {project.solution.includes('\n- ') || project.solution.startsWith('- ') ? (
                        <ul className="space-y-3">
                          {project.solution.split('\n').filter(line => line.trim().startsWith('- ')).map((bullet, index) => (
                            <li key={index} className="flex items-start gap-3">
                              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                              <span className="text-muted-foreground leading-relaxed">
                                {bullet.replace(/^-\s*/, '')}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <MarkdownContent content={project.solution} />
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right Column - Project Gallery (1/4) */}
              {getProjectImages().length > 1 && (
                <div
                  className="lg:sticky lg:top-32"
                  style={galleryHeight ? { height: `${galleryHeight}px` } : undefined}
                >
                  <Card className="h-full flex flex-col">
                    <CardContent className="p-6 flex flex-col h-full">
                      <h2 className="text-xl font-bold mb-4 flex-shrink-0">Gallery</h2>
                      <div className="flex-1 overflow-y-auto -mx-2 px-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-1 gap-4 pb-2">
                          {getProjectImages().map((image, index) => (
                            <div
                              key={image.id}
                              className="relative group cursor-pointer"
                              onClick={() => {
                                setLightboxIndex(index);
                                setLightboxOpen(true);
                              }}
                            >
                              {image.media_type === 'video' ? (
                                <video
                                  src={image.image_url}
                                  className="w-full h-32 object-cover rounded-lg transition-transform group-hover:scale-[1.02]"
                                  autoPlay
                                  muted
                                  loop
                                  playsInline
                                />
                              ) : (
                                <img
                                  src={image.image_url}
                                  alt={image.alt_text || `${project.title} - Image ${index + 1}`}
                                  className="w-full h-32 object-cover rounded-lg transition-transform group-hover:scale-[1.02]"
                                />
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                                <div className="bg-white/90 p-2 rounded-full">
                                  <Expand className="w-4 h-4 text-primary" />
                                </div>
                              </div>
                              {image.image_category && (
                                <Badge
                                  className="absolute top-2 left-2 capitalize text-xs"
                                  variant={image.image_category === 'before' ? 'destructive' :
                                          image.image_category === 'during' ? 'secondary' : 'default'}
                                >
                                  {image.image_category}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-secondary text-secondary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-4">
              Ready to Start Your Own Project?
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Let's bring your vision to life with our expert craftsmanship.
            </p>
            <Button
              size="lg"
              variant="default"
              onClick={() => router.push('/#estimate')}
            >
              Get Your Free Estimate
            </Button>
          </div>
        </section>
      </main>

      <Footer />

      {/* Image Lightbox */}
      {project && (
        <ImageLightbox
          images={getProjectImages().map(img => ({
            url: img.image_url,
            alt: img.alt_text,
            category: img.image_category,
            media_type: img.media_type
          }))}
          currentIndex={lightboxIndex}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}
