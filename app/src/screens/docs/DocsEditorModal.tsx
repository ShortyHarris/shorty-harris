import { useState } from 'react';
import { motion } from 'framer-motion';
import { marked } from 'marked';
import { MarkdownEditor } from '../../components/MarkdownEditor';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { updateDocsArticle, type DocsArticle } from '../../hooks/useDocs';
import { useOverlayClose } from '../../hooks/useOverlayClose';
import { RequiredMark } from '../../components/RequiredMark';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-(--ad-ink-faint)';
const inputCls = 'w-full rounded-lg border border-(--ad-line) bg-(--ad-surface-2) px-3.5 py-2.5 text-[13px] text-(--ad-ink) outline-none placeholder:text-(--ad-ink-ghost) transition-colors focus:border-(--ad-green) focus:bg-(--ad-surface)';
const ghostCls = 'cursor-pointer whitespace-nowrap rounded-xl border border-(--ad-line) bg-transparent px-4 py-2 text-[13px] font-semibold text-(--ad-ink-soft) transition-colors hover:border-(--ad-line-strong) hover:bg-(--ad-surface-2)';
const primaryCls = 'cursor-pointer whitespace-nowrap rounded-xl border-0 bg-(--ad-green) px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-(--ad-green-hover) disabled:opacity-50';

const AUDIENCE_OPTIONS: DocsArticle['audience'][] = ['client', 'admin', 'both', 'internal'];

export function DocsEditorModal({
  article, onClose, onSaved,
}: { article: DocsArticle; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle]     = useState(article.title);
  const [summary, setSummary] = useState(article.summary);
  const [category, setCategory] = useState(article.category);
  const [audience, setAudience] = useState(article.audience);
  const [status, setStatus]   = useState(article.status);
  const [bodyMd, setBodyMd]   = useState(article.body_md);
  const [tab, setTab]         = useState<'write' | 'preview'>('write');
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) { setErr('Title is required.'); return; }
    if (!category.trim()) { setErr('Category is required.'); return; }
    setBusy(true); setErr(null);
    const { error } = await updateDocsArticle(article.id, {
      title: title.trim(),
      summary: summary.trim(),
      category: category.trim(),
      audience,
      status,
      body_md: bodyMd,
    });
    setBusy(false);
    if (error) setErr(error); else onSaved();
  }

  return (
    <motion.div
      className="fixed inset-0 z-100 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose)}
    >
      <motion.div
        style={FONT}
        className="modal-card flex w-full flex-col bg-(--ad-surface) overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[760px] md:rounded-md md:shadow-2xl"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-(--ad-line) px-5 py-4">
          <div>
            <h2 className="m-0 text-[18px] font-bold text-(--ad-ink)">Edit article</h2>
            <p className="m-0 mt-0.5 text-[12px] text-(--ad-ink-faint)">{article.slug} · v{article.version}</p>
          </div>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-(--ad-ink-faint) hover:text-(--ad-ink)">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <div>
            <label className={fieldLbl}>Title<RequiredMark /></label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={FONT} className={inputCls} />
          </div>

          <div>
            <label className={fieldLbl}>Summary</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              style={FONT}
              className={`${inputCls} resize-y`}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={fieldLbl}>Category<RequiredMark /></label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} style={FONT} className={inputCls} />
            </div>
            <div>
              <label className={fieldLbl}>Audience</label>
              <Select value={audience} onValueChange={(v) => setAudience(v as DocsArticle['audience'])}>
                <SelectTrigger style={FONT} className="h-10 rounded-lg border-(--ad-line) bg-(--ad-surface-2) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
                  {AUDIENCE_OPTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={fieldLbl}>Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as DocsArticle['status'])}>
                <SelectTrigger style={FONT} className="h-10 rounded-lg border-(--ad-line) bg-(--ad-surface-2) text-[13px] text-(--ad-ink) focus:ring-0 focus:ring-offset-0 focus:border-(--ad-green)">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={FONT} className="bg-(--ad-surface) text-[13px] text-(--ad-ink)">
                  <SelectItem value="draft">draft</SelectItem>
                  <SelectItem value="published">published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className={fieldLbl}>Body (markdown)</label>
              <div className="flex gap-1 rounded-lg border border-(--ad-line) p-0.5">
                <button
                  type="button"
                  onClick={() => setTab('write')}
                  className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-bold ${tab === 'write' ? 'bg-(--ad-green) text-white' : 'bg-transparent text-(--ad-ink-soft)'}`}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setTab('preview')}
                  className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-bold ${tab === 'preview' ? 'bg-(--ad-green) text-white' : 'bg-transparent text-(--ad-ink-soft)'}`}
                >
                  Preview
                </button>
              </div>
            </div>
            {tab === 'write' ? (
              <MarkdownEditor value={bodyMd} onChange={setBodyMd} rows={16} font={FONT} />
            ) : (
              <div
                className="docs-article-body rounded-lg border border-(--ad-line) bg-(--ad-surface-2) px-4 py-3.5 max-w-none"
                style={{ maxHeight: 380, overflowY: 'auto' }}
                dangerouslySetInnerHTML={{ __html: marked.parse(bodyMd || '', { async: false }) as string }}
              />
            )}
          </div>

          {err && <div className="rounded-xl border border-(--ad-clay)/20 bg-(--ad-clay-tint) px-4 py-3 text-[13px] text-(--ad-clay)">{err}</div>}
        </div>

        <div className="shrink-0 border-t border-(--ad-line) px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className={ghostCls}>Cancel</button>
          <button onClick={submit} disabled={busy} className={primaryCls}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
