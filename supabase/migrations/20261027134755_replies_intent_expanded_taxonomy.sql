alter table public.replies drop constraint if exists replies_intent_check;
alter table public.replies add constraint replies_intent_check check (intent = any (array[
  'interested',
  'question',
  'resend_request',
  'referred',
  'maybe',
  'not_interested',
  'stop',
  'wrong_person',
  'out_of_office',
  'automated',
  'auto_reply',
  'bounced',
  'uncertain'
]));

comment on column public.replies.intent is 'Only "interested" creates a hot lead and deducts a client credit. It requires explicit interest in what the client sells: a call, pricing, a quote, or starting work. Anything weaker is question, maybe, resend_request, referred or uncertain.'