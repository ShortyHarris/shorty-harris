import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, CheckCircle2, AlertTriangle, LogOut, BarChart3, ChevronRight, Lock, Building2, BookOpen, Compass } from 'lucide-react';
import { useGmailConnection } from '../../hooks/useGmailConnection';
import { useClientProfile, type ClientProfile, type UpdateClientProfileInput } from '../../hooks/useClientProfile';
import { useAuth } from '../../auth/AuthProvider';
import { useTour } from '../../tour/TourProvider';
import { isValidEmail, isValidPhone, normalizePhone } from '../../lib/validation';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { HelpButton, type HelpContent } from '../../components/HelpButton';

const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em]';
const inputCls = 'w-full rounded-lg border px-3.5 py-2.5 text-[13px] outline-none transition-colors';
const inputStyle = { borderColor: 'var(--line)', background: 'var(--bg)', color: 'var(--ink)' };

const HELP: HelpContent = {
  title: 'Email Connection',
  body: [
    { type: 'p', text: "Connect your own Gmail so outreach emails go out from your business's real address instead of a shared one — replies land straight in your inbox." },
    { type: 'p', text: "You can disconnect at any time. If Gmail ever revokes access, reconnect here to pick back up." },
  ],
};

function formatLastUsed(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/* ─── Business profile: name, type, address, contact info, signature name ───
   Shown as a tappable summary row (like the Analytics link below it) rather
   than an always-open form — tapping it opens an edit modal. */
function ProfileSection({ clientId }: { clientId: string }) {
  const { profile, loading, updateProfile } = useClientProfile(clientId);
  const [editing, setEditing] = useState(false);

  if (loading || !profile) {
    return (
      <div className="animate-pulse p-5">
        <div className="h-4 w-40 rounded mb-3" style={{ background: 'var(--line)' }} />
        <div className="h-9 w-full rounded-lg mb-3" style={{ background: 'var(--line)' }} />
        <div className="h-9 w-full rounded-lg" style={{ background: 'var(--line)' }} />
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setEditing(true)}
        className="flex w-full cursor-pointer items-center gap-3 p-5 text-left transition-colors hover:bg-(--bg)"
        data-tour="business-profile"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--leaf-tint)' }}>
          <Building2 size={16} style={{ color: 'var(--leaf)' }} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-[15px] font-bold" style={{ color: 'var(--ink)' }}>{profile.business_name}</span>
          <span className="block truncate text-[13px] mt-0.5" style={{ color: 'var(--ink-soft)' }}>
            {profile.contact_name ? `Signs as ${profile.contact_name}` : 'Tap to add your business info'}
          </span>
        </span>
        <ChevronRight size={16} style={{ color: 'var(--ink-faint)' }} />
      </button>

      <AnimatePresence>
        {editing && (
          <ProfileEditModal profile={profile} updateProfile={updateProfile} onClose={() => setEditing(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

function ProfileEditModal({
  profile, updateProfile, onClose,
}: {
  profile: ClientProfile;
  updateProfile: (input: UpdateClientProfileInput) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  // Lazy initializer, not an effect — `profile` is already loaded by the time
  // this component mounts (ProfileSection gates on it), so the form's local
  // editable copy only ever needs to be seeded once, at mount.
  const [form, setForm] = useState<UpdateClientProfileInput>(() => ({
    business_name: profile.business_name,
    business_type: profile.business_type ?? '',
    location: profile.location ?? '',
    website_url: profile.website_url ?? '',
    contact_email: profile.contact_email ?? '',
    contact_phone: profile.contact_phone ?? '',
    contact_name: profile.contact_name ?? '',
    notification_channel: profile.notification_channel ?? 'whatsapp',
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof UpdateClientProfileInput>(key: K, value: UpdateClientProfileInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    if (!form.business_name.trim()) { setErr('Business name is required.'); return; }
    if (!form.contact_email.trim()) { setErr('Contact email is required.'); return; }
    if (!isValidEmail(form.contact_email)) { setErr('Enter a valid contact email address.'); return; }
    if (form.contact_phone.trim() && !isValidPhone(form.contact_phone)) { setErr('Enter a valid contact phone number.'); return; }

    setBusy(true); setErr(null);
    const { error } = await updateProfile({
      ...form,
      business_name: form.business_name.trim(),
      contact_phone: form.contact_phone.trim() ? normalizePhone(form.contact_phone) : '',
    });
    setBusy(false);
    if (error) setErr(error); else onClose();
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:p-6"
      style={{ background: 'rgba(28, 30, 25, 0.45)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        className="flex w-full flex-col overflow-hidden h-full md:h-auto md:max-h-[90vh] md:max-w-[560px] md:rounded-2xl md:shadow-2xl"
        style={{ background: 'var(--surface)' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
          <h2 className="m-0 text-[18px] font-bold" style={{ color: 'var(--ink)' }}>Edit business profile</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none" style={{ color: 'var(--ink-faint)' }}>×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-4">
            <label className={fieldLbl} style={{ color: 'var(--ink-faint)' }}>Representative name</label>
            <input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} placeholder="e.g. Yvonne" style={inputStyle} className={inputCls} />
            <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
              Used to sign outreach emails — e.g. "Have a wonderful day, {form.contact_name || '…'}"
            </p>
          </div>

          <div className="mb-4">
            <label className={fieldLbl} style={{ color: 'var(--ink-faint)' }}>Business name</label>
            <input value={form.business_name} onChange={(e) => set('business_name', e.target.value)} style={inputStyle} className={inputCls} />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={fieldLbl} style={{ color: 'var(--ink-faint)' }}>Business type</label>
              <input value={form.business_type} onChange={(e) => set('business_type', e.target.value)} style={inputStyle} className={inputCls} />
            </div>
            <div>
              <label className={fieldLbl} style={{ color: 'var(--ink-faint)' }}>Address</label>
              <input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Uptown Normal" style={inputStyle} className={inputCls} />
            </div>
          </div>

          <div className="mb-4">
            <label className={fieldLbl} style={{ color: 'var(--ink-faint)' }}>Website URL</label>
            <input type="url" value={form.website_url} onChange={(e) => set('website_url', e.target.value)} placeholder="https://example.com" style={inputStyle} className={inputCls} />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={fieldLbl} style={{ color: 'var(--ink-faint)' }}>Contact email</label>
              <input type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} style={inputStyle} className={inputCls} />
            </div>
            <div>
              <label className={fieldLbl} style={{ color: 'var(--ink-faint)' }}>Contact phone</label>
              <input type="tel" value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} style={inputStyle} className={inputCls} />
            </div>
          </div>

          <div className="mb-4">
            <label className={fieldLbl} style={{ color: 'var(--ink-faint)' }}>Notification channel</label>
            <Select value={form.notification_channel} onValueChange={(v) => set('notification_channel', v as UpdateClientProfileInput['notification_channel'])}>
              <SelectTrigger className="h-10 rounded-lg text-[13px]" style={inputStyle}><SelectValue /></SelectTrigger>
              <SelectContent className="text-[13px]" style={{ background: 'var(--surface)', color: 'var(--ink)' }}>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {err && (
            <div className="mb-4 rounded-xl border px-4 py-3 text-[13px]" style={{ background: 'var(--clay-tint)', color: 'var(--clay)', borderColor: '#e6cbc0' }}>
              {err}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t px-5 py-4 flex justify-end gap-2.5" style={{ borderColor: 'var(--line)' }}>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg border px-4 py-2 text-[13px] font-semibold transition-colors"
            style={{ borderColor: 'var(--line-strong)', color: 'var(--ink-soft)', background: 'transparent' }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="cursor-pointer rounded-lg border-0 px-4 py-2 text-[13px] font-bold text-white transition-colors disabled:opacity-50"
            style={{ background: 'var(--leaf)' }}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Take a tour — replays the guided walkthrough on demand ─── */
function TourReplayRow() {
  const { start } = useTour();
  return (
    <button
      onClick={start}
      className="flex w-full cursor-pointer items-center gap-3 p-5 text-left transition-colors hover:bg-(--bg)"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--leaf-tint)' }}>
        <Compass size={16} style={{ color: 'var(--leaf)' }} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-bold" style={{ color: 'var(--ink)' }}>Take a tour</span>
        <span className="block text-[13px] mt-0.5" style={{ color: 'var(--ink-soft)' }}>A quick walkthrough of your dashboard.</span>
      </span>
      <ChevronRight size={16} style={{ color: 'var(--ink-faint)' }} />
    </button>
  );
}

/* ─── Password change ───
   Reuses the existing forgot-password flow (AuthProvider.resetPassword →
   emails a reset link → /auth/set-password) instead of a raw new/confirm
   password form here — one less place for password-change logic to live,
   and it's already the tested, working path. */
function PasswordSection() {
  const { session, resetPassword } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const email = session?.user?.email ?? '';

  async function submit() {
    if (!email) return;
    setBusy(true); setErr(null);
    const { error } = await resetPassword(email);
    setBusy(false);
    if (error) setErr(error); else setSent(true);
  }

  return (
    <div className="p-5">
      <h2 className="text-[15px] font-bold flex items-center gap-2 mb-1" style={{ color: 'var(--ink)' }}>
        <Lock size={16} style={{ color: 'var(--ink-faint)' }} />
        Password
      </h2>
      <p className="text-[13px] mb-3" style={{ color: 'var(--ink-soft)' }}>
        We'll email a reset link to <strong>{email}</strong>.
      </p>
      {err && (
        <div className="mb-3 rounded-xl border px-4 py-3 text-[13px]" style={{ background: 'var(--clay-tint)', color: 'var(--clay)', borderColor: '#e6cbc0' }}>
          {err}
        </div>
      )}
      {sent && !err ? (
        <div className="rounded-xl border px-4 py-3 text-[13px]" style={{ background: 'var(--leaf-tint)', color: 'var(--leaf)', borderColor: '#c5e3d4' }}>
          Check your inbox for a link to set a new password.
        </div>
      ) : (
        <button
          onClick={submit}
          disabled={busy || !email}
          className="cursor-pointer rounded-lg border px-4 py-2 text-[13px] font-bold transition-colors disabled:opacity-50"
          style={{ borderColor: 'var(--line-strong)', color: 'var(--ink)', background: 'transparent' }}
        >
          {busy ? 'Sending…' : 'Send password reset link'}
        </button>
      )}
    </div>
  );
}

export function Settings({ clientId, onSignOut }: { clientId: string; onSignOut: () => void }) {
  const { connection, loading, error, disconnect, connectUrl, reload } = useGmailConnection(clientId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const connected = searchParams.get('gmail_connected');
    const gmailError = searchParams.get('gmail_error');
    if (connected) {
      setBanner({ kind: 'success', text: `Gmail connected: ${connected}` });
      setSearchParams({}, { replace: true });
      reload();
    } else if (gmailError) {
      setBanner({ kind: 'error', text: `Failed to connect Gmail: ${gmailError}` });
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDisconnect() {
    setDisconnecting(true);
    await disconnect();
    setDisconnecting(false);
  }

  return (
    <main className="content">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="m-0 text-[22px] font-extrabold tracking-tight" style={{ color: 'var(--ink)' }}>Settings</h1>
          <p className="m-0 mt-1 text-[13.5px]" style={{ color: 'var(--ink-soft)' }}>Manage how outreach is sent on your behalf.</p>
        </div>
        <HelpButton content={HELP} />
      </div>

      {banner && (
        <div
          className="mb-5 rounded-xl border px-4 py-3.5 text-[13.5px] font-medium"
          style={banner.kind === 'success'
            ? { background: 'var(--leaf-tint)', color: 'var(--leaf)', borderColor: '#c5e3d4' }
            : { background: 'var(--clay-tint)', color: 'var(--clay)', borderColor: '#e6cbc0' }}
        >
          {banner.text}
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-xl border px-4 py-3.5 text-[13.5px]" style={{ background: 'var(--clay-tint)', color: 'var(--clay)', borderColor: '#e6cbc0' }}>
          Couldn't check your Gmail connection: {error}
        </div>
      )}

      {/* ─── Business profile ─── */}
      <div className="mb-2 px-0.5 text-[10.5px] font-bold uppercase tracking-[.08em]" style={{ color: 'var(--ink-faint)' }}>
        Business profile
      </div>
      <div className="mb-6 overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        <ProfileSection clientId={clientId} />
      </div>

      {/* ─── Outreach ─── */}
      <div className="mb-2 px-0.5 text-[10.5px] font-bold uppercase tracking-[.08em]" style={{ color: 'var(--ink-faint)' }}>
        Outreach
      </div>
      <div className="mb-6 overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        {loading ? (
          <div className="animate-pulse p-5">
            <div className="h-4 w-40 rounded mb-3" style={{ background: 'var(--line)' }} />
            <div className="h-3 w-64 rounded mb-5" style={{ background: 'var(--line)' }} />
            <div className="h-9 w-32 rounded-lg" style={{ background: 'var(--line)' }} />
          </div>
        ) : connection.connected ? (
          <div className="p-5" data-tour="gmail-connect">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h2 className="text-[15px] font-bold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                <Mail size={16} style={{ color: 'var(--leaf)' }} />
                Email Connection
              </h2>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
                style={{ background: 'var(--leaf-tint)', color: 'var(--leaf)' }}
              >
                <CheckCircle2 size={12} />
                Connected
              </span>
            </div>
            <p className="text-[13px] mb-4" style={{ color: 'var(--ink-soft)' }}>
              Outreach emails are sent from your own Gmail address.
            </p>
            <div className="rounded-xl px-4 py-3 mb-4" style={{ background: 'var(--bg)' }}>
              <div className="text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>{connection.email}</div>
              {connection.last_used && (
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>
                  Last used {formatLastUsed(connection.last_used)}
                </div>
              )}
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="cursor-pointer rounded-lg border px-4 py-2 text-[13px] font-bold transition-colors disabled:opacity-50"
              style={{ borderColor: '#e0b8ae', color: 'var(--clay)', background: 'transparent' }}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        ) : connection.status === 'error' ? (
          <div className="p-5" data-tour="gmail-connect">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h2 className="text-[15px] font-bold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                <Mail size={16} style={{ color: 'var(--clay)' }} />
                Email Connection
              </h2>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
                style={{ background: 'var(--clay-tint)', color: 'var(--clay)' }}
              >
                <AlertTriangle size={12} />
                Needs attention
              </span>
            </div>
            <p className="text-[13px] mb-3" style={{ color: 'var(--ink-soft)' }}>
              Gmail lost its connection{connection.email ? ` for ${connection.email}` : ''}. Reconnect to keep sending outreach.
            </p>
            {connection.error_message && (
              <div className="rounded-xl px-4 py-3 mb-4 text-[12.5px]" style={{ background: 'var(--clay-tint)', color: 'var(--clay)' }}>
                {connection.error_message}
              </div>
            )}
            <a
              href={connectUrl}
              className="inline-block cursor-pointer rounded-lg border-0 px-4 py-2 text-[13px] font-bold text-white transition-colors"
              style={{ background: 'var(--leaf)' }}
            >
              Reconnect Gmail
            </a>
          </div>
        ) : (
          <div className="p-5" data-tour="gmail-connect">
            <h2 className="text-[15px] font-bold flex items-center gap-2 mb-1" style={{ color: 'var(--ink)' }}>
              <Mail size={16} style={{ color: 'var(--ink-faint)' }} />
              Email Connection
            </h2>
            <p className="text-[13px] mb-4" style={{ color: 'var(--ink-soft)' }}>
              Connect your Gmail to send outreach emails from your own address.
            </p>
            <a
              href={connectUrl}
              className="inline-flex items-center shadow-sm hover:shadow-md border-gray-500 gap-2 cursor-pointer bg-white rounded-lg border-0 px-4 py-2 text-[13px] font-bold text-white transition-colors"
            >
              <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Gmail_icon_%282020%29.svg/1280px-Gmail_icon_%282020%29.svg.png" alt="Gmail" className="w-5 h-4" /> Connect Gmail
            </a>
          </div>
        )}

        <div className="border-t" style={{ borderColor: 'var(--line)' }} />

        <Link
          to="/app/analytics"
          className="flex items-center gap-3 p-5 no-underline transition-colors hover:bg-(--bg)"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--leaf-tint)' }}>
            <BarChart3 size={16} style={{ color: 'var(--leaf)' }} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-bold" style={{ color: 'var(--ink)' }}>Analytics</span>
            <span className="block text-[13px] mt-0.5" style={{ color: 'var(--ink-soft)' }}>Open rates, reply rates, and per-campaign performance.</span>
          </span>
          <ChevronRight size={16} style={{ color: 'var(--ink-faint)' }} />
        </Link>

        <div className="border-t" style={{ borderColor: 'var(--line)' }} />

        <Link
          to="/docs"
          className="flex items-center gap-3 p-5 no-underline transition-colors hover:bg-(--bg)"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--leaf-tint)' }}>
            <BookOpen size={16} style={{ color: 'var(--leaf)' }} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-bold" style={{ color: 'var(--ink)' }}>Help &amp; Docs</span>
            <span className="block text-[13px] mt-0.5" style={{ color: 'var(--ink-soft)' }}>Guides and answers for using your dashboard.</span>
          </span>
          <ChevronRight size={16} style={{ color: 'var(--ink-faint)' }} />
        </Link>

        <div className="border-t" style={{ borderColor: 'var(--line)' }} />

        <TourReplayRow />
      </div>

      {/* ─── Account ─── */}
      <div className="mb-2 px-0.5 text-[10.5px] font-bold uppercase tracking-[.08em]" style={{ color: 'var(--ink-faint)' }}>
        Account
      </div>
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
        <PasswordSection />

        <div className="border-t" style={{ borderColor: 'var(--line)' }} />

        <div className="flex items-center justify-between gap-3 p-5">
          <p className="m-0 text-[13px]" style={{ color: 'var(--ink-soft)' }}>You're signed in to this dashboard.</p>
          <button
            onClick={onSignOut}
            className="cursor-pointer inline-flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-bold transition-colors"
            style={{ borderColor: '#e0b8ae', color: 'var(--clay)', background: 'transparent' }}
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
