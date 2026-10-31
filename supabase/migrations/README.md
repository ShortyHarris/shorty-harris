# Migrations

These files record changes applied directly to the live database via the Supabase MCP or the dashboard. The live database is the source of truth, not this folder.

As of this commit the history is complete: each file here is the exact SQL recorded in `supabase_migrations.schema_migrations`, under the same version and name, checked by md5 against the database. The one exception is `20260731143716_create_test_client_auth_user_v2`, which is left out on purpose because its SQL contains a plaintext password for a demo login. It is a record of a demo account being created, nothing else depends on it.

**Do NOT run `supabase db push` against this project.** Do not run any `supabase migration` command that applies these files either. The history is a record of what was done, and re-applying it would try to recreate objects that already exist, including old versions of functions that have since been replaced, for example `approved_queue`.

This history records migrations only. Any change made by hand in the dashboard SQL editor is not captured here.

To change the database: apply the migration, then add its file here using the exact version and SQL from `supabase_migrations.schema_migrations`.
