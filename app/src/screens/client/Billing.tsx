import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useBilling, type PaymentRow, type LedgerRow } from '../../hooks/useBilling';
import { useClientHeader } from '../../hooks/useClientHeader';
import { AnimatePresence } from 'framer-motion';
import { PurchaseSuccess } from '../../components/PurchaseSuccess';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { useToast, ToastHost } from '../../components/Toast';
import { RefreshButton } from '../../components/RefreshButton';
import { useRefreshHandler } from '../../hooks/useRefreshHandler';
import { PACKS } from '../../lib/pricing';
import { StatusPill, PILL, type StatusPillStyle } from '../../components/StatusPill';

// A paid invoice is done, not something waiting on the client, so it uses the calm "sent" look.
const PAY_PILL: Record<string, StatusPillStyle> = {
  succeeded: { ...PILL.sent,    icon: 'check' },
  failed:    { ...PILL.problem, icon: 'alert' },
  pending:   { ...PILL.ahead,   icon: 'clock' },
  refunded:  { ...PILL.closed,  icon: 'minus' },
};
const PAY_LABEL: Record<string, string> = { succeeded: 'Paid', failed: 'Failed', pending: 'Pending', refunded: 'Refunded' };

function payLabel(status: string): string {
  return PAY_LABEL[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}
import './Billing.css';

const HELP: HelpContent = {
  title: 'Billing & Credits',
  body: [
    { type: 'p', text: "Credits are how you pay for Hot Leads. Each confirmed Hot Lead costs one credit from your balance." },
    { type: 'p', text: "Your balance is shown at the top of every page. When you're running low, choose a pack below, pay by card, and credits are added instantly." },
    { type: 'p', text: "This page also shows your full payment history and a line-by-line breakdown of every credit spent." },
  ],
};

const PAGE_SIZE = 10;

type DateFilter = 'all' | '30' | '90' | '365';
const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: '30',  label: 'Last 30 days' },
  { key: '90',  label: 'Last 90 days' },
  { key: '365', label: 'Last 12 months' },
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

export function Billing({
  clientId, onCreditsChanged, client = supabase, readOnly = false,
}: { clientId: string; onCreditsChanged?: () => void; client?: SupabaseClient; readOnly?: boolean }) {
  const { data, loading, isFetching, dataUpdatedAt, error, reload } = useBilling(clientId, client);
  const { toasts, toast, dismiss } = useToast();
  // A sandbox account never opens Stripe: Buy records a no-charge purchase instead.
  const { isSandbox } = useClientHeader(clientId, client);
  const handleRefresh = useRefreshHandler(reload, toast, 'Failed to refresh billing.');
  const [selected, setSelected]           = useState<number>(5);
  const [checkoutBusy, setCheckoutBusy]   = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [searchParams, setSearchParams]   = useSearchParams();
  const [banner, setBanner]               = useState<{ kind: 'success' | 'cancel'; text: string } | null>(null);
  // The success card after buying credits. balance is set for a sandbox purchase (the RPC
  // returns it); after Stripe the live balance is used, as the webhook may land a moment later.
  const [celebrate, setCelebrate] = useState<{ credits: number | null; balance: number | null; sandbox: boolean } | null>(null);

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
      const bought = Number(searchParams.get('credits'));
      setCelebrate({ credits: Number.isFinite(bought) && bought > 0 ? bought : null, balance: null, sandbox: false });
      const t = setTimeout(() => { reload(); onCreditsChanged?.(); }, 2500);
      setSearchParams({}, { replace: true });
      return () => clearTimeout(t);
    } else if (status === 'cancel') {
      setBanner({ kind: 'cancel', text: 'Checkout cancelled - no charge was made.' });
      setSearchParams({}, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCheckout() {
    if (readOnly) return;
    setCheckoutBusy(true);
    setCheckoutError(null);
    if (isSandbox) {
      // Same end state as coming back from a paid Stripe checkout (see the
      // status=success effect above), without leaving the app or charging a card.
      const { data: res, error: err } = await supabase.rpc('sandbox_simulate_purchase', {
        p_client_id: clientId, p_credits: pack.credits,
      });
      setCheckoutBusy(false);
      const r = res as { ok?: boolean; error?: string; balance?: number } | null;
      if (err || !r?.ok) {
        setCheckoutError(`Could not record the sandbox purchase (${err?.message ?? r?.error ?? 'unknown error'}).`);
        return;
      }
      setCelebrate({ credits: pack.credits, balance: typeof r.balance === 'number' ? r.balance : null, sandbox: true });
      reload();
      onCreditsChanged?.();
      return;
    }
    try {
 const endpoint = 'https://n8n.shortyharris.com/webhook/wf7-create-checkout';
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

          <div className="page-header mb-5 flex items-start justify-between gap-4">
            <div>
              <h1 className="m-0 text-[26px] font-extrabold tracking-tight" style={{ color: 'var(--ink)' }}>Billing</h1>
              <p className="m-0 mt-1 text-[13px]" style={{ color: 'var(--ink-soft)' }}>Your credits, buying more, and where they went.</p>
            </div>
            <HelpButton content={HELP} />
          </div>

        <div className="credit-hero mb-4 rounded-lg" data-tour="credit-balance">
          {!loading && (data?.smsCredits ?? 0) > 0 && (
            <div className="credit-hero-top justify-end">
              <span className="credit-hero-sms-chip">+{data?.smsCredits} SMS credits</span>
            </div>
          )}
          <div className="credit-hero-num">{loading ? '-' : data?.credits}</div>
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
                  <div className="pack-row-per">${(p.priceUsd / p.credits).toFixed(2)} per lead</div>
                </div>
                <div className="pack-row-price">${p.priceUsd}</div>
              </button>
            ))}
          </div>

          <button className="checkout-btn rounded-lg" onClick={startCheckout} disabled={checkoutBusy || readOnly}>
            {!checkoutBusy && <LockIcon />}
            {checkoutBusy
              ? (isSandbox ? 'Recording sandbox purchase…' : 'Starting secure checkout…')
              : `Buy ${selected} credits - $${pack.priceUsd}`}
          </button>
          {readOnly && (
            <p className="checkout-note">You're viewing this account. Credits can only be bought from the client's own login.</p>
          )}
          {checkoutError && (
            <p className="checkout-note checkout-note-error">{checkoutError}</p>
          )}
          <p className="checkout-note">
            {isSandbox
              ? 'Sandbox account: buying skips Stripe and no card is charged. The credits and the receipt are added exactly as after a real payment.'
              : 'Secure checkout via Stripe. Credits are added immediately on success.'}
          </p>
        </div>
      </div>

      {/* Bottom: both tables, full width, stacked */}
      <div className="bill-section-head bill-section-head-spaced">
        <h2>Payment history</h2>
        <RefreshButton onRefresh={handleRefresh} isFetching={isFetching} dataUpdatedAt={dataUpdatedAt} className="bill-refresh" />
      </div>

      {error && <div className="bill-error">{error}</div>}

      {loading ? (
        <>
          {/* Mobile: skeleton payment cards */}
          <div className="payment-list lg:hidden" aria-hidden>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="payment-item rounded-lg">
                <div className="flex flex-col gap-2">
                  <div className="h-4 w-28 rounded animate-pulse bg-(--ad-line-mid)" />
                  <div className="h-3 w-20 rounded animate-pulse bg-(--ad-line)" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="h-4 w-16 rounded animate-pulse bg-(--ad-line-mid)" />
                  <div className="h-5 w-14 rounded-full animate-pulse bg-(--ad-line)" />
                </div>
              </div>
            ))}
          </div>
          {/* Desktop: skeleton table */}
          <div className="hidden lg:block lg:bg-(--ad-surface) lg:border lg:border-(--ad-line) lg:rounded-[10px] lg:p-4" aria-hidden>
            <table className="w-full">
              <tbody>
                {[...Array(4)].map((_, i) => (
                  <tr key={i} className="border-b border-[var(--line)]">
                    <td className="py-3.5 px-2"><div className="h-4 w-10 rounded animate-pulse bg-(--ad-line-mid)" /></td>
                    <td className="py-3.5 px-2"><div className="h-3 w-24 rounded animate-pulse bg-(--ad-line)" /></td>
                    <td className="py-3.5 px-2"><div className="h-4 w-16 rounded animate-pulse bg-(--ad-line-mid)" /></td>
                    <td className="py-3.5 px-2"><div className="h-5 w-14 rounded-full animate-pulse bg-(--ad-line)" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (data?.payments.length ?? 0) === 0 ? (
        <div className="bill-empty">
          <strong>No payments yet</strong>
          <span>Your purchases will appear here.</span>
        </div>
      ) : (
        // Phones get the same filter and pages as desktop; only the row layout differs.
        <div className="lg:rounded-[10px] lg:border lg:border-(--ad-line) lg:bg-(--ad-surface) lg:p-4">
          <HistoryToolbar
            count={`${filteredPayments.length} payment${filteredPayments.length !== 1 ? 's' : ''}`}
            filter={paymentsFilter}
            onFilter={(f) => { setPaymentsFilter(f); setPaymentsPage(1); }}
          />
          {pagedPayments.length === 0 ? (
            <div className="bill-empty"><span>No payments in this range.</span></div>
          ) : (
            <>
              <div className="payment-list lg:hidden">
                {pagedPayments.map((p) => (
                  <div className="payment-item rounded-lg" key={p.id}>
                    <div className="payment-item-left">
                      <span className="payment-item-credits">
                        {p.credits_purchased > 0 ? `+${p.credits_purchased} credits` : '-'}
                      </span>
                      <span className="payment-item-date">{date(p.created_at)}</span>
                    </div>
                    <div className="payment-item-right">
                      <span className="payment-item-amount">{money(p.amount_cents, p.currency)}</span>
                      <StatusPill pill={PAY_PILL[p.status] ?? PAY_PILL.pending}>{payLabel(p.status)}</StatusPill>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden lg:block"><PaymentsTable payments={pagedPayments} /></div>
            </>
          )}
          <Pagination page={paymentsSafePage} totalPages={paymentsTotalPages} onChange={setPaymentsPage} />
        </div>
      )}

      {!loading && (data?.ledger.length ?? 0) > 0 && (
        <>
          <div className="bill-section-head bill-section-head-spaced">
            <h2>Credit activity</h2>
          </div>

          <div className="lg:rounded-[10px] lg:border lg:border-(--ad-line) lg:bg-(--ad-surface) lg:p-4">
            <HistoryToolbar
              count={`${filteredLedger.length} entr${filteredLedger.length !== 1 ? 'ies' : 'y'}`}
              filter={ledgerFilter}
              onFilter={(f) => { setLedgerFilter(f); setLedgerPage(1); }}
            />
            {pagedLedger.length === 0 ? (
              <div className="bill-empty"><span>No activity in this range.</span></div>
            ) : (
              <>
                <div className="activity-list lg:hidden">
                  {pagedLedger.map((l) => (
                    <div className="activity-item rounded-lg" key={l.id}>
                      <div className="activity-item-info">
                        <span className="activity-desc">{l.description ?? l.type.replace(/_/g, ' ')}</span>
                        <span className="activity-date">{date(l.created_at)}</span>
                      </div>
                      <span className={`activity-amt ${l.amount < 0 ? 'neg' : 'pos'}`}>
                        {l.amount > 0 ? `+${l.amount}` : l.amount}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="hidden lg:block"><ActivityTable ledger={pagedLedger} /></div>
              </>
            )}
            <Pagination page={ledgerSafePage} totalPages={ledgerTotalPages} onChange={setLedgerPage} />
          </div>
        </>
      )}

      <AnimatePresence>
        {celebrate && (
          <PurchaseSuccess
            key="purchase-success"
            creditsAdded={celebrate.credits}
            balance={celebrate.balance ?? (loading ? null : data?.credits ?? null)}
            sandbox={celebrate.sandbox}
            leadsHref="/app"
            onClose={() => setCelebrate(null)}
          />
        )}
      </AnimatePresence>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}

function HistoryToolbar({ count, filter, onFilter }: { count: string; filter: DateFilter; onFilter: (f: DateFilter) => void }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <span className="text-[13px] text-[var(--ink-faint)]">{count}</span>
      <Select value={filter} onValueChange={(v) => onFilter(v as DateFilter)}>
        <SelectTrigger aria-label="Date range" className="h-8 w-[160px] bg-(--ad-surface) text-[13px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATE_FILTERS.map((f) => (
            <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ───── payment history table ───── */
function PaymentsTable({ payments }: { payments: PaymentRow[] }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-[var(--line)]">
          <th className="py-2.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-(--ad-ink-ghost)">Credits</th>
          <th className="py-2.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-(--ad-ink-ghost)">Date</th>
          <th className="py-2.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-(--ad-ink-ghost)">Amount</th>
          <th className="py-2.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-(--ad-ink-ghost)">Status</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p) => (
          <tr key={p.id} className="border-b border-[var(--line)] last:border-0 transition-colors hover:bg-(--ad-surface-2)">
            <td className="py-3 px-2 font-semibold text-[14px] text-[var(--ink)]">
              {p.credits_purchased > 0 ? `+${p.credits_purchased}` : '-'}
            </td>
            <td className="py-3 px-2 text-[13.5px] text-[var(--ink-faint)]">{date(p.created_at)}</td>
            <td className="py-3 px-2 text-[14px] text-[var(--ink)] font-medium">{money(p.amount_cents, p.currency)}</td>
            <td className="py-3 px-2"><StatusPill pill={PAY_PILL[p.status] ?? PAY_PILL.pending}>{payLabel(p.status)}</StatusPill></td>
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
          <th className="py-2.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-(--ad-ink-ghost)">Description</th>
          <th className="py-2.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-(--ad-ink-ghost)">Date</th>
          <th className="py-2.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-(--ad-ink-ghost) text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {ledger.map((l) => (
          <tr key={l.id} className="border-b border-[var(--line)] last:border-0 transition-colors hover:bg-(--ad-surface-2)">
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
