// The admin sidebar's Hot Leads number: new leads someone has to act on. Sandbox (test)
// accounts' leads stay in the Hot Leads list, marked Sandbox, but never raise this count.
export function newHotLeadAlertCount(
  leads: { status: string; client: { is_sandbox?: boolean | null } | null }[],
): number {
  return leads.filter((l) => l.status === 'new' && !l.client?.is_sandbox).length;
}
