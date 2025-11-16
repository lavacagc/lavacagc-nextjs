'use client'

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SEOStats {
  // SEO Health
  averageScore: number;
  pagesOptimized: number;
  totalPages: number;
  missingMetaDescriptions: number;

  // Link Health
  brokenLinksCount: number;
  totalLinksChecked: number;
  lastLinkCheck: Date | null;

  // Redirects
  activeRedirects: number;
  totalRedirects: number;
  monthlyHits: number;

  // Loading state
  loading: boolean;
  error: string | null;
}

export const useSEOStats = () => {
  const [stats, setStats] = useState<SEOStats>({
    averageScore: 0,
    pagesOptimized: 0,
    totalPages: 0,
    missingMetaDescriptions: 0,
    brokenLinksCount: 0,
    totalLinksChecked: 0,
    lastLinkCheck: null,
    activeRedirects: 0,
    totalRedirects: 0,
    monthlyHits: 0,
    loading: true,
    error: null
  });

  const fetchAllStats = useCallback(async () => {
    setStats(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Fetch all data in parallel for better performance
      const [
        redirectsResult,
        brokenLinksResult,
        blogPostsResult,
        pagesResult
      ] = await Promise.all([
        supabase.from('redirects').select('active, hit_count, created_at'),
        supabase.from('broken_links').select('resolved, last_checked, url'),
        supabase.from('blog_posts').select('meta_description, meta_title'),
        supabase.from('pages').select('id')
      ]);

      // Calculate redirect stats
      const redirects = redirectsResult.data || [];
      const activeRedirects = redirects.filter(r => r.active).length;
      const totalRedirects = redirects.length;
      const monthlyHits = redirects.reduce((sum, r) => sum + (r.hit_count || 0), 0);

      // Calculate broken links stats
      const brokenLinks = brokenLinksResult.data || [];
      const unresolvedBrokenLinks = brokenLinks.filter(l => !l.resolved).length;
      const totalLinksChecked = brokenLinks.length;
      const lastLinkCheck = brokenLinks.length > 0
        ? new Date(Math.max(...brokenLinks.map(l => new Date(l.last_checked || 0).getTime())))
        : null;

      // Calculate SEO health stats
      const blogPosts = blogPostsResult.data || [];
      const pages = pagesResult.data || [];
      const totalContentPages = blogPosts.length + pages.length;

      // Count pages with proper SEO (has meta description)
      const blogPostsWithMeta = blogPosts.filter(p => p.meta_description && p.meta_description.trim().length > 0);
      const pagesOptimized = blogPostsWithMeta.length;
      const missingMetaDescriptions = blogPosts.filter(p => !p.meta_description || p.meta_description.trim().length === 0).length;

      // Calculate average SEO score (simple heuristic based on completeness)
      const calculateSEOScore = () => {
        if (blogPosts.length === 0) return 0;

        let totalScore = 0;
        blogPosts.forEach(post => {
          let postScore = 0;
          // Meta description present: +40 points
          if (post.meta_description && post.meta_description.trim().length > 0) postScore += 40;
          // Meta description optimal length (120-160 chars): +20 points
          if (post.meta_description && post.meta_description.length >= 120 && post.meta_description.length <= 160) postScore += 20;
          // Meta title present: +30 points
          if (post.meta_title && post.meta_title.trim().length > 0) postScore += 30;
          // Meta title optimal length (50-60 chars): +10 points
          if (post.meta_title && post.meta_title.length >= 50 && post.meta_title.length <= 60) postScore += 10;
          totalScore += postScore;
        });
        return Math.round(totalScore / blogPosts.length);
      };

      setStats({
        averageScore: calculateSEOScore(),
        pagesOptimized,
        totalPages: blogPosts.length,
        missingMetaDescriptions,
        brokenLinksCount: unresolvedBrokenLinks,
        totalLinksChecked,
        lastLinkCheck,
        activeRedirects,
        totalRedirects,
        monthlyHits,
        loading: false,
        error: null
      });
    } catch (err) {
      console.error('Error fetching SEO stats:', err);
      setStats(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch SEO stats'
      }));
    }
  }, []);

  useEffect(() => {
    fetchAllStats();
  }, [fetchAllStats]);

  return { stats, refresh: fetchAllStats };
};
