import { PublicNav } from './PublicNav';
import { PublicFooter } from './PublicFooter';
import { useSeo } from '../hooks/useSeo';

export interface LegalSection {
  heading: string;
  body: (string | { type: 'ul'; items: string[] })[];
}

const FONT: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif" };

export function LegalPage({
  title, description, path, lastUpdated, intro, sections,
}: {
  title: string;
  description: string;
  path: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
}) {
  useSeo({ title, description, path });

  return (
    <div style={FONT} className="min-h-screen bg-white text-[#1a1b17]">
      <PublicNav />

      <main className="max-w-[720px] mx-auto px-6 pt-14 pb-24">
        <h1 className="m-0 text-[30px] sm:text-[38px] font-extrabold leading-[1.15] tracking-tight">{title}</h1>
        <p className="mt-3 text-[13px] text-[#9a9d92]">Last updated {lastUpdated}</p>
        <p className="mt-6 text-[17px] leading-relaxed text-[#54574e]">{intro}</p>

        <style>{`
          .legal-body h2 { font-size: 21px; font-weight: 800; margin: 44px 0 14px; letter-spacing: -0.01em; color: #1a1b17; }
          .legal-body p { font-size: 15.5px; line-height: 1.75; color: #3f4038; margin: 0 0 16px; }
          .legal-body ul { margin: 0 0 16px; padding-left: 22px; }
          .legal-body li { font-size: 15.5px; line-height: 1.75; color: #3f4038; margin-bottom: 8px; }
          .legal-body a { color: #3c7a5b; text-decoration: underline; text-underline-offset: 2px; }
          .legal-body strong { font-weight: 700; color: #1a1b17; }
        `}</style>
        <div className="legal-body mt-4">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              {s.body.map((b, i) =>
                typeof b === 'string'
                  ? <p key={i}>{b}</p>
                  : <ul key={i}>{b.items.map((item) => <li key={item}>{item}</li>)}</ul>
              )}
            </section>
          ))}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
