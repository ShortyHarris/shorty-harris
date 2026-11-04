// TRANSCRIPT of the deployed gmail-client edge function, version 12, captured
// 2026-11-04. Until today this function existed only in Supabase, with no copy
// in source control: the function that sends every email on the platform had no
// way back if it were lost or overwritten.
//
// This file was reconstructed from the deployed source rather than exported with
// the CLI, so DIFF IT AGAINST THE LIVE FUNCTION BEFORE ANY REDEPLOY:
//   supabase functions download gmail-client
// Treat the live version as authoritative where the two disagree.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function toBase64Url(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// RFC 2047 header encoding. Pure printable ASCII is returned unchanged. Anything else
// (Czech diacritics, emoji, ...) becomes one or more =?UTF-8?B?...?= encoded words, each
// kept under the 75 character limit and folded with CRLF + space. CR/LF in the input are
// collapsed to a space first so a value can never inject extra headers.
function encodeHeader(value: string): string {
  const clean = String(value ?? "").replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  const enc = new TextEncoder();
  const words: string[] = [];
  let chunk = "";
  for (const ch of clean) {
    const next = chunk + ch;
    if (enc.encode(next).length > 45) { words.push(chunk); chunk = ch; } else chunk = next;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => {
    let bin = "";
    for (const b of enc.encode(w)) bin += String.fromCharCode(b);
    return `=?UTF-8?B?${btoa(bin)}?=`;
  }).join("\r\n ");
}

function decodeBase64Utf8(b64: string): string {
  const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

interface RequestBody {
  action: "send" | "read_replies" | "refresh_token" | "get_status";
  client_id: string;
  to?: string;
  subject?: string;
  body?: string;
  html_body?: string;
  unsubscribe_url?: string;
  message_id?: string;
  after_epoch?: number;
}

async function getClientDisplayName(clientId: string): Promise<string> {
  const { data } = await supabase.from("clients").select("business_name").eq("id", clientId).single();
  return data?.business_name || "";
}

async function getValidAccessToken(clientId: string): Promise<{ access_token: string; email: string }> {
  const { data: cred, error } = await supabase.from("client_email_credentials").select("*").eq("client_id", clientId).eq("status", "active").single();
  if (error || !cred) throw new Error(`No active Gmail credentials for client ${clientId}`);
  const expiresAt = new Date(cred.token_expires_at).getTime();
  if (cred.access_token && expiresAt > Date.now() + 300_000) {
    return { access_token: cred.access_token, email: cred.email_address };
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: cred.refresh_token, grant_type: "refresh_token" }),
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.access_token) {
    await supabase.from("client_email_credentials").update({ status: "error", error_message: tokens.error_description || "Token refresh failed", updated_at: new Date().toISOString() }).eq("client_id", clientId);
    throw new Error(`Token refresh failed: ${tokens.error_description || tokens.error}`);
  }
  await supabase.from("client_email_credentials").update({ access_token: tokens.access_token, token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(), last_used_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() }).eq("client_id", clientId);
  return { access_token: tokens.access_token, email: cred.email_address };
}

// RFC 2369 / RFC 8058: only a plain https URL with no whitespace, angle brackets or CR/LF is accepted.
function unsubscribeHeaders(url?: string): string[] {
  const u = String(url ?? "").trim();
  if (!/^https:\/\/[^\s<>"]+$/.test(u) || u.length > 500) return [];
  return [`List-Unsubscribe: <${u}>`, `List-Unsubscribe-Post: List-Unsubscribe=One-Click`];
}

interface Threading { threadId: string; inReplyTo: string; references: string; subject: string }

// Reads the RFC 5322 Message-ID of an already-sent Gmail message (needed for In-Reply-To / References).
async function rfcMessageId(accessToken: string, gmailId: string): Promise<string | null> {
  try {
    const r = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(gmailId)}?format=metadata&metadataHeaders=Message-ID`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) return null;
    const j = await r.json();
    const h = (j.payload?.headers || []).find((x: any) => String(x.name).toLowerCase() === "message-id");
    const v = String(h?.value ?? "").trim();
    return /^<[^<>\s]+>$/.test(v) ? v : null;
  } catch { return null; }
}

// Follow-ups reply inside the prospect's original Gmail thread, but only when platform_settings.thread_followups
// is on. Any problem at all returns null and the email is sent exactly as it was before (never blocks a send).
async function resolveThreading(accessToken: string, messageId?: string): Promise<Threading | null> {
  try {
    if (!messageId) return null;
    const { data: m } = await supabase.from("messages").select("id, prospect_id, message_type").eq("id", messageId).single();
    if (!m || m.message_type === "initial") return null;
    const { data: ps } = await supabase.from("platform_settings").select("thread_followups").eq("id", 1).single();
    if (!ps?.thread_followups) return null;
    const { data: prior } = await supabase.from("messages").select("message_type, subject, gmail_message_id, gmail_thread_id, sent_at")
      .eq("prospect_id", m.prospect_id).eq("send_status", "sent").not("gmail_message_id", "is", null).order("sent_at", { ascending: true });
    if (!prior?.length) return null;
    const initial = prior.find((p: any) => p.message_type === "initial") ?? prior[0];
    const latest = prior[prior.length - 1];
    if (!initial.gmail_thread_id || !initial.subject) return null;
    const initId = await rfcMessageId(accessToken, initial.gmail_message_id);
    if (!initId) return null;
    const latestId = latest.gmail_message_id === initial.gmail_message_id ? initId : await rfcMessageId(accessToken, latest.gmail_message_id);
    const last = latestId ?? initId;
    const subj = /^re:/i.test(initial.subject) ? initial.subject : `Re: ${initial.subject}`;
    return { threadId: initial.gmail_thread_id, inReplyTo: last, references: last === initId ? initId : `${initId} ${last}`, subject: subj };
  } catch (e) { console.error("resolveThreading failed, sending unthreaded", e); return null; }
}

async function sendEmail(accessToken: string, fromEmail: string, displayName: string, to: string, subject: string, body: string, htmlBody?: string, unsubscribeUrl?: string, threading?: Threading | null): Promise<{ success: boolean; id?: string; threadId?: string; error?: string; threaded?: boolean }> {
  // Display name: plain ASCII is left exactly as before; non-ASCII is RFC 2047 encoded.
  const safeName = displayName ? encodeHeader(displayName) : "";
  const fromHeader = safeName ? `${safeName} <${fromEmail}>` : fromEmail;
  const toHeader = String(to).replace(/[\r\n]+/g, "").trim();
  const subjectHeader = encodeHeader(threading ? threading.subject : subject);
  const threadHeaders = threading ? [`In-Reply-To: ${threading.inReplyTo}`, `References: ${threading.references}`] : [];
  const boundary = "boundary_" + crypto.randomUUID().replace(/-/g, "");
  let rawMessage: string;
  if (htmlBody) {
    rawMessage = [`From: ${fromHeader}`, `To: ${toHeader}`, `Subject: ${subjectHeader}`, ...threadHeaders, ...unsubscribeHeaders(unsubscribeUrl), `MIME-Version: 1.0`, `Content-Type: multipart/alternative; boundary="${boundary}"`, "", `--${boundary}`, `Content-Type: text/plain; charset=utf-8`, "", body || "Please view this email in an HTML-capable client.", `--${boundary}`, `Content-Type: text/html; charset=utf-8`, "", htmlBody, `--${boundary}--`].join("\r\n");
  } else {
    rawMessage = [`From: ${fromHeader}`, `To: ${toHeader}`, `Subject: ${subjectHeader}`, ...threadHeaders, ...unsubscribeHeaders(unsubscribeUrl), `Content-Type: text/plain; charset=utf-8`, "", body].join("\r\n");
  }
  const b64 = toBase64Url(rawMessage);
  const payload: Record<string, string> = { raw: b64 };
  if (threading) payload.threadId = threading.threadId;
  const res = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) return { success: false, error: data.error?.message || "Send failed" };
  return { success: true, id: data.id, threadId: data.threadId, threaded: !!threading };
}

// Reply search. This used to be "in:inbox category:primary", which returns NOTHING for Gmail accounts that do not
// use inbox tabs (most Google Workspace accounts), so those clients never had a reply recorded. The whole inbox is
// searched instead, minus the tabs that only ever hold bulk mail. Anything that is not a prospect reply is dropped
// further down in the n8n flow (WF4), which matches replies by thread id and sender address.
//
// NOTE (2026-11-04): WF4 calls this with after_epoch = now - 10 minutes and never looks back, so anything missed in
// that window is missed permanently. gmail-reply-sweep exists to catch what falls through. See that function.
const REPLY_QUERY = "in:inbox -category:promotions -category:social -category:forums";

async function readReplies(accessToken: string, afterEpoch?: number): Promise<{ messages: Array<{ id: string; gmail_message_id: string; threadId: string; from: string; subject: string; snippet: string; date: string; body: string }> }> {
  let query = REPLY_QUERY;
  if (afterEpoch) query += ` after:${afterEpoch}`;
  const listRes = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const listData = await listRes.json();
  if (!listRes.ok || !listData.messages?.length) return { messages: [] };
  const messages = [];
  for (const msg of listData.messages.slice(0, 50)) {
    const msgRes = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const msgData = await msgRes.json();
    if (!msgRes.ok) continue;
    const headers = msgData.payload?.headers || [];
    const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
    let bodyText = "";
    if (msgData.payload?.body?.data) {
      bodyText = decodeBase64Utf8(msgData.payload.body.data);
    } else if (msgData.payload?.parts) {
      const tp = msgData.payload.parts.find((p: any) => p.mimeType === "text/plain" && p.body?.data);
      if (tp) bodyText = decodeBase64Utf8(tp.body.data);
    }
    messages.push({ id: msg.id, gmail_message_id: msg.id, threadId: msgData.threadId || msg.threadId || "", from: getHeader("From"), subject: getHeader("Subject"), snippet: msgData.snippet || "", date: getHeader("Date"), body: bodyText });
  }
  return { messages };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
  try {
    const body: RequestBody = await req.json();
    const { action, client_id } = body;
    if (!client_id) return Response.json({ error: "client_id required" }, { status: 400, headers: CORS_HEADERS });
    if (action === "get_status") {
      const { data, error } = await supabase.from("client_email_credentials").select("email_address, status, error_message, last_used_at, created_at").eq("client_id", client_id).single();
      if (error || !data) return Response.json({ connected: false }, { headers: CORS_HEADERS });
      return Response.json({ connected: data.status === "active", email: data.email_address, status: data.status, error_message: data.error_message, last_used: data.last_used_at, connected_at: data.created_at }, { headers: CORS_HEADERS });
    }
    const { access_token, email } = await getValidAccessToken(client_id);
    if (action === "refresh_token") return Response.json({ success: true, email }, { headers: CORS_HEADERS });
    if (action === "send") {
      if (!body.to || !body.subject || (!body.body && !body.html_body)) return Response.json({ error: "to, subject, and body or html_body required" }, { status: 400, headers: CORS_HEADERS });
      const displayName = await getClientDisplayName(client_id);
      const threading = await resolveThreading(access_token, body.message_id);
      const result = await sendEmail(access_token, email, displayName, body.to, body.subject, body.body || "", body.html_body, body.unsubscribe_url, threading);
      return Response.json(result, { headers: CORS_HEADERS });
    }
    if (action === "read_replies") { const result = await readReplies(access_token, body.after_epoch); return Response.json(result, { headers: CORS_HEADERS }); }
    return Response.json({ error: "Invalid action" }, { status: 400, headers: CORS_HEADERS });
  } catch (err: any) { console.error("Gmail client error:", err); return Response.json({ error: err.message }, { status: 500, headers: CORS_HEADERS }); }
});
