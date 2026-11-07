# Database tests

pgTAP tests of the rules that live in the database: the send gate, follow-up dates and holidays,
approvals, rejections, unsubscribe handling, permissions per role, and the overdue-approval
scenarios OA-1 to OA-10 (`docs/REGRESSION-TESTING-PLAN.md` section 6).

```bash
scripts/db/test.sh               # all files (Docker, psql and pg_prove needed)
scripts/db/test.sh 10_overdue    # one file
```

- `database/*.test.sql`: one file per area. Each runs in a transaction that is rolled back.
- `helpers/test_helpers.sql`: shared fixtures (`tests.client()`, `tests.prospect()`,
  `tests.message()`, `tests.sent()`, ...), acting as a role, and business-day time travel.
  Installed into the test database only.
- To act as a signed-in client: `select tests.claims_client(:'user_id'); set local session
  authorization authenticated;` then `reset session authorization;`. Switching the session user
  matters: the database trusts any session logged in as `postgres` as the backend.
- Known issues are written as `todo` tests: reported, not blocking. Remove the `todo` with the fix.
- `approved_queue_auth.ps1` is an older manual check against the live API, not part of this suite.
