import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
// Until auth is wired in, the dashboard scopes to this client.
export const CLIENT_ID = import.meta.env.VITE_DEMO_CLIENT_ID as string;
