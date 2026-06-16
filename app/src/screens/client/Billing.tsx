import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBilling, type PaymentRow, type LedgerRow } from '../../hooks/useBilling';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import './Billing.css';

interface Pack { credits: number; priceUsd: number; tag?: string; }
const PACKS: Pack[] = [
  { credits: 20,  priceUsd: 49 },
  { credits: 50,  priceUsd: 99,  tag: 'Most popular' },
  { credits: 100, priceUsd: 179, tag: 'Best value' },
];

const PAGE_SIZE = 5;

type DateFilter = 'all' | '30' | '90' | '365';
const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: '30',  label: 'Last 30 days' },
  { key: '90',  label: 'Last 90 days' },
  { key: '365', label: 'This year' },
];

function withinDateFilter(iso: string, filter: DateFilter): boolean {
  if (filter === 'all') return true;
  const cutoff = Date.now() - Number(filter) * 24 * 60 * 60 * 1000;
  return new Date(iso).getTime() >= cutoff;
}

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

  const [paymentsFilter, setPaymentsFilter] = useState<DateFilter>('all');
  const [paymentsPage, setPaymentsPage]     = useState(1);
  const [ledgerFilter, setLedgerFilter]     = useState<DateFilter>('all');
  const [ledgerPage, setLedgerPage]         = useState(1);

  const pack = PACKS.find((p) => p.credits === selected)!;

  const filteredPayments = (data?.payments ?? []).filter((p) => withinDateFilter(p.created_at, paymentsFilter));
  const paymentsTotalPages = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE));
  const paymentsSafePage   = Math.min(paymentsPage, paymentsTotalPages);
  const pagedPayments      = filteredPayments.slice((paymentsSafePage - 1) * PAGE_SIZE, paymentsSafePage * PAGE_SIZE);

  const filteredLedger = (data?.ledger ?? []).filter((l) => withinDateFilter(l.created_at, ledgerFilter));
  const ledgerTotalPages = Math.max(1, Math.ceil(filteredLedger.length / PAGE_SIZE));
  const ledgerSafePage   = Math.min(ledgerPage, ledgerTotalPages);
  const pagedLedger      = filteredLedger.slice((ledgerSafePage - 1) * PAGE_SIZE, ledgerSafePage * PAGE_SIZE);

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

      {/* Top: balance + buy credits side by side on desktop */}
      <div className="lg:grid  lg:gap-6 lg:items-start">

          <div className="bill-section-head">
             <h2 className='text-2xl font-bold flex items-center gap-2'> <img src='https://cdn-icons-png.flaticon.com/128/1052/1052815.png' className='w-8' /> Billing & Activity</h2>
          </div>

        <div className="credit-hero mb-4 rounded-lg">
          <div className="credit-hero-top justify-end">
            
            {!loading && data?.smsCredits != null && (
              <span className="credit-hero-sms-chip">+{data.smsCredits} SMS credits</span>
            )}
          </div>
          <div className="credit-hero-num">{loading ? '—' : data?.credits}</div>
          <div className="credit-hero-label">credits remaining</div>
          <div className="credit-hero-note">
            Each hot lead routed to you costs 1 credit
          </div>
        </div>

        <div>
          <div className="bill-section-head">
            <h2>Add more credits</h2>
          </div>

          <div className="pack-list md:grid grid-cols-3 md:gap-4">
            {PACKS.map((p) => (
              <button
                key={p.credits}
                className={` rounded-lg pack-row${selected === p.credits ? ' is-selected' : ''}`}
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

          <button className="checkout-btn rounded-lg" onClick={startCheckout} disabled={checkoutBusy}>
            {!checkoutBusy && <LockIcon />}
            {checkoutBusy
              ? 'Starting secure checkout…'
              : `Buy ${selected} credits - $${pack.priceUsd}`}
          </button>
          {checkoutError && (
            <p className="checkout-note checkout-note-error">{checkoutError}</p>
          )}
          <p className="checkout-note">
            Secure checkout via Stripe. Credits are added immediately on success.
          </p>
        </div>
      </div>

      {/* Bottom: both tables, full width, stacked */}
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
        <>
          {/* Mobile: card list (unchanged) */}
          <div className="payment-list lg:hidden">
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

          {/* Desktop: real table, full width, contained in one bordered card */}
          <div className="hidden lg:block lg:bg-white lg:border lg:border-[var(--line)] lg:rounded-lg lg:p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] text-[var(--ink-faint)]">
                {filteredPayments.length} payment{filteredPayments.length !== 1 ? 's' : ''}
              </span>
              <Select
                value={paymentsFilter}
                onValueChange={(v) => { setPaymentsFilter(v as DateFilter); setPaymentsPage(1); }}
              >
                <SelectTrigger className="h-8 w-[160px] text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FILTERS.map((f) => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {pagedPayments.length === 0 ? (
              <div className="bill-empty"><span>No payments in this range.</span></div>
            ) : (
              <PaymentsTable payments={pagedPayments} />
            )}
            <Pagination page={paymentsSafePage} totalPages={paymentsTotalPages} onChange={setPaymentsPage} />
          </div>
        </>
      )}

      {!loading && (data?.ledger.length ?? 0) > 0 && (
        <>
          <div className="bill-section-head bill-section-head-spaced">
            <h2>Credit activity</h2>
          </div>

          {/* Mobile: card list (unchanged) */}
          <div className="activity-list lg:hidden">
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

          {/* Desktop: real table, full width, contained in one bordered card */}
          <div className="hidden lg:block lg:bg-white lg:border lg:border-[var(--line)] lg:rounded-lg lg:p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] text-[var(--ink-faint)]">
                {filteredLedger.length} entr{filteredLedger.length !== 1 ? 'ies' : 'y'}
              </span>
              <Select
                value={ledgerFilter}
                onValueChange={(v) => { setLedgerFilter(v as DateFilter); setLedgerPage(1); }}
              >
                <SelectTrigger className="h-8 w-[160px] text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FILTERS.map((f) => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {pagedLedger.length === 0 ? (
              <div className="bill-empty"><span>No activity in this range.</span></div>
            ) : (
              <ActivityTable ledger={pagedLedger} />
            )}
            <Pagination page={ledgerSafePage} totalPages={ledgerTotalPages} onChange={setLedgerPage} />
          </div>
        </>
      )}
    </main>
  );
}

/* ───── payment history table ───── */
function PaymentsTable({ payments }: { payments: PaymentRow[] }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-[var(--line)]">
          <th className="py-2.5 px-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">Credits</th>
          <th className="py-2.5 px-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">Date</th>
          <th className="py-2.5 px-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">Amount</th>
          <th className="py-2.5 px-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">Status</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p) => (
          <tr key={p.id} className="border-b border-[var(--line)] last:border-0">
            <td className="py-3 px-2 font-semibold text-[14px] text-[var(--ink)]">
              {p.credits_purchased > 0 ? `+${p.credits_purchased}` : '—'}
            </td>
            <td className="py-3 px-2 text-[13.5px] text-[var(--ink-faint)]">{date(p.created_at)}</td>
            <td className="py-3 px-2 text-[14px] text-[var(--ink)] font-medium">{money(p.amount_cents, p.currency)}</td>
            <td className="py-3 px-2"><span className={`pay-pill ${p.status}`}>{p.status}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ───── credit activity table ───── */
function ActivityTable({ ledger }: { ledger: LedgerRow[] }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-[var(--line)]">
          <th className="py-2.5 px-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">Description</th>
          <th className="py-2.5 px-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">Date</th>
          <th className="py-2.5 px-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-faint)] text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {ledger.map((l) => (
          <tr key={l.id} className="border-b border-[var(--line)] last:border-0">
            <td className="py-3 px-2 text-[14px] text-[var(--ink)] capitalize">
              {l.description ?? l.type.replace(/_/g, ' ')}
            </td>
            <td className="py-3 px-2 text-[13.5px] text-[var(--ink-faint)]">{date(l.created_at)}</td>
            <td className={`py-3 px-2 text-right font-semibold ${l.amount < 0 ? 'text-[var(--ink-soft)]' : 'text-[var(--leaf)]'}`}>
              {l.amount > 0 ? `+${l.amount}` : l.amount}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ───── icons ───── */
function CreditCardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 576 512" fill="currentColor">
      <path d="M0 112C0 85.5 21.5 64 48 64H528c26.5 0 48 21.5 48 48v32H0V112zM0 224H576V400c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V224zM64 352c-8.8 0-16 7.2-16 16s7.2 16 16 16h64c8.8 0 16-7.2 16-16s-7.2-16-16-16H64zm128 0c-8.8 0-16 7.2-16 16s7.2 16 16 16H320c8.8 0 16-7.2 16-16s-7.2-16-16-16H192z" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 448 512" fill="currentColor" className="inline-block mr-1.5 -mt-0.5">
      <path d="M144 144v48H304V144c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192V144C80 64.5 144.5 0 224 0s144 64.5 144 144v48h16c35.3 0 64 28.7 64 64V448c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V256c0-35.3 28.7-64 64-64H80z" />
    </svg>
  );
}

/* ───── pagination controls ───── */
function Pagination({
  page, totalPages, onChange,
}: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-4 mt-2 border-t border-[var(--line)]">
      <span className="text-[13px] text-[var(--ink-faint)]">Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <button
          className="text-[13px] font-medium px-3 py-1.5 rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-soft)] disabled:opacity-40"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </button>
        <button
          className="text-[13px] font-medium px-3 py-1.5 rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-soft)] disabled:opacity-40"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}
