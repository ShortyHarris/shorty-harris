import type { LimitError } from '../lib/campaignLimits';

/* "3 of 5 search terms" - amber at the cap, clay once over it. At the cap the
   input itself explains why it went grey; over the cap this line also says how
   many to remove, so the field doesn't need a second, separate error line. */
export function LimitCounter({ count, max, noun }: { count: number; max: number; noun: string }) {
  const over = count - max;
  const tone = over > 0 ? 'text-(--ad-clay)' : over === 0 ? 'text-(--ad-amber)' : 'text-(--ad-ink-faint)';
  return (
    <p className={`m-0 mt-1 text-[11px] font-semibold ${tone}`} aria-live="polite">
      {count} of {max} {noun}
      {over > 0 && ` - remove ${over} to save`}
    </p>
  );
}

/* Inline messages for the errors a field owns (e.g. the terms x locations
   cap, or max results). The "add at least one" errors are left to the step /
   submit checks so an empty, untouched form isn't shouting at the user. */
export function LimitMessages({ errors, fields }: { errors: LimitError[]; fields: LimitError['field'][] }) {
  const shown = errors.filter((e) => e.over && fields.includes(e.field));
  if (shown.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1" role="alert">
      {shown.map((e) => (
        <p key={e.code} className="m-0 text-[11.5px] font-semibold text-(--ad-clay)">{e.message}</p>
      ))}
    </div>
  );
}
