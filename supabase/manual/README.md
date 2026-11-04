# Manually applied SQL

SQL run by hand in the Supabase dashboard SQL editor. These changes are live, but
they are **not** in `supabase_migrations.schema_migrations`, so they cannot sit in
`../migrations/`, where every file matches a recorded version.

Files are named `YYYYMMDD_NN_name.sql` (date applied, order run). Do not re-run them:
the function and trigger files are safe to repeat, but the data updates are one-off.

| File | Applied | What it changed |
|---|---|---|
| 20261104_01_suppress_prospects_on_do_not_contact.sql | 2026-11-04 | Adding an address to do_not_contact stops follow-ups and clears unsent drafts on every prospect with that email; new prospects with a listed address start suppressed |
| 20261104_02_backfill_suppress_existing_do_not_contact.sql | 2026-11-04 | Applied the above to the 25 addresses already listed: 30 prospects flagged, 1 unsent follow-up rejected |
| 20261104_03_reset_automated_reply_only_prospects.sql | 2026-11-04 | 15 prospects marked 'replied' only because of an automatic reply (Jul–Aug) set to 'contacted' with follow-ups stopped |
| 20261104_04_weekly_client_summary_view.sql | 2026-11-04 | Read-only view `weekly_client_summary` (service role only), read by n8n WF28 - Weekly Client Summary |
