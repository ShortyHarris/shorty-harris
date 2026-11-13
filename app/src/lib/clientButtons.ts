// One button look for the client area. Use it for <button> and <Link> alike:
//   <button className={btn('primary')}>Approve</button>
//   <Link className={btn('secondary', 'lg')} to="...">Open</Link>
// Colours come from the theme tokens in styles/theme-client.css, so changing
// --leaf / --clay there restyles every button at once.

export type BtnVariant = 'primary' | 'secondary' | 'danger' | 'alert' | 'quiet';
export type BtnSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold no-underline ' +
  'transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--leaf) ' +
  'disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50';

const VARIANT: Record<BtnVariant, string> = {
  // The one thing to do on a screen.
  primary: 'border border-transparent bg-(--leaf) font-bold text-(--ad-on-accent) hover:bg-(--leaf-hover) active:brightness-90',
  // Everything else: Edit, Cancel, Back, Refresh, pagination.
  secondary: 'border border-(--line-strong) bg-(--surface) text-(--ink) hover:border-(--ink-soft) hover:bg-(--bg) active:bg-(--ad-fill)',
  // Reject, delete, stop: red outline, tinted on hover, so it is unmistakably destructive
  // without competing with the primary action.
  danger: 'border border-(--ad-danger-line) bg-(--surface) font-bold text-(--ad-danger) hover:border-(--ad-danger) hover:bg-(--ad-danger-tint) active:bg-(--ad-danger-tint-hover) focus-visible:outline-(--ad-danger)',
  // The action inside a red warning banner: solid in the banner's own colour
  // instead of green on red.
  alert: 'border border-transparent bg-(--clay) font-bold text-(--ad-on-accent) hover:bg-(--ad-clay-hover)',
  // Low-emphasis text actions.
  quiet: 'border border-transparent bg-transparent text-(--ink-soft) hover:bg-(--bg) hover:text-(--ink)',
};

const SIZE: Record<BtnSize, string> = {
  sm: 'px-2.5 py-1 text-[11.5px]',
  md: 'px-3.5 py-1.5 text-[12.5px]',
  lg: 'px-4 py-2 text-[13px]',
};

export function btn(variant: BtnVariant = 'secondary', size: BtnSize = 'md'): string {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]}`;
}
