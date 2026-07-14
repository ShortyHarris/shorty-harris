import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  useBlogQueue, usePublishedBlogPosts, fetchLinkedPosts, BLOG_KEYS,
} from '../../hooks/useBlogPosts';
import type { BlogPost, BlogCategory } from '../../hooks/useBlogPosts';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { ChevronDown, ChevronUp, Link2 } from 'lucide-react';

const HELP: HelpContent = {
  title: 'Blog',
  body: [
    { type: 'p', text: "WF12 drafts blog posts automatically and they land here pending approval. Nothing appears on the public site until you approve it — approving publishes it and triggers a rebuild of the public blog." },
    { type: 'p', text: "Click a post to expand it — you can edit the title, body, excerpt, and SEO fields before approving." },
    { type: 'ul', items: [
      "Approve & publish — goes live on the public site immediately",
      "Reject — discards the draft with a reason; WF12 won't retry it",
      "Delete — removes the draft so WF12 regenerates it on its next run",
    ]},
  ],
};

const CATEGORY_LABEL: Record<BlogCategory, string> = {
  family_business: 'Family business',
  small_business: 'Small business',
  business_development_rural: 'Rural biz dev',
  general: 'General',
};

const CATEGORY_PILL: Record<BlogCategory, { bg: string; text: string }> = {
  family_business:             { bg: '#edf4ef', text: '#3c7a5b' },
  small_business:               { bg: '#f8efdb', text: '#b9831f' },
  business_development_rural:  { bg: '#f0ecf8', text: '#6b4fa0' },
  general:                      { bg: '#f5f2ec', text: '#62655c' },
};

const PAGE_SIZE = 10;

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

export function Blog() {
  const {
    pending, loading, error,
    approveAndPublish, reject, deleteForRegeneration, reload,
  } = useBlogQueue();
  const { posts: published, loading: publishedLoading, reload: reloadPublished } = usePublishedBlogPosts();

  const [view, setView]           = useState<'pending' | 'published'>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<BlogPost | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BlogPost | null>(null);
  const [page, setPage]           = useState(1);
  const [busyId, setBusyId]       = useState<string | null>(null);

  const list = view === 'pending' ? pending : published;
  const isLoading = view === 'pending' ? loading : publishedLoading;

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = list.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function switchView(v: 'pending' | 'published') {
    setView(v);
    setPage(1);
    setExpandedId(null);
  }

  async function handleApprove(post: BlogPost, edits: Partial<Pick<BlogPost, 'title' | 'body_md' | 'excerpt' | 'seo_title' | 'meta_description'>>) {
    setBusyId(post.id);
    try {
      await approveAndPublish(post.id, edits);
      setExpandedId(null);
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(reason: string) {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    try {
      await reject(rejectTarget.id, reason);
      setRejectTarget(null);
      setExpandedId(null);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteForRegeneration(deleteTarget.id);
      setDeleteTarget(null);
      setExpandedId(null);
    } finally {
      setBusyId(null);
    }
  }

  const pagBtnCls = 'cursor-pointer rounded-lg border border-[#ddd8cb] bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-[#20211c] transition-colors hover:bg-[#fbf9f5] disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div style={FONT} className="flex flex-col gap-6">

      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-[#20211c]"> <img src="https://cdn-icons-png.flaticon.com/128/2965/2965879.png" alt="Blog" className="w-10 h-10" />Blog</h1>
          <p className="m-0 mt-1 text-[13px] text-[#62655c]">
            Review AI-drafted posts before they go live on the public site.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP} />
          <button
            onClick={() => { reload(); reloadPublished(); }}
            className="cursor-pointer whitespace-nowrap rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:border-[#ddd8cb] hover:bg-[#fbf9f5]"
          >
            Refresh
          </button>
        </div>
      </header>

      {/* Segmented view toggle */}
      <div className="inline-flex w-fit rounded-xl border border-[#ece8df] bg-white p-1">
        <button
          onClick={() => switchView('pending')}
          className={`cursor-pointer rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors ${
            view === 'pending' ? 'bg-[#3c7a5b] text-white' : 'text-[#62655c] hover:bg-[#fbf9f5]'
          }`}
        >
          Pending ({pending.length})
        </button>
        <button
          onClick={() => switchView('published')}
          className={`cursor-pointer rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors ${
            view === 'published' ? 'bg-[#3c7a5b] text-white' : 'text-[#62655c] hover:bg-[#fbf9f5]'
          }`}
        >
          Published ({published.length})
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">
          Couldn't load the queue: {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-[#ece8df] bg-[#fbf9f5]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
          <strong className="text-[15px] font-bold text-[#20211c]">
            {view === 'pending' ? 'Nothing waiting for review.' : 'Nothing published yet.'}
          </strong>
          <span className="text-[13px] text-[#62655c]">
            {view === 'pending'
              ? 'New drafts from WF12 will appear here.'
              : 'Approved posts show up here once they go live.'}
          </span>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {paged.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                readOnly={view === 'published'}
                expanded={expandedId === post.id}
                busy={busyId === post.id}
                onToggle={() => setExpandedId((id) => (id === post.id ? null : post.id))}
                onApprove={(edits) => handleApprove(post, edits)}
                onReject={() => setRejectTarget(post)}
                onDelete={() => setDeleteTarget(post)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-[#ece8df] bg-white px-4 py-3 text-[12.5px] text-[#9a9d92]">
              <span>Page {safePage} of {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} className={pagBtnCls}>Previous</button>
                <button onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages} className={pagBtnCls}>Next</button>
              </div>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {rejectTarget && (
          <RejectModal
            key="reject-modal"
            post={rejectTarget}
            busy={busyId === rejectTarget.id}
            onClose={() => setRejectTarget(null)}
            onConfirm={handleReject}
          />
        )}
        {deleteTarget && (
          <DeleteModal
            key="delete-modal"
            post={deleteTarget}
            busy={busyId === deleteTarget.id}
            onClose={() => setDeleteTarget(null)}
            onConfirm={handleDelete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function LinkedPostsPreview({ postId }: { postId: string }) {
  const { data: links = [], isLoading } = useQuery({
    queryKey: BLOG_KEYS.links(postId),
    queryFn: () => fetchLinkedPosts(postId),
    staleTime: 60 * 1000,
  });

  if (isLoading) return null;
  if (links.length === 0) {
    return <p className="m-0 text-[12px] italic text-[#c4bfb5]">No planned interlinks yet.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {links.map((l) => (
        <div key={l.id} className="flex items-center gap-2 text-[12.5px] text-[#62655c]">
          <Link2 size={12} className="shrink-0 text-[#9a9d92]" />
          <span className="truncate">{l.title}</span>
          {l.anchor_text && <span className="shrink-0 text-[11px] italic text-[#9a9d92]">"{l.anchor_text}"</span>}
        </div>
      ))}
    </div>
  );
}

function PostCard({
  post, readOnly, expanded, busy, onToggle, onApprove, onReject, onDelete,
}: {
  post: BlogPost;
  readOnly: boolean;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onApprove: (edits: Partial<Pick<BlogPost, 'title' | 'body_md' | 'excerpt' | 'seo_title' | 'meta_description'>>) => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle]                     = useState(post.title);
  const [bodyMd, setBodyMd]                     = useState(post.body_md);
  const [excerpt, setExcerpt]                   = useState(post.excerpt ?? '');
  const [seoTitle, setSeoTitle]                 = useState(post.seo_title ?? '');
  const [metaDescription, setMetaDescription]   = useState(post.meta_description ?? '');

  const pill = CATEGORY_PILL[post.category] ?? CATEGORY_PILL.general;
  const inputCls = 'w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-2.5 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white';
  const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]';

  function submitApprove() {
    onApprove({
      title: title.trim(),
      body_md: bodyMd,
      excerpt: excerpt.trim(),
      seo_title: seoTitle.trim(),
      meta_description: metaDescription.trim(),
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#ece8df] bg-white">
      {/* Collapsed header — always visible, click to expand */}
      <button
        onClick={onToggle}
        className="flex w-full cursor-pointer items-start gap-3 p-4 text-left transition-colors hover:bg-[#fbf9f5]"
      >
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[#f5f2ec]">
          {post.cover_image_url ? (
            <img src={post.cover_image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-[#c4bfb5]">No cover</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-[#20211c]">{post.title}</span>
            <span className="atbl-pill" style={{ background: pill.bg, color: pill.text }}>
              {CATEGORY_LABEL[post.category] ?? post.category}
            </span>
          </div>
          {post.excerpt && (
            <p className="m-0 mt-1 line-clamp-2 text-[12.5px] text-[#62655c]">{post.excerpt}</p>
          )}
          {post.target_keywords.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {post.target_keywords.slice(0, 4).map((k) => (
                <span key={k} className="rounded-full bg-[#f5f2ec] px-2 py-0.5 text-[10.5px] font-semibold text-[#62655c]">{k}</span>
              ))}
              {post.target_keywords.length > 4 && (
                <span className="text-[10.5px] text-[#9a9d92]">+{post.target_keywords.length - 4} more</span>
              )}
            </div>
          )}
          {post.status === 'rejected' && post.rejection_reason && (
            <p className="m-0 mt-1.5 text-[12px] text-[#a8533a]">Rejected: {post.rejection_reason}</p>
          )}
        </div>

        {expanded ? <ChevronUp size={16} className="shrink-0 text-[#9a9d92]" /> : <ChevronDown size={16} className="shrink-0 text-[#9a9d92]" />}
      </button>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-[#ece8df] p-4 flex flex-col gap-4">
          {readOnly ? (
            <div className="rounded-xl border border-[#ece8df] bg-[#fbf9f5] p-4 text-[13px] leading-relaxed text-[#20211c] whitespace-pre-wrap">
              {post.body_md}
            </div>
          ) : (
            <>
              <div>
                <label className={fieldLbl}>Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} style={FONT} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={fieldLbl}>SEO title</label>
                  <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} style={FONT} className={inputCls} />
                </div>
                <div>
                  <label className={fieldLbl}>Excerpt</label>
                  <input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} style={FONT} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={fieldLbl}>Meta description</label>
                <input value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} style={FONT} className={inputCls} />
              </div>
              <div>
                <label className={fieldLbl}>Body (markdown)</label>
                <textarea
                  value={bodyMd}
                  onChange={(e) => setBodyMd(e.target.value)}
                  rows={14}
                  style={{ ...FONT, fontFamily: "ui-monospace, 'Cascadia Code', monospace" }}
                  className="w-full resize-y rounded-lg border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#20211c] outline-none transition-colors focus:border-[#3c7a5b] focus:bg-white"
                />
              </div>
            </>
          )}

          <div>
            <label className={fieldLbl}>Planned interlinks</label>
            <LinkedPostsPreview postId={post.id} />
          </div>

          {!readOnly && (
            <div className="flex flex-wrap justify-end gap-2.5 border-t border-[#f5f2ec] pt-3">
              <button
                onClick={onDelete}
                disabled={busy}
                className="cursor-pointer rounded-xl border border-transparent bg-transparent px-4 py-2 text-[13px] font-semibold text-[#c4bfb5] transition-colors hover:border-[#a8533a]/30 hover:bg-[#fdf0ec] hover:text-[#a8533a] disabled:opacity-50"
              >
                Delete (regenerate)
              </button>
              <button
                onClick={onReject}
                disabled={busy}
                className="cursor-pointer rounded-xl border border-[#a8533a] bg-transparent px-4 py-2 text-[13px] font-bold text-[#a8533a] transition-colors hover:bg-[#a8533a] hover:text-white disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={submitApprove}
                disabled={busy || !title.trim()}
                className="cursor-pointer rounded-xl border-0 bg-[#3c7a5b] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#2d5e46] disabled:opacity-50"
              >
                {busy ? 'Publishing…' : 'Approve & publish'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RejectModal({
  post, busy, onClose, onConfirm,
}: { post: BlogPost; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        style={FONT}
        className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[90vh] md:max-w-[480px] md:rounded-2xl md:shadow-2xl"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold text-[#20211c]">Reject post</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-3">
          <p className="m-0 text-[13px] text-[#62655c]">
            Rejecting <strong className="font-bold text-[#20211c]">{post.title}</strong>. WF12 won't retry this exact draft.
          </p>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Off-brand tone, factually wrong, duplicate topic…"
              style={FONT}
              className="w-full resize-y rounded-lg border border-[#ece8df] bg-[#fbf9f5] px-3.5 py-2.5 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white"
            />
          </div>
        </div>
        <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className="cursor-pointer rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:bg-[#fbf9f5]">Cancel</button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={busy || !reason.trim()}
            className="cursor-pointer rounded-xl border-0 bg-[#a8533a] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#8a3f2b] disabled:opacity-50"
          >
            {busy ? 'Rejecting…' : 'Reject post'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DeleteModal({
  post, busy, onClose, onConfirm,
}: { post: BlogPost; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:bg-black/40 md:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        style={FONT}
        className="flex w-full flex-col bg-white overflow-hidden h-full md:h-auto md:max-h-[90vh] md:max-w-[480px] md:rounded-2xl md:shadow-2xl"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#ece8df] px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold text-[#20211c]">Delete draft</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none text-[#9a9d92] hover:text-[#20211c]">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-3">
          <div className="rounded-xl border border-[#a8533a]/20 bg-[#fdf0ec] px-4 py-4">
            <p className="m-0 text-[14px] font-bold text-[#a8533a]">Delete "{post.title}"?</p>
            <p className="m-0 mt-1.5 text-[13px] text-[#a8533a]/80">
              This isn't a rejection — WF12 will treat the topic as still needing a post and draft a fresh one on its next scheduled run.
            </p>
          </div>
        </div>
        <div className="shrink-0 border-t border-[#ece8df] px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className="cursor-pointer rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:bg-[#fbf9f5]">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="cursor-pointer rounded-xl border-0 bg-[#a8533a] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#8a3f2b] disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete draft'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
