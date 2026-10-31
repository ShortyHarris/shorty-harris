-- Reverting an earlier change of mine. An empty representative_name is
-- intended behaviour: WF2 and WF5 fall back to signing with the business name,
-- which is the correct result when no individual signs for that client.
-- Auto-filling it from contact_name overrode a deliberate choice, and
-- contact_name is not reliably the signer anyway (Coffeehouse's contact is
-- Yvonne while its emails sign as Eugene), so the guess could put the wrong
-- person's name on outgoing mail.
drop trigger if exists trg_default_representative_name on public.clients;
drop function if exists public.default_representative_name();