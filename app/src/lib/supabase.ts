import { createClient } from '@supabase/supabase-js';

const url = 'https://lxoeotyibsalbxgbjfxo.supabase.co';
const anonKey = 'sb_publishable_CdK80AB1j_99hPPZGGS_jA_XYsNzrUs';

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
