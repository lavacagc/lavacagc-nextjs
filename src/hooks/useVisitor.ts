'use client';

import { useState, useEffect, useCallback } from 'react';

export interface VisitorData {
  id: string;
  first_seen: string;
  last_seen: string;
  visit_count: number;
  pages_visited: Array<{ path: string; timestamp: string }>;
  referrer: string | null;
}

const STORAGE_KEY = 'lavaca_visitor';
const LEGACY_KEY = 'lavaca_visitor_id';
const MAX_PAGES = 50;

function generateId(): string {
  return 'v_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function getStoredVisitor(): VisitorData | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as VisitorData;
  } catch {
    // corrupt data
  }
  return null;
}

function saveVisitor(data: VisitorData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    // Keep legacy key in sync for chat widget compatibility
    localStorage.setItem(LEGACY_KEY, data.id);
  } catch {
    // storage full or disabled
  }
}

export function getVisitorId(): string {
  if (typeof window === 'undefined') return '';
  const stored = getStoredVisitor();
  if (stored) return stored.id;
  // Check legacy key
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) return legacy;
  return '';
}

export function getVisitorData(): VisitorData | null {
  return getStoredVisitor();
}

export function useVisitor() {
  const [visitor, setVisitor] = useState<VisitorData | null>(null);

  const trackPage = useCallback((path: string) => {
    setVisitor(prev => {
      if (!prev) return prev;
      // Don't add duplicate consecutive pages
      const lastPage = prev.pages_visited[prev.pages_visited.length - 1];
      if (lastPage?.path === path) return prev;

      const updated: VisitorData = {
        ...prev,
        last_seen: new Date().toISOString(),
        pages_visited: [
          ...prev.pages_visited.slice(-(MAX_PAGES - 1)),
          { path, timestamp: new Date().toISOString() }
        ],
      };
      saveVisitor(updated);
      return updated;
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const now = new Date().toISOString();
    let existing = getStoredVisitor();

    if (existing) {
      // Returning visitor — increment visit count if last seen > 30 min ago
      const lastSeen = new Date(existing.last_seen).getTime();
      const thirtyMin = 30 * 60 * 1000;
      const isNewSession = Date.now() - lastSeen > thirtyMin;

      existing = {
        ...existing,
        last_seen: now,
        visit_count: isNewSession ? existing.visit_count + 1 : existing.visit_count,
      };
      saveVisitor(existing);
      setVisitor(existing);
    } else {
      // New visitor — check for legacy ID migration
      const legacyId = localStorage.getItem(LEGACY_KEY);
      const newVisitor: VisitorData = {
        id: legacyId || generateId(),
        first_seen: now,
        last_seen: now,
        visit_count: 1,
        pages_visited: [],
        referrer: document.referrer || null,
      };
      saveVisitor(newVisitor);
      setVisitor(newVisitor);
    }
  }, []);

  return {
    visitorId: visitor?.id || '',
    visitCount: visitor?.visit_count || 0,
    firstSeen: visitor?.first_seen || null,
    lastSeen: visitor?.last_seen || null,
    isReturning: (visitor?.visit_count || 0) > 1,
    pagesVisited: visitor?.pages_visited || [],
    referrer: visitor?.referrer || null,
    trackPage,
  };
}
