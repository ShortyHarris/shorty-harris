import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Search, ExternalLink, Plus, Sparkles } from 'lucide-react';
import { useDocsArticles, createDocsArticle, reembedAllArticles, type DocsArticle } from '../../hooks/useDocs';
import { useOverlayClose } from '../../hooks/useOverlayClose';
import { SkeletonTable } from '../../components/Skeleton';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { DocsEditorModal } from '../docs/DocsEditorModal';
import { DocsSearchPanel } from '../docs/DocsSearchPanel';
import { useToast, ToastHost } from '../../components/Toast';
import { RefreshButton } from '../../components/RefreshButton';
import { useRefreshHandler } from '../../hooks/useRefreshHandler';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { RequiredMark } from '../../components/RequiredMark';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const HELP: HelpContent = {
  title: 'Docs',
  body: [
    { type: 'p', text: "Every article behind the /docs help center. Search or filter to find one quickly, then edit it in place - changes are live immediately and re-embedded for search automatically." },
    { type: 'p', text: "Audience controls who can see it: client-only, admin-only, both, or internal (admin-only, hidden from the sidebar entirely for non-admins)." },
  ],
};

const AUDIENCE_PILL: Record<string, { bg: string; text: string }> = {
  client: { bg: 'var(--ad-green-tint)', text: 'var(--ad-green)' },
  admin: { bg: 'var(--ad-purple-tint)', text: 'var(--ad-purple)' },
  both: { bg: 'var(--ad-fill)', text: 'var(--ad-ink-soft)' },
  internal: { bg: 'var(--ad-clay-tint)', text: 'var(--ad-clay)' },
};

const ghostCls = 'cursor-pointer whitespace-nowrap rounded-xl border border-(--ad-line) bg-transparent px-4 py-2 text-[13px] font-semibold text-(--ad-ink-soft) transition-colors hover:border-(--ad-line-strong) hover:bg-(--ad-surface-2)';
const primaryCls = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-(--ad-green) px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-(--ad-green-hover) disabled:opacity-50';

function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
}

export function DocsAdmin() {
  const { rows, categories, loading, isFetching, dataUpdatedAt, error, reload } = useDocsArticles();
  const { toasts, toast, dismiss } = useToast();
  const handleRefresh = useRefreshHandler(reload, toast, 'Failed to refresh docs.');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [audienceFilter, setAudienceFilter] = useState('all');
  const [editing, setEditing] = useState<DocsArticle | null>(null);
  const [creating, setCreating] = useState(false);
  const [reembedding, setReembedding] = useState(false);
  const [reembedMsg, setReembedMsg] = useState<string | null>(null);
  const [aiQuestion, setAiQuestion] = useState<string | null>(null);

  async function handleReembedAll() {
    if (rows.length === 0 || reembedding) return;
    setReembedding(true);
    setReembedMsg(null);
    const { succeeded, failed } = await reembedAllArticles(rows.map((r) => r.id));
    setReembedding(false);
    setReembedMsg(failed > 0
      ? `Re-embedded ${succeeded} of ${rows.length} (${failed} failed - check that GEMINI_API_KEY is configured).`
      : `Re-embedded all ${succeeded} articles for search.`);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (audienceFilter !== 'all' && r.audience !== audienceFilter) return false;
      if (q && !r.title.toLowerCase().includes(q) && !r.slug.toLowerCase().includes(q) && !r.summary.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, categoryFilter, audienceFilter]);

  return (
    <div style={FONT} className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-(--ad-ink)">
            <img src="https://cdn-icons-png.flaticon.com/128/2232/2232688.png" alt="Docs" className="w-9 h-9" />
            Docs
          </h1>
          <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">{rows.length} articles</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP} />
          <Link to="/docs" target="_blank" className={`${ghostCls} no-underline hidden md:inline-flex items-center gap-1.5`}>
            <ExternalLink size={13} />
            View docs site
          </Link>
          <RefreshButton onRefresh={handleRefresh} isFetching={isFetching} dataUpdatedAt={dataUpdatedAt} className={ghostCls} />
          <button onClick={handleReembedAll} disabled={reembedding} className={`${ghostCls} hidden md:inline-flex items-center gap-1.5`}>
            <Sparkles size={13} />
            {reembedding ? 'Re-embedding…' : 'Re-embed all'}
          </button>
          <button onClick={() => setCreating(true)} className={`${primaryCls} hidden md:inline-flex items-center gap-1.5`}>
            <Plus size={14} strokeWidth={2.5} />
            New article
          </button>
        </div>
      </header>

      {reembedMsg && (
        <div className="rounded-xl border border-(--ad-line) bg-(--ad-surface-2) px-4 py-3 text-[13px] text-(--ad-ink-soft)">{reembedMsg}</div>
      )}

      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--ad-ink-faint)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) setAiQuestion(query.trim());
            }}
            placeholder="Search articles, or press Enter to ask AI…"
            style={FONT}
            className="w-full rounded-lg border border-(--ad-line) bg-(--ad-surface-2) py-2.5 pl-9 pr-3.5 text-[13px] text-(--ad-ink) outline-none placeholder:text-(--ad-ink-ghost) transition-colors focus:border-(--ad-green) focus:bg-(--ad-surface)"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger style={FONT} className="h-10 w-full rounded-lg border-(--ad-line) bg-(--ad-surface-2) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green) md:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(({ category }) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={audienceFilter} onValueChange={setAudienceFilter}>
          <SelectTrigger style={FONT} className="h-10 w-full rounded-lg border-(--ad-line) bg-(--ad-surface-2) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green) md:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
            <SelectItem value="all">All audiences</SelectItem>
            <SelectItem value="client">Client</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="both">Both</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={10} cols={5} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-(--ad-line) bg-(--ad-surface) p-10 text-center">
          <strong className="text-[15px] font-bold text-(--ad-ink)">No articles match.</strong>
        </div>
      ) : (
        <div className="atbl hidden md:block">
          <table className="table-fixed">
            <colgroup>
              <col className="w-[32%]" />
              <col className="w-[20%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr>
                {['Title', 'Category', 'Audience', 'Status', 'Updated', ''].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const pill = AUDIENCE_PILL[a.audience] ?? AUDIENCE_PILL.both;
                return (
                  <tr key={a.id} onClick={() => setEditing(a)} className="cursor-pointer">
                    <td className="min-w-0">
                      <div className="truncate font-bold text-(--ad-ink)" title={a.title}>{a.title}</div>
                      <div className="truncate text-[11px] text-(--ad-ink-faint)">{a.slug}</div>
                    </td>
                    <td className="min-w-0 text-(--ad-ink-soft)">
                      <div className="truncate">{a.category}</div>
                    </td>
                    <td>
                      <span className="atbl-pill" style={{ background: pill.bg, color: pill.text }}>{a.audience}</span>
                    </td>
                    <td>
                      <span className="atbl-pill" style={{
                        background: a.status === 'published' ? 'var(--ad-green-tint)' : 'var(--ad-fill)',
                        color: a.status === 'published' ? 'var(--ad-green)' : 'var(--ad-ink-soft)',
                      }}>
                        {a.status}
                      </span>
                    </td>
                    <td className="text-[12px] text-(--ad-ink-faint) whitespace-nowrap">
                      {new Date(a.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-3 text-right text-[12px] text-(--ad-ink-faint)">v{a.version}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {filtered.map((a) => {
          const pill = AUDIENCE_PILL[a.audience] ?? AUDIENCE_PILL.both;
          return (
            <button key={a.id} onClick={() => setEditing(a)} className="cursor-pointer rounded-xl border border-(--ad-line) bg-(--ad-surface) p-4 text-left">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-bold text-[14px] text-(--ad-ink)" title={a.title}>{a.title}</span>
                <span className="shrink-0 inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]" style={{ background: pill.bg, color: pill.text }}>
                  {a.audience}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-(--ad-ink-faint)">{a.category} · {a.status} · v{a.version}</p>
            </button>
          );
        })}
      </div>

      {/* Mobile FAB */}
      <button
        onClick={() => setCreating(true)}
        className="fixed bottom-6 right-6 z-40 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-(--ad-green) text-white shadow-[0_4px_20px_rgba(60,122,91,0.35)] transition-colors hover:bg-(--ad-green-hover)"
        aria-label="New article"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      <AnimatePresence>
        {editing && (
          <DocsEditorModal
            key={`edit-${editing.id}`}
            article={editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); toast('Article saved.'); }}
          />
        )}
        {creating && (
          <NewArticleModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); toast('Article created as a draft.'); }} />
        )}
        {aiQuestion && (
          <DocsSearchPanel
            key="admin-docs-ai-search"
            initialQuestion={aiQuestion}
            onClose={() => setAiQuestion(null)}
          />
        )}
      </AnimatePresence>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-(--ad-ink-faint)';
const inputCls = 'w-full rounded-lg border border-(--ad-line) bg-(--ad-surface-2) px-3.5 py-2.5 text-[13px] text-(--ad-ink) outline-none placeholder:text-(--ad-ink-ghost) transition-colors focus:border-(--ad-green) focus:bg-(--ad-surface)';

function NewArticleModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [audience, setAudience] = useState<DocsArticle['audience']>('both');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || !category.trim()) { setErr('Title and category are required.'); return; }
    setBusy(true); setErr(null);
    const { error } = await createDocsArticle({
      slug: slugify(title),
      category: category.trim(),
      audience,
      title: title.trim(),
      summary: summary.trim(),
      body_md: `## Overview\n\nStart writing here.`,
      status: 'draft',
      order_index: 999,
    });
    setBusy(false);
    if (error) setErr(error); else onCreated();
  }

  return (
    <div
      className="fixed inset-0 z-100 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
      {...useOverlayClose(onClose)}
    >
      <div
        style={FONT}
        className="modal-card flex w-full flex-col bg-(--ad-surface) overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[480px] md:rounded-md md:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold text-(--ad-ink)">New article</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-(--ad-ink-faint) hover:text-(--ad-ink)">×</button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-5">
          <div>
            <label className={fieldLbl}>Title<RequiredMark /></label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={FONT} className={inputCls} placeholder="e.g. Setting up your first campaign" />
          </div>
          <div>
            <label className={fieldLbl}>Category<RequiredMark /></label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} style={FONT} className={inputCls} placeholder="e.g. Campaigns" />
          </div>
          <div>
            <label className={fieldLbl}>Summary</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} style={FONT} className={`${inputCls} resize-y`} />
          </div>
          <div>
            <label className={fieldLbl}>Audience</label>
            <Select value={audience} onValueChange={(v) => setAudience(v as DocsArticle['audience'])}>
              <SelectTrigger style={FONT} className="h-10 rounded-lg border-(--ad-line) bg-(--ad-surface-2) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)">
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="both">Both</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="m-0 text-[11px] text-(--ad-ink-faint)">Created as a draft - open it after creating to write the body and publish.</p>
          {err && <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{err}</div>}
        </div>
        <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className={ghostCls}>Cancel</button>
          <button onClick={submit} disabled={busy} className={primaryCls}>{busy ? 'Creating…' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
