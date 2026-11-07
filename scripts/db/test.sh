#!/usr/bin/env bash
# Runs the database tests (supabase/tests/database/*.test.sql, pgTAP) against a fresh local
# database built from the repo. Needs Docker, psql and pg_prove
# (Ubuntu: apt install postgresql-client libtap-parser-sourcehandler-pgtap-perl).
#
#   scripts/db/test.sh                    # start the stack, build, run every test file
#   scripts/db/test.sh 10_overdue         # only files whose name contains "10_overdue"
#   TAP_LOG=out.tap scripts/db/test.sh    # also keep the detailed results (read by scripts/ci/report.mjs)
#   KEEP=1 scripts/db/test.sh             # reuse a running stack (the database is still reset)
set -euo pipefail
cd "$(dirname "$0")/../.."

SUPABASE="${SUPABASE:-npx --yes supabase@3.0.0}"
STACK=scripts/db/stack

if [ "${KEEP:-}" = "1" ] && $SUPABASE status --workdir "$STACK" >/dev/null 2>&1; then
  $SUPABASE db reset --workdir "$STACK" >/dev/null
else
  # Only what the schema needs: Postgres, plus auth and storage (they create the auth and
  # storage schemas the app's triggers and policies refer to) and realtime (its publication).
  $SUPABASE start --workdir "$STACK" \
    -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta,postgrest,kong
fi

DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres scripts/db/build-test-db.sh

files=(supabase/tests/database/*${1:-}*.test.sql)
args=(-d postgres -h 127.0.0.1 -p 54322 -U supabase_admin --ext .sql)
if [ -n "${TAP_LOG:-}" ]; then
  mkdir -p "$(dirname "$TAP_LOG")"
  PGPASSWORD=postgres pg_prove --verbose "${args[@]}" "${files[@]}" 2>&1 | tee "$TAP_LOG"
  exit "${PIPESTATUS[0]}"
fi
PGPASSWORD=postgres pg_prove "${args[@]}" "${files[@]}"
