-- representative_name is the name that signs a client's outgoing emails. WF2 and
-- WF5 pass it to Gemini, and when it is blank they instruct the model to sign
-- with the business name alone, because inventing a sender name is worse than
-- omitting one. That guard is correct, but nothing ever populated the field, so
-- a client onboarded without it silently loses the human name from every email
-- it sends and no error is raised anywhere.
--
-- contact_name is not always the same person as the signer (Coffeehouse's
-- contact is Yvonne while emails sign as Eugene), so this is a last-resort
-- default only: it fills the field when it is blank and never overwrites a
-- value that is already set. First name only, since that is what goes in a
-- sign-off.
create or replace function public.default_representative_name()
returns trigger
language plpgsql
as $$
begin
  if coalesce(trim(new.representative_name), '') = ''
     and coalesce(trim(new.contact_name), '') <> '' then
    new.representative_name := split_part(trim(new.contact_name), ' ', 1);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_default_representative_name on public.clients;
create trigger trg_default_representative_name
  before insert or update of representative_name, contact_name on public.clients
  for each row execute function public.default_representative_name();