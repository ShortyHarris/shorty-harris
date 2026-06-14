import { useState, useEffect } from 'react';
import { useBilling } from '../hooks/useBilling';
import './Billing.css';

interface Pack { credits: number; priceUsd: number; tag?: string; }
const PACKS: Pack[] = [
  { credits: 20, priceUsd: 49 },
  { credits: 50, priceUsd: 99, tag: 'Most popular' },
  { credits: 100, priceUsd: 179, tag: 'Best value' },
];

function money(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}
function date(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function Billing({ clientId, onCreditsChanged }: { clientId: string; onCreditsChanged?: () => void }) {
  const { data, loading, error, reload } = useBilling(clientId);
  const [selected, setSelected] = useState<number>(50);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const pack = PACKS.find((p) => p.credits === selected)!;

  // React to the redirect back from Stripe (?status=success|cancel)
  const [banner, setBanner] = useState<{ kind: 'success' | 'cancel'; text: string } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    if (status === 'success') {
      setBanner({ kind: 'success', text: 'Payment received — your credits have been added.' });
      // give the webhook a moment, then refresh the balance
      const t = setTimeout(() => { reload(); onCreditsChanged?.(); }, 2500);
      window.history.replaceState({}, '', window.location.pathname);
      return () => clearTimeout(t);
    } else if (status === 'cancel') {
      setBanner({ kind: 'cancel', text: 'Checkout cancelled — no charge was made.' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [reload]);

  async function startCheckout() {
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const endpoint = import.meta.env.VITE_CHECKOUT_WEBHOOK_URL as string;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          credits: pack.credits,
          amount_cents: pack.priceUsd * 100,
          label: `${pack.credits} lead credits`,
        }),
      });
      const json = await res.json();
      if (json.checkout_url) {
        window.location.href = json.checkout_url; // redirect to Stripe hosted checkout
      } else {
        setCheckoutError('Could not start checkout. Please try again.');
      }
    } catch {
      setCheckoutError('Could not reach the payment service. Please try again.');
    } finally {
      setCheckoutBusy(false);
    }
  }

  return (
    <main className="content">
      <section className="hero">
        <h1>Billing &amp; credits</h1>
        <p className="hero-sub">Each hot lead we route to you costs 1 credit. Top up whenever you’re running low.</p>
      </section>

      {banner && (
        <div className={`pay-banner ${banner.kind}`}>{banner.text}</div>
      )}

      <div className="balance-row">
        <div className="balance-card primary">
          <div className="balance-num">{loading ? '—' : data?.credits}</div>
          <div className="balance-label">Lead credits remaining</div>
        </div>
        <div className="balance-card">
          <div className="balance-num">{loading ? '—' : data?.smsCredits}</div>
          <div className="balance-label">SMS credits</div>
        </div>
      </div>

      <div className="section-head"><h2>Top up</h2></div>
      <div className="pack-grid">
        {PACKS.map((p) => (
          <button
            key={p.credits}
            className={`pack ${selected === p.credits ? 'is-selected' : ''}`}
            onClick={() => setSelected(p.credits)}
          >
            {p.tag && <span className="pack-tag">{p.tag}</span>}
            <div className="pack-credits">{p.credits}</div>
            <div className="pack-credits-label">credits</div>
            <div className="pack-price">${p.priceUsd}</div>
            <div className="pack-per">${(p.priceUsd / p.credits).toFixed(2)} / lead</div>
          </button>
        ))}
      </div>

      <button className="checkout-btn" onClick={startCheckout} disabled={checkoutBusy}>
        {checkoutBusy ? 'Starting secure checkout…' : `Buy ${selected} credits — $${pack.priceUsd}`}
      </button>
      {checkoutError && <p className="checkout-note" style={{ color: 'var(--clay)' }}>{checkoutError}</p>}
      <p className="checkout-note">Secure checkout via Stripe. You’ll be charged once; credits are added immediately on success.</p>

      <div className="section-head spaced">
        <h2>Payment history</h2>
        <button className="link-btn" onClick={reload}>Refresh</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : (data?.payments.length ?? 0) === 0 ? (
        <div className="empty"><strong>No payments yet.</strong><span>Your purchases will appear here.</span></div>
      ) : (
        <div className="hist-table">
          <div className="hist-head">
            <span>Date</span><span>Credits</span><span>Amount</span><span>Status</span>
          </div>
          {data!.payments.map((p) => (
            <div className="hist-row" key={p.id}>
              <span>{date(p.created_at)}</span>
              <span>{p.credits_purchased > 0 ? `+${p.credits_purchased}` : '—'}</span>
              <span>{money(p.amount_cents, p.currency)}</span>
              <span><i className={`pay-pill ${p.status}`}>{p.status}</i></span>
            </div>
          ))}
        </div>
      )}

      {!loading && (data?.ledger.length ?? 0) > 0 && (
        <>
          <div className="section-head spaced"><h2>Credit activity</h2></div>
          <div className="ledger">
            {data!.ledger.map((l) => (
              <div className="ledger-row" key={l.id}>
                <div className="ledger-main">
                  <span className="ledger-desc">{l.description ?? l.type.replace(/_/g, ' ')}</span>
                  <span className="ledger-date">{date(l.created_at)}</span>
                </div>
                <span className={`ledger-amt ${l.amount < 0 ? 'neg' : 'pos'}`}>
                  {l.amount > 0 ? `+${l.amount}` : l.amount}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
