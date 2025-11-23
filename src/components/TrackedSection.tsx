'use client';

import { ReactNode } from 'react';
import { useScrollTracking } from '@/hooks/useScrollTracking';

interface TrackedSectionProps {
  sectionId: string;
  sectionName: string;
  children: ReactNode;
  className?: string;
  id?: string;
  trackTimeOnSection?: boolean;
  trackScrollDepth?: boolean;
  scrollDepthThresholds?: number[];
  minTimeThreshold?: number;
}

/**
 * Wrapper component that adds scroll tracking to any section
 *
 * @example
 * ```tsx
 * <TrackedSection
 *   sectionId="testimonials"
 *   sectionName="Testimonials Section"
 *   className="py-20 bg-background"
 * >
 *   <Testimonials />
 * </TrackedSection>
 * ```
 */
export default function TrackedSection({
  sectionId,
  sectionName,
  children,
  className = '',
  id,
  trackTimeOnSection = true,
  trackScrollDepth = true,
  scrollDepthThresholds = [25, 50, 75, 100],
  minTimeThreshold = 3,
}: TrackedSectionProps) {
  const sectionRef = useScrollTracking({
    sectionId,
    sectionName,
    trackTimeOnSection,
    trackScrollDepth,
    scrollDepthThresholds,
    minTimeThreshold,
  });

  return (
    <section ref={sectionRef} className={className} id={id}>
      {children}
    </section>
  );
}
