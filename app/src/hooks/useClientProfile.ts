import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { dashboardKey } from './useClientDashboard';
import { clientHeaderKey } from './useClientHeader';

export interface ClientProfile {
  business_name: string;
  business_type: string | null;
  location: string | null;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  notification_channel: 'whatsapp' | 'sms';
}

export interface UpdateClientProfileInput {
  business_name: string;
  business_type: string;
  location: string;
  website_url: string;
  contact_email: string;
  contact_phone: string;
  contact_name: string;
  notification_channel: 'whatsapp' | 'sms';
}

export const clientProfileKey = (clientId: string) => ['client-profile', clientId] as const;

async function fetchClientProfile(clientId: string): Promise<ClientProfile> {
  const { data, error } = await supabase
    .from('clients')
    .select('business_name, business_type, location, website_url, contact_email, contact_phone, contact_name, notification_channel')
    .eq('id', clientId)
    .single();
  if (error) throw new Error(error.message);
  return data as ClientProfile;
}

export function useClientProfile(clientId: string) {
  const isPreview = clientId === '__preview__';

  const { data, isLoading: loading, error } = useQuery({
    queryKey: clientProfileKey(clientId),
    queryFn: () => fetchClientProfile(clientId),
    enabled: !!clientId && !isPreview,
    staleTime: 60 * 1000,
  });

  const updateProfile = useCallback(async (input: UpdateClientProfileInput) => {
    const { error } = await supabase
      .from('clients')
      .update({
        business_name: input.business_name,
        business_type: input.business_type || null,
        location: input.location || null,
        website_url: input.website_url || null,
        contact_email: input.contact_email || null,
        contact_phone: input.contact_phone || null,
        contact_name: input.contact_name || null,
        notification_channel: input.notification_channel,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clientId);

    if (error) return { error: error.message };

    queryClient.invalidateQueries({ queryKey: clientProfileKey(clientId) });
    queryClient.invalidateQueries({ queryKey: clientHeaderKey(clientId) });
    queryClient.invalidateQueries({ queryKey: dashboardKey(clientId) });
    return { error: null };
  }, [clientId]);

  return {
    profile: data ?? null,
    loading: isPreview ? false : loading,
    error: (error as Error)?.message ?? null,
    updateProfile,
  };
}
