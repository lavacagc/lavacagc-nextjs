'use client'

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

const INACTIVITY_TIMEOUT = 20 * 60 * 1000; // 20 minutes in milliseconds

/**
 * InactivityTimer component that monitors user activity on admin pages
 * and automatically signs out after 20 minutes of inactivity
 */
export function InactivityTimer() {
  const { user } = useAuth();
  const pathname = usePathname();
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const isAdminRoute = pathname?.startsWith('/admin') || pathname?.startsWith('/vaca-mgmt') || pathname?.startsWith('/auth');

    if (!user || !isAdminRoute) {
      // Clear timer if not on admin route or not logged in
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    const resetInactivityTimer = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      inactivityTimerRef.current = setTimeout(async () => {
        await supabase.auth.signOut();
      }, INACTIVITY_TIMEOUT);
    };

    // Start the timer
    resetInactivityTimer();

    // Activity events to reset timer
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];

    events.forEach(event => {
      window.addEventListener(event, resetInactivityTimer);
    });

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      events.forEach(event => {
        window.removeEventListener(event, resetInactivityTimer);
      });
    };
  }, [user, pathname]);

  return null;
}

export default InactivityTimer;
