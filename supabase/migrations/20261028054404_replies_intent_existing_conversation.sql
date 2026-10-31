alter table public.replies drop constraint if exists replies_intent_check;
alter table public.replies add constraint replies_intent_check check (intent = any (array[
  'interested','question','resend_request','referred','maybe','not_interested','stop','wrong_person',
  'out_of_office','automated','auto_reply','bounced','uncertain','existing_conversation'
]));
comment on column public.replies.intent is 'Only "interested" creates a hot lead and charges a credit. It needs a strong match to our outreach (thread or exact address) and explicit buying interest in what the client sells. existing_conversation means the reply belongs to correspondence outside our outreach.'