alter table public.messages
  add column if not exists angle text,
  add column if not exists observation text,
  add column if not exists observation_source_url text;

comment on column public.messages.angle is 'Which researched angle this email used: SOCIAL, GEO or REDDIT. Null means the generic fallback was used.';
comment on column public.messages.observation is 'The verified observation about the prospect that this email opens with. Shown next to the draft on the Approvals page so the client can check it.';
comment on column public.messages.observation_source_url is 'Link backing up the observation.'