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
  Paintbrush, Zap, Phone, DollarSign, Heart, ThumbsUp, CheckCircle,
} from 'lucide-react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import Link from 'next/link';
import type {
  CMSSection, HeroSection, BeforeAfterSection, FeaturesSection,
  TestimonialsSection, TextSection, CTASection, FAQSection, GallerySection,
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

// ─── Hero Section ──────────────────────────────────────────────────

function HeroRenderer({ section }: { section: HeroSection }) {
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
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            {section.heading}
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

function BeforeAfterRenderer({ section }: { section: BeforeAfterSection }) {
  if (!section.items?.length) return null;
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        {section.heading && (
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-4">
            {section.heading}
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

function FeaturesRenderer({ section }: { section: FeaturesSection }) {
  if (!section.items?.length) return null;
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        {section.heading && (
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-12">
            {section.heading}
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

function TestimonialsRenderer({ section }: { section: TestimonialsSection }) {
  if (!section.items?.length) return null;
  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        {section.heading && (
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-12">
            {section.heading}
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

function TextRenderer({ section }: { section: TextSection }) {
  // Simple markdown-like rendering (handles lists, bold, italic)
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
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        {section.heading && (
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-8">
            {section.heading}
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
          <h2 className="text-2xl md:text-3xl font-bold mb-4">{section.heading}</h2>
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
            <a
              href={`tel:${section.phone.replace(/[^0-9+]/g, '')}`}
              className="inline-flex items-center gap-2 text-secondary-foreground hover:text-primary transition-colors font-medium text-lg"
            >
              <Phone className="h-5 w-5" />
              {section.phone}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ Section ───────────────────────────────────────────────────

function FAQRenderer({ section }: { section: FAQSection }) {
  if (!section.items?.length) return null;
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4 max-w-3xl">
        {section.heading && (
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-8">
            {section.heading}
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

function GalleryRenderer({ section }: { section: GallerySection }) {
  if (!section.images?.length) return null;
  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        {section.heading && (
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-8">
            {section.heading}
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

// ─── Main Renderer ─────────────────────────────────────────────────

function SectionRenderer({ section }: { section: CMSSection }) {
  switch (section.type) {
    case 'hero': return <HeroRenderer section={section} />;
    case 'before-after': return <BeforeAfterRenderer section={section} />;
    case 'features': return <FeaturesRenderer section={section} />;
    case 'testimonials': return <TestimonialsRenderer section={section} />;
    case 'text': return <TextRenderer section={section} />;
    case 'cta': return <CTARenderer section={section} />;
    case 'faq': return <FAQRenderer section={section} />;
    case 'gallery': return <GalleryRenderer section={section} />;
    default: return null;
  }
}

export default function CMSPageRenderer({ sections }: { sections: CMSSection[] }) {
  return (
    <div>
      {sections.map((section, idx) => (
        <SectionRenderer key={idx} section={section} />
      ))}
    </div>
  );
}
