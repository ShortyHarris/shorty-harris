import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Safety net for WF4's reply poll.
//
// WF4 asks Gmail only for "after: now - 10 minutes", every 2 minutes, and never
// looks back. A failed poll, or a message Gmail indexes late, falls into a
// permanent blind spot: nothing ever re-reads it. That is how a hard bounce on
// 22 Oct went unseen for 13 days while follow-ups kept going to a dead address.
//
// This sweep walks the Gmail threads we have sent on recently and compares them
// against the replies table. What it does with what WF4 missed depends on what
// it is:
//   HARD bounce (5xx, no such user)  -> recorded, prospect stopped and suppressed.
//   SOFT bounce (4xx, will retry)    -> logged only. Gmail is still trying, and
//                                       suppressing the address would throw away
//                                       a live prospect over a temporary fault.
//   anything else                    -> logged for review, never classified here.
//                                       A human reply may be a hot lead and
//                                       belongs in WF4's Gemini classifier.
//
// Edge functions are killed at 150s, so all database state is loaded once up
// front and a clean thread costs one Gmail call and no queries.
//
// Triggered by pg_cron every 2 hours via pg_net. See
// supabase/migrations/20261104140000_reply_sweep_schedule.sql.

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function decodeBase64Utf8(b64: string): string {
  const raw = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

// Envelope patterns match WF4's Extract Sender, so the two never disagree about
// what counts as a bounce at all.
const BOUNCE_SENDER = /mailer-daemon|postmaster|mail delivery (subsystem|system)|maildeliverysystem|bounce@/;
const BOUNCE_TEXT = /wasn't delivered|was not delivered|delivery status notification|undeliverable|delivery has failed|delivery failed|returned mail|failure notice|message could not be delivered|could not be delivered|address not found|recipient address rejected|no such user|user unknown|mailbox (unavailable|full)|does not exist|couldn't be found|could not be found|message blocked|adresa nebyla nalezena|zpráva nebyla doručena|nepodařilo doručit/;

// Soft wins over hard: a message saying both "temporary" and "failed" is a retry
// in progress, and suppressing the address would discard a live prospect.
const SOFT_BOUNCE = /\b4\.\d\.\d\b|\b4[45]\d[ -]|temporary problem|temporarily|will retry|try again|delivery incomplete|greylist|rate limited|quota exceeded|over quota|too many|service unavailable|došlo k potížím|zkuste/;
const HARD_BOUNCE = /\b5\.\d\.\d\b|\b55\d\b|no such user|user unknown|address not found|couldn't be found|could not be found|mailbox not found|does not exist|address rejected|recipient address rejected|no user here|unrouteable|adresa nebyla nalezena|není k dispozici/;

async function getAccessToken(clientId: string): Promise<{ access_token: string; email: string }> {
  const { data: cred, error } = await supabase
    .from("client_email_credentials").select("*")
    .eq("client_id", clientId).eq("status", "active").single();
  if (error || !cred) throw new Error(`No active Gmail credentials for client ${clientId}`);
  const expiresAt = new Date(cred.token_expires_at).getTime();
  if (cred.access_token && expiresAt > Date.now() + 300_000) {
    return { access_token: cred.access_token, email: cred.email_address };
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: cred.refresh_token, grant_type: "refresh_token",
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.access_token) {
    throw new Error(`Token refresh failed: ${tokens.error_description || tokens.error}`);
  }
  await supabase.from("client_email_credentials").update({
    access_token: tokens.access_token,
    token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("client_id", clientId);
  return { access_token: tokens.access_token, email: cred.email_address };
}

const headerOf = (h: any[], name: string) =>
  h.find((x: any) => String(x.name).toLowerCase() === name.toLowerCase())?.value || "";

function plainBody(payload: any): string {
  if (payload?.body?.data) return decodeBase64Utf8(payload.body.data);
  const parts = payload?.parts || [];
  const tp = parts.find((p: any) => p.mimeType === "text/plain" && p.body?.data);
  if (tp) return decodeBase64Utf8(tp.body.data);
  for (const p of parts) { const n = plainBody(p); if (n) return n; }
  return "";
}

function classify(from: string, body: string): "hard" | "soft" | "other" {
  const f = from.toLowerCase();
  const b = body.toLowerCase();
  const isBounce = BOUNCE_SENDER.test(f) || BOUNCE_TEXT.test(b);
  if (!isBounce) return "other";
  if (SOFT_BOUNCE.test(b)) return "soft";
  if (HARD_BOUNCE.test(b)) return "hard";
  return "soft"; // unsure about a bounce: never suppress on a guess
}

async function fetchThread(token: string, tid: string): Promise<any | null> {
  let wait = 600;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(tid)}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) return await r.json();
    if (r.status !== 403 && r.status !== 429 && r.status < 500) return null;
    await sleep(wait); wait *= 2;
  }
  return null;
}

async function sweepClient(clientId: string, daysBack: number, maxThreads: number, deadline: number) {
  const since = new Date(Date.now() - daysBack * 86_400_000).toISOString();

  const { data: sent } = await supabase
    .from("messages").select("id, prospect_id, gmail_thread_id, sent_at")
    .eq("client_id", clientId).eq("send_status", "sent")
    .gte("sent_at", since).not("gmail_thread_id", "is", null)
    .order("sent_at", { ascending: false });

  const anchors = new Map<string, any>();
  for (const m of sent || []) if (!anchors.has(m.gmail_thread_id)) anchors.set(m.gmail_thread_id, m);
  const threadIds = [...anchors.keys()].slice(0, maxThreads);
  if (!threadIds.length) return { threads: 0, hard: 0, soft: 0, other: 0, failed: 0, stopped_early: false };

  const { data: seen } = await supabase
    .from("replies").select("gmail_message_id").eq("client_id", clientId)
    .gte("received_at", since);
  const known = new Set((seen || []).map((r: any) => r.gmail_message_id));

  const { access_token, email } = await getAccessToken(clientId);
  const own = String(email).toLowerCase();

  let hard = 0, soft = 0, other = 0, failed = 0, stoppedEarly = false;

  for (const tid of threadIds) {
    if (Date.now() > deadline) { stoppedEarly = true; break; }
    const t = await fetchThread(access_token, tid);
    if (!t) { failed++; await sleep(120); continue; }
    const anchor = anchors.get(tid);

    for (const m of t.messages || []) {
      const h = m.payload?.headers || [];
      const from = headerOf(h, "From");
      if (!from || from.toLowerCase().includes(own)) continue;
      if (known.has(m.id)) continue;
      known.add(m.id);

      const body = plainBody(m.payload);
      const kind = classify(from, body);
      const receivedAt = new Date(Number(m.internalDate) || Date.now()).toISOString();

      await supabase.from("backfill_scan_results").upsert({
        client_id: clientId, thread_id: tid, gmail_message_id: m.id,
        from_addr: from.slice(0, 300), subject: headerOf(h, "Subject").slice(0, 500),
        date_header: headerOf(h, "Date").slice(0, 100),
        internal_date: Number(m.internalDate) || null,
        snippet: String(m.snippet || "").slice(0, 500), body: body.slice(0, 4000),
      }, { onConflict: "client_id,gmail_message_id" });

      if (kind === "hard") {
        const { error: insErr } = await supabase.from("replies").insert({
          prospect_id: anchor.prospect_id, message_id: anchor.id, client_id: clientId,
          body: body.slice(0, 2000), received_at: receivedAt, gmail_message_id: m.id,
          intent: "bounced", intent_confidence: 1.0,
          classified_at: new Date().toISOString(), match_method: "thread",
        });
        if (!insErr) {
          // Marking the prospect bounced fires auto_dnc_on_bounce, which adds the
          // address to do_not_contact. Follow-ups and unsent drafts are closed
          // here because that trigger does not reach rows already generated.
          await supabase.from("prospects").update({
            pipeline_status: "bounced", followups_stopped: true,
            updated_at: new Date().toISOString(),
          }).eq("id", anchor.prospect_id);
          await supabase.from("follow_up_schedules").update({
            status: "cancelled", updated_at: new Date().toISOString(),
          }).eq("prospect_id", anchor.prospect_id).in("status", ["pending", "generating", "generated"]);
          await supabase.from("messages").update({
            send_status: "blocked_dnc", updated_at: new Date().toISOString(),
          }).eq("prospect_id", anchor.prospect_id).in("send_status", ["not_sent", "queued", "scheduled"]);
          hard++;
        }
      } else if (kind === "soft") {
        soft++;
        await supabase.from("error_logs").insert({
          source: "gmail_reply_sweep", error_type: "soft_bounce", severity: "info",
          message: `Temporary delivery failure, no action taken. Client ${clientId}, prospect `
            + `${anchor.prospect_id}, from ${from.slice(0, 120)}, gmail id ${m.id}.`,
        });
      } else {
        other++;
        await supabase.from("error_logs").insert({
          source: "gmail_reply_sweep", error_type: "missed_reply", severity: "warning",
          message: `WF4 missed an inbound reply. Client ${clientId}, prospect ${anchor.prospect_id}, `
            + `from ${from.slice(0, 120)}, gmail id ${m.id}. Not classified here: re-run it through WF4.`,
        });
      }
    }
    await sleep(120);
  }
  return { threads: threadIds.length, hard, soft, other, failed, stopped_early: stoppedEarly };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const deadline = Date.now() + 110_000;
  try {
    const payload = await req.json().catch(() => ({}));
    const daysBack = Number(payload.days_back) > 0 ? Number(payload.days_back) : 3;
    const maxThreads = Number(payload.max_threads) > 0 ? Number(payload.max_threads) : 150;

    let clientIds: string[] = [];
    if (payload.client_id) clientIds = [payload.client_id];
    else {
      const { data } = await supabase.from("client_email_credentials")
        .select("client_id").eq("status", "active");
      clientIds = (data || []).map((r: any) => r.client_id);
    }

    const results: Record<string, any> = {};
    for (const cid of clientIds) {
      if (Date.now() > deadline) { results[cid] = { skipped: "out_of_time" }; continue; }
      try { results[cid] = await sweepClient(cid, daysBack, maxThreads, deadline); }
      catch (e: any) { results[cid] = { error: String(e?.message ?? e) }; }
    }
    return Response.json({ days_back: daysBack, clients: clientIds.length, results });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});
