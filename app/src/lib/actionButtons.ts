// One button system for screens shared by the client and admin shells (built on the --ad-*
// tokens, which both define). Every variant has the same five states:
//   rest · hover (darker / tinted) · pressed (one step darker, nudged down 1px)
//   · keyboard focus (2px ring, offset) · disabled (neutral grey, no hover, not clickable)
//
// Hierarchy, strongest first. Use at most one primary per area:
//   primary        the action we expect: Save, Approve
//   secondary      safe alternatives: Review, Move back to pending, Keep
//   danger         solid red, only for the final "yes, destroy it" in a confirm dialog
//   dangerOutline  a destructive action that is the point of a toolbar (Cancel selected)
//   dangerGhost    a destructive action next to safer ones (row Cancel, Cancel email)

export type ActionVariant = 'primary' | 'secondary' | 'danger' | 'dangerOutline' | 'dangerGhost';
export type ActionSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-semibold ' +
  'transition-[background-color,border-color,color,transform] duration-150 ' +
  'active:translate-y-px ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'disabled:pointer-events-none disabled:translate-y-0';

const VARIANT: Record<ActionVariant, string> = {
  primary:
    'border-transparent bg-(--ad-green) font-bold text-(--ad-on-accent) ' +
    'hover:bg-(--ad-green-hover) active:bg-(--ad-green-hover) active:brightness-90 ' +
    'focus-visible:outline-(--ad-green) ' +
    'disabled:border-(--ad-line) disabled:bg-(--ad-surface-2) disabled:text-(--ad-ink-ghost)',
  secondary:
    'border-(--ad-line-strong) bg-(--ad-surface) text-(--ad-ink) ' +
    'hover:border-(--ad-ink-soft) hover:bg-(--ad-surface-2) active:bg-(--ad-fill) ' +
    'focus-visible:outline-(--ad-green) ' +
    'disabled:border-(--ad-line) disabled:bg-(--ad-surface) disabled:text-(--ad-ink-ghost)',
  danger:
    'border-transparent bg-(--ad-danger) font-bold text-(--ad-on-danger) ' +
    'hover:bg-(--ad-danger-hover) active:bg-(--ad-danger-active) ' +
    'focus-visible:outline-(--ad-danger) ' +
    'disabled:border-(--ad-line) disabled:bg-(--ad-surface-2) disabled:text-(--ad-ink-ghost)',
  dangerOutline:
    'border-(--ad-danger-line) bg-(--ad-surface) text-(--ad-danger) ' +
    'hover:border-(--ad-danger) hover:bg-(--ad-danger-tint) active:bg-(--ad-danger-tint-hover) ' +
    'focus-visible:outline-(--ad-danger) ' +
    'disabled:border-(--ad-line) disabled:bg-(--ad-surface) disabled:text-(--ad-ink-ghost)',
  dangerGhost:
    'border-transparent bg-transparent text-(--ad-danger) ' +
    'hover:bg-(--ad-danger-tint) hover:text-(--ad-danger-hover) active:bg-(--ad-danger-tint-hover) ' +
    'focus-visible:outline-(--ad-danger) ' +
    'disabled:text-(--ad-ink-ghost)',
};

const SIZE: Record<ActionSize, string> = {
  sm: 'h-8 px-2.5 text-[12px]',
  md: 'h-9 px-3.5 text-[12.5px]',
  lg: 'h-11 px-4 text-[13.5px]',
};

export function actionBtn(variant: ActionVariant, size: ActionSize = 'md', extra = ''): string {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]} ${extra}`.trim();
}
