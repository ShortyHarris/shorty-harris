
-- Topic bank / content calendar, per client
create table blog_topics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  topic text not null,
  angle text,
  category text not null check (category in ('family_business','small_business','business_development_rural','general')),
  target_keyword text,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_blog_topics_client_unused on blog_topics(client_id, used);

-- Blog posts
create table blog_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  slug text not null,
  category text not null check (category in ('family_business','small_business','business_development_rural','general')),
  body_md text not null,
  excerpt text,
  cover_image_url text,
  seo_title text,
  meta_description text,
  target_keywords text[] default '{}',
  status text not null default 'pending_approval' check (status in ('draft','pending_approval','approved','published','rejected')),
  author text default 'Shorty Harris Team',
  rejection_reason text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  published_at timestamptz,
  unique(client_id, slug)
);

create index idx_blog_posts_client_status on blog_posts(client_id, status);
create index idx_blog_posts_client_published on blog_posts(client_id, published_at desc) where status = 'published';

-- Internal link graph: which post links to which
create table blog_link_graph (
  id uuid primary key default gen_random_uuid(),
  source_post_id uuid not null references blog_posts(id) on delete cascade,
  target_post_id uuid not null references blog_posts(id) on delete cascade,
  anchor_text text,
  created_at timestamptz not null default now(),
  unique(source_post_id, target_post_id)
);

create index idx_link_graph_target on blog_link_graph(target_post_id);

-- RLS
alter table blog_topics enable row level security;
alter table blog_posts enable row level security;
alter table blog_link_graph enable row level security;

-- Public can read only published posts
create policy "public read published posts" on blog_posts
  for select using (status = 'published');

-- Authenticated (dashboard/service role) full access handled via service key, no public write policies needed
