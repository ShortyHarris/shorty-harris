import { useState } from "react";

// Editorial FAQ for the public pages: serif questions on hairline rules, a
// plus that turns into a minus. Each question is a real button (keyboard and
// screen-reader friendly) controlling its answer region.

export interface FaqItem {
  q: string;
  a: React.ReactNode;
}

export function Faq({ items, firstOpen = true }: { items: FaqItem[]; firstOpen?: boolean }) {
  const [open, setOpen] = useState<number | null>(firstOpen ? 0 : null);
  return (
    <div className="border-0 border-b border-solid border-hairline">
      {items.map((f, i) => {
        const isOpen = open === i;
        const id = `faq-${i}-${f.q.length}`;
        return (
          <div key={f.q} className="border-0 border-t border-solid border-hairline">
            <h3 className="m-0">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={id}
                className="flex w-full cursor-pointer items-start justify-between gap-6 border-0 bg-transparent px-0 py-[18px] text-left font-serif text-[21px] font-normal leading-[1.3] text-ink-strong lg:py-[22px] lg:text-[26px]"
              >
                <span>{f.q}</span>
                <span aria-hidden className="mt-0.5 shrink-0 font-inter text-[22px] leading-none lg:text-[26px]">
                  {isOpen ? "−" : "+"}
                </span>
              </button>
            </h3>
            <div id={id} hidden={!isOpen} className="max-w-[640px] pb-5 text-[16px] leading-[1.6] text-ink-muted lg:pb-6 lg:text-[17px]">
              {f.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}
