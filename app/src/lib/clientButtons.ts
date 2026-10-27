// One button look for the client area. Use it for <button> and <Link> alike:
//   <button className={btn('primary')}>Approve</button>
//   <Link className={btn('secondary', 'lg')} to="...">Open</Link>
// Colours come from the theme tokens in styles/theme-client.css, so changing
// --leaf / --clay there restyles every button at once.

export type BtnVariant = 'primary' | 'secondary' | 'danger' | 'alert' | 'quiet';
export type BtnSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const VARIANT: Record<BtnVariant, string> = {
  // The one thing to do on a screen.
  primary: 'border border-transparent bg-(--leaf) font-bold text-white hover:bg-(--leaf-hover)',
  // Everything else: Edit, Cancel, Back, Refresh, pagination.
  secondary: 'border border-(--line-strong) bg-white text-(--ink) hover:bg-(--bg)',
  // Reject, delete, stop: outlined until hovered so it never competes with primary.
  danger: 'border border-(--clay) bg-transparent font-bold text-(--clay) hover:bg-(--clay) hover:text-white',
  // The action inside a red warning banner: solid in the banner's own colour
  // instead of green on red.
  alert: 'border border-transparent bg-(--clay) font-bold text-white hover:bg-[#8a3f2b]',
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
