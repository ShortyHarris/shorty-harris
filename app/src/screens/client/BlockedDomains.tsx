import { useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Lock, Trash2 } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useClientBlacklist } from '../../hooks/useBlacklistedDomains';
import { useOverlayClose } from '../../hooks/useOverlayClose';

const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em]';
const inputCls = 'w-full rounded-lg border px-3.5 py-2.5 text-[13px] outline-none transition-colors';
const inputStyle = { borderColor: 'var(--line)', background: 'var(--bg)', color: 'var(--ink)' };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function BlockedDomainsModal({
  clientId, client = supabase, onClose,
}: {
  clientId: string;
  client?: SupabaseClient;
  onClose: () => void;
}) {
  const { ownRows, globalRows, loading, error, addDomain, deleteDomain } = useClientBlacklist(clientId, client);
  const [input, setInput] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // The unique index lets a client insert a domain that's already blocked
  // globally - same domain, different client_id, no collision - but that
  // row would be redundant (RLS already blocks the global one for them).
  // Catching it here against the already-loaded list avoids a pointless
  // round trip and a confusing "added" success for a no-op.
  async function submit() {
    const domain = input.trim();
    if (!domain) { setFormErr('Enter a domain, website, or email address.'); return; }
    const alreadyGlobal = globalRows.some((r) => r.domain.toLowerCase() === domain.toLowerCase());
    if (alreadyGlobal) {
      setFormErr('This domain is already blocked platform-wide - no need to add it again.');
      return;
    }
    setBusy(true); setFormErr(null);
    const { error } = await addDomain(domain, reason);
    setBusy(false);
    if (error) { setFormErr(error); return; }
    setInput(''); setReason('');
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await deleteDomain(id);
    setDeletingId(null);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:p-6"
      style={{ background: 'rgba(28, 30, 25, 0.45)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose)}
    >
      <motion.div
        className="flex w-full flex-col overflow-hidden h-full md:h-auto md:max-h-[90vh] md:max-w-[560px] md:rounded-2xl md:shadow-2xl"
        style={{ background: 'var(--surface)' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
          <div>
            <h2 className="m-0 text-[18px] font-bold" style={{ color: 'var(--ink)' }}>Blocked domains</h2>
            <p className="m-0 mt-0.5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
              We'll never send outreach to an address at a domain on this list.
            </p>
          </div>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none" style={{ color: 'var(--ink-faint)' }}>×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Add form */}
          <div className="mb-5">
            <label className={fieldLbl} style={{ color: 'var(--ink-faint)' }}>Add a domain</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                placeholder="example.com"
                style={inputStyle}
                className={`${inputCls} flex-1`}
              />
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                style={inputStyle}
                className={`${inputCls} sm:w-[160px]`}
              />
              <button
                onClick={submit}
                disabled={busy}
                className="cursor-pointer shrink-0 rounded-lg border-0 px-4 py-2.5 text-[13px] font-bold text-white transition-colors disabled:opacity-50"
                style={{ background: 'var(--leaf)' }}
              >
                {busy ? 'Adding…' : 'Add'}
              </button>
            </div>
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
              A domain, a website address, or an email address all work.
            </p>
            {formErr && (
              <p className="mt-2 text-[12px]" style={{ color: 'var(--clay)' }}>{formErr}</p>
            )}
          </div>

          {error && (
            <div className="mb-4 rounded-xl border px-4 py-3 text-[13px]" style={{ background: 'var(--clay-tint)', color: 'var(--clay)', borderColor: '#e6cbc0' }}>
              Couldn't load your blocked domains: {error}
            </div>
          )}

          {loading ? (
            <div className="animate-pulse flex flex-col gap-2">
              <div className="h-10 w-full rounded-lg" style={{ background: 'var(--line)' }} />
              <div className="h-10 w-full rounded-lg" style={{ background: 'var(--line)' }} />
            </div>
          ) : (
            <>
              {/* Own rows */}
              <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[.08em]" style={{ color: 'var(--ink-faint)' }}>
                Your blocked domains
              </div>
              {ownRows.length === 0 ? (
                <div className="mb-5 rounded-xl border border-dashed px-4 py-4 text-[12.5px]" style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)' }}>
                  You haven't blocked any domains yet. Add one above to stop outreach from ever going to an address there.
                </div>
              ) : (
                <div className="mb-5 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line)' }}>
                  {ownRows.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0" style={{ borderColor: 'var(--line)' }}>
                      <Globe size={14} style={{ color: 'var(--ink-faint)' }} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold" style={{ color: 'var(--ink)' }}>{r.domain}</div>
                        <div className="truncate text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>
                          {r.reason ?? 'No reason given'} · Added {formatDate(r.created_at)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deletingId === r.id}
                        aria-label={`Remove ${r.domain}`}
                        title="Remove"
                        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent transition-colors disabled:opacity-50"
                        style={{ color: 'var(--ink-faint)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Global rows - read-only, visually distinct group */}
              <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[.08em]" style={{ color: 'var(--ink-faint)' }}>
                <Lock size={11} />
                Blocked for every client
              </div>
              <p className="mb-2 text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>
                These are blocked platform-wide - you can't remove them here.
              </p>
              {globalRows.length === 0 ? (
                <div className="rounded-xl border border-dashed px-4 py-4 text-[12.5px]" style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)' }}>
                  Nothing is blocked platform-wide right now.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}>
                  {globalRows.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0" style={{ borderColor: 'var(--line)' }}>
                      <Lock size={14} style={{ color: 'var(--ink-faint)' }} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold" style={{ color: 'var(--ink-soft)' }}>{r.domain}</div>
                        <div className="truncate text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>
                          {r.reason ?? 'No reason given'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 border-t px-5 py-4" style={{ borderColor: 'var(--line)' }}>
          <button
            onClick={onClose}
            className="w-full cursor-pointer rounded-xl border px-4 py-2.5 text-[14px] font-semibold transition-colors"
            style={{ borderColor: 'var(--line-strong)', color: 'var(--ink)', background: 'transparent' }}
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
