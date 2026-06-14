import { useState } from 'react';
import { useApprovalQueue } from '../../hooks/useApprovalQueue';
import type { QueueItem } from '../../types';
import './ApprovalQueue.css';

const TYPE_LABEL: Record<string, string> = {
  initial: 'First touch',
  follow_up_d3: 'Follow-up · day 3',
  follow_up_d7: 'Follow-up · day 7',
  follow_up_d14: 'Follow-up · day 14',
};

export function ApprovalQueue() {
  const { items, stats, loading, error, approve, reject, reload } = useApprovalQueue();

  return (
    <div className="queue">
      <header className="queue-head">
        <div>
          <h1>Approvals</h1>
          <p className="queue-sub">Nothing sends until you approve it. Review each draft, edit if needed, then approve or reject.</p>
        </div>
        <button className="ghost-btn" onClick={reload}>Refresh</button>
      </header>

      <div className="stat-row">
        <Stat label="Awaiting review" value={stats.pending} tone="pending" />
        <Stat label="Approved today" value={stats.approvedToday} tone="approve" />
        <Stat label="Sent today" value={stats.sentToday} tone="brand" />
        <Stat label="Rejected" value={stats.rejected} tone="reject" />
      </div>

      {error && <div className="error-banner">Couldn't load the queue: {error}</div>}

      {loading ? (
        <div className="empty">Loading drafts…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          <strong>Queue's clear.</strong>
          <span>No drafts waiting for review. New ones appear here as the AI writes them.</span>
        </div>
      ) : (
        <div className="card-list">
          {items.map((item) => (
            <DraftCard key={item.id} item={item} onApprove={approve} onReject={reject} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="stat" data-tone={tone}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function DraftCard({
  item,
  onApprove,
  onReject,
}: {
  item: QueueItem;
  onApprove: (id: string, editedBody?: string) => void;
  onReject: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.body);
  const dirty = draft.trim() !== item.body.trim();

  return (
    <article className="card">
      <div className="card-top">
        <div className="card-who">
          <div className="recipient">{item.prospect?.business_name ?? 'Unknown prospect'}</div>
          <div className="card-meta">
            {item.prospect?.contact_name && <span>{item.prospect.contact_name}</span>}
            {item.prospect?.email && <span className="mono">{item.prospect.email}</span>}
          </div>
        </div>
        <span className="type-chip">{TYPE_LABEL[item.message_type] ?? item.message_type}</span>
      </div>

      <div className="for-client">
        For <strong>{item.client?.business_name ?? 'unknown client'}</strong>
        {item.prospect?.category && <span className="dot-sep">{item.prospect.category}</span>}
        {item.prospect?.location && <span className="dot-sep">{item.prospect.location}</span>}
      </div>

      {item.subject && <div className="subject">{item.subject}</div>}

      {editing ? (
        <textarea
          className="body-edit"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.max(5, draft.split('\n').length + 1)}
        />
      ) : (
        <div className="body">{item.body}</div>
      )}

      <div className="card-actions">
        {editing ? (
          <>
            <button
              className="btn approve"
              onClick={() => onApprove(item.id, dirty ? draft : undefined)}
            >
              {dirty ? 'Save & approve' : 'Approve'}
            </button>
            <button className="btn ghost" onClick={() => { setEditing(false); setDraft(item.body); }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn approve" onClick={() => onApprove(item.id)}>Approve</button>
            <button className="btn neutral" onClick={() => setEditing(true)}>Edit</button>
            <button className="btn reject" onClick={() => onReject(item.id)}>Reject</button>
          </>
        )}
      </div>
    </article>
  );
}
