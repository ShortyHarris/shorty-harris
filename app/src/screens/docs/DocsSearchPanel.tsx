import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const FUNCTIONS_URL = 'https://lxoeotyibsalbxgbjfxo.supabase.co/functions/v1';
const SOURCES_DELIM = '\n\n---SOURCES---\n';

interface DocsSource { slug: string; title: string; }

export function DocsSearchPanel({
  onClose, initialQuestion,
}: { onClose: () => void; initialQuestion?: string }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [question, setQuestion] = useState(initialQuestion ?? '');
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<DocsSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (initialQuestion?.trim()) ask(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ask(override?: string) {
    const q = (override ?? question).trim();
    if (!q || busy) return;
    setAsked(q);
    setAnswer('');
    setSources([]);
    setErr(null);
    setBusy(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${FUNCTIONS_URL}/docs-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ question: q }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Search failed (HTTP ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const delimIdx = buffer.indexOf(SOURCES_DELIM);
        if (delimIdx === -1) {
          setAnswer(buffer);
        } else {
          setAnswer(buffer.slice(0, delimIdx));
          const jsonPart = buffer.slice(delimIdx + SOURCES_DELIM.length);
          try {
            const parsed = JSON.parse(jsonPart);
            if (Array.isArray(parsed)) setSources(parsed);
          } catch {
            // sources JSON not fully arrived yet — will parse on a later chunk
          }
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); ask(); }
    else if (e.key === 'Escape') onClose();
  }

  function goToSource(slug: string) {
    onClose();
    navigate(`/docs/${slug}`);
  }

  return (
    <motion.div
      className="fixed inset-0 z-110 flex flex-col items-center bg-black/40 px-4 pt-[10vh]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        style={FONT}
        className="flex w-full max-w-[620px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[#ece8df] px-4 py-3.5">
          <Sparkles size={16} className="shrink-0 text-[#9a9d92]" />
          <div className="flex-1 min-w-0">
            <input
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about Shorty Harris…"
              style={FONT}
              className="w-full border-0 bg-transparent text-[14px] text-[#20211c] outline-none placeholder:text-[#c4bfb5]"
            />
          </div>
          <button onClick={onClose} className="cursor-pointer shrink-0 border-0 bg-transparent p-1 text-[#9a9d92] hover:text-[#20211c]" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {(asked || busy) && (
          <div className="max-h-[50vh] overflow-y-auto px-4 py-4">
            {asked && <p className="m-0 mb-3 text-[12px] font-semibold text-[#9a9d92]">"{asked}"</p>}

            {err ? (
              <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">{err}</div>
            ) : (
              <>
                {!answer && busy && (
                  <div className="flex items-center gap-2 text-[13px] text-[#9a9d92]">
                    <Loader2 size={14} className="animate-spin" />
                    Thinking…
                  </div>
                )}
                {answer && (
                  <p className="m-0 whitespace-pre-wrap text-[14px] leading-relaxed text-[#20211c]">{answer}</p>
                )}
                {sources.length > 0 && (
                  <div className="mt-4 flex flex-col gap-1.5 border-t border-[#f5f2ec] pt-3">
                    <span className="text-[11px] font-bold uppercase tracking-[.06em] text-[#9a9d92]">Sources</span>
                    {sources.map((s) => (
                      <button
                        key={s.slug}
                        onClick={() => goToSource(s.slug)}
                        className="cursor-pointer self-start border-0 bg-transparent p-0 text-left text-[13px] font-semibold text-[#3c7a5b] underline decoration-[#3c7a5b]/30 underline-offset-2 hover:decoration-[#3c7a5b]"
                      >
                        {s.title}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
