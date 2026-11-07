// Marks a sandbox (test) account wherever admins see it next to real customers.
export function SandboxBadge() {
  return (
    <span
      title="Sandbox: a test account. Emails only reach the tester's own mailbox, and it is left out of reporting."
      className="inline-flex shrink-0 items-center rounded-full bg-[#b42318] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[.04em] text-white"
    >
      Sandbox
    </span>
  );
}
