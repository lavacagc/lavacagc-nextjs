'use client';

import { useEffect } from 'react';
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
  AlertCircle,
} from 'lucide-react';
import PhotoGallery from '@/components/gallery/PhotoGallery';
import { buildProjectGallery } from '@/lib/projects/gallery';
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
    pair_key?: string | null;
    caption?: string | null;
  }>;
}

interface ProjectDetailClientProps {
  project: ProjectData;
}

export default function ProjectDetailClient({ project }: ProjectDetailClientProps) {
  const router = useRouter();

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  // One unified gallery: standalone photos/videos + explicit before/after pairs.
  const { photos, beforeAfters } = buildProjectGallery(project.project_images || []);
  const hasMedia = photos.length > 0 || beforeAfters.length > 0;

  return (
    <>
      {/* Header with Back Button — compact on mobile */}
      <section className="bg-background border-b sticky top-[var(--smart-banner-height,0px)] transition-[top] duration-300 z-40">
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

      {/* Hero Section - Two Column Layout (info + unified gallery) */}
      <section className="py-4 md:py-16">
        <div className="container mx-auto px-4 md:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-6 lg:gap-16 items-start">
            {/* Left Column - Project Info (sticky on desktop) */}
            <div className="lg:sticky lg:top-32">
              <div className="flex flex-wrap gap-1.5 md:gap-2 mb-2 md:mb-6">
                {project.service_types.map((service) => (
                  <Badge
                    key={service}
                    className="bg-primary text-primary-foreground px-3 md:px-5 py-0.5 md:py-1.5 text-[10px] md:text-xs font-semibold rounded-full"
                  >
                    {service}
                  </Badge>
                ))}
              </div>

              <h1 className="text-xl md:text-5xl lg:text-6xl font-bold md:font-extrabold mb-2 md:mb-6 leading-snug md:leading-tight">
                {project.title}
              </h1>

              <div className="flex flex-wrap items-center gap-3 md:gap-6 mb-3 md:mb-5 text-muted-foreground text-xs md:text-base">
                <div className="flex items-center gap-1 md:gap-2">
                  <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span>{project.location}</span>
                </div>
                {project.date_completed && (
                  <div className="flex items-center gap-1 md:gap-2">
                    <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <time dateTime={project.date_completed}>
                      {new Date(project.date_completed).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                      })}
                    </time>
                  </div>
                )}
                {project.duration && (
                  <div className="flex items-center gap-1 md:gap-2">
                    <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span>{project.duration}</span>
                  </div>
                )}
              </div>

              {project.testimonial_rating > 0 && (
                <div className="flex items-center gap-3 mb-2 md:mb-10">
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 md:w-6 md:h-6 ${
                          i < project.testimonial_rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="hidden md:inline text-sm text-muted-foreground ml-2">
                    ({project.testimonial_rating}/5 stars)
                  </span>
                </div>
              )}
            </div>

            {/* Right Column - Unified gallery + shadowbox (before/after pairs open a slider) */}
            {hasMedia && (
              <div className="w-full">
                <PhotoGallery
                  photos={photos}
                  beforeAfters={beforeAfters}
                  alt={project.title}
                  testIdPrefix="project"
                />
              </div>
            )}
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

      {/* Testimonial, Challenge & Solution */}
      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="space-y-8 max-w-4xl">
            {/* Client Testimonial */}
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
    </>
  );
}
