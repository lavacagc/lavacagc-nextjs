import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GMBConfig {
  id: string;
  account_id: string | null;
  location_id: string | null;
  business_name: string | null;
  last_sync: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoogleReview {
  id: string;
  review_id: string;
  reviewer_name: string | null;
  reviewer_photo_url: string | null;
  star_rating: number;
  comment: string | null;
  review_reply: string | null;
  create_time: string | null;
  update_time: string | null;
  created_at: string;
  updated_at: string;
}

export const useGMBConfig = () => {
  return useQuery({
    queryKey: ['gmb-config'],
    queryFn: async () => {
      // Use the secure function that doesn't expose OAuth tokens
      const { data, error } = await supabase.rpc('get_gmb_config_safe');

      if (error) throw error;
      // The function returns JSON which we parse into GMBConfig
      return data ? (data as unknown as GMBConfig) : null;
    },
  });
};

export const useGoogleReviews = () => {
  return useQuery({
    queryKey: ['google-reviews'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('google_reviews')
        .select('*')
        .order('create_time', { ascending: false });

      if (error) throw error;
      return data as GoogleReview[];
    },
  });
};

export const useGetAuthUrl = () => {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('google-my-business/auth-url');
      
      if (error) throw error;
      return data;
    },
  });
};

export const useRefreshToken = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('google-my-business/refresh-token', {
        method: 'POST',
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gmb-config'] });
    },
  });
};

export const useGetAccounts = () => {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('google-my-business/accounts');
      
      if (error) throw error;
      return data;
    },
  });
};

export const useGetLocations = () => {
  return useMutation({
    mutationFn: async (accountId: string) => {
      const { data, error } = await supabase.functions.invoke('google-my-business/locations', {
        body: { accountId },
      });
      
      if (error) throw error;
      return data;
    },
  });
};

export const useSyncReviews = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('google-my-business/sync-reviews', {
        method: 'POST',
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['gmb-config'] });
    },
  });
};

export const useSaveGMBConfig = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (config: { accountId: string; locationId: string; businessName: string }) => {
      const { data, error } = await supabase.functions.invoke('google-my-business/save-config', {
        body: config,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gmb-config'] });
    },
  });
};

export const useSyncLogs = () => {
  return useQuery({
    queryKey: ['review-sync-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_sync_log')
        // CM-14: one row per sync run, forever - the history panel only ever
        // shows the recent ones.
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
  });
};
