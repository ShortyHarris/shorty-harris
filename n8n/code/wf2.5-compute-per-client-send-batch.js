const DEFAULT_DAILY_CAP = 40;
const FULL_DAILY_CAP = 40;
const PER_RUN_CAP_PER_CLIENT = 10;
const DEFAULT_TZ = 'America/Chicago';

const approvedUnsent = $('Get All Approved Unsent').all().map(i => i.json);
const sentRecent = $('Get Sent Today').all().map(i => i.json);
const clients = $('Get Client Timezones').all().map(i => i.json);

// client_send_limits view: id, send_timezone, daily_cap (warm-up ramp, 0 when paused), warmup_mode,
// is_sandbox, clock_offset_minutes (sandbox clock; always 0 for real clients), sandbox_fast.
const tzByClient = {};
const capByClient = {};
const modeByClient = {};
const offsetMsByClient = {};
const fastClient = {};
for (const c of clients) {
  if (!c.id) continue;
  tzByClient[c.id] = c.send_timezone || DEFAULT_TZ;
  capByClient[c.id] = (c.daily_cap === null || c.daily_cap === undefined) ? DEFAULT_DAILY_CAP : Number(c.daily_cap);
  modeByClient[c.id] = c.warmup_mode || 'warm';
  // Only sandbox clients can have a clock offset or fast mode; real clients get 0 / false.
  offsetMsByClient[c.id] = c.is_sandbox === true ? (Number(c.clock_offset_minutes) || 0) * 60000 : 0;
  fastClient[c.id] = c.is_sandbox === true && c.sandbox_fast === true;
}

function localParts(date, tz) {
  let f;
  try {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, weekday: 'short', hour: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch (e) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TZ, weekday: 'short', hour: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  const p = {};
  for (const x of f.formatToParts(date)) p[x.type] = x.value;
  let hour = parseInt(p.hour, 10);
  if (hour === 24) hour = 0;
  return { wd: p.weekday, hour, day: p.year + '-' + p.month + '-' + p.day };
}

const now = new Date();
// The client's own "now" for time-of-day and calendar-day checks. A sandbox's clock can
// be moved forward (its data is shifted back by the same amount, so elapsed-time checks
// use the real now). For real clients the offset is 0, so this is simply now.
const clientNow = (cid) => new Date(now.getTime() + (offsetMsByClient[cid] || 0));

// The coarse UTC gate before this node lets every run through so that sandbox
// clients can send at any hour. Real clients are still held to their own window
// below, so outside the old coarse range they simply produce nothing.
const sentCountByClient = {};
const lastSentByClient = {};
for (const m of sentRecent) {
  const cid = m.client_id;
  if (!cid || !m.sent_at) continue;
  const t = new Date(m.sent_at).getTime();
  if (!lastSentByClient[cid] || t > lastSentByClient[cid]) lastSentByClient[cid] = t;
  const tz = tzByClient[cid] || DEFAULT_TZ;
  const off = offsetMsByClient[cid] || 0;
  if (localParts(new Date(t + off), tz).day !== localParts(clientNow(cid), tz).day) continue;
  sentCountByClient[cid] = (sentCountByClient[cid] || 0) + 1;
}

const byClient = {};
for (const m of approvedUnsent) {
  const cid = m.client_id;
  if (!cid || !m.id) continue;
  if (!byClient[cid]) byClient[cid] = [];
  byClient[cid].push(m);
}
// Send order: due follow-ups first, then first emails, each oldest first.
// Follow-ups are time-boxed (3/5/7 business days after the previous email) and
// are created after the first emails, so plain oldest-first left them waiting
// behind the whole first-email backlog.
const isFollowUp = (m) => String(m.message_type || '').startsWith('follow_up');
for (const cid in byClient) {
  byClient[cid].sort((a, b) => {
    const fa = isFollowUp(a) ? 0 : 1;
    const fb = isFollowUp(b) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

const result = [];
for (const cid in byClient) {
  // Send window (Mon-Fri 9-17 in the client's time zone) applies to every client,
  // except a sandbox in fast testing mode. A sandbox with real sending rules uses its
  // sandbox clock, so testers can move to 18:00 or to 9am tomorrow. Sandbox clients only
  // ever mail their own connected mailbox (enforced in the database).
  const tz = tzByClient[cid] || DEFAULT_TZ;
  const lp = localParts(clientNow(cid), tz);
  const isWeekday = ['Mon','Tue','Wed','Thu','Fri'].includes(lp.wd);
  if (!fastClient[cid] && !(isWeekday && lp.hour >= 9 && lp.hour < 17)) continue;
  const cap = (cid in capByClient) ? capByClient[cid] : DEFAULT_DAILY_CAP;
  const already = sentCountByClient[cid] || 0;
  const remaining = Math.max(0, cap - already);
  if (remaining === 0) continue;
  let perRun = PER_RUN_CAP_PER_CLIENT;
  if (modeByClient[cid] === 'ramp' && cap < FULL_DAILY_CAP) {
    // Warm-up: spread the day's emails across the 8 hour window, one at a time with a random gap.
    const gapMin = (480 / Math.max(cap, 1)) * 0.6 * (0.75 + Math.random() * 0.5);
    const last = lastSentByClient[cid] || 0;
    if ((now.getTime() - last) < gapMin * 60000) continue;
    perRun = 1;
  }
  const take = Math.min(remaining, perRun, byClient[cid].length);
  for (let i = 0; i < take; i++) {
    result.push({ json: { id: byClient[cid][i].id, _empty: false } });
  }
}

if (result.length === 0) {
  return [{ json: { _empty: true } }];
}

return result;
