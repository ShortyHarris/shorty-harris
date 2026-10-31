# Migrations

These files record changes applied directly to the live database via the Supabase MCP or the dashboard. The live database is the source of truth, not this folder.

The history here is partial. The remote has about 147 migrations and this folder holds a subset, with some version mismatches that predate 2026-10-30.

**Do NOT run `supabase db push` against this project.** It would try to apply files that do not match the remote history, including old versions of functions that have since been replaced, for example `approved_queue`.

To change the database: apply the migration, then add its file here using the exact version and SQL from `supabase_migrations.schema_migrations`.
