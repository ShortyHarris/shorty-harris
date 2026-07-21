import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Search, ExternalLink, Plus, Sparkles } from 'lucide-react';
import { useDocsArticles, createDocsArticle, reembedAllArticles, type DocsArticle } from '../../hooks/useDocs';
import { SkeletonTable } from '../../components/Skeleton';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { DocsEditorModal } from '../docs/DocsEditorModal';
import { DocsSearchPanel } from '../docs/DocsSearchPanel';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const HELP: HelpContent = {
  title: 'Docs',
  body: [
    { type: 'p', text: "Every article behind the /docs help center. Search or filter to find one quickly, then edit it in place — changes are live immediately and re-embedded for search automatically." },
    { type: 'p', text: "Audience controls who can see it: client-only, admin-only, both, or internal (admin-only, hidden from the sidebar entirely for non-admins)." },
  ],
};

const AUDIENCE_PILL: Record<string, { bg: string; text: string }> = {
  client: { bg: '#edf4ef', text: '#3c7a5b' },
  admin: { bg: '#f0ecf8', text: '#6b4fa0' },
  both: { bg: '#f5f2ec', text: '#62655c' },
  internal: { bg: '#f6e8e2', text: '#a8533a' },
};

const ghostCls = 'cursor-pointer whitespace-nowrap rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:border-[#ddd8cb] hover:bg-[#fbf9f5]';
const primaryCls = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-[#3c7a5b] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#2d5e46] disabled:opacity-50';

function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
}

export function DocsAdmin() {
  const { rows, categories, loading, error, reload } = useDocsArticles();
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
      ? `Re-embedded ${succeeded} of ${rows.length} (${failed} failed — check that GEMINI_API_KEY is configured).`
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
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-[#20211c]">
            <img src="https://cdn-icons-png.flaticon.com/128/2232/2232688.png" alt="Docs" className="w-9 h-9" />
            Docs
          </h1>
          <p className="m-0 mt-1 text-[13px] text-[#62655c]">{rows.length} articles</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP} />
          <Link to="/docs" target="_blank" className={`${ghostCls} no-underline hidden md:inline-flex items-center gap-1.5`}>
            <ExternalLink size={13} />
            View docs site
          </Link>
          <button onClick={reload} className={ghostCls}>Refresh</button>
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
        <div className="rounded-xl border border-[#ece8df] bg-[#fbf9f5] px-4 py-3 text-[13px] text-[#62655c]">{reembedMsg}</div>
      )}

      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9a9d92]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) setAiQuestion(query.trim());
            }}
            placeholder="Search articles, or press Enter to ask AI…"
            style={FONT}
            className="w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] py-2.5 pl-9 pr-3.5 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger style={FONT} className="h-10 w-full rounded-lg border-[#ece8df] bg-[#fbf9f5] text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b] md:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(({ category }) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={audienceFilter} onValueChange={setAudienceFilter}>
          <SelectTrigger style={FONT} className="h-10 w-full rounded-lg border-[#ece8df] bg-[#fbf9f5] text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b] md:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
            <SelectItem value="all">All audiences</SelectItem>
            <SelectItem value="client">Client</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="both">Both</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{error}</div>
      )}

      {loading ? (
        <SkeletonTable rows={10} cols={5} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
          <strong className="text-[15px] font-bold text-[#20211c]">No articles match.</strong>
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
                      <div className="truncate font-bold text-[#20211c]" title={a.title}>{a.title}</div>
                      <div className="truncate text-[11px] text-[#9a9d92]">{a.slug}</div>
                    </td>
                    <td className="min-w-0 text-[#62655c]">
                      <div className="truncate">{a.category}</div>
                    </td>
                    <td>
                      <span className="atbl-pill" style={{ background: pill.bg, color: pill.text }}>{a.audience}</span>
                    </td>
                    <td>
                      <span className="atbl-pill" style={{
                        background: a.status === 'published' ? '#edf4ef' : '#f5f2ec',
                        color: a.status === 'published' ? '#3c7a5b' : '#62655c',
                      }}>
                        {a.status}
                      </span>
                    </td>
                    <td className="text-[12px] text-[#9a9d92] whitespace-nowrap">
                      {new Date(a.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-3 text-right text-[12px] text-[#9a9d92]">v{a.version}</td>
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
            <button key={a.id} onClick={() => setEditing(a)} className="cursor-pointer rounded-xl border border-[#ece8df] bg-white p-4 text-left">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-bold text-[14px] text-[#20211c]" title={a.title}>{a.title}</span>
                <span className="shrink-0 inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]" style={{ background: pill.bg, color: pill.text }}>
                  {a.audience}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-[#9a9d92]">{a.category} · {a.status} · v{a.version}</p>
            </button>
          );
        })}
      </div>

      {/* Mobile FAB */}
      <button
        onClick={() => setCreating(true)}
        className="fixed bottom-6 right-6 z-40 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-[#3c7a5b] text-white shadow-[0_4px_20px_rgba(60,122,91,0.35)] transition-colors hover:bg-[#2d5e46]"
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
            onSaved={() => setEditing(null)}
          />
        )}
        {creating && (
          <NewArticleModal onClose={() => setCreating(false)} onCreated={() => setCreating(false)} />
        )}
        {aiQuestion && (
          <DocsSearchPanel
            key="admin-docs-ai-search"
            initialQuestion={aiQuestion}
            onClose={() => setAiQuestion(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]';
const inputCls = 'w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-2.5 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white';

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
      onClick={onClose}
    >
      <div
        style={FONT}
        className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-w-[480px] md:rounded-2xl md:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold text-[#20211c]">New article</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-5">
          <div>
            <label className={fieldLbl}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={FONT} className={inputCls} placeholder="e.g. Setting up your first campaign" />
          </div>
          <div>
            <label className={fieldLbl}>Category</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} style={FONT} className={inputCls} placeholder="e.g. Campaigns" />
          </div>
          <div>
            <label className={fieldLbl}>Summary</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} style={FONT} className={`${inputCls} resize-y`} />
          </div>
          <div>
            <label className={fieldLbl}>Audience</label>
            <Select value={audience} onValueChange={(v) => setAudience(v as DocsArticle['audience'])}>
              <SelectTrigger style={FONT} className="h-10 rounded-lg border-[#ece8df] bg-[#fbf9f5] text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="both">Both</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="m-0 text-[11px] text-[#9a9d92]">Created as a draft — open it after creating to write the body and publish.</p>
          {err && <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>}
        </div>
        <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className={ghostCls}>Cancel</button>
          <button onClick={submit} disabled={busy} className={primaryCls}>{busy ? 'Creating…' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
