# Database baseline

The migration history in `supabase/migrations` starts on 2026-06-30, after the core tables were
created by hand, so it cannot build a database from nothing. This folder can:

| File | What it is |
| --- | --- |
| `schema.sql` | Everything the app owns in the live database, as of the migration version in its first line: extensions, tables, functions, views, defaults, constraints, indexes, triggers (including those on `auth.users`), row level security and policies (including storage), privileges exactly as live, comments, the realtime publication and storage buckets. Generated; do not edit by hand. |
| `reference_data.sql` | Data the rules read: the holiday calendar and the single-row settings tables (agency contact details replaced with placeholders). No customer data. |

**Not included, on purpose:** customer data, cron jobs (they call production webhooks) and vault
secrets. Changes applied by hand in the SQL editor are included, since the baseline is read from
the database itself (see `supabase/migrations/README.md`).

**A fresh database** = Supabase's own setup + `schema.sql` + `reference_data.sql` + every file in
`supabase/migrations` newer than the baseline version. `scripts/db/build-test-db.sh` does this;
`scripts/db/test.sh` starts a local Supabase stack (Docker), builds the database and runs the
pgTAP tests in `supabase/tests/database`. It refuses hosted Supabase URLs. **Never apply
`schema.sql` to the live project.**

Checked 2026-11-05: rebuilt from these files, the database's schema dump is byte-for-byte the same
as the live one.

## Refreshing it

Refresh when the migrations newer than the baseline get long, or after changes were made by hand
in the dashboard (which migrations do not capture):

```bash
SUPABASE_ACCESS_TOKEN=... node scripts/db/build-baseline.mjs
```

This runs `scripts/db/baseline-objects.sql` (read-only) through the Supabase Management API and
rewrites `schema.sql`, with the newest live migration version in its header. Commit it in its own
pull request; the database tests then run on it. Update `reference_data.sql` by hand when the
holiday calendar changes.
