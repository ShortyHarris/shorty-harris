create policy client_own_dnc on do_not_contact
  for select
  using (exists (
    select 1 from prospects p
    where p.id = do_not_contact.source_prospect_id
      and p.client_id = current_client_id()
  ));