import './BrandLockup.css';

/* Compact brand mark: bolt icon + wordmark, sized to sit quietly above a
   page heading instead of competing with it (replaces the old oversized
   text-only "Shorty Harris" wordmark on the auth screens). `iconSize` and
   `noMargin` let callers that drop it into a flex row (e.g. the admin top
   bar) size it up and strip the default bottom margin - that margin was
   throwing off vertical centering next to the bell/avatar cluster. */
export function BrandLockup({
  className = '',
  iconSize = 18,
  noMargin = false,
}: {
  className?: string;
  iconSize?: number;
  noMargin?: boolean;
}) {
  return (
    <span
      className={`brand-lockup ${className}`}
      style={noMargin ? { marginBottom: 0 } : undefined}
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 48 46" fill="none" aria-hidden="true">
        <path
          fill="#7e14ff"
          d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"
        />
      </svg>
      Shorty Harris
    </span>
  );
}
