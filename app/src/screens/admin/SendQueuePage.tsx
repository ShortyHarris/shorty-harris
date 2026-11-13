import { Send } from 'lucide-react';
import { SendQueue } from '../../components/SendQueue';
import { HelpButton, type HelpContent } from '../../components/HelpButton';
import { useToast, ToastHost } from '../../components/Toast';

const HELP: HelpContent = {
  title: 'Send queue',
  body: [
    { type: 'p', text: 'Every approved email that has not been sent yet, across all clients, with the time it is expected to go out (daily sending limit, warm-up, follow-up dates and send days included).' },
    { type: 'ul', items: [
      'Review - open the email; correct the subject or body and save. It stays approved and keeps its place.',
      'Move back to pending - take it out of the queue; it waits on the client\'s Pending tab for approval again.',
      'Cancel - it never sends, and the prospect\'s remaining follow-ups are cancelled (same as Reject).',
    ]},
    { type: 'p', text: 'The sender reads the email again at the moment it sends, so any change saved before then is what goes out. Once a row shows "Sending now" it is being handed to Gmail and can no longer be changed.' },
  ],
};

export function SendQueuePage() {
  const { toasts, toast, dismiss } = useToast();
  return (
    <div className="flex flex-col gap-5 content" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <header className="page-header flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 flex items-center gap-2 text-[26px] font-extrabold tracking-tight text-(--ad-ink)">
            <Send size={22} strokeWidth={2} className="text-(--ad-green)" aria-hidden />
            Send queue
          </h1>
          <p className="m-0 mt-1 text-[13px] text-(--ad-ink-soft)">
            Approved emails waiting to go out. Review, correct, pull back or cancel any of them before they send.
          </p>
        </div>
        <HelpButton content={HELP} />
      </header>
      <SendQueue clientId={null} toast={toast} compact />
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
