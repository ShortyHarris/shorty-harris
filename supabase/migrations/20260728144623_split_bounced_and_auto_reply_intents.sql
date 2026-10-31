alter table replies drop constraint replies_intent_check;
alter table replies add constraint replies_intent_check
  check (intent = any (array['interested','maybe','not_interested','stop','wrong_person','out_of_office','automated','bounced','auto_reply']));