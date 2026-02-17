'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Star, Shield, Award, Clock, Calendar, Home, Hammer, Wrench,
  Paintbrush, Zap, Phone, DollarSign, Heart, ThumbsUp, CheckCircle, Sparkles,
} from 'lucide-react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import LandingPageLeadForm from '@/components/LandingPageLeadForm';
import CallTrackingWrapper from '@/components/CallTrackingWrapper';
import Link from 'next/link';
import type {
  CMSSection, HeroSection, BeforeAfterSection, FeaturesSection,
  TestimonialsSection, TextSection, CTASection, FAQSection, GallerySection,
  ProjectsSection, LeadFormSection,
} from '@/types/cms';

// ─── Icon Resolver ─────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield, Award, Clock, Star, CheckCircle, Calendar, Home,
  Hammer, Wrench, Paintbrush, Zap, Phone, DollarSign, Heart, ThumbsUp,
};

function IconComponent({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] || Shield;
  return <Icon className={className} />;
}

// ─── Gradient Text Helper ──────────────────────────────────────────
// Renders text with **double asterisks** as gradient-highlighted spans

function renderGradientText(text: string): React.ReactNode {
  if (!text) return null;

  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      return (
        <span
          key={i}
          className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text"
        >
          {inner}
        </span>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

// ─── Section Background Helper ─────────────────────────────────────

function getSectionBackground(sectionType: string, index: number): string {
  if (sectionType === 'hero' || sectionType === 'cta' || sectionType === 'lead-form') {
    return 'bg-secondary text-secondary-foreground';
  }
  return index % 2 === 0 ? 'bg-background' : 'bg-muted/30';
}

// ─── Hero Section ──────────────────────────────────────────────────

function HeroRenderer({ section }: { section: HeroSection }) {
  const layout = section.layout || 'centered';

  if (layout === 'split-form') {
    return (
      <section className="relative bg-secondary text-secondary-foreground overflow-hidden">
        {section.backgroundImage && (
          <div className="absolute inset-0 opacity-20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={section.backgroundImage}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="relative container mx-auto px-4 py-12 md:py-20">
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            {/* Left side */}
            <div>
              <div className="flex items-center gap-1.5 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                ))}
                <span className="ml-2 text-sm font-medium">5.0 Rating on Google</span>
              </div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 leading-tight">
                {renderGradientText(section.heading)}
              </h1>
              {section.subheading && (
                <p className="text-lg md:text-xl text-secondary-foreground/90 mb-6">
                  {section.subheading}
                </p>
              )}
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-primary" /> Licensed &amp; Insured
                </span>
                <span className="flex items-center gap-1.5">
                  <Award className="h-4 w-4 text-primary" /> NJ HIC# 13VH13373800
                </span>
              </div>
            </div>

            {/* Right side — Lead Form */}
            <div>
              <LandingPageLeadForm
                source={section.formSource || 'cms-page'}
                projectType={section.formProjectType || 'general'}
                heading={section.formHeading}
                subheading={section.formSubheading}
                buttonText={section.formButtonText}
              />
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Centered layout (default)
  return (
    <section className="relative bg-secondary text-secondary-foreground overflow-hidden">
      {section.backgroundImage && (
        <div className="absolute inset-0 opacity-15">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={section.backgroundImage}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="relative container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-3xl mx-auto text-center">
          {/* Urgency badge */}
          {section.urgencyBadge && (
            <div className="inline-flex items-center gap-2 bg-primary/20 text-primary-foreground px-4 py-2 rounded-full text-sm font-medium mb-6 border border-primary/30">
              <Sparkles className="h-4 w-4" />
              {section.urgencyBadge}
            </div>
          )}

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            {renderGradientText(section.heading)}
          </h1>
          {section.subheading && (
            <p className="text-xl md:text-2xl text-secondary-foreground/90 mb-8 max-w-2xl mx-auto">
              {section.subheading}
            </p>
          )}
          {section.ctaText && (
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-lg px-8 py-6 font-semibold"
            >
              <Link href={section.ctaLink || '/contact'}>
                {section.ctaText}
              </Link>
            </Button>
          )}
          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-secondary-foreground/80 mt-8">
            <span className="flex items-center gap-1.5">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              5.0 on Google
            </span>
            <span className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-primary" /> Licensed &amp; Insured
            </span>
            <span className="flex items-center gap-1.5">
              <Award className="h-4 w-4 text-primary" /> HIC# 13VH13373800
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Before & After Section ────────────────────────────────────────

function BeforeAfterRenderer({ section, bgClass }: { section: BeforeAfterSection; bgClass: string }) {
  if (!section.items?.length) return null;
  return (
    <section className={`py-16 ${bgClass}`}>
      <div className="container mx-auto px-4">
        {section.heading && (
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-4">
            {renderGradientText(section.heading)}
          </h2>
        )}
        <div className={`grid gap-8 ${section.items.length > 1 ? 'md:grid-cols-2' : 'max-w-2xl mx-auto'} mt-8`}>
          {section.items.map((item, idx) => (
            <div key={idx} className="space-y-2">
              <BeforeAfterSlider
                beforeImage={item.beforeImage}
                afterImage={item.afterImage}
              />
              {item.caption && (
                <p className="text-sm text-text-secondary text-center">{item.caption}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Features Section ──────────────────────────────────────────────

function FeaturesRenderer({ section, bgClass }: { section: FeaturesSection; bgClass: string }) {
  if (!section.items?.length) return null;
  return (
    <section className={`py-16 ${bgClass}`}>
      <div className="container mx-auto px-4">
        {section.heading && (
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-12">
            {renderGradientText(section.heading)}
          </h2>
        )}
        <div className="grid md:grid-cols-3 gap-8">
          {section.items.map((item, idx) => (
            <div key={idx} className="text-center p-6 rounded-xl bg-card shadow-sm border border-border">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <IconComponent name={item.icon} className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">{item.title}</h3>
              <p className="text-text-secondary text-sm">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Testimonials Section ──────────────────────────────────────────

function TestimonialsRenderer({ section, bgClass }: { section: TestimonialsSection; bgClass: string }) {
  if (!section.items?.length) return null;
  return (
    <section className={`py-16 ${bgClass}`}>
      <div className="container mx-auto px-4">
        {section.heading && (
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-12">
            {renderGradientText(section.heading)}
          </h2>
        )}
        <div className={`grid gap-8 ${section.items.length > 1 ? 'md:grid-cols-2' : 'max-w-3xl mx-auto'}`}>
          {section.items.map((item, idx) => (
            <div key={idx} className="bg-card rounded-xl p-6 shadow-sm border border-border text-center">
              <div className="flex justify-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`h-5 w-5 ${i < item.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                  />
                ))}
              </div>
              <blockquote className="text-lg text-text-primary italic mb-4 leading-relaxed">
                &ldquo;{item.quote}&rdquo;
              </blockquote>
              <p className="text-text-secondary font-medium">&mdash; {item.author}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Text Section ──────────────────────────────────────────────────

function TextRenderer({ section, bgClass }: { section: TextSection; bgClass: string }) {
  const renderContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: string[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} className="space-y-2 max-w-2xl mx-auto">
            {listItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2 p-3 bg-card rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-text-secondary">{item}</span>
              </li>
            ))}
          </ul>
        );
        listItems = [];
      }
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        listItems.push(trimmed.slice(2));
      } else {
        flushList();
        if (trimmed) {
          elements.push(
            <p key={`p-${idx}`} className="text-text-secondary text-center max-w-2xl mx-auto">
              {trimmed}
            </p>
          );
        }
      }
    });
    flushList();

    return elements;
  };

  return (
    <section className={`py-16 ${bgClass}`}>
      <div className="container mx-auto px-4">
        {section.heading && (
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-8">
            {renderGradientText(section.heading)}
          </h2>
        )}
        <div className="space-y-4">
          {renderContent(section.content)}
        </div>
      </div>
    </section>
  );
}

// ─── CTA Section ───────────────────────────────────────────────────

function CTARenderer({ section }: { section: CTASection }) {
  return (
    <section className="py-12 bg-secondary text-secondary-foreground">
      <div className="container mx-auto px-4 text-center">
        {section.heading && (
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            {renderGradientText(section.heading)}
          </h2>
        )}
        {section.description && (
          <p className="text-lg mb-6 text-secondary-foreground/90">{section.description}</p>
        )}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {section.ctaText && (
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-lg px-8 py-4 font-semibold"
            >
              <Link href={section.ctaLink || '/contact'}>
                {section.ctaText}
              </Link>
            </Button>
          )}
          {section.phone && (
            <CallTrackingWrapper
              href={`tel:${section.phone.replace(/[^0-9+]/g, '')}`}
              className="inline-flex items-center gap-2 text-secondary-foreground hover:text-primary transition-colors font-medium text-lg"
            >
              <Phone className="h-5 w-5" />
              {section.phone}
            </CallTrackingWrapper>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ Section ───────────────────────────────────────────────────

function FAQRenderer({ section, bgClass }: { section: FAQSection; bgClass: string }) {
  if (!section.items?.length) return null;
  return (
    <section className={`py-16 ${bgClass}`}>
      <div className="container mx-auto px-4 max-w-3xl">
        {section.heading && (
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-8">
            {renderGradientText(section.heading)}
          </h2>
        )}
        <Accordion type="single" collapsible className="w-full">
          {section.items.map((item, idx) => (
            <AccordionItem key={idx} value={`faq-${idx}`}>
              <AccordionTrigger className="text-left text-text-primary font-medium">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-text-secondary">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

// ─── Gallery Section ───────────────────────────────────────────────

function GalleryRenderer({ section, bgClass }: { section: GallerySection; bgClass: string }) {
  if (!section.images?.length) return null;
  return (
    <section className={`py-16 ${bgClass}`}>
      <div className="container mx-auto px-4">
        {section.heading && (
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-8">
            {renderGradientText(section.heading)}
          </h2>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {section.images.map((img, idx) => (
            <div key={idx} className="rounded-xl overflow-hidden bg-card shadow-sm border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.src}
                alt={img.alt}
                className="w-full h-48 object-cover"
              />
              {img.caption && (
                <div className="p-3">
                  <p className="text-sm text-text-secondary text-center">{img.caption}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Projects Section ──────────────────────────────────────────────

function ProjectsRenderer({ section, bgClass }: { section: ProjectsSection; bgClass: string }) {
  if (!section.items?.length) return null;
  return (
    <section className={`py-16 ${bgClass}`}>
      <div className="container mx-auto px-4">
        {section.heading && (
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-12">
            {renderGradientText(section.heading)}
          </h2>
        )}
        <div className="grid md:grid-cols-3 gap-8">
          {section.items.map((project, idx) => (
            <div
              key={idx}
              className="rounded-xl overflow-hidden bg-card shadow-sm border border-border"
            >
              {project.image && (
                <div className="relative h-48">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={project.image}
                    alt={project.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-6">
                <h3 className="text-lg font-semibold text-text-primary mb-3">{project.title}</h3>
                <ul className="space-y-2">
                  {project.items.map((item, itemIdx) => (
                    <li key={itemIdx} className="flex items-center gap-2 text-sm text-text-secondary">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Lead Form Section ─────────────────────────────────────────────

function LeadFormRenderer({ section }: { section: LeadFormSection }) {
  return (
    <section className="py-16 bg-secondary text-secondary-foreground">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
          {/* Left side */}
          <div>
            {section.urgencyBadge && (
              <div className="inline-flex items-center gap-2 bg-primary/20 text-primary-foreground px-4 py-2 rounded-full text-sm font-medium mb-6 border border-primary/30">
                <Sparkles className="h-4 w-4" />
                {section.urgencyBadge}
              </div>
            )}
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {renderGradientText(section.heading)}
            </h2>
            {section.subheading && (
              <p className="text-lg text-secondary-foreground/90 mb-6">
                {section.subheading}
              </p>
            )}
            {section.bulletPoints && section.bulletPoints.length > 0 && (
              <ul className="space-y-3 mb-6">
                {section.bulletPoints.filter(Boolean).map((item, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-secondary-foreground/90">
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
            {section.phone && (
              <CallTrackingWrapper
                href={`tel:${section.phone.replace(/[^0-9+]/g, '')}`}
                className="inline-flex items-center gap-2 text-primary hover:text-primary-light transition-colors font-semibold"
              >
                <Phone className="h-5 w-5" />
                Or call us: {section.phone}
              </CallTrackingWrapper>
            )}
          </div>

          {/* Right side — Lead Form */}
          <div>
            <LandingPageLeadForm
              source={section.formSource}
              projectType={section.formProjectType}
              heading={section.formHeading}
              subheading={section.formSubheading}
              buttonText={section.formButtonText}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Main Renderer ─────────────────────────────────────────────────

function SectionRenderer({ section, index }: { section: CMSSection; index: number }) {
  const bgClass = getSectionBackground(section.type, index);

  switch (section.type) {
    case 'hero': return <HeroRenderer section={section} />;
    case 'before-after': return <BeforeAfterRenderer section={section} bgClass={bgClass} />;
    case 'features': return <FeaturesRenderer section={section} bgClass={bgClass} />;
    case 'testimonials': return <TestimonialsRenderer section={section} bgClass={bgClass} />;
    case 'text': return <TextRenderer section={section} bgClass={bgClass} />;
    case 'cta': return <CTARenderer section={section} />;
    case 'faq': return <FAQRenderer section={section} bgClass={bgClass} />;
    case 'gallery': return <GalleryRenderer section={section} bgClass={bgClass} />;
    case 'projects': return <ProjectsRenderer section={section} bgClass={bgClass} />;
    case 'lead-form': return <LeadFormRenderer section={section} />;
    default: return null;
  }
}

export default function CMSPageRenderer({ sections }: { sections: CMSSection[] }) {
  return (
    <div>
      {sections.map((section, idx) => (
        <SectionRenderer key={idx} section={section} index={idx} />
      ))}
    </div>
  );
}
