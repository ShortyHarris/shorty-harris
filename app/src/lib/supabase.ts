import { createClient } from '@supabase/supabase-js';
import { withTimeout } from './fetchWithTimeout';

const url = 'https://lxoeotyibsalbxgbjfxo.supabase.co';
const anonKey = 'sb_publishable_CdK80AB1j_99hPPZGGS_jA_XYsNzrUs';

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
  // No REST or auth request may hang forever - see fetchWithTimeout.ts.
  global: { fetch: withTimeout((...args) => fetch(...args)) },
});
