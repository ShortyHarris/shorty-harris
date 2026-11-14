import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

/* Who sees the campaign wizard. Two switches, combined in the database by wizard_on_for():
     wizard_settings.sandbox_only  admin toggle: on = sandbox accounts only, off = every client
     clients.wizard_enabled        admin off-switch for one client
   Every screen asks wizard_on_for(), so flipping the toggle takes effect everywhere at once. */

/** Whether the wizard is on for this client. False on any error, so it fails closed. */
export async function fetchWizardOn(clientId: string, client: SupabaseClient = supabase): Promise<boolean> {
  const { data, error } = await client.rpc('wizard_on_for', { p_client_id: clientId });
  if (error) return false;
  return data === true;
}

export const wizardRolloutKey = ['wizard-rollout'] as const;

/** Admin: the sandbox-only toggle. `sandboxOnly` is null until it has loaded. */
export function useWizardRollout() {
  const { data, isLoading, error } = useQuery({
    queryKey: wizardRolloutKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('wizard_settings').select('sandbox_only').eq('id', 1).single();
      if (error) throw new Error(error.message);
      return { sandboxOnly: data.sandbox_only as boolean };
    },
    staleTime: 60 * 1000,
  });

  async function setSandboxOnly(sandboxOnly: boolean): Promise<{ error: string | null }> {
    const { data: rows, error } = await supabase
      .from('wizard_settings')
      .update({ sandbox_only: sandboxOnly, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select('sandbox_only');
    // RLS lets only admins update; a refused update comes back as zero rows, not an error.
    if (error || !rows?.length) return { error: error?.message ?? 'Only an admin can change this.' };
    queryClient.setQueryData(wizardRolloutKey, { sandboxOnly });
    // Anything cached about who has the wizard is now out of date.
    queryClient.invalidateQueries({ queryKey: ['client-header'] });
    return { error: null };
  }

  return {
    sandboxOnly: data?.sandboxOnly ?? null,
    loading: isLoading,
    error: (error as Error | null)?.message ?? null,
    setSandboxOnly,
  };
}
