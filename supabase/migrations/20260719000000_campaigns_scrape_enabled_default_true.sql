-- Client-created campaigns were ending up with scrape_enabled = false because
-- createClientCampaign() never set the column, so it fell back to the DB
-- default. That default was false, which silently blocked Apify scraping for
-- every campaign a client created themselves. The frontend now sets
-- scrape_enabled: true explicitly on insert; this flips the column default
-- too, so any other future write path that omits the field fails safe.
--
-- Already applied directly to the live project (lxoeotyibsalbxgbjfxo) —
-- this migration exists to keep that change tracked in the repo.

alter table public.campaigns
  alter column scrape_enabled set default true;
