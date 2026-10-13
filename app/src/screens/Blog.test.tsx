import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Blog } from './Blog';
import { BlogPost } from './BlogPost';
import { queryClient } from '../lib/queryClient';
import { supabase } from '../lib/supabase';

vi.mock('../components/PublicNav', () => ({ PublicNav: () => null }));
vi.mock('../components/PublicFooter', () => ({ PublicFooter: () => null }));
vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }));

type Row = Record<string, unknown>;
type Call = [string, ...unknown[]];

// In-memory stand-in for the PostgREST builder: filters, ordering and ranges
// are actually applied to the fixture rows, so a missing filter in the code
// under test really does let an unpublished row through (no RLS here).
function fakeTable(rows: Row[], calls: Call[]) {
  return () => {
    const filters: ((r: Row) => boolean)[] = [];
    let order: { col: string; asc: boolean } | null = null;
    let range: [number, number] | null = null;
    let wantCount = false;

    const run = () => {
      let out = rows.filter((r) => filters.every((f) => f(r)));
      const count = out.length;
      if (order) {
        const { col, asc } = order;
        out = [...out].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (asc ? 1 : -1));
      }
      if (range) out = out.slice(range[0], range[1] + 1);
      return { data: out, error: null, count: wantCount ? count : null };
    };

    const b = {
      select(cols: string, opts?: { count?: string }) {
        calls.push(['select', cols, opts]);
        wantCount = opts?.count === 'exact';
        return b;
      },
      eq(col: string, val: unknown) {
        calls.push(['eq', col, val]);
        filters.push((r) => r[col] === val);
        return b;
      },
      lte(col: string, val: string) {
        calls.push(['lte', col, val]);
        filters.push((r) => r[col] != null && String(r[col]) <= val);
        return b;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]));
        return b;
      },
      order(col: string, opts: { ascending: boolean }) {
        calls.push(['order', col, opts]);
        order = { col, asc: opts.ascending };
        return b;
      },
      range(from: number, to: number) {
        calls.push(['range', from, to]);
        range = [from, to];
        return b;
      },
      maybeSingle: () => Promise.resolve({ ...run(), data: run().data[0] ?? null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
}

const STORAGE = 'https://proj.supabase.co/storage/v1/object/public/blog-covers';
const past = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const future = new Date(Date.now() + 7 * 86_400_000).toISOString();

function post(n: number, extra: Row = {}): Row {
  return {
    id: `p${n}`,
    title: `Live post ${n}`,
    slug: `live-${n}`,
    category: 'small_business',
    excerpt: null,
    cover_image_url: `${STORAGE}/cover-${n}.png`,
    status: 'published',
    published_at: past(n),
    body_md: 'body',
    target_keywords: [],
    ...extra,
  };
}

const UNPUBLISHED: Row[] = [
  post(101, { title: 'Draft post', slug: 'draft', status: 'draft', published_at: null }),
  post(102, { title: 'Scheduled post', slug: 'scheduled', status: 'scheduled', published_at: null }),
  post(103, { title: 'Pending post', slug: 'pending', status: 'pending_approval', published_at: null }),
  // status says published but the date hasn't arrived yet
  post(104, { title: 'Future post', slug: 'future', status: 'published', published_at: future }),
];

let calls: Call[];
function useRows(rows: Row[]) {
  calls = [];
  const table = fakeTable(rows, calls);
  (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => table());
}

function renderAt(url: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const cards = () => screen.findAllByTestId('blog-card');

describe('public blog listing', () => {
  beforeEach(() => {
    queryClient.clear();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });

  it('never renders an unpublished, scheduled or future-dated post as a card', async () => {
    useRows([post(1), post(2), ...UNPUBLISHED]);
    renderAt('/blog');

    const rendered = await cards();
    expect(rendered.map((c) => within(c).getByText(/post/i).textContent)).toEqual(['Live post 1', 'Live post 2']);
    for (const title of ['Draft post', 'Scheduled post', 'Pending post', 'Future post']) {
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    }
  });

  it('queries only card columns, live posts, newest first, 9 per page with an exact count', async () => {
    useRows([post(1)]);
    renderAt('/blog');
    await cards();

    const select = calls.find((c) => c[0] === 'select' && (c[2] as { count?: string })?.count);
    expect(select).toEqual(['select', 'id, title, slug, excerpt, cover_image_url, category, published_at', { count: 'exact' }]);
    expect(String(select?.[1])).not.toContain('body_md');
    expect(calls).toContainEqual(['eq', 'status', 'published']);
    expect(calls.some((c) => c[0] === 'lte' && c[1] === 'published_at')).toBe(true);
    expect(calls).toContainEqual(['order', 'published_at', { ascending: false }]);
    expect(calls).toContainEqual(['range', 0, 8]);
  });

  it('reads the page from ?page= and paginates with Previous/Next and page numbers', async () => {
    useRows(Array.from({ length: 20 }, (_, i) => post(i + 1)));
    renderAt('/blog?page=2');

    const rendered = await cards();
    expect(calls).toContainEqual(['range', 9, 17]);
    expect(rendered).toHaveLength(9);
    expect(within(rendered[0]).getByText('Live post 10')).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Blog pages' });
    expect(within(nav).getByText('2')).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: /Previous/ })).toHaveAttribute('href', '/blog');
    expect(within(nav).getByRole('link', { name: /Next/ })).toHaveAttribute('href', '/blog?page=3');
    expect(within(nav).getByRole('link', { name: 'Page 3' })).toBeInTheDocument();
  });

  it('keeps the category filter in the URL alongside the page', async () => {
    useRows([
      ...Array.from({ length: 12 }, (_, i) => post(i + 1, { category: 'general' })),
      post(50, { category: 'family_business' }),
    ]);
    renderAt('/blog?category=general');

    await cards();
    expect(calls).toContainEqual(['eq', 'category', 'general']);
    const nav = screen.getByRole('navigation', { name: 'Blog pages' });
    expect(within(nav).getByRole('link', { name: /Next/ })).toHaveAttribute('href', '/blog?category=general&page=2');
  });

  it('loads the first row eagerly and the rest lazily, via resized Storage images', async () => {
    useRows(Array.from({ length: 5 }, (_, i) => post(i + 1)));
    renderAt('/blog');

    const imgs = (await cards()).map((c) => c.querySelector('img')!);
    expect(imgs[0]).toHaveAttribute('loading', 'eager');
    expect(imgs[0]).toHaveAttribute('fetchpriority', 'high');
    expect(imgs[1]).toHaveAttribute('loading', 'eager');
    expect(imgs[1]).not.toHaveAttribute('fetchpriority');
    expect(imgs[2]).toHaveAttribute('loading', 'eager');
    expect(imgs[3]).toHaveAttribute('loading', 'lazy');
    for (const img of imgs) {
      expect(img).toHaveAttribute('decoding', 'async');
      expect(img).toHaveAttribute('width', '640');
      expect(img).toHaveAttribute('height', '320');
    }
    expect(imgs[0].getAttribute('src')).toBe(
      'https://proj.supabase.co/storage/v1/render/image/public/blog-covers/cover-1.png?width=640&quality=70&format=webp',
    );
    const srcset = imgs[0].getAttribute('srcset')!;
    expect(srcset).toContain('width=400');
    expect(srcset).toMatch(/ 400w, .* 640w, .* 960w$/);
  });

  it('shows skeleton cards while the list loads', () => {
    (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const pending = new Promise(() => {});
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'lte', 'order', 'range']) b[m] = () => b;
      b.then = (res: (v: unknown) => unknown) => pending.then(res);
      return b;
    });
    renderAt('/blog');
    expect(screen.getAllByTestId('blog-card-skeleton')).toHaveLength(9);
  });
});

describe('public blog post page', () => {
  beforeEach(() => queryClient.clear());

  it('uses the same live filter, so a scheduled or future post is "not found"', async () => {
    useRows([post(1), ...UNPUBLISHED]);
    renderAt('/blog/future');

    expect(await screen.findByText('Post not found')).toBeInTheDocument();
    expect(calls).toContainEqual(['eq', 'status', 'published']);
    expect(calls.some((c) => c[0] === 'lte' && c[1] === 'published_at')).toBe(true);
  });

  it('"All posts" returns to the list page the reader came from', async () => {
    useRows([post(1)]);
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[{ pathname: '/blog/live-1', state: { listSearch: '?page=2' } }]}>
          <Routes>
            <Route path="/blog/:slug" element={<BlogPost />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('link', { name: /All posts/ })).toHaveAttribute('href', '/blog?page=2');
  });

  it('"All posts" falls back to /blog when opened directly', async () => {
    useRows([post(1)]);
    renderAt('/blog/live-1');

    expect(await screen.findByRole('link', { name: /All posts/ })).toHaveAttribute('href', '/blog');
  });
});
