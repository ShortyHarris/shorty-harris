#!/usr/bin/env bash
# Builds a test database from the repo: the baseline schema, its reference data, every
# migration newer than the baseline, then the pgTAP test helpers.
#
#   scripts/db/build-test-db.sh            # local Supabase stack started by scripts/db/test.sh
#   DB_URL=postgresql://... scripts/db/build-test-db.sh
#
# Never point this at the live project: the baseline recreates objects that exist there.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *supabase.co*|*supabase.com*) echo "Refusing to build a test database on a hosted Supabase project: $DB_URL" >&2; exit 1 ;;
esac

run() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -X "$@"; }

baseline_version=$(sed -n 's/^-- .*as of migration \([0-9]\{14\}\)\..*/\1/p' supabase/baseline/schema.sql | head -1)
[ -n "$baseline_version" ] || { echo "No baseline version found in supabase/baseline/schema.sql" >&2; exit 1; }

echo "Baseline schema (as of $baseline_version)"
run -f supabase/baseline/schema.sql
echo "Reference data"
run -f supabase/baseline/reference_data.sql

applied=0
for f in supabase/migrations/*.sql; do
  v=$(basename "$f" | cut -c1-14)
  if [[ "$v" > "$baseline_version" ]]; then
    echo "Migration $(basename "$f")"
    run --single-transaction -f "$f"
    applied=$((applied + 1))
  fi
done
echo "$applied migration(s) newer than the baseline applied"

echo "Test helpers"
run -f supabase/tests/helpers/test_helpers.sql
