'use client'

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePathname } from 'next/navigation';

interface NotificationMessage {
  name: string;
  location: string;
  service: string;
}

const SERVICE_TYPES = [
  'kitchen estimate',
  'bathroom remodel',
  'basement finishing',
  'home addition',
  'interior renovation',
];

const SocialProofPopup = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [currentMessage, setCurrentMessage] = useState<NotificationMessage | null>(null);
  const [messages, setMessages] = useState<NotificationMessage[]>([]);
  const pathname = usePathname();

  // Load reviewer names and locations
  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch reviewer names from google_reviews
        const { data: reviews } = await supabase
          .from('google_reviews')
          .select('reviewer_name')
          .not('reviewer_name', 'is', null)
          .limit(20);

        // Fetch service areas for locations
        const { data: areas } = await supabase
          .from('service_areas')
          .select('name')
          .eq('active', true)
          .limit(20);

        // Generate notification messages
        const generatedMessages: NotificationMessage[] = [];
        const names = reviews?.map((r) => r.reviewer_name?.split(' ')[0] || 'Someone') || [
          'Alex',
          'Maria',
          'James',
          'Sarah',
          'Michael',
        ];
        const locations = areas?.map((a) => a.name) || [
          'Montclair',
          'Short Hills',
          'Alpine',
          'Saddle River',
          'Essex Fells',
        ];

        // Create combinations
        for (let i = 0; i < 10; i++) {
          const name = names[i % names.length];
          const location = locations[i % locations.length];
          const service = SERVICE_TYPES[i % SERVICE_TYPES.length];
          generatedMessages.push({ name, location, service });
        }

        setMessages(generatedMessages);
      } catch (error) {
        console.error('Error loading social proof data:', error);
        // Fallback messages
        setMessages([
          { name: 'Alex', location: 'Montclair', service: 'kitchen estimate' },
          { name: 'Maria', location: 'Short Hills', service: 'bathroom remodel' },
          { name: 'James', location: 'Alpine', service: 'basement finishing' },
        ]);
      }
    };

    loadData();
  }, []);

  // Show popup at random intervals
  useEffect(() => {
    if (messages.length === 0) return;

    // Don't show on admin pages
    if (pathname.startsWith('/admin') || pathname.startsWith('/auth')) {
      return;
    }

    const showRandomNotification = () => {
      // Random message from the pool
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      setCurrentMessage(randomMessage);
      setIsVisible(true);

      // Auto-hide after 5 seconds
      setTimeout(() => {
        setIsVisible(false);
      }, 5000);
    };

    // Show first notification after 10 seconds
    const initialTimeout = setTimeout(() => {
      showRandomNotification();
    }, 10000);

    // Then show every 30-45 seconds
    const interval = setInterval(() => {
      showRandomNotification();
    }, 30000 + Math.random() * 15000); // 30-45 seconds

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [messages, pathname]);

  if (!currentMessage) return null;

  return (
    <div
      className={`fixed bottom-6 left-6 z-50 transition-all duration-500 ease-in-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
      }`}
    >
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-sm flex items-start gap-3">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-[#ea580c] flex items-center justify-center text-white font-semibold">
            {currentMessage.name.charAt(0)}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            <span className="font-semibold">{currentMessage.name}</span> from{' '}
            <span className="font-semibold">{currentMessage.location}</span>
          </p>
          <p className="text-xs text-gray-600 mt-0.5">just requested a {currentMessage.service}</p>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default SocialProofPopup;
