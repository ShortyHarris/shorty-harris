// Captures Supabase's redirect error (e.g. an expired/used invite or
// password-reset link: #error=access_denied&error_code=otp_expired&...)
// at the earliest possible moment.
//
// This file must have NO imports and must be the very first import in
// main.tsx. Supabase's client (lib/supabase.ts) parses and then strips
// this same URL hash as part of its own session-detection on init, so
// capturing it here - before that module is ever evaluated - is the only
// reliable way to still see it later, e.g. in SetPassword.tsx.
const hash = typeof window !== 'undefined' ? window.location.hash : '';
const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);

const errorCode = params.get('error_code');

export const authRedirectError = errorCode
  ? {
      code: errorCode,
      description: params.get('error_description')?.replace(/\+/g, ' ') ?? null,
    }
  : null;
