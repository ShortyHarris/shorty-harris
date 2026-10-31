// Launching a scrape goes through the WF0a gate (wf0-enqueue), never straight to the worker
// (wf0-discover). The gate enforces the monthly prospect limit, the 5 free launches a month and
// the credit deduction, promotes a draft campaign to active, and queues the job; WF0b picks it up
// within about 5 minutes. Nothing in the app may call wf0-discover.

export const ENQUEUE_URL = 'https://n8n.shortyharris.com/webhook/wf0-enqueue';

export type EnqueueResult =
  | { kind: 'queued'; positionAhead: number | null; queueId: string | null }
  /** Monthly prospect limit (HTTP 200). */
  | { kind: 'limit_reached'; message: string }
  /** No free launches left and no credits (HTTP 429). */
  | { kind: 'launch_limit_reached'; message: string }
  /** The one-active-job-per-campaign unique index rejected a second launch. */
  | { kind: 'already_queued'; message: string }
  | { kind: 'error'; message: string };

export const ALREADY_QUEUED_MESSAGE = 'This campaign is already queued or running.';

// WF0a answers a second launch of an in-flight campaign with HTTP 409 {"status":"already_queued"}
// (its Insert Queue Row error output). The Postgres text match below is only a fallback for an
// older or differently-wired workflow that passes the raw 23505 from
// discovery_queue_one_active_per_campaign through.
const DUPLICATE_RE = /23505|duplicate key|unique constraint|discovery_queue_one_active_per_campaign/i;

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Reads the body before looking at the HTTP status: a 429 is a meaningful answer, not a generic failure. */
export function parseEnqueueResponse(httpStatus: number, text: string): EnqueueResult {
  const body = parseJson(text);
  const status = typeof body?.status === 'string' ? body.status : null;
  const message = typeof body?.message === 'string' && body.message.trim() ? body.message : null;

  if (status === 'queued') {
    return {
      kind: 'queued',
      positionAhead: typeof body?.position_ahead === 'number' ? body.position_ahead : null,
      queueId: typeof body?.queue_id === 'string' ? body.queue_id : null,
    };
  }
  if (status === 'already_queued') return { kind: 'already_queued', message: message ?? ALREADY_QUEUED_MESSAGE };
  if (DUPLICATE_RE.test(text)) return { kind: 'already_queued', message: ALREADY_QUEUED_MESSAGE };
  if (status === 'limit_reached') {
    return { kind: 'limit_reached', message: message ?? 'Monthly prospect limit reached for this client.' };
  }
  if (status === 'launch_limit_reached' || httpStatus === 429) {
    return {
      kind: 'launch_limit_reached',
      message: message ?? 'No free launches left this month and no credits remaining.',
    };
  }
  return { kind: 'error', message: message ?? `Scrape service returned ${httpStatus}` };
}

export async function enqueueCampaign(
  campaignId: string,
  fetchFn: typeof fetch = fetch,
): Promise<EnqueueResult> {
  let res: Response;
  try {
    res = await fetchFn(ENQUEUE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId }),
    });
  } catch {
    return { kind: 'error', message: 'Could not reach the scrape service' };
  }
  const text = await res.text().catch(() => '');
  return parseEnqueueResponse(res.status, text);
}

/** Toast copy for a queued launch; position_ahead is how many queued jobs are in front of it. */
export function queuedMessage(name: string, positionAhead: number | null): string {
  const place = positionAhead === null
    ? ''
    : positionAhead === 0 ? ' - next in line' : ` - ${positionAhead} ahead of it`;
  return `"${name}" queued${place}. The scraper picks up jobs every few minutes.`;
}
