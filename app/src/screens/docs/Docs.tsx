import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { marked } from 'marked';
import { Menu, X, ChevronDown, ChevronRight, Pencil, ArrowLeft, Search } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useDocsArticles, type DocsArticle } from '../../hooks/useDocs';
import { DocsEditorModal } from './DocsEditorModal';
import { DocsSearchPanel } from './DocsSearchPanel';
import './Docs.css';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

function slugifyHeading(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}

interface TocEntry { id: string; text: string; level: 2 | 3; }

// marked's default renderer emits plain <h2>/<h3> with no id — inject one
// derived from the heading text, and collect the same ids for the mini-TOC,
// so the two can never drift out of sync with each other.
function renderBody(md: string): { html: string; toc: TocEntry[] } {
  const rawHtml = marked.parse(md, { async: false }) as string;
  const toc: TocEntry[] = [];
  const used = new Map<string, number>();
  const html = rawHtml.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, level: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, '').trim();
    let id = slugifyHeading(text);
    const n = used.get(id) ?? 0;
    used.set(id, n + 1);
    if (n > 0) id = `${id}-${n}`;
    toc.push({ id, text, level: Number(level) as 2 | 3 });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html, toc };
}

export function Docs() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const homeHref = isAdmin ? '/admin' : '/app';

  const { rows, categories, loading, error } = useDocsArticles();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const active: DocsArticle | undefined = slug ? rows.find((r) => r.slug === slug) : rows[0];

  // Land on the first article once the list loads, if no slug is in the URL.
  useEffect(() => {
    if (!slug && rows.length > 0) navigate(`/docs/${rows[0].slug}`, { replace: true });
  }, [slug, rows, navigate]);

  const { html, toc } = useMemo(() => (active ? renderBody(active.body_md) : { html: '', toc: [] }), [active]);

  function toggleCategory(cat: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  const sidebarContent = (
    <>
      <Link to={homeHref} className="docs-back-link">
        <ArrowLeft size={14} strokeWidth={2} />
        Back to dashboard
      </Link>
      <nav className="docs-sidebar-nav">
        {categories.map(({ category, articles }) => {
          // Whichever category holds the active article is always shown
          // expanded — derived at render time so there's no effect/setState
          // needed just to seed the "default open" behavior.
          const isOpen = expanded.has(category) || category === active?.category;
          return (
            <div key={category} className="docs-cat">
              <button type="button" className="docs-cat-header" onClick={() => toggleCategory(category)}>
                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span>{category}</span>
              </button>
              {isOpen && (
                <div className="docs-cat-items">
                  {articles.map((a) => (
                    <Link
                      key={a.id}
                      to={`/docs/${a.slug}`}
                      onClick={() => setMobileNavOpen(false)}
                      className={`docs-nav-item${active?.id === a.id ? ' is-active' : ''}`}
                    >
                      {a.title}
                      {a.status === 'draft' && <span className="docs-draft-pill">Draft</span>}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );

  return (
    <div style={FONT} className="docs-shell">
      {/* Top bar */}
      <header className="docs-topbar">
        <button className="docs-hamburger" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <div className="docs-breadcrumb">
          <span className="docs-breadcrumb-brand">Docs</span>
          {active && (
            <>
              <span className="docs-breadcrumb-sep">/</span>
              <span className="docs-breadcrumb-cat">{active.category}</span>
              <span className="docs-breadcrumb-sep">/</span>
              <span className="docs-breadcrumb-title">{active.title}</span>
            </>
          )}
        </div>
        <button className="docs-search-trigger" onClick={() => setSearchOpen(true)}>
          <Search size={13} className="docs-search-trigger-icon" />
          <span className="docs-search-trigger-text-wrap">
            <span className="docs-search-trigger-text">Search or ask a question</span>
          </span>
          <kbd>/</kbd>
        </button>
      </header>

      <div className="docs-body">
        {/* Desktop sidebar */}
        <aside className="docs-sidebar">{sidebarContent}</aside>

        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileNavOpen && (
            <motion.div
              className="docs-mobile-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMobileNavOpen(false)}
            >
              <motion.div
                className="docs-mobile-drawer"
                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 340 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button className="docs-mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
                  <X size={18} />
                </button>
                {sidebarContent}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main content */}
        <main className="docs-main">
          {loading ? (
            <div className="docs-skeleton">
              <div className="docs-skeleton-line" style={{ width: '40%', height: 28 }} />
              <div className="docs-skeleton-line" style={{ width: '70%', height: 14 }} />
              <div className="docs-skeleton-line" style={{ width: '100%', height: 200, marginTop: 20 }} />
            </div>
          ) : error ? (
            <div className="docs-error">Couldn't load the docs: {error}</div>
          ) : !active ? (
            <div className="docs-error">No articles available yet.</div>
          ) : (
            <>
              <div className="docs-article-head">
                <div>
                  <h1 className="docs-article-title">{active.title}</h1>
                  <p className="docs-article-summary">{active.summary}</p>
                </div>
                {isAdmin && (
                  <button className="docs-edit-btn" onClick={() => setEditing(true)}>
                    <Pencil size={13} strokeWidth={2.2} />
                    Edit
                  </button>
                )}
              </div>
              <div className="docs-article-body" dangerouslySetInnerHTML={{ __html: html }} />
            </>
          )}
        </main>

        {/* Mini TOC */}
        {toc.length > 1 && (
          <aside className="docs-toc">
            <div className="docs-toc-label">On this page</div>
            {toc.map((t) => (
              <a key={t.id} href={`#${t.id}`} className={`docs-toc-link docs-toc-level-${t.level}`}>
                {t.text}
              </a>
            ))}
          </aside>
        )}
      </div>

      <AnimatePresence>
        {editing && active && (
          <DocsEditorModal
            key={`edit-${active.id}`}
            article={active}
            onClose={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {searchOpen && <DocsSearchPanel key="docs-search" onClose={() => setSearchOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
