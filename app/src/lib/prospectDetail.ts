// Fields the detail modal already shows in its own labelled rows (plus ids and
// joins that mean nothing to a reader). Everything else on the row is listed
// under "More details" so new columns appear without a UI change.
const SHOWN_KEYS = new Set([
  'id', 'client_id', 'campaign_id', 'import_id', 'client', 'campaign',
  'business_name', 'contact_name', 'email', 'phone', 'category', 'location',
  'website', 'pipeline_status', 'created_at', 'updated_at',
]);

/**
 * A display-ready value: primitives become strings (booleans as Yes/No),
 * empties are dropped, and nested objects/arrays keep their shape so the UI
 * can lay them out instead of dumping raw JSON.
 */
export type DetailValue = string | DetailValue[] | DetailObject;
export interface DetailObject { [label: string]: DetailValue }

export interface ExtraField { label: string; value: DetailValue }

export function humanize(key: string): string {
  const s = key.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === ''
    || (Array.isArray(v) && v.length === 0)
    || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);
}

/** Normalise any value for display; returns null when nothing is left to show. */
export function toDetailValue(v: unknown): DetailValue | null {
  if (isEmpty(v)) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) {
    const items = v.map(toDetailValue).filter((x): x is DetailValue => x !== null);
    return items.length ? items : null;
  }
  if (typeof v === 'object') {
    const out: DetailObject = {};
    for (const [k, v2] of Object.entries(v as Record<string, unknown>)) {
      const d = toDetailValue(v2);
      if (d !== null) out[humanize(k)] = d;
    }
    return Object.keys(out).length ? out : null;
  }
  return String(v);
}

/** Remaining non-empty columns; a jsonb object (e.g. enrichment) is split one level into fields. */
export function extraFields(row: Record<string, unknown>): ExtraField[] {
  const out: ExtraField[] = [];
  for (const [key, v] of Object.entries(row)) {
    if (SHOWN_KEYS.has(key) || isEmpty(v)) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        const d = toDetailValue(v2);
        if (d !== null) out.push({ label: `${humanize(key)}: ${humanize(k2)}`, value: d });
      }
    } else {
      const d = toDetailValue(v);
      if (d !== null) out.push({ label: humanize(key), value: d });
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
