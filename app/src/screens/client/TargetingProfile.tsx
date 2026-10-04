import { useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import {
  useClientIcp, saveClientIcp, buildClientIcp, useClientTargetingPerformance,
  type ClientIcpPatch,
} from '../../hooks/useClientIcp';
import { TagInput } from '../../components/TagInput';
import { useToast, ToastHost } from '../../components/Toast';
import { HelpButton, type HelpContent } from '../../components/HelpButton';

const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em]';
const inputCls = 'w-full rounded-lg border px-3.5 py-2.5 text-[13px] outline-none transition-colors';
const inputStyle = { borderColor: 'var(--line)', background: 'var(--bg)', color: 'var(--ink)' };

const HELP: HelpContent = {
  title: 'Targeting profile',
  body: [
    { type: 'p', text: "This is what we know about who you target - built from your website and, over time, from which replies actually turn positive." },
    { type: 'p', text: "Anything you edit here is kept exactly as you wrote it - rebuilding from your website never overwrites a field you've touched." },
  ],
};

interface FieldDef {
  key: keyof Omit<ClientIcpPatch, 'notes'>;
  label: string;
  placeholder: string;
  splitOn: string;
  emptyHint?: string;
}

const ARRAY_FIELDS: FieldDef[] = [
  { key: 'target_business_types', label: 'Target business types', placeholder: 'e.g. Dental practice, Gym', splitOn: ',' },
  { key: 'target_locations', label: 'Target locations', placeholder: 'e.g. Bloomington, IL', splitOn: ';' },
  {
    key: 'decision_maker_roles', label: 'Decision-maker roles', placeholder: 'e.g. Owner, Office manager', splitOn: ',',
    emptyHint: "We don't derive this yet - add the roles who'd actually say yes.",
  },
  { key: 'pain_points', label: 'Pain points', placeholder: 'e.g. Needs frequent hygienic cleaning', splitOn: ',' },
  { key: 'value_props', label: 'What you offer', placeholder: 'e.g. Office cleaning, Window cleaning', splitOn: ',' },
  { key: 'suggested_search_terms', label: 'Suggested search terms', placeholder: 'e.g. Dental Practice', splitOn: ',' },
];

export function TargetingProfile({ clientId, client = supabase, readOnly = false }: {
  clientId: string; client?: SupabaseClient; readOnly?: boolean;
}) {
  const { icp, loading, error, reload } = useClientIcp(clientId, client);
  const { rows: perf, loading: perfLoading } = useClientTargetingPerformance(clientId, client);
  const { toasts, toast, dismiss } = useToast();
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function valuesFor(key: FieldDef['key']): string[] {
    return draft[key] ?? icp[key] ?? [];
  }

  async function commitArray(key: FieldDef['key'], values: string[]) {
    setDraft((prev) => ({ ...prev, [key]: values }));
    setSavingField(key);
    setErr(null);
    const { error } = await saveClientIcp(clientId, { [key]: values } as ClientIcpPatch);
    setSavingField(null);
    if (error) { setErr(error); return; }
    await reload();
    setDraft((prev) => { const next = { ...prev }; delete next[key]; return next; });
  }

  async function commitNotes() {
    if (notesDraft === null) return;
    setSavingField('notes');
    setErr(null);
    const { error } = await saveClientIcp(clientId, { notes: notesDraft });
    setSavingField(null);
    if (error) { setErr(error); return; }
    await reload();
    setNotesDraft(null);
  }

  async function handleRebuild() {
    setRebuilding(true); setErr(null);
    const { error } = await buildClientIcp(clientId);
    setRebuilding(false);
    if (error) { setErr(error); return; }
    await reload();
    toast('Rebuilt from your website - your own edits were left alone.');
  }

  return (
    <main className="content">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="m-0 text-[22px] font-extrabold tracking-tight" style={{ color: 'var(--ink)' }}>Targeting profile</h1>
          <p className="m-0 mt-1 text-[13.5px]" style={{ color: 'var(--ink-soft)' }}>
            Who we target on your behalf, and what's actually working.
          </p>
        </div>
        <HelpButton content={HELP} />
      </div>

      {error && (
        <div className="mb-5 rounded-xl border px-4 py-3.5 text-[13.5px]" style={{ background: 'var(--clay-tint)', color: 'var(--clay)', borderColor: '#e6cbc0' }}>
          Couldn't load your targeting profile: {error}
        </div>
      )}
      {err && (
        <div className="mb-5 rounded-xl border px-4 py-3.5 text-[13.5px]" style={{ background: 'var(--clay-tint)', color: 'var(--clay)', borderColor: '#e6cbc0' }}>
          {err}
        </div>
      )}

      {!readOnly && (
        <div className="mb-6 flex items-start justify-between gap-4 rounded-2xl border px-5 py-4" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          <div>
            <h2 className="m-0 text-[14px] font-bold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
              <Sparkles size={15} style={{ color: 'var(--leaf)' }} /> Rebuild from my website
            </h2>
            <p className="m-0 mt-1 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
              Re-reads your website and refreshes everything below - except any field you've already edited yourself.
            </p>
          </div>
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className="cursor-pointer inline-flex shrink-0 items-center gap-2 rounded-lg border-0 px-4 py-2 text-[13px] font-bold text-white transition-colors disabled:opacity-50"
            style={{ background: 'var(--leaf)' }}
          >
            <RefreshCw size={14} className={rebuilding ? 'animate-spin' : ''} />
            {rebuilding ? 'Rebuilding…' : 'Rebuild'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse mb-6 rounded-2xl border p-5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          <div className="h-4 w-40 rounded mb-3" style={{ background: 'var(--line)' }} />
          <div className="h-9 w-full rounded-lg" style={{ background: 'var(--line)' }} />
        </div>
      ) : (
        <div className="mb-6 overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          {ARRAY_FIELDS.map((f, i) => {
            const edited = icp.edited_fields.includes(f.key);
            return (
              <div key={f.key}>
                {i > 0 && <div className="border-t" style={{ borderColor: 'var(--line)' }} />}
                <div className="p-5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label className={fieldLbl} style={{ color: 'var(--ink-faint)' }}>{f.label}</label>
                    {edited && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ background: 'var(--leaf-tint)', color: 'var(--leaf)' }}>
                        your edit - won't be overwritten
                      </span>
                    )}
                  </div>
                  {readOnly ? (
                    <div className="flex flex-wrap gap-1.5">
                      {valuesFor(f.key).length === 0 ? (
                        <span className="text-[12.5px]" style={{ color: 'var(--ink-faint)' }}>-</span>
                      ) : valuesFor(f.key).map((v) => (
                        <span key={v} className="rounded-full border px-2.5 py-1 text-[12px]" style={{ borderColor: 'var(--line)', color: 'var(--ink-soft)' }}>{v}</span>
                      ))}
                    </div>
                  ) : (
                    <TagInput
                      label=""
                      placeholder={f.placeholder}
                      values={valuesFor(f.key)}
                      onChange={(v) => commitArray(f.key, v)}
                      splitOn={f.splitOn}
                    />
                  )}
                  {valuesFor(f.key).length === 0 && f.emptyHint && (
                    <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-faint)' }}>{f.emptyHint}</p>
                  )}
                  {savingField === f.key && (
                    <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-faint)' }}>Saving…</p>
                  )}
                </div>
              </div>
            );
          })}

          <div className="border-t" style={{ borderColor: 'var(--line)' }} />
          <div className="p-5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className={fieldLbl} style={{ color: 'var(--ink-faint)' }}>Notes</label>
              {icp.edited_fields.includes('notes') && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ background: 'var(--leaf-tint)', color: 'var(--leaf)' }}>
                  your edit - won't be overwritten
                </span>
              )}
            </div>
            {readOnly ? (
              <p className="m-0 text-[13px]" style={{ color: 'var(--ink-soft)' }}>{icp.notes || '-'}</p>
            ) : (
              <>
                <textarea
                  value={notesDraft ?? icp.notes ?? ''}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={commitNotes}
                  rows={3}
                  placeholder="Anything else we should know about who you're trying to reach."
                  className={`${inputCls} resize-y`}
                  style={inputStyle}
                />
                {savingField === 'notes' && (
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-faint)' }}>Saving…</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="mb-2 px-0.5 text-[10.5px] font-bold uppercase tracking-[.08em]" style={{ color: 'var(--ink-faint)' }}>
        What's actually working
      </div>
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        {perfLoading ? (
          <div className="animate-pulse p-5">
            <div className="h-9 w-full rounded-lg" style={{ background: 'var(--line)' }} />
          </div>
        ) : perf.length === 0 ? (
          <p className="m-0 p-5 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            No results yet - this fills in once your first campaign has been sent.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ color: 'var(--ink-faint)' }} className="text-left text-[10.5px] font-bold uppercase tracking-[.06em]">
                  <th className="px-5 py-3">Category</th>
                  <th className="px-3 py-3">Emailed</th>
                  <th className="px-3 py-3">Replied</th>
                  <th className="px-3 py-3">Positive</th>
                  <th className="px-3 py-3">Bounce rate</th>
                </tr>
              </thead>
              <tbody>
                {perf.map((row, i) => (
                  <tr key={row.category} style={i > 0 ? { borderTop: '1px solid var(--line)' } : undefined}>
                    <td className="px-5 py-3 font-semibold" style={{ color: 'var(--ink)' }}>{row.category}</td>
                    <td className="px-3 py-3" style={{ color: 'var(--ink-soft)' }}>{row.emailed}</td>
                    <td className="px-3 py-3" style={{ color: 'var(--ink-soft)' }}>{row.replied}</td>
                    <td className="px-3 py-3 font-semibold" style={{ color: 'var(--leaf)' }}>{row.positive}</td>
                    <td className="px-3 py-3" style={{ color: 'var(--ink-soft)' }}>{(row.bounce_rate * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </main>
  );
}
