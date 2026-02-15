'use client'

import React from 'react';
import Image from 'next/image';
import Script from 'next/script';
import DOMPurify from 'dompurify';
import { Metadata } from 'next';

interface AMPBlogPostProps {
  title: string;
  content: string;
  author: string;
  publishedDate: string;
  modifiedDate?: string;
  featuredImage?: string;
  excerpt?: string;
  slug: string;
  isAMP?: boolean;
}

// Generate metadata for blog post pages
export const generateBlogPostMetadata = ({
  title,
  content,
  author,
  publishedDate,
  modifiedDate,
  featuredImage,
  excerpt,
  slug
}: AMPBlogPostProps): Metadata => {
  const canonicalUrl = `https://ajsconstructionnj.com/blog/${slug}`;
  const ampUrl = `https://ajsconstructionnj.com/blog/${slug}/amp`;
  const description = excerpt || content.substring(0, 160);

  return {
    title: `${title} | La Vaca General Contractors`,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      type: 'article',
      url: canonicalUrl,
      ...(featuredImage && { images: [featuredImage] }),
      authors: [author],
      publishedTime: publishedDate,
      ...(modifiedDate && { modifiedTime: modifiedDate }),
    },
    other: {
      'amphtml': ampUrl,
    }
  };
};

const AMPBlogPost: React.FC<AMPBlogPostProps> = ({
  title,
  content,
  author,
  publishedDate,
  modifiedDate,
  featuredImage,
  excerpt,
  slug,
  isAMP = false
}) => {
  const canonicalUrl = `https://ajsconstructionnj.com/blog/${slug}`;

  // Article structured data for AMP
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": excerpt || content.substring(0, 160),
    "author": {
      "@type": "Person",
      "name": author,
      "url": "https://ajsconstructionnj.com/about"
    },
    "publisher": {
      "@type": "Organization",
      "name": "La Vaca General Contractors",
      "logo": {
        "@type": "ImageObject",
        "url": "https://ajsconstructionnj.com/src/assets/logo.png",
        "width": 200,
        "height": 60
      }
    },
    "datePublished": publishedDate,
    "dateModified": modifiedDate || publishedDate,
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": canonicalUrl
    },
    ...(featuredImage && {
      "image": {
        "@type": "ImageObject",
        "url": featuredImage,
        "width": 1200,
        "height": 630
      }
    })
  };

  if (isAMP) {
    // Return AMP-specific version (simplified for Next.js)
    return (
      <>
        <Script
          id="article-schema-amp"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
        />

        <main>
          <article className="max-w-[800px] mx-auto px-5 py-6">
            <header>
              <h1 className="text-3xl font-bold text-primary mb-4 leading-tight">
                {title}
              </h1>
              <div className="text-text-secondary text-sm mb-8 pb-4 border-b border-border">
                By {author} | Published {new Date(publishedDate).toLocaleDateString()}
                {modifiedDate && ` | Updated ${new Date(modifiedDate).toLocaleDateString()}`}
              </div>
            </header>

            {featuredImage && (
              <Image
                src={featuredImage}
                width={800}
                height={400}
                className="w-full h-auto mb-8"
                alt={title}
                unoptimized
              />
            )}

            <div
              className="prose prose-lg max-w-none"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(content, {
                  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'img', 'blockquote', 'code', 'pre', 'span', 'div'],
                  ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'id']
                })
              }}
            />

            <div className="bg-gradient-to-r from-primary to-accent-tangerine text-white rounded-lg p-6 mt-8 text-center">
              <h3 className="text-xl font-bold mb-2 text-white">Ready to Start Your Remodeling Project?</h3>
              <p className="mb-4 text-white/90">Get a free estimate from Northern NJ&apos;s trusted renovation experts.</p>
              <a href="tel:(201)555-0123" className="inline-block bg-white/20 text-white font-semibold px-6 py-3 rounded-lg hover:bg-white/30 transition-colors no-underline">
                Call (201) 555-0123
              </a>
            </div>
          </article>
        </main>
      </>
    );
  }

  // Regular blog post with AMP link
  return (
    <>
      <Script
        id="article-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />

      <article className="max-w-4xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-text-primary mb-4 leading-tight">
            {title}
          </h1>
          <div className="text-text-secondary text-sm mb-6">
            By {author} | Published {new Date(publishedDate).toLocaleDateString()}
            {modifiedDate && ` | Updated ${new Date(modifiedDate).toLocaleDateString()}`}
          </div>
        </header>

        {featuredImage && (
          <Image
            src={featuredImage}
            alt={title}
            className="w-full h-64 md:h-80 object-cover rounded-lg mb-8"
            width={800}
            height={400}
            unoptimized
          />
        )}

        <div
          className="prose prose-lg max-w-none text-text-secondary leading-relaxed"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(content, {
              ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'img', 'blockquote', 'code', 'pre', 'span', 'div'],
              ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'id']
            })
          }}
        />

        <div className="bg-gradient-to-r from-primary to-accent-tangerine text-white rounded-lg p-6 mt-8 text-center">
          <h3 className="text-xl font-bold mb-2 text-white">Ready to Start Your Remodeling Project?</h3>
          <p className="mb-4 text-white/90">Get a free estimate from Northern NJ&apos;s trusted renovation experts.</p>
          <a
            href="tel:(201)555-0123"
            className="inline-block bg-white/20 text-white font-semibold px-6 py-3 rounded-lg hover:bg-white/30 transition-colors no-underline"
          >
            Call (201) 555-0123
          </a>
        </div>
      </article>
    </>
  );
};

export default AMPBlogPost;
