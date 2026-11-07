import { createClient } from '@supabase/supabase-js';

const LIVE_URL = 'https://lxoeotyibsalbxgbjfxo.supabase.co';
const LIVE_ANON_KEY = 'sb_publishable_CdK80AB1j_99hPPZGGS_jA_XYsNzrUs';

// Local development can point the app at a local Supabase stack with VITE_LOCAL_SUPABASE_URL and
// VITE_LOCAL_SUPABASE_ANON_KEY in app/.env.local. Only `vite` dev mode reads them; a production
// build always uses the live project, whatever the environment says.
const local = import.meta.env.DEV ? import.meta.env.VITE_LOCAL_SUPABASE_URL : undefined;
const localKey = import.meta.env.DEV ? import.meta.env.VITE_LOCAL_SUPABASE_ANON_KEY : undefined;

const url = local && localKey ? local : LIVE_URL;
const anonKey = local && localKey ? localKey : LIVE_ANON_KEY;

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
