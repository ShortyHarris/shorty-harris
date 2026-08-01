import smartlookClient from 'smartlook-client';

// Client-dashboard only (see ClientZone in App.tsx) — not the admin side or
// the public marketing site. Project keys like this are meant to sit in
// front-end code (same threat model as the GA tracking id or Supabase anon
// key already hardcoded elsewhere in this app); this doesn't grant access to
// anything, it just tells Smartlook which project a recorded session belongs to.
const SMARTLOOK_KEY = '144345036b91aed816fb259d084efe5eb7e74010';

let initialized = false;

export function initSmartlook() {
  if (initialized) return;
  smartlookClient.init(SMARTLOOK_KEY, { region: 'eu' });
  initialized = true;
}

export function identifySmartlookUser(
  userId: string,
  props: { name?: string | null; role?: string; client_id?: string | null },
) {
  smartlookClient.identify(userId, {
    name: props.name ?? '',
    role: props.role ?? '',
    client_id: props.client_id ?? '',
  });
}
