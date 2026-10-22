// Guard for closing an edit modal by overlay click, Escape or ×. The explicit
// Cancel button skips it - that's already a deliberate discard.
export function confirmDiscard(dirty: boolean): boolean {
  return !dirty || window.confirm('Discard your unsaved changes?');
}
