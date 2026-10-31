alter table replies drop constraint replies_intent_check;
alter table replies add constraint replies_intent_check
  check (intent = ANY (ARRAY['interested'::text, 'maybe'::text, 'not_interested'::text, 'stop'::text, 'wrong_person'::text, 'out_of_office'::text, 'automated'::text]));