# Migrations

These files record changes applied directly to the live database via the Supabase MCP or the dashboard. The live database is the source of truth, not this folder.

Each file here is the exact SQL recorded in `supabase_migrations.schema_migrations`, under the same version and name, checked by md5 against the database (last reconciled 2026-11-05, up to `20261105054849`). Exceptions:

- `20260731143716_create_test_client_auth_user_v2` is left out on purpose: its SQL contains a plaintext password for a demo login. It created a demo account, nothing else depends on it.
- `20261102132000_messages_reject_reason` and `20261102150000_sign_off_first_name` were run in the dashboard SQL editor, so they are **not** recorded in `schema_migrations`. Their changes are live (checked 2026-11-05) and included in the baseline.

**Do NOT run `supabase db push` against this project.** Do not run any `supabase migration` command that applies these files either. The history is a record of what was done, and re-applying it would try to recreate objects that already exist, including old versions of functions that have since been replaced, for example `approved_queue`.

This history records migrations only. Any change made by hand in the dashboard SQL editor is not captured here.

To change the database: apply the migration, then add its file here using the exact version and SQL from `supabase_migrations.schema_migrations` (the version the database records, not one picked by hand).

## Building a fresh database

The history starts on 2026-06-30, after the core tables were created, so it cannot build a database from nothing. `supabase/baseline/` holds a snapshot of the whole live schema; a fresh database is the baseline plus every migration here that is newer than it. See `supabase/baseline/README.md` and `scripts/db/build-test-db.sh`.
