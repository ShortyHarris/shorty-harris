import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BrandLockup } from '../components/BrandLockup';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif" };

// Only shown on the outcomes that mean "we won't be emailing you again" -
// not on 'working' (nothing sad has happened yet) or 'error' (a retry might
// still fix it, so it's not actually goodbye).
const SAD_ILLUSTRATION_URL = 'https://lxoeotyibsalbxgbjfxo.supabase.co/storage/v1/object/public/blog-covers/image-removebg-preview%20(1).png';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type State =
  | { status: 'working' }
  | { status: 'success'; businessName: string | null }
  | { status: 'invalid' }
  | { status: 'error' };

// Public, unauthenticated page reached from an unsubscribe link in an email.
// Deliberately outside any auth guard and renders no app chrome - a recipient
// clicking this from their inbox has no session, and must never be bounced
// to /login. One click is the entire flow: no confirmation, no sign-in, no
// data collection beyond the token already in the URL.
export function Unsubscribe() {
  const [state, setState] = useState<State>({ status: 'working' });

  useEffect(() => {
    document.title = 'Unsubscribe - Shorty Harris';

    let el = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', 'robots');
      document.head.appendChild(el);
    }
    const previous = el.getAttribute('content');
    el.setAttribute('content', 'noindex, nofollow');

    return () => {
      if (previous) el?.setAttribute('content', previous);
      else el?.removeAttribute('content');
    };
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('t');

    if (!token || !UUID_RE.test(token)) {
      setState({ status: 'invalid' });
      return;
    }

    let cancelled = false;
    Promise.resolve(supabase.rpc('unsubscribe_by_token', { p_token: token }))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ status: 'error' });
          return;
        }
        if (data?.ok) {
          setState({ status: 'success', businessName: data.business_name ?? null });
        } else {
          setState({ status: 'invalid' });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={FONT} className="min-h-screen bg-white text-[#1a1b17] flex items-center justify-center px-6">
      <main className="max-w-[480px] w-full py-16 text-center">
        <BrandLockup />

        {state.status === 'working' && (
          <>
            <div
              aria-hidden="true"
              style={{
                margin: '0 auto 24px',
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: '2px solid #ddd8cb',
                borderTopColor: '#3c7a5b',
                animation: 'sh-unsub-spin 0.7s linear infinite',
              }}
            />
            <style>{`@keyframes sh-unsub-spin { to { transform: rotate(360deg); } }`}</style>
            <h1 className="m-0 text-[22px] font-bold leading-tight">Working on it…</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[#54574e]">Processing your unsubscribe request.</p>
          </>
        )}

        {state.status === 'success' && (
          <>
            <img
              src={SAD_ILLUSTRATION_URL}
              alt=""
              aria-hidden="true"
              className="mx-auto mb-6 w-md"
            />
            <h1
              className="m-0 text-[26px] sm:text-[30px] font-extrabold leading-tight"
              style={{ letterSpacing: '-0.02em' }}
            >
              Sorry to see you go😔
            </h1>
       
            <p className="mt-4 text-[15.5px] leading-tight text-[#54574e]">
              You've been unsubscribed.{' '}
              {state.businessName
                ? `You will no longer receive emails from ${state.businessName}.`
                : 'You will no longer receive emails from this sender.'}{' '}
              No further action is needed.
            </p>
          </>
        )}

        {state.status === 'invalid' && (
          <>
            <h1 className="m-0 text-[22px] font-bold leading-tight">This link is invalid or expired</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-[#54574e]">
              We couldn't process this unsubscribe link. If you'd still like to stop receiving these emails, reply
              to the email with the word "unsubscribe" and we'll take care of it.
            </p>
          </>
        )}

        {state.status === 'error' && (
          <>
            <h1 className="m-0 text-[22px] font-bold leading-tight">Something went wrong</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-[#54574e]">
              We couldn't process your request. Please try again.
            </p>
            <button
              onClick={() => {
                setState({ status: 'working' });
                window.location.reload();
              }}
              className="mt-6 cursor-pointer rounded-xl border-0 bg-[#3c7a5b] px-5 py-2.5 text-[13px] font-semibold text-white"
            >
              Try again
            </button>
            <p className="mt-5 text-[13.5px] leading-relaxed text-[#54574e]">
              Or reply to the email with the word "unsubscribe" and we'll take care of it.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
