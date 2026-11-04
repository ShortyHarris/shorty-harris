# Incident, 4 November 2026: missed replies and bounces

## What was reported

A follow-up email to a Czech prospect showed a mangled subject line
(`NovÃƒÂ¡ kolonie 2604/8`) in the Gmail thread.

## What it actually was

Two unrelated problems. The reported one was already fixed; the one found
underneath it was live and costing sends.

### 1. Subject encoding: already fixed, nothing to do

The database was clean: zero mangled subjects across 4,942 messages. The
encoder in `gmail-client` produces correct RFC 2047 and was verified to
round-trip the exact subject.

The fix was deployed 24 October. The email in question was sent 22 October,
two days before, and Gmail names a thread after its **first** message, so that
thread will display the broken subject forever.

- 78 emails sent before 24 Oct have permanently mangled subjects. Not fixable.
- 103 sent since are correct.

### 2. Reply ingestion was silently dropping messages

The real problem, found while checking the first.

WF4 polls Gmail every 2 minutes asking only for `after: now - 10 minutes`, and
never looks back. A failed poll, or a message Gmail indexes late, falls into a
permanent blind spot. Nothing re-reads it.

Compounding it, the reply query used to be `in:inbox category:primary`, which
returns nothing for Google Workspace accounts that do not use inbox tabs. For
TUTEL that meant:

| | Before 24 Oct | After |
| :---- | :---- | :---- |
| Emails sent | 81 | 103 |
| Replies recorded | **0** | 13 |

The query was fixed on 24 October, but because the poll only looks forward, the
missed window was never re-scanned. A hard bounce on 22 October went unseen for
13 days while follow-ups kept going to the dead address.

## What was done

1. Scanned every Gmail thread TUTEL had sent on before 24 Oct, read-only, and
   reviewed the results before writing anything.
2. **No commercial loss**: every genuine human reply had been captured. Only
   bounces were missed.
3. Recorded 8 hard bounces that had been missed across two clients, stopped
   those prospects and suppressed the addresses.
4. Built `gmail-reply-sweep`, which re-walks recent threads every 2 hours and
   catches what WF4 drops.
5. Added `log_reply_health()`, which flags any client sending 30+ emails in 14
   days with zero replies: the exact shape of this incident.
6. **Fixed the root cause in WF4.** `client_email_credentials.last_reply_poll_at`
   records when each mailbox was last successfully polled. "Fetch Client
   Replies" now derives `after_epoch` from it, clamped to always overlap the
   last 10 minutes and never to reach back more than 24 hours (the Gmail read
   is capped at 50 messages per call, so an unbounded window would silently
   truncate). A new "Mark Client Polled" node stamps it on both the "no new
   replies" and "replies done" paths, with `onError: continueRegularOutput` so
   a failure there can never stall ingestion. Verified live: all six mailboxes
   now advance every poll.

### One mistake made and corrected

The first version of the sweep treated every bounce as permanent, and
suppressed two prospects on **temporary** failures (451 4.4.4, and a Gmail
"will retry for 46 more hours"). Both were reverted to `contacted` and removed
from do-not-contact within minutes. The classifier now separates hard from soft
and, when unsure, treats a bounce as soft and takes no action. It was verified
against all six real bounce bodies before being scheduled.

## Still open

1. **`filler@godaddy.com`** is shared by three prospects, so suppressing it
   stopped all three, including one that had already replied. Correct behaviour
   for a dead address, but worth a look.
2. **Two Gmail threads** would not load even after retries, most likely deleted
   from the mailbox.

The sweep stays even though WF4 is fixed: it is the only thing that would catch
the next ingestion bug, and it costs one Gmail call per recent thread every two
hours.

## Files

- `supabase/functions/gmail-client/index.ts` — transcript of deployed v12.
  Until today this existed only in Supabase. **Diff against the live function
  before any redeploy**: `supabase functions download gmail-client`.
- `supabase/functions/gmail-reply-sweep/index.ts` — the catch-up sweep.
- `supabase/migrations/20261104120000_backfill_scan_results_table.sql`
- `supabase/migrations/20261104130000_reply_health_monitor.sql`
- `supabase/migrations/20261104140000_reply_sweep_schedule.sql`
- `supabase/migrations/20261104150000_client_email_last_reply_poll_at.sql`
- `n8n/WF4-intent-classification.json` — exported definition of WF4 at active
  version `bd30c92d`, so the next change to it is diffable. There was no
  baseline for any workflow before today.
