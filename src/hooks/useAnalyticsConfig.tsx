import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AnalyticsConfig {
  id: string;
  ga4_measurement_id: string | null;
  gtm_container_id: string | null;
  tracking_enabled: boolean;
  consent_mode_enabled: boolean;
  ip_anonymization: boolean;
  enhanced_ecommerce: boolean;
  custom_dimensions: Record<string, unknown>;
  privacy_settings: Record<string, unknown>;
}

export interface CustomEvent {
  id: string;
  event_name: string;
  event_category: string;
  event_action: string;
  event_label: string | null;
  event_value: number | null;
  parameters: Record<string, unknown>;
  active: boolean;
  description: string | null;
}

export const useAnalyticsConfig = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['analytics-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analytics_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as AnalyticsConfig | null;
    },
  });

  const { data: customEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['custom-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_events')
        .select('*')
        .order('event_name');

      if (error) throw error;
      return data as CustomEvent[];
    },
  });

  const updateConfig = useMutation({
    mutationFn: async (updates: Partial<AnalyticsConfig>) => {
      if (!config?.id) {
        const { data, error } = await supabase
          .from('analytics_config')
          .insert(updates)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase
        .from('analytics_config')
        .update(updates)
        .eq('id', config.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-config'] });
      toast({
        title: 'Success',
        description: 'Analytics configuration updated successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to update configuration: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  const createEvent = useMutation({
    mutationFn: async (event: Omit<CustomEvent, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('custom_events')
        .insert(event)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-events'] });
      toast({
        title: 'Success',
        description: 'Custom event created successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to create event: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  const updateEvent = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CustomEvent> & { id: string }) => {
      const { data, error } = await supabase
        .from('custom_events')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-events'] });
      toast({
        title: 'Success',
        description: 'Custom event updated successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to update event: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('custom_events')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-events'] });
      toast({
        title: 'Success',
        description: 'Custom event deleted successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to delete event: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  return {
    config,
    customEvents,
    isLoading: configLoading || eventsLoading,
    updateConfig: updateConfig.mutate,
    createEvent: createEvent.mutate,
    updateEvent: updateEvent.mutate,
    deleteEvent: deleteEvent.mutate,
  };
};
