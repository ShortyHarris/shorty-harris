// Fields the detail modal already shows in its own labelled rows (plus ids and
// joins that mean nothing to a reader). Everything else on the row is listed
// under "More details" so new columns appear without a UI change.
const SHOWN_KEYS = new Set([
  'id', 'client_id', 'campaign_id', 'import_id', 'client', 'campaign',
  'business_name', 'contact_name', 'email', 'phone', 'category', 'location',
  'website', 'pipeline_status', 'created_at', 'updated_at',
]);

export interface ExtraField { label: string; value: string }

function humanize(key: string): string {
  const s = key.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === ''
    || (Array.isArray(v) && v.length === 0)
    || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);
}

function show(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Remaining non-empty columns; a jsonb object (e.g. enrichment) is flattened one level. */
export function extraFields(row: Record<string, unknown>): ExtraField[] {
  const out: ExtraField[] = [];
  for (const [key, v] of Object.entries(row)) {
    if (SHOWN_KEYS.has(key) || isEmpty(v)) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (!isEmpty(v2)) out.push({ label: `${humanize(key)}: ${humanize(k2)}`, value: show(v2) });
      }
    } else {
      out.push({ label: humanize(key), value: show(v) });
    }
  }
  return out;
}

/** Only http(s) URLs become links; a scraped "javascript:" value must never be clickable. */
export function safeWebsiteHref(website: string | null | undefined): string | null {
  const w = (website ?? '').trim();
  if (!w) return null;
  const href = /^[a-z][a-z0-9+.-]*:/i.test(w) ? w : `https://${w}`;
  try {
    const u = new URL(href);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}
