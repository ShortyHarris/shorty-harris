import { useRef } from 'react';
import { Bold, Italic, Underline, Heading2, List } from 'lucide-react';

// A plain markdown textarea with a small formatting toolbar. Buttons wrap the
// current selection (or insert placeholder text) with the matching markdown
// syntax, so the stored value stays real markdown — the public post page
// already renders body_md with `marked`, and this keeps that pipeline
// completely unchanged instead of switching to a contentEditable/HTML value.

type Action = 'bold' | 'italic' | 'underline' | 'h2' | 'list';

function applyAction(value: string, start: number, end: number, action: Action): { value: string; start: number; end: number } {
  const selected = value.slice(start, end) || placeholderFor(action);
  let wrapped: string;
  switch (action) {
    case 'bold':      wrapped = `**${selected}**`; break;
    case 'italic':     wrapped = `*${selected}*`; break;
    case 'underline':  wrapped = `<u>${selected}</u>`; break;
    case 'h2':         wrapped = `\n## ${selected}\n`; break;
    case 'list':       wrapped = `\n- ${selected}`; break;
  }
  return {
    value: value.slice(0, start) + wrapped + value.slice(end),
    start: start + wrapped.length,
    end: start + wrapped.length,
  };
}

function placeholderFor(action: Action): string {
  switch (action) {
    case 'bold':      return 'bold text';
    case 'italic':     return 'italic text';
    case 'underline':  return 'underlined text';
    case 'h2':         return 'Heading';
    case 'list':       return 'List item';
  }
}

const TOOLBAR_BUTTONS: { action: Action; icon: typeof Bold; label: string }[] = [
  { action: 'bold', icon: Bold, label: 'Bold' },
  { action: 'italic', icon: Italic, label: 'Italic' },
  { action: 'underline', icon: Underline, label: 'Underline' },
  { action: 'h2', icon: Heading2, label: 'Heading' },
  { action: 'list', icon: List, label: 'Bullet list' },
];

export function MarkdownEditor({
  value, onChange, rows = 14, font,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  font?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function handleAction(action: Action) {
    const el = ref.current;
    if (!el) return;
    const { value: next, start, end } = applyAction(value, el.selectionStart, el.selectionEnd, action);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, end);
    });
  }

  return (
    <div className="rounded-lg border border-[#ece8df] bg-[#fbf9f5] overflow-hidden focus-within:border-[#3c7a5b] transition-colors">
      <div className="flex items-center gap-0.5 border-b border-[#ece8df] bg-white px-2 py-1.5">
        {TOOLBAR_BUTTONS.map(({ action, icon: Icon, label }) => (
          <button
            key={action}
            type="button"
            title={label}
            onClick={() => handleAction(action)}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[#62655c] transition-colors hover:bg-[#f5f2ec] hover:text-[#20211c]"
          >
            <Icon size={14} strokeWidth={2} />
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        style={{ ...font, fontFamily: font?.fontFamily ?? "ui-monospace, 'Cascadia Code', monospace" }}
        className="w-full resize-y bg-transparent px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#20211c] outline-none"
      />
    </div>
  );
}
