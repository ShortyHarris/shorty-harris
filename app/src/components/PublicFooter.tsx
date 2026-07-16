import { Link } from 'react-router-dom';

// Shared footer for every public-facing page (Home, Blog, BlogPost, …).
// "How it works" / "Results" link back to the home page's sections (with a
// leading "/") rather than a bare "#hash", so they resolve correctly from
// any page, not just from "/" itself.

const FOOT_LINKS = [
  { title: "Product", links: [["How it works", "/#how"], ["Results", "/#results"]] as const },
  { title: "Company", links: [["Blog", "/blog"], ["Privacy", "/privacy"], ["Terms", "/terms"]] as const },
];

export function PublicFooter() {
  return (
    <footer className="border-t border-[#e5ddd3] max-w-[1200px] mx-auto w-full px-6 lg:px-12 pt-14 pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_2fr] gap-10 lg:gap-16 pb-12">
        <div className="flex flex-col gap-3.5 max-w-full lg:max-w-[300px]">
          <div className="text-[17px] tracking-[-0.025em] leading-none">
            <span className="font-medium text-[#54574e]">Shorty</span>
            <span className="font-extrabold text-[#1a1b17]"> Harris</span>
          </div>
          <p className="text-[13.5px] leading-[1.55] text-[#54574e] m-0">
            AI-powered outbound that finds ideal customers and delivers warm, qualified leads straight to your inbox.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-6">
          {FOOT_LINKS.map((col) => (
            <div key={col.title} className="flex flex-col gap-2.5">
              <div className="text-[12px] font-bold tracking-[0.05em] uppercase text-[#1a1b17] mb-1">{col.title}</div>
              {col.links.map(([label, href]) => (
                <a key={label} href={href} className="text-[14px] text-[#54574e] no-underline hover:text-[#3c7a5b] transition-colors">{label}</a>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-t border-[#e5ddd3] pt-6 text-[13px] text-[#6b6e65]">
        <span>© {new Date().getFullYear()} Shorty Harris. All rights reserved.</span>
        <Link to="/login" className="text-[13px] text-[#54574e] no-underline font-semibold hover:text-[#3c7a5b] transition-colors">
          Sign in
        </Link>
      </div>
    </footer>
  );
}
