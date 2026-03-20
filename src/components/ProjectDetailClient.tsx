'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  AlertCircle,
} from 'lucide-react';
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
  url_slug: string;
  project_images: Array<{
    id: string;
    image_url: string;
    image_category: string;
    alt_text: string;
    is_featured: boolean;
    media_type?: 'image' | 'video';
  }>;
}

interface ProjectDetailClientProps {
  project: ProjectData;
}

export default function ProjectDetailClient({ project }: ProjectDetailClientProps) {
  const router = useRouter();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [galleryHeight, setGalleryHeight] = useState<number | null>(null);
  const contentColumnRef = useRef<HTMLDivElement>(null);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

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

  const getProjectImages = (category?: string) => {
    if (!project?.project_images) return [];

    if (category) {
      return project.project_images.filter((img) => img.image_category === category);
    }

    return project.project_images.sort((a, b) => {
      // Sort: featured first, then by category (before, during, after)
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;

      const order = { before: 0, during: 1, after: 2 };
      return (
        (order[a.image_category as keyof typeof order] || 3) -
        (order[b.image_category as keyof typeof order] || 3)
      );
    });
  };

  return (
    <>
      {/* Header with Back Button — compact on mobile */}
      <section className="bg-background border-b sticky top-0 z-40">
        <div className="container mx-auto px-4 md:px-10 py-2 md:py-4">
          {/* Mobile: inline back arrow + breadcrumb in one row */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={() => router.push('/portfolio')}
              className="p-1 -ml-1 cursor-pointer"
              aria-label="Back to Portfolio"
            >
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <nav aria-label="Breadcrumb">
              <ol className="flex items-center space-x-1.5 text-xs text-muted-foreground">
                <li><Link href="/" className="hover:text-primary">Home</Link></li>
                <li>/</li>
                <li><Link href="/portfolio" className="hover:text-primary">Portfolio</Link></li>
              </ol>
            </nav>
          </div>
          {/* Desktop: full breadcrumb + back button */}
          <div className="hidden md:block">
            <nav aria-label="Breadcrumb" className="mb-2">
              <ol className="flex items-center space-x-2 text-sm text-muted-foreground">
                <li><Link href="/" className="hover:text-primary">Home</Link></li>
                <li>/</li>
                <li><Link href="/portfolio" className="hover:text-primary">Portfolio</Link></li>
                <li>/</li>
                <li className="text-foreground font-medium truncate max-w-[200px]">{project.title}</li>
              </ol>
            </nav>
            <Button
              variant="ghost"
              onClick={() => router.push('/portfolio')}
              className="flex items-center gap-2 hover:bg-muted"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Portfolio
            </Button>
          </div>
        </div>
      </section>

      {/* Hero Section - Two Column Layout */}
      <section className="py-4 md:py-16">
        <div className="container mx-auto px-4 md:px-10">
          {/* Mobile: image first, then compact title below */}
          <div className="md:hidden">
            {/* Service badges + title — compact */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {project.service_types.map((service) => (
                <Badge
                  key={service}
                  className="bg-primary text-primary-foreground px-3 py-0.5 text-[10px] font-semibold rounded-full"
                >
                  {service}
                </Badge>
              ))}
            </div>
            <h1 className="text-xl font-bold mb-2 leading-snug">
              {project.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mb-3 text-muted-foreground text-xs">
              <div className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>{project.location}</span>
              </div>
              {project.duration && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{project.duration}</span>
                </div>
              )}
              {project.testimonial_rating > 0 && (
                <div className="flex items-center gap-1">
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3 h-3 ${
                          i < project.testimonial_rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            {/* Mobile image gallery — right below title, above the fold */}
            {getProjectImages().length > 0 && (
              <div>
                {/* Main Image — 16:9 container, shows full width without excessive zoom */}
                <div
                  className="relative group cursor-pointer overflow-hidden rounded-xl mb-2 aspect-video"
                  onClick={() => {
                    setLightboxIndex(0);
                    setLightboxOpen(true);
                  }}
                >
                  {getProjectImages()[0].media_type === 'video' ? (
                    <video
                      src={getProjectImages()[0].image_url}
                      className="w-full h-full object-cover"
                      autoPlay muted loop playsInline
                    />
                  ) : (
                    <Image
                      src={getProjectImages()[0].image_url}
                      alt={getProjectImages()[0].alt_text || `${project.title} - Featured project photo`}
                      className="object-cover"
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      priority
                    />
                  )}
                  {getProjectImages()[0].image_category && (
                    <Badge
                      className="absolute top-2 left-2 capitalize text-[10px]"
                      variant={
                        getProjectImages()[0].image_category === 'before' ? 'destructive'
                        : getProjectImages()[0].image_category === 'during' ? 'secondary'
                        : 'default'
                      }
                    >
                      {getProjectImages()[0].image_category}
                    </Badge>
                  )}
                  <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">
                    {getProjectImages().length} photos
                  </div>
                </div>

                {/* Thumbnail Strip */}
                {getProjectImages().length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {getProjectImages().map((image, index) => (
                      <div
                        key={image.id}
                        className={`relative flex-shrink-0 w-14 h-14 rounded-md overflow-hidden cursor-pointer border-2 transition-all ${
                          index === 0 ? 'border-primary' : 'border-transparent'
                        }`}
                        onClick={() => { setLightboxIndex(index); setLightboxOpen(true); }}
                      >
                        {image.media_type === 'video' ? (
                          <video src={image.image_url} className="w-full h-full object-cover" muted playsInline />
                        ) : (
                          <Image src={image.image_url} alt={image.alt_text || `Photo ${index + 1}`} className="object-cover" fill sizes="56px" loading="lazy" />
                        )}
                        {image.image_category && (
                          <div className={`absolute bottom-0 left-0 right-0 text-[8px] text-center py-0.5 capitalize font-medium ${
                            image.image_category === 'before' ? 'bg-red-500/80 text-white'
                            : image.image_category === 'after' ? 'bg-green-500/80 text-white'
                            : 'bg-black/50 text-white'
                          }`}>
                            {image.image_category}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>

          {/* Desktop: original two-column layout */}
          <div className="hidden md:grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-8 lg:gap-16 items-start">
            {/* Left Column - Project Info (Sticky) */}
            <div className="lg:sticky lg:top-32">
              <div className="flex flex-wrap gap-2 mb-6">
                {project.service_types.map((service) => (
                  <Badge
                    key={service}
                    className="bg-primary text-primary-foreground px-5 py-1.5 text-xs font-semibold rounded-full"
                  >
                    {service}
                  </Badge>
                ))}
              </div>

              <h1 className="text-5xl lg:text-6xl font-extrabold mb-6 leading-tight">
                {project.title}
              </h1>

              <div className="flex flex-wrap items-center gap-6 mb-5 text-muted-foreground text-base">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{project.location}</span>
                </div>
                {project.date_completed && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <time dateTime={project.date_completed}>
                      {new Date(project.date_completed).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                      })}
                    </time>
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
                          i < project.testimonial_rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted'
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

            {/* Right Column - Image Gallery (Desktop only) */}
            <div className="w-full">
              {getProjectImages().length > 0 && (
                <>
                  {/* Desktop: grid layout with main + 2 side images */}
                  <div className="hidden md:grid grid-cols-2 gap-4 rounded-2xl overflow-hidden">
                    {/* Main Large Image */}
                    <div
                      className="relative group cursor-pointer row-span-2 overflow-hidden rounded-2xl"
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
                        <Image
                          src={getProjectImages()[0].image_url}
                          alt={
                            getProjectImages()[0].alt_text ||
                            `${project.title} - Featured ${project.service_types[0]} project in ${project.location} by La Vaca General Contractors`
                          }
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          fill
                          sizes="50vw"
                        />
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
                        <div className="bg-white/0 group-hover:bg-white/90 p-0 group-hover:p-3 rounded-full transition-all duration-300">
                          <Expand className="w-6 h-6 text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        </div>
                      </div>
                    </div>

                    {/* Smaller Images */}
                    {getProjectImages()
                      .slice(1, 3)
                      .map((image, index) => (
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
                            <Image
                              src={image.image_url}
                              alt={
                                image.alt_text ||
                                `${project.title} - ${project.service_types[0]} project detail image ${index + 2} by La Vaca General Contractors in ${project.location}`
                              }
                              className="object-cover transition-transform duration-300 group-hover:scale-105"
                              fill
                              sizes="25vw"
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

                  {/* Mobile gallery is rendered above the desktop grid */}
                </>
              )}
            </div>
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
                        <time dateTime={project.date_completed}>
                          {new Date(project.date_completed).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </time>
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
                        &quot;{project.testimonial_text}&quot;
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
                        {project.challenge
                          .split('\n')
                          .filter((line) => line.trim().startsWith('- '))
                          .map((bullet, index) => (
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
                        {project.solution
                          .split('\n')
                          .filter((line) => line.trim().startsWith('- '))
                          .map((bullet, index) => (
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
                            className="relative group cursor-pointer h-32"
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
                              <Image
                                src={image.image_url}
                                alt={image.alt_text || `${project.title} - Image ${index + 1}`}
                                className="object-cover rounded-lg transition-transform group-hover:scale-[1.02]"
                                fill
                                sizes="(max-width: 768px) 50vw, 25vw"
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
                                variant={
                                  image.image_category === 'before'
                                    ? 'destructive'
                                    : image.image_category === 'during'
                                      ? 'secondary'
                                      : 'default'
                                }
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
          <h2 className="text-3xl font-bold mb-4">Ready to Start Your Own Project?</h2>
          <p className="text-xl mb-8 opacity-90">
            Let&apos;s bring your vision to life with our expert craftsmanship.
          </p>
          <Link
            href="/#estimate"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-background text-text-primary hover:bg-background/90 h-11 px-8"
          >
            Get Your Free Estimate
          </Link>
        </div>
      </section>

      {/* Image Lightbox */}
      <ImageLightbox
        images={getProjectImages().map((img) => ({
          url: img.image_url,
          alt: img.alt_text,
          category: img.image_category,
          media_type: img.media_type,
        }))}
        currentIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onNavigate={setLightboxIndex}
      />
    </>
  );
}
