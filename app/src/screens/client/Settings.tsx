import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useGmailConnection } from '../../hooks/useGmailConnection';
import { HelpButton, type HelpContent } from '../../components/HelpButton';

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

export function Settings({ clientId }: { clientId: string }) {
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

      {loading ? (
        <div className="animate-pulse rounded-2xl border p-5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
          <div className="h-4 w-40 rounded mb-3" style={{ background: 'var(--line)' }} />
          <div className="h-3 w-64 rounded mb-5" style={{ background: 'var(--line)' }} />
          <div className="h-9 w-32 rounded-lg" style={{ background: 'var(--line)' }} />
        </div>
      ) : connection.connected ? (
        <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
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
        <div className="rounded-2xl border p-5" style={{ borderColor: '#e6cbc0', background: 'var(--surface)' }}>
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
        <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
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
    </main>
  );
}
