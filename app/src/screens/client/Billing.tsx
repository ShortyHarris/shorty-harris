import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBilling } from '../../hooks/useBilling';
import './Billing.css';

interface Pack { credits: number; priceUsd: number; tag?: string; }
const PACKS: Pack[] = [
  { credits: 20,  priceUsd: 49 },
  { credits: 50,  priceUsd: 99,  tag: 'Most popular' },
  { credits: 100, priceUsd: 179, tag: 'Best value' },
];

function money(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
function date(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function Billing({ clientId, onCreditsChanged }: { clientId: string; onCreditsChanged?: () => void }) {
  const { data, loading, error, reload } = useBilling(clientId);
  const [selected, setSelected]           = useState<number>(50);
  const [checkoutBusy, setCheckoutBusy]   = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [searchParams, setSearchParams]   = useSearchParams();
  const [banner, setBanner]               = useState<{ kind: 'success' | 'cancel'; text: string } | null>(null);

  const pack = PACKS.find((p) => p.credits === selected)!;

  useEffect(() => {
    const status = searchParams.get('status');
    if (status === 'success') {
      setBanner({ kind: 'success', text: 'Payment received — your credits have been added.' });
      const t = setTimeout(() => { reload(); onCreditsChanged?.(); }, 2500);
      setSearchParams({}, { replace: true });
      return () => clearTimeout(t);
    } else if (status === 'cancel') {
      setBanner({ kind: 'cancel', text: 'Checkout cancelled — no charge was made.' });
      setSearchParams({}, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        window.location.href = json.checkout_url;
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
      {/* Payment status banner */}
      {banner && (
        <div className={`pay-banner ${banner.kind}`}>{banner.text}</div>
      )}

      {/* ── Credit balance ── */}
      <div className="credit-hero">
        <div className="credit-hero-num">{loading ? '—' : data?.credits}</div>
        <div className="credit-hero-label">credits remaining</div>
        {!loading && data?.smsCredits != null && (
          <div className="credit-hero-sms">+ {data.smsCredits} SMS credits</div>
        )}
        <div className="credit-hero-note">
          Each hot lead routed to you costs 1 credit
        </div>
      </div>

      {/* ── Add credits ── */}
      <div className="bill-section-head">
        <h2>Add more credits</h2>
      </div>

      <div className="pack-list">
        {PACKS.map((p) => (
          <button
            key={p.credits}
            className={`pack-row${selected === p.credits ? ' is-selected' : ''}`}
            onClick={() => setSelected(p.credits)}
          >
            <div className="pack-radio">
              <div className="pack-radio-dot" />
            </div>
            <div className="pack-row-body">
              <div className="pack-row-name">
                {p.credits} credits
                {p.tag && <span className="pack-tag">{p.tag}</span>}
              </div>
              <div className="pack-row-per">
                ${(p.priceUsd / p.credits).toFixed(2)} per lead
              </div>
            </div>
            <div className="pack-row-price">${p.priceUsd}</div>
          </button>
        ))}
      </div>

      <button className="checkout-btn" onClick={startCheckout} disabled={checkoutBusy}>
        {checkoutBusy
          ? 'Starting secure checkout…'
          : `Buy ${selected} credits — $${pack.priceUsd}`}
      </button>
      {checkoutError && (
        <p className="checkout-note checkout-note-error">{checkoutError}</p>
      )}
      <p className="checkout-note">
        Secure checkout via Stripe. Credits are added immediately on success.
      </p>

      {/* ── Payment history ── */}
      <div className="bill-section-head bill-section-head-spaced">
        <h2>Payment history</h2>
        <button className="bill-refresh" onClick={reload}>Refresh</button>
      </div>

      {error && <div className="bill-error">{error}</div>}

      {loading ? (
        <div className="bill-empty"><span>Loading…</span></div>
      ) : (data?.payments.length ?? 0) === 0 ? (
        <div className="bill-empty">
          <strong>No payments yet</strong>
          <span>Your purchases will appear here.</span>
        </div>
      ) : (
        <div className="payment-list">
          {data!.payments.map((p) => (
            <div className="payment-item" key={p.id}>
              <div className="payment-item-left">
                <span className="payment-item-credits">
                  {p.credits_purchased > 0 ? `+${p.credits_purchased} credits` : '—'}
                </span>
                <span className="payment-item-date">{date(p.created_at)}</span>
              </div>
              <div className="payment-item-right">
                <span className="payment-item-amount">
                  {money(p.amount_cents, p.currency)}
                </span>
                <span className={`pay-pill ${p.status}`}>{p.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Credit activity ── */}
      {!loading && (data?.ledger.length ?? 0) > 0 && (
        <>
          <div className="bill-section-head bill-section-head-spaced">
            <h2>Credit activity</h2>
          </div>
          <div className="activity-list">
            {data!.ledger.map((l) => (
              <div className="activity-item" key={l.id}>
                <div className="activity-item-info">
                  <span className="activity-desc">
                    {l.description ?? l.type.replace(/_/g, ' ')}
                  </span>
                  <span className="activity-date">{date(l.created_at)}</span>
                </div>
                <span className={`activity-amt ${l.amount < 0 ? 'neg' : 'pos'}`}>
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
