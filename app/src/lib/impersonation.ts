import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

const url = 'https://lxoeotyibsalbxgbjfxo.supabase.co';
const anonKey = 'sb_publishable_CdK80AB1j_99hPPZGGS_jA_XYsNzrUs';

function blocked(action: string): never {
  throw new Error(`"${action}" is disabled - you are viewing this client in read-only mode.`);
}

// Wraps a real Supabase client so every mutating call throws client-side,
// before any network request - the first of two independent layers. The
// one that actually matters is the impersonation_read-only RLS policies
// added by the impersonation_rls migration: even a raw fetch bypassing
// this wrapper entirely still can't write, because no write policy exists
// for the impersonation JWT claim on any table.
function makeReadOnly(client: SupabaseClient): SupabaseClient {
  const originalFrom = client.from.bind(client);
  client.from = ((table: string) => {
    const qb = originalFrom(table);
    qb.insert = () => blocked('insert');
    qb.update = () => blocked('update');
    qb.upsert = () => blocked('upsert');
    qb.delete = () => blocked('delete');
    return qb;
  }) as typeof client.from;
  // functions can mutate too (e.g. gmail-client); block them wholesale
  client.functions.invoke = (() => blocked('functions.invoke')) as typeof client.functions.invoke;
  return client;
}

export interface ImpersonationSession {
  client: SupabaseClient;
  clientId: string;
  businessName: string;
  expiresAt: number;
}

export async function startImpersonation(clientId: string): Promise<ImpersonationSession> {
  const { data, error } = await supabase.functions.invoke('start-impersonation', {
    body: { client_id: clientId },
  });
  if (error || data?.error) {
    throw new Error(data?.error ?? error?.message ?? 'Failed to start impersonation.');
  }

  const rawClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.token}` } },
  });

  return {
    client: makeReadOnly(rawClient),
    clientId: data.client_id,
    businessName: data.business_name,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function endImpersonation(clientId: string): Promise<void> {
  try {
    await supabase.functions.invoke('end-impersonation', { body: { client_id: clientId } });
  } catch {
    // Best-effort - the token expires on its own regardless (15 min TTL).
  }
}
