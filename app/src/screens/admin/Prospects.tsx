import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useProspects } from '../../hooks/useAdminData';
import { SkeletonTable } from '../../components/Skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

const STATUS_OPTIONS = ['all', 'new', 'contacted', 'replied', 'hot_lead', 'won', 'lost'] as const;

const STATUS_LABEL: Record<string, string> = {
  all: 'All statuses', new: 'New', contacted: 'Contacted',
  replied: 'Replied', hot_lead: 'Hot lead', won: 'Won', lost: 'Lost',
};

const STATUS_PILL: Record<string, { bg: string; text: string; border?: string }> = {
  new:       { bg: '#edf4ef', text: '#3c7a5b' },
  contacted: { bg: '#f8efdb', text: '#b9831f' },
  replied:   { bg: '#f8efdb', text: '#b9831f' },
  hot_lead:  { bg: '#3c7a5b', text: '#fff' },
  won:       { bg: '#3c7a5b', text: '#fff' },
  lost:      { bg: 'transparent', text: '#9a9d92', border: '1px solid #ddd8cb' },
};

const PAGE_SIZE = 15;

export function Prospects() {
  const { rows, loading, error, reload } = useProspects();
  const [q, setQ]           = useState('');
  const [status, setStatus] = useState('all');
  const [cat, setCat]       = useState('all');
  const [page, setPage]     = useState(1);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = rows.filter((r) => {
    if (status !== 'all' && r.pipeline_status !== status) return false;
    if (cat !== 'all' && r.category !== cat) return false;
    if (q) {
      const hay = `${r.business_name} ${r.email ?? ''} ${r.contact_name ?? ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function updateQ(v: string)      { setQ(v);      setPage(1); }
  function updateStatus(v: string) { setStatus(v); setPage(1); }
  function updateCat(v: string)    { setCat(v);    setPage(1); }

  const pagBtnCls = 'cursor-pointer rounded-lg border border-[#ddd8cb] bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold text-[#20211c] transition-colors hover:bg-[#fbf9f5] disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div style={FONT} className="flex flex-col gap-6">

      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight text-[#20211c]"> <img src="https://cdn-icons-png.flaticon.com/128/143/143438.png" alt="Prospects" className="w-10 h-10" />Prospects</h1>
          <p className="m-0 mt-1 text-[13px] text-[#62655c]">{rows.length} total across all clients</p>
        </div>
        <button
          onClick={reload}
          className="cursor-pointer whitespace-nowrap rounded-xl border border-[#ece8df] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#62655c] transition-colors hover:border-[#ddd8cb] hover:bg-[#fbf9f5]"
        >
          Refresh
        </button>
      </header>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#ece8df] bg-white p-3">
        <div className="relative flex min-w-[220px] flex-1 items-center">
          <Search className="absolute left-3 h-4 w-4 text-[#9a9d92] pointer-events-none" />
          <input
            value={q}
            onChange={(e) => updateQ(e.target.value)}
            placeholder="Search name, email, contact…"
            style={FONT}
            className="w-full rounded-lg border border-[#ece8df] bg-[#fbf9f5] py-2 pl-9 pr-3 text-[13px] text-[#20211c] outline-none placeholder:text-[#c4bfb5] transition-colors focus:border-[#3c7a5b] focus:bg-white"
          />
        </div>

        <Select value={status} onValueChange={updateStatus}>
          <SelectTrigger
            style={FONT}
            className="h-9 w-[155px] rounded-lg border-[#ece8df] bg-white text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={cat} onValueChange={updateCat}>
          <SelectTrigger
            style={FONT}
            className="h-9 w-[155px] rounded-lg border-[#ece8df] bg-white text-[13px] text-[#20211c] focus:ring-0 focus:ring-offset-0 focus:border-[#3c7a5b]"
          >
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent style={FONT} className="bg-white text-[13px] text-[#20211c]">
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="rounded-xl border border-[#a8533a]/20 bg-[#f6e8e2] px-4 py-3 text-[13px] text-[#a8533a]">
          {error}
        </div>
      )}

      {/* Table / Cards */}
      {loading ? (
        <SkeletonTable rows={PAGE_SIZE} cols={6} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#ece8df] bg-white p-10 text-center">
          <strong className="text-[15px] font-bold text-[#20211c]">No matches.</strong>
          <span className="text-[13px] text-[#62655c]">Try adjusting your filters or search query.</span>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-lg border border-[#ece8df] bg-white">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[#ece8df] bg-[#fbf9f5]">
                  {['Business', 'Contact', 'Client', 'Category', 'Location', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[.08em] text-[#9a9d92]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((r, i) => {
                  const pill = STATUS_PILL[r.pipeline_status] ?? STATUS_PILL.new;
                  return (
                    <tr
                      key={r.id}
                      className={`transition-colors hover:bg-[#fbf9f5] ${i < paged.length - 1 ? 'border-b border-[#f5f2ec]' : ''}`}
                    >
                      <td className="px-4 py-3 font-bold text-[#20211c]">{r.business_name}</td>
                      <td className="px-4 py-3">
                        <div className="text-[#20211c]">{r.contact_name ?? '—'}</div>
                        {r.email && (
                          <div className="mt-0.5 font-mono text-[11px] text-[#9a9d92]">{r.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#62655c]">{r.client?.business_name ?? '—'}</td>
                      <td className="px-4 py-3 text-[#62655c]">{r.category ?? '—'}</td>
                      <td className="px-4 py-3 text-[#62655c]">{r.location ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          style={{
                            background: pill.bg,
                            color: pill.text,
                            border: pill.border ?? 'none',
                          }}
                          className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]"
                        >
                          {r.pipeline_status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-3">
            {paged.map((r) => {
              const pill = STATUS_PILL[r.pipeline_status] ?? STATUS_PILL.new;
              return (
                <div key={r.id} className="rounded-xl border border-[#ece8df] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-bold text-[#20211c]">{r.business_name}</div>
                    <span
                      style={{
                        background: pill.bg,
                        color: pill.text,
                        border: pill.border ?? 'none',
                      }}
                      className="shrink-0 inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]"
                    >
                      {r.pipeline_status.replace('_', ' ')}
                    </span>
                  </div>
                  {(r.contact_name || r.email) && (
                    <div className="mt-1.5">
                      {r.contact_name && (
                        <div className="text-[12px] text-[#20211c]">{r.contact_name}</div>
                      )}
                      {r.email && (
                        <div className="font-mono text-[11px] text-[#9a9d92]">{r.email}</div>
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#62655c]">
                    {r.client?.business_name && (
                      <span>{r.client.business_name}</span>
                    )}
                    {r.category && (
                      <>
                        <span className="text-[#c4bfb5]">·</span>
                        <span>{r.category}</span>
                      </>
                    )}
                    {r.location && (
                      <>
                        <span className="text-[#c4bfb5]">·</span>
                        <span>{r.location}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Shared pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border border-[#ece8df] bg-white px-4 py-3 text-[12.5px] text-[#9a9d92]">
              <span>Page {safePage} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage <= 1}
                  className={pagBtnCls}
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage >= totalPages}
                  className={pagBtnCls}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
