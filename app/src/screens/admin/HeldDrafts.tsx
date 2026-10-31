import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useClientsList } from '../../hooks/useAdminData';
import { fetchApprovedQueue, type ApprovedQueueTab } from '../../hooks/useClientApprovals';
import { BLOCK_INFO, isPolicyHeld } from '../../lib/blockReasons';
import { BlockBadge } from '../../components/BlockBadge';
import { SkeletonTable } from '../../components/Skeleton';
import { approvalTypeLabel } from '../../lib/approvalLabels';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const PAGE_SIZE = 25;
const ALL = 'all';

const REASON_OPTIONS = Object.keys(BLOCK_INFO).map((r) => ({ value: r, label: r.replace(/_/g, ' ') }));

const pillCls = 'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.04em]';
const selectTriggerCls = 'h-9 rounded-lg border-(--ad-line) bg-(--ad-surface) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)';

/**
 * Admin-only, read-only view of approved drafts that are not going out, for any client,
 * with every reason including the generic-mailbox and freemail send rules. It renders no
 * approve, reject or edit control at all. What comes back is decided by is_admin() inside
 * the approved_queue RPC; this screen only reports what the server returned.
 */
export function HeldDrafts() {
  const clients = useClientsList();
  const [clientId, setClientId] = useState('');
  const [tab, setTab] = useState<ApprovedQueueTab>('blocked');
  const [reason, setReason] = useState(ALL);
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['admin-held-drafts', clientId, tab, reason, page],
    queryFn: () => fetchApprovedQueue(clientId, supabase, {
      tab, page, pageSize: PAGE_SIZE, sort: 'approved_desc', messageType: null, reason: reason === ALL ? null : reason,
    }),
    enabled: !!clientId,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const refused = !!data && !data.isAdmin;

  function pick<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setPage(1); };
  }

  return (
    <div style={FONT} className="flex flex-col gap-6">
      <header className="page-header page-header--stack">
        <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-(--ad-ink)">
          <Ban className="w-8 h-8 mr-1" style={{ color: 'var(--ad-clay)' }} />
          Held drafts
        </h1>
        <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">
          Read-only. Approved drafts that have not been sent, with the reason each one is held, including the
          generic-mailbox and freemail send rules that clients never see.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-(--ad-line) bg-(--ad-surface) p-3">
        <Select value={clientId} onValueChange={pick(setClientId)}>
          <SelectTrigger style={FONT} aria-label="Client" className={`${selectTriggerCls} w-[240px]`}>
            <SelectValue placeholder="Choose a client" />
          </SelectTrigger>
          <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tab} onValueChange={pick((v: string) => setTab(v as ApprovedQueueTab))}>
          <SelectTrigger style={FONT} aria-label="Show" className={`${selectTriggerCls} w-[190px]`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
            <SelectItem value="blocked">Blocked only</SelectItem>
            <SelectItem value="approved">All approved, unsent</SelectItem>
            <SelectItem value="pending">Pending approval</SelectItem>
          </SelectContent>
        </Select>
        <Select value={reason} onValueChange={pick(setReason)} disabled={tab === 'pending'}>
          <SelectTrigger style={FONT} aria-label="Reason" className={`${selectTriggerCls} w-[220px]`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
            <SelectItem value={ALL}>Any reason</SelectItem>
            {REASON_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {isFetching && <span className="text-[12px] text-(--ad-ink-faint)">Loading…</span>}
      </div>

      {error && (
        <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">
          {(error as Error).message}
        </div>
      )}

      {refused && (
        <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">
          This view needs an administrator session. Held-by-send-rules drafts are not returned to this account.
        </div>
      )}

      {data && !refused && (
        <p className="m-0 text-[13px] font-semibold text-(--ad-ink)" data-testid="held-summary">
          {data.counts.approved} approved, unsent: {data.counts.sendable} sendable, {data.counts.scheduled} scheduled,
          {' '}{data.counts.blocked} blocked ({data.counts.policyHeld} held by send rules).
          {' '}{data.counts.pending} pending ({data.counts.pendingPolicyHeld} held by send rules).
        </p>
      )}

      {!clientId ? (
        <div className="rounded-2xl border border-dashed border-(--ad-line) bg-(--ad-surface) p-10 text-center text-[13px] text-(--ad-ink-soft)">
          Choose a client to see its held drafts.
        </div>
      ) : isLoading ? (
        <SkeletonTable rows={10} cols={4} />
      ) : !refused && data && data.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-(--ad-line) bg-(--ad-surface) p-10 text-center">
          <strong className="text-[15px] font-semibold text-(--ad-ink)">Nothing held for this selection.</strong>
        </div>
      ) : !refused && data ? (
        <>
          <div className="atbl">
            <table className="table-fixed">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[30%]" />
                <col className="w-[30%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead>
                <tr>{['Prospect', 'Subject', 'Why it is held', 'Approved'].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.items.map((m) => (
                  <tr key={m.id}>
                    <td className="min-w-0">
                      <div className="line-clamp-2 font-semibold text-(--ad-ink)" title={m.prospect?.business_name ?? undefined}>
                        {m.prospect?.business_name ?? 'Unknown'}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-(--ad-ink-soft)" title={m.prospect?.email ?? undefined}>
                        {m.prospect?.email ?? 'No email'}
                      </div>
                    </td>
                    <td className="min-w-0 text-(--ad-ink-soft)">
                      <div className="line-clamp-2" title={m.subject ?? undefined}>{m.subject ?? 'No subject'}</div>
                      <div className="mt-0.5 text-[11px]">{approvalTypeLabel(m.message_type)}</div>
                    </td>
                    <td className="min-w-0">
                      <BlockBadge reason={m.block_reason} campaignStatus={m.campaign_status} />
                      {/* The view reports one reason by priority; this shows when the send rules also hold the draft. */}
                      {m.policy_held && !isPolicyHeld(m.block_reason) && (
                        <span className={`${pillCls} mt-1`} style={{ background: 'var(--ad-clay-tint)', color: 'var(--ad-clay)' }}>
                          {m.block_reason ? 'Also held by send rules' : 'Held by send rules'}
                        </span>
                      )}
                      {!m.block_reason && !m.policy_held && (
                        <span className="text-[12px] text-(--ad-ink-soft)">
                          {m.approval_status === 'pending' ? 'Pending approval' : 'Sendable'}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-[12px] text-(--ad-ink-soft)">
                      {m.approved_at ? new Date(m.approved_at).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-(--ad-line) bg-(--ad-surface) px-4 py-3 text-[12.5px] text-(--ad-ink-soft)">
              <span>Page {safePage} of {totalPages} · {data.total} rows</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(safePage - 1)} disabled={safePage <= 1}
                  className="cursor-pointer rounded-lg border border-(--ad-line) bg-transparent px-3 py-1.5 text-[12.5px] font-semibold text-(--ad-ink) disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
                <button onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages}
                  className="cursor-pointer rounded-lg border border-(--ad-line) bg-transparent px-3 py-1.5 text-[12.5px] font-semibold text-(--ad-ink) disabled:cursor-not-allowed disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
