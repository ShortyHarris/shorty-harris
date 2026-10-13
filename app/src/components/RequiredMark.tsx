/* The one way forms mark a field the save/next step will refuse without.
   Visual star for sighted users, real text for screen readers. Only use it
   on fields the submit handler actually checks - optional fields stay
   unmarked (or say "(optional)" where that helps). */
export function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" title="Required" className="ml-0.5 text-(--ad-clay)">*</span>
      <span className="sr-only"> (required)</span>
    </>
  );
}
