import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBilling } from '../../hooks/useBilling';
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
  const [searchParams, setSearchParams] = useSearchParams();

  const pack = PACKS.find((p) => p.credits === selected)!;

  const [banner, setBanner] = useState<{ kind: 'success' | 'cancel'; text: string } | null>(null);
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
    <main className="ccontent">
      <header className="bil-head">
        <div>
          <span className="overline">BILLING & CREDITS</span>
          <h1>Top up and track every cent.</h1>
          <p className="bil-sub">Each hot lead we route to you costs 1 credit. Top up whenever you're running low.</p>
        </div>
        <button className="btn-solid" onClick={reload}>Export Account Data</button>
      </header>

      {banner && <div className={`bil-banner ${banner.kind}`}>{banner.text}</div>}

      {/* Balance card */}
      <section className="bil-balance">
        <div className="bil-balance-info">
          <div className="bil-balance-label">CURRENT BALANCE</div>
          <div className="bil-balance-num">
            {loading ? '—' : data?.credits}
            <span className="bil-balance-unit">Credits</span>
          </div>
          <div className="bil-balance-hint">
            {data ? `${data.smsCredits} SMS credits available · ` : ''}
            Next automated top-up scheduled when balance hits 5.
          </div>
        </div>
        <button className="bil-topup-cta" onClick={startCheckout} disabled={checkoutBusy}>
          <span className="bil-topup-plus">+</span>
          {checkoutBusy ? 'Starting checkout…' : 'Top Up Credits'}
        </button>
      </section>

      {/* Packs */}
      <section className="bil-section">
        <div className="bil-section-head">
          <h2>Top Up</h2>
          <span className="bil-section-sub">Cards billed once — credits add immediately on success.</span>
        </div>
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

        <button className="bil-checkout" onClick={startCheckout} disabled={checkoutBusy}>
          {checkoutBusy ? 'Starting secure checkout…' : `Buy ${selected} credits — $${pack.priceUsd}`}
        </button>
        {checkoutError && <p className="bil-checkout-note err">{checkoutError}</p>}
        <p className="bil-checkout-note">Secure checkout via Stripe.</p>
      </section>

      {/* Payment history */}
      <section className="bil-section">
        <div className="bil-section-head">
          <h2>Payment History</h2>
          <button className="link-btn" onClick={reload}>Refresh</button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="empty">Loading…</div>
        ) : (data?.payments.length ?? 0) === 0 ? (
          <div className="empty"><strong>No payments yet.</strong><span>Your purchases will appear here.</span></div>
        ) : (
          <div className="bil-table">
            <div className="bil-table-head">
              <span>TRANSACTION ID</span><span>DATE</span><span>AMOUNT</span><span>STATUS</span>
            </div>
            {data!.payments.map((p) => (
              <div className="bil-table-row" key={p.id}>
                <span className="mono">#{p.id.slice(0, 8).toUpperCase()}</span>
                <span>{date(p.created_at)}</span>
                <span className="num">{money(p.amount_cents, p.currency)}</span>
                <span><i className={`bil-pay-pill ${p.status}`}>{p.status}</i></span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Activity */}
      {!loading && (data?.ledger.length ?? 0) > 0 && (
        <section className="bil-section">
          <div className="bil-section-head"><h2>Credit Activity</h2></div>
          <div className="bil-ledger">
            {data!.ledger.map((l) => (
              <div className="bil-ledger-row" key={l.id}>
                <div className="bil-ledger-main">
                  <span className="bil-ledger-desc">{l.description ?? l.type.replace(/_/g, ' ')}</span>
                  <span className="bil-ledger-date">{date(l.created_at)}</span>
                </div>
                <span className={`bil-ledger-amt ${l.amount < 0 ? 'neg' : 'pos'}`}>
                  {l.amount > 0 ? `+${l.amount}` : l.amount}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
