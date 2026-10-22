# Page Design Spec

Read-only audit of page-level UI in `src/`: tables, toolbars, filters, tabs, dropdowns, pagination, buttons, cards, pills, empty / loading / error states and page headers. Structure and dimensions only. Colors are omitted; where a class carried a color it is skipped or marked `[color omitted]`. Modals and drawers are covered in `MODAL_DESIGN_SPEC.md` and are not repeated here.

Stack facts the numbers depend on:

- Tailwind CSS v4, spacing unit 4px (`p-1` = 4px). No overrides of `--spacing` or `--radius-md/lg/xl/2xl`, so defaults apply: `rounded` 4px, `rounded-md` 6px, `rounded-lg` 8px, `rounded-xl` 12px, `rounded-2xl` 16px, `rounded-full` 9999px. `rounded-sm` is 4px by default and 10px inside `.theme-client` (which sets `--radius-sm: 10px`).
- `text-sm` = 14px / 20px. `text-2xl` = 24px / 32px. Arbitrary `text-[13px]` sets only font-size; line-height is then the inherited `body { line-height: 1.5 }` from `src/index.css`.
- `tracking-tight` = -0.025em. `leading-none` = 1, `leading-snug` = 1.375, `leading-relaxed` = 1.625.
- `shadow-sm` = `0 1px 3px 0, 0 1px 2px -1px`; `shadow-md` = `0 4px 6px -1px, 0 2px 4px -2px`; `shadow-lg` = `0 10px 15px -3px, 0 4px 6px -4px`.
- `transition-colors` / `transition-all` / `transition-shadow` use Tailwind v4 defaults: 150ms, `cubic-bezier(0.4, 0, 0.2, 1)`.
- Component CSS files wrapped in `@layer components` lose to Tailwind utilities on the same element (relevant where a CSS class and a `rounded-*` utility are combined).

Dead CSS (never imported): `src/screens/admin/Screens.css` (`.screen`, `.toolbar`, `.data-table`, `.table-pagination`, `.pill`, `.row-card`, `.toggle`, `.empty`), `src/screens/admin/ApprovalQueue.css`, `src/screens/admin/Analytics.css`. Values in those files are not used anywhere and are excluded below.

---

## 1. Inventory (Step 1)

### 1.1 Shared components and shared CSS

| Shared piece | File | What it provides | Used by |
|---|---|---|---|
| `.atbl`, `.atbl-pill`, `.atbl-tabs` | `src/styles/admin-tables.css` (imported by admin `Layout.tsx` and client `Shell.tsx`) | The table card, header and row styling, rectangular status pill, inner underline tab bar | Every admin table and most client tables |
| `SkeletonTable`, `SkeletonCards`, `SkeletonTiles`, `SkeletonChart` | `src/components/Skeleton.tsx` | Pulse skeletons | Admin pages, client Prospects / Approvals / Campaigns |
| `RowMenu` | `src/components/RowMenu.tsx` | Kebab button + portal dropdown with actions, headers, separators, checkmarks, dots | Admin tables only |
| `RefreshButton` | `src/components/RefreshButton.tsx` | Refresh button with "Updated X ago" stamp, collapses to icon on mobile | Most page headers |
| `HelpButton` | `src/components/HelpButton.tsx` | 28px round info button in page headers | Most page headers |
| `MobileFab` | `src/components/MobileFab.tsx` | 56px floating create button, phones only | Admin Clients, Prospects, Campaigns; client Campaigns |
| `Select*` | `src/components/ui/select.tsx` (Radix) | Dropdown trigger and menu | All filter dropdowns |
| `Button` | `src/components/ui/button.tsx` (cva) | shadcn button variants | **Marketing header only** (`ui/header-1.tsx`, `ui/hero-1.tsx`). No app page uses it |
| `CountryHoldBanner`, `EuBadge` | `src/components/CountryHoldBanner.tsx` | Warning banner and small badge | Campaign pages |
| `TargetAreaChips`, `TagInput` | `src/components/` | Chip lists | Campaign pages |
| `.page-header` mobile rule | `src/index.css` | Mobile grid layout for every page header | Every app page |
| `.content` | `src/styles/theme-client.css` | Client page wrapper (max width + padding) | Client Prospects, Campaigns, Approvals, Billing, Results, Targeting, Settings |
| `.apage` | `src/screens/admin/Layout.css` | Admin page padding | Every admin page |

Not present as shared components: `DataTable`, `Pagination`, `Tabs`, `PageHeader`, `StatCard`, `EmptyState`, `SearchInput`, `Pill/Badge`. Each of these is hand-rolled per page (see 1.2).

### 1.2 Pages

| Page | File | Contains | Hand-rolled instead of shared |
|---|---|---|---|
| Admin Approvals | `screens/admin/ApprovalQueue.tsx` | 4 stat tiles, `.atbl` table (5 cols), mobile cards, pagination | `StatTile` (local), pagination (inline), Refresh button (inline, not `RefreshButton`) |
| Admin Clients | `screens/admin/Clients.tsx` | `.atbl` table (7 cols), RowMenu, mobile cards, pagination, MobileFab | Pagination (inline), empty state |
| Admin Prospects | `screens/admin/Prospects.tsx` | Search + 2 Select filters, `.atbl` table (6 cols), RowMenu with status header, mobile cards, pagination | Toolbar, search, pagination |
| Admin Campaigns | `screens/admin/CampaignsAndLeads.tsx` (`Campaigns`) | `.atbl` table (6 cols), inline row buttons + RowMenu, mobile cards, `Pagination` | `Pagination` is file-local |
| Admin Hot leads | `screens/admin/CampaignsAndLeads.tsx` (`HotLeads`) | `.atbl-tabs` underline tabs with counts (desktop), pill tabs (mobile), table (5 cols), divided mobile list, `Pagination` | Tab bars, list |
| Admin Monitoring | `screens/admin/Monitoring.tsx` | Page-level `.atbl-tabs` (3 tabs with counts), 3 tables, toggle button, pagination | Tabs, pagination |
| Admin Domains | `screens/admin/Domains.tsx` | Scope filter bar (label + Select), `.atbl` table (6 cols), RowMenu | Filter bar |
| Admin Docs | `screens/admin/DocsAdmin.tsx` | Search + 2 Selects, `.atbl` table (6 cols), mobile cards | Toolbar |
| Admin Results | `screens/admin/AdminResults.tsx` | `.atbl` table (6 cols) | none |
| Admin Analytics | `screens/admin/Analytics.tsx`, `ReplyBreakdown.tsx` | 4 metric tiles, chart cards, mobile search + client pills, donut legend list, toggle stat tiles, reply list | `MetricTile`, `ChartCard`, `StatTile` (third local version) |
| Admin Blog | `screens/admin/Blog.tsx` | Segmented control (Pending / Published), generator card, divided list, pagination | Segmented control, list, pagination |
| Client Dashboard | `screens/client/Dashboard.tsx` + `Dashboard.css` | Stat grid (CSS), filter bar (pills on mobile, underline tabs on desktop), leads table (own CSS), mobile row cards, warm prospects panel, pagination | Everything in CSS classes: `.stat-card`, `.filter-tab`, `.dash-leads table`, `.dash-pagination` |
| Client Prospects | `screens/client/Prospects.tsx` | Search, pill status tabs with counts, `.atbl` table (7 cols, no mobile cards), inline note popover, pagination | Search, tabs, pagination |
| Client Campaigns | `screens/client/Campaigns.tsx` | `.atbl` table (6 cols), mobile cards, limit banners, MobileFab | none (no pagination) |
| Client Approvals | `screens/client/Approvals.tsx` | 4 stat tiles, bulk-select bar, `.atbl` table with checkbox column, pagination | `StatTile` (copy of admin), bulk bar |
| Client Analytics | `screens/client/Analytics.tsx` + `Analytics.css` | 5 KPI cards, chart card, table card with selectable rows | `.an-*` CSS, own table |
| Client Billing | `screens/client/Billing.tsx` + `Billing.css` | Credit hero, pack picker, 2 tables (desktop) / card lists (mobile), date-range Select, pagination | Own tables, own `Pagination` (third copy), own empty state |
| Client Results | `screens/client/Results.tsx` | Funnel card, insight cards, category table | Own table |
| Client Targeting | `screens/client/TargetingProfile.tsx` | Field rows card, tag chips, category table | Own table |
| Client Settings | `screens/client/Settings.tsx` | Grouped list cards with icon rows, switch, status pills | Settings rows |
| Docs | `screens/docs/Docs.tsx` + `Docs.css` | Sidebar nav, search trigger | Own CSS |
| Public Blog | `screens/Blog.tsx` | Category filter pills, card grid, numbered pagination, skeleton cards | Own pills, own pager (only numbered pager in the project) |

---

## 2. Exact values (Step 2)

### A. Page frame

**Admin shell** (`Layout.css`)

| Element | Value |
|---|---|
| Top bar | `height: 52px` (`--atopbar-h`), `padding: 0 32px`, 1px bottom border, sticky |
| Sidebar | grid column `252px`, `padding: 18px 12px 16px`, sticky below top bar, nav items `padding: 8.5px 10px`, `gap: 9px`, 1px gap between items |
| Page padding (`.apage`) | desktop `28px 32px 40px`; at 767px and below `20px 16px 96px` (96px bottom clears the FAB) |
| Max width | not present (fluid) |
| Section gap | page root `flex flex-col gap-6` = 24px on every admin page; Monitoring tab content `gap-4` (16px) |

**Client shell** (`Shell.css`, `theme-client.css`)

| Element | Value |
|---|---|
| Desktop top bar | `--ctopbar-h: 52px`, `padding: 0 24px` |
| Mobile top bar | `padding: 11px 18px`, `gap: 10px` |
| Sidebar (768px+) | `width: 252px`, `padding: 18px 12px 16px`, links `padding: 8.5px 10px`, 13.5px |
| Bottom nav (below 768px) | fixed, `padding: 7px 10px calc(7px + env(safe-area-inset-bottom))`, items 11px / 500, icon box 34 x 32px, page body `padding-bottom: 80px` |
| `.content` | `max-width: 640px; padding: 24px 20px 64px`; 768px+: `max-width: 720px; padding: 32px 32px 80px`; 1024px+: `max-width: 1100px` |
| Section gap | `flex flex-col gap-6` (24px) on Prospects / Campaigns / Approvals; Results / Targeting / Settings stack sections with `mb-5` (20px) and `mb-6` (24px) instead |
| Dashboard and Analytics | not inside `.content`; full-bleed CSS with 18px side margins on mobile (`.dash-head { padding: 20px 18px 14px }`) and 28px at 768px+ (`.dash-head { padding: 32px 28px 20px }`) |

**Page header** (admin and client list pages)

```
<header className="page-header flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
  <div>
    <h1 className="m-0 text-[26px] flex items-center gap-1 font-extrabold tracking-tight">[icon img w-10 h-10] Title</h1>
    <p className="m-0 mt-1 text-[13px]">count or description</p>
  </div>
  <div className="flex items-center gap-2 shrink-0">HelpButton, RefreshButton, primary action</div>
</header>
```

| Property | Value |
|---|---|
| Title | 26px, 800, letter-spacing -0.025em, line-height 1.5 (inherited) |
| Title icon | `img` 40 x 40px (`w-10 h-10`); some pages 36px (`w-9 h-9`, Clients) or 32px (`w-8 h-8`, Monitoring, Domains); gap 4px (`gap-1`) or 8px (`gap-2`) |
| Description | 13px, 4px below (`mt-1`) |
| Actions | right aligned, `gap-2` (8px), some `md:gap-2.5` (10px) |
| Primary action | last in the cluster; hidden on mobile (`hidden md:inline-flex`) and replaced by `MobileFab` |
| Space to first content | the page `gap-6` (24px) |
| Mobile (below 768px, `index.css`) | header becomes `grid-template-columns: minmax(0,1fr) auto; column-gap: 12px; row-gap: 4px`; h1 shrinks to 22px, line-height 1.2, title icon 30 x 30px; description spans full width on row 2; actions sit on row 1 right. `.page-header--stack` moves actions to row 3, full width, `margin-top: 8px`, wrapping |
| Client secondary pages (Results, Targeting, Settings) | `page-header flex items-start justify-between gap-4 mb-5`, h1 `text-[22px] font-extrabold tracking-tight`, description `text-[13.5px]` |
| Client Dashboard / Analytics | `.dash-title` / `.an-title`: 22px, 800, letter-spacing -0.03em, line-height 1.1, `margin: 0 0 5px`, icon gap 8px; sub 13.5px, line-height 1.5 |
| Client Billing | `<h2 className="text-2xl font-bold">` (24px / 32px) with 32px icon |

### B. Tables

**Shared table: `.atbl`** (`admin-tables.css`)

| Property | Value |
|---|---|
| Container | `border-radius: 10px; border: 1px solid; box-shadow: 0 1px 2px` (4% opacity, lowest elevation); `overflow-x: auto; overflow-y: hidden` |
| Table | `width: 100%; min-width: 640px; border-collapse: collapse; font-size: 13px` |
| Horizontal scroll | below 640px of available width the table scrolls inside the card |
| Sticky header | not present |
| Header row | `thead tr { border-bottom: 1px solid }`; `th { padding: 11px 16px 10px; text-align: left; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.11em; white-space: nowrap }`. Height: 11 + 15.75 (10.5 x 1.5) + 10 = 36.75px |
| Sort indicators | not present (no sortable tables) |
| Body row | `tbody tr { border-bottom: 1px solid; transition: background 0.1s }`, last row no border, `:hover` background change |
| Body cell | `td { padding: 12px 16px; vertical-align: middle }`. Single-line row height: 12 + 19.5 (13 x 1.5) + 12 + 1 = 44.5px |
| Zebra striping | not present |
| Selected row state | not present in `.atbl` (client Analytics `.an-row-selected` only) |
| Clickable rows | `<tr onClick className="group cursor-pointer">` (Clients, Campaigns), `cursor-pointer` (Hot leads, Docs, client Campaigns). Primary cell gets `group-hover:underline` in Clients and admin Campaigns |
| Column widths | `table-fixed` with `<colgroup>` percentages (e.g. Clients `22/15/11/10/16/15/11%`; Prospects `24/24/16/16/14/6%`). Hot leads, Monitoring tables: auto layout (no `table-fixed`) |
| Action column | last column, header empty, `td className="px-3 text-right"` (12px side padding), 6 to 16% wide |

**Cells**

| Cell type | Classes / values |
|---|---|
| Primary text | `truncate font-bold` (13px / 700), `title` attribute holds the full value |
| Two-line cell | primary line + `mt-0.5 truncate text-[11px]` secondary (2px gap); mono variant `font-mono text-[11px]` for emails |
| Secondary meta line | `text-[11px]` or `text-[12px]` |
| Date cell | `text-[12px] whitespace-nowrap` |
| Multi-line title | `line-clamp-2 font-bold leading-snug` (admin Campaigns) |
| Summary cell | `max-w-[340px]` + `line-clamp-1` (Hot leads); `max-w-90` (360px) (Monitoring); `max-w-105` (420px) (client Dashboard) |
| Numeric | left aligned like text (no right alignment), except Billing activity amount `text-right` |
| Avatar / icon cell | not present in tables |
| Status pill | `.atbl-pill` (see H) |
| Inline row buttons | `rounded-lg border px-2 py-1 text-[11px] font-semibold` (Add credits, Edit), `rounded-md px-3.5 py-1.5 text-[12px] font-bold` (Approve), `rounded-lg border px-2.5 py-1 text-[11px]` (Run scrape), `rounded-lg border px-3 py-1.5 text-[12px]` (Resolve) |
| Row chevron | `ChevronRight size={15}` in last column (Hot leads, client Dashboard, client Campaigns) |
| Truncation | `min-w-0` on `td` + `truncate` on an inner `div` |

**Row action menu (`RowMenu`)**

| Part | Value |
|---|---|
| Trigger | `flex h-7 w-7 rounded-lg border text-[17px] leading-none`, glyph `⋮`; 28 x 28px hit area; open state keeps a border and fill |
| Menu | portal to `body`, `position: fixed`, `z-index: 9999`, `w-48` (192px), `rounded-xl` (12px), 1px border, `py-1` (4px), shadow `0 8px 28px` (12% opacity), `overflow-y-auto overscroll-contain` |
| Placement | aligned to the trigger, 4px gap (`rect.bottom + 4` or above with `bottom = innerHeight - rect.top + 4`); flips above when space below is short; `maxHeight` = available space, minimum 120px |
| Item | `flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]` (12 / 8px padding, 8px gap; height 8 + 19.5 + 8 = 35.5px) |
| Group header | `px-3 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[.07em]` |
| Separator | `<hr className="my-1">` (4px vertical margin) |
| Status dot | `h-2 w-2 rounded-full` (8px) leading |
| Checkmark | trailing `text-[11px]` "✓" |
| Destructive item | same size, destructive text color and hover tint |
| Disabled item | `disabled:opacity-40 cursor-not-allowed` |
| Close | outside mousedown or Escape |

**Bulk selection** (client Approvals only)

| Part | Value |
|---|---|
| Checkbox column | `<col className="w-9" />` (36px), `<th className="w-9" />`, cell `td className="px-3"` |
| Checkbox | native `<input type="checkbox">` with `accent-*`, browser default size |
| Bulk bar | separate card above the table: `rounded-lg border px-4 py-3`, `flex items-center justify-between gap-3`; left "select all" label `gap-2 text-[12.5px] font-semibold`; right `flex flex-wrap justify-end gap-2` with "N selected" `text-[12.5px]` and buttons `rounded-md px-3 py-1.5 text-[12px] font-bold` |

Footer / totals row: not present.

**Other table implementations**

| Table | Header | Cells | Container |
|---|---|---|---|
| Client Dashboard `.dash-leads table` | identical to `.atbl` (11/16/10 padding, 10.5px, 700, uppercase, 0.11em) | `12px 16px`, 13px | 768px+: card `margin: 0 28px 32px; border-radius: 10px; border 1px; shadow 0 1px 2px`; `table min-width: 560px` |
| Client Analytics `.an-table` | `padding: 8px 10px; font-size: 11.5px; 700; uppercase; letter-spacing: 0.02em` | `padding: 10px`, `white-space: nowrap`, 13px; rows clickable, selected row state | `.an-table-card { padding: 16px; border-radius: 14px; border 1px; margin: 0 18px 16px }`, inner `overflow-x: auto` |
| Client Billing (lg+) | `py-2.5 px-2 text-[10.5px] font-bold uppercase tracking-[0.11em]` | `py-3 px-2`, 14px primary / 13.5px secondary | `lg:rounded-[10px] lg:border lg:p-4 lg:shadow-[0_1px_2px...]` |
| Client Results / Targeting | `text-[10.5px] font-bold uppercase tracking-[.06em]`, first cell `px-5 py-3`, others `px-3 py-3` | same padding, 13px | `rounded-2xl border overflow-hidden`, section header `px-5 py-4 border-b` with `text-[15px] font-bold` title; rows divided by inline `borderTop: 1px` |
| Admin AddCredits history | in a modal, see modal spec | | |

### C. Toolbar and filters

**Toolbar layouts**

| Page | Structure |
|---|---|
| Admin Prospects | `flex flex-wrap items-center gap-3` (12px): search (`relative flex min-w-[220px] flex-1`), then two `SelectTrigger h-9 w-[155px]`. No wrapper card, no padding |
| Admin Docs | `flex flex-col gap-2.5 md:flex-row md:items-center`: stacked on mobile (10px gap), row at 768px+; search `flex-1`, selects `h-10 w-full md:w-[180px]` and `md:w-[160px]` |
| Admin Domains | card bar `flex flex-wrap items-center gap-3 rounded-lg border p-3` (8px radius, 12px padding): label `text-[12px] font-bold uppercase tracking-[.06em]` then `SelectTrigger h-9 w-[220px]` |
| Client Prospects | search alone (`relative max-w-sm`, 384px max) then a pill tab row below, each its own block in the page `gap-6` |
| Client Billing (lg+) | inside the table card: `flex items-center justify-between mb-3`, left count text 13px, right `SelectTrigger h-8 w-[160px] text-[13px]` |
| Admin Monitoring (Errors tab) | `flex items-center justify-end gap-2 md:gap-2.5`: toggle button + RefreshButton |

Alignment: search on the left, filters to its right; actions live in the page header, not the toolbar.

**Search input**

| Page | Input | Icon |
|---|---|---|
| Admin Prospects | `w-full rounded-lg border py-2 pl-9 pr-3 text-[13px]` (8px radius, 36px left padding, 12px right; height 8 + 19.5 + 8 + 2 = 37.5px) | `Search` `h-4 w-4` (16px) `absolute left-3` (12px), vertically centered by the flex parent |
| Admin Docs | `rounded-lg border py-2.5 pl-9 pr-3.5 text-[13px]` (height 41.5px) | `size={14}` `absolute left-3 top-1/2 -translate-y-1/2` |
| Client Prospects | `rounded-lg border py-2 pl-9 pr-3 text-[13px]`, wrapper `max-w-sm` | `size={14}` `left-3 top-1/2 -translate-y-1/2` |
| Admin Analytics (mobile) | `rounded-lg border py-2 pl-8 pr-3 text-[13px]` (32px left padding) | `size={14}` |
| Client warm list (modal) | `.warm-all-search`: 40px tall, `padding: 0 12px`, radius 8px | 15px |
| Placeholder | same 13px as the input text |
| Focus | border color and background swap, `outline-none`, no ring |
| Clear button | not present |
| Width | Prospects `min-w-[220px] flex-1`; Docs `flex-1`; client `max-w-sm` (384px) |

**Filter controls**

| Control | Values |
|---|---|
| Select trigger (base) | `flex h-10 w-full items-center justify-between rounded-md border px-3 py-2 text-sm`, chevron `h-4 w-4` at 50% opacity, `focus:ring-2 focus:ring-offset-2` |
| Select trigger (as used) | override `h-9` (36px) or `h-10` (40px) or `h-8` (32px), `rounded-lg` (8px), `text-[13px]`, fixed widths 155 / 160 / 180 / 220px, `focus:ring-0 focus:ring-offset-0` (ring removed, border color swap instead) |
| Select menu | `z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] rounded-md border shadow-md`, popper offset `translate-y-1` (4px), viewport `p-1`, matches trigger width |
| Select item | `rounded-sm py-1.5 pl-8 pr-2 text-sm` (6px vertical, 32px left for the check), check icon `h-4 w-4` in a `h-3.5 w-3.5` slot at `left-2` (8px) |
| Group label | `py-1.5 pl-8 pr-2 text-sm font-semibold` (defined, unused in pages) |
| Search in dropdown | not present |
| Pill filter tabs (admin Hot leads mobile, client Prospects) | `shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] whitespace-nowrap`; active: transparent border, 700; inactive: 1px border, 600. Count badge `rounded-full px-1.5 min-w-[18px] h-[18px] text-[10.5px] font-bold`. Row `flex items-center gap-2 overflow-x-auto` with hidden scrollbar |
| Pill filter tabs (client Dashboard mobile `.filter-tab`) | `border: 1.5px; border-radius: 99px; padding: 6px 13px; font-size: 13px; 600` (active 700, border transparent), `gap: 5px`; badge `min-width: 17px; height: 17px; padding: 0 4px; font-size: 11px; font-weight: 650`. Bar `gap: 7px; padding: 11px 16px`, sticky `top: 52px`, horizontal scroll, 1px bottom border |
| Pill selector (admin Analytics mobile) | `shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold`, inactive adds 1px border; row `-mx-5 px-5 pb-1 flex gap-2 overflow-x-auto` (bleeds to card edge) |
| Public Blog category pills | `rounded-full border h-9 px-4 text-[13.5px]` (36px), row `flex flex-wrap justify-center gap-2` |
| Segmented control (admin Blog) | wrapper `inline-flex w-fit rounded-xl border p-1` (12px radius, 4px padding); buttons `rounded-lg px-4 py-1.5 text-[13px] font-semibold` (8px radius); active is a filled button |
| Toggle button (Monitoring "Show resolved") | `rounded-xl border px-4 py-2 text-[13px] font-semibold`; active state swaps border and tint, label text changes |
| Date range | Billing `Select` with preset ranges (`h-8 w-[160px]`). Month switcher, date range picker: not present on pages |
| Clear filters link | not present |
| Active filter indicator | count badges inside tabs; no separate active-filter chips |
| Result count | page header description (`{n} clients`, `{n} total across all clients`, `{n} row(s) in this view`), Billing count text 13px above table. "Showing X of Y": not present (pagination shows "Page N of M") |
| Mobile behavior | tabs become horizontally scrolling pills; selects either keep fixed widths and wrap (admin Prospects) or go full width stacked (admin Docs). Filter sheets: not present |

### D. Tabs and segmented navigation

| Tab bar | Values |
|---|---|
| `.atbl-tabs` container | `display: flex; align-items: center; border-bottom: 1px solid; padding: 0 4px` |
| Tab (Hot leads, inside table card) | `-mb-px cursor-pointer border-b-2 px-4 py-3 text-[13px] font-semibold transition-colors` (16 / 12px padding; height 12 + 19.5 + 12 + 2 = 45.5px) |
| Tab (Monitoring, page level) | same plus `shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap`; container adds `gap-1` (4px) and `overflow-x-auto` with hidden scrollbar; optional 14px leading icon |
| Active indicator | 2px bottom border (`border-b-2`), overlapping the container's 1px line (`-mb-px`); inactive tabs keep a transparent 2px border |
| Indicator animation | none (color transition only, 150ms) |
| Count badge in tab | `ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10.5px] font-bold` (Hot leads) or in the `gap-1.5` flow (Monitoring) |
| Client Dashboard desktop `.filter-tab` | underline tabs: `padding: 13px 10px; font-size: 13.5px; 500` (active 600), `border-bottom: 2px; margin-bottom: -1px`; bar `padding: 0 4px; gap: 0`, static |
| Bottom nav active pill (client mobile) | `.cbnav-pill { inset: 0; border-radius: 11px }` in a 34 x 32px box, animated between tabs with framer `layoutId="cbnav-pill"`, spring `stiffness: 420, damping: 32` |
| Overflow | horizontal scroll, scrollbar hidden (`scrollbarWidth: 'none'`) |

### E. Pagination

Pattern used everywhere in the app ("Previous / Next" with a page label):

| Variant | Container | Buttons |
|---|---|---|
| Admin pages and client Prospects / Approvals (inline copies) | own card below the table: `flex items-center justify-between rounded-lg border px-4 py-3 text-[12.5px]` (8px radius, 16 / 12px padding) | `pagBtnCls`: `rounded-lg border px-3.5 py-1.5 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40`; height 6 + 18.75 + 6 + 2 = 32.75px; gap `gap-2` (8px) |
| `Pagination` (admin CampaignsAndLeads) | inside the card: `flex items-center justify-between border-t px-4 py-3 text-[12.5px]` (no own border box) | same as `pagBtnCls` |
| `.dash-pagination` (client Dashboard) | `padding: 12px 16px; border-top: 1px` | `.dash-page-btn { font-size: 12.5px; 600; padding: 6px 14px; border-radius: 6px; border: 1px }`, disabled `opacity: 0.4` |
| Billing `Pagination` | `flex items-center justify-between pt-4 mt-2 border-t`, label 13px | `text-[13px] font-medium px-3 py-1.5 rounded-[8px] border`, disabled `opacity-40` |
| Public Blog | centered `flex flex-wrap justify-center gap-2 mt-16`, numbered: `flex h-9 min-w-9 items-center justify-center gap-1 rounded-full border px-3 text-[13px] font-semibold` (36px circles), ellipsis `px-1 text-[13px]`, current page filled with `aria-current="page"`, disabled as `<span aria-disabled>` |

| Property | Value |
|---|---|
| Position | directly below the table; admin uses the page `gap-6` (24px) above it, except Campaigns where it sits flush (no wrapper) |
| Page indicator | "Page {n} of {total}" on the left |
| Rows per page control | not present (fixed `PAGE_SIZE`, e.g. 15 on admin Clients) |
| Hidden when | `totalPages <= 1` |
| Mobile | same component, placed after the mobile card list |

### F. Buttons

There is no shared button component in the app; these class strings are copy-pasted per file.

| Variant | Classes | Resolved |
|---|---|---|
| Primary (`primaryCls`) | `cursor-pointer whitespace-nowrap rounded-xl border-0 px-4 py-2 text-[13px] font-bold transition-colors disabled:opacity-50` | 12px radius, 16 / 8px padding, 13px / 700, height 35.5px |
| Ghost / secondary (`ghostCls`) | `... rounded-xl border px-4 py-2 text-[13px] font-semibold ...` | same, 1px border, 600, height 37.5px |
| Danger (`dangerCls`) | as primary with destructive fill | |
| Danger outline | `rounded-xl border px-4 py-2 text-[13px] font-bold` (Blog Reject) or `rounded-md border px-3 py-1.5 text-[12px] font-bold` (client Approvals bulk reject) | |
| Ghost tertiary (delete) | `rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-[12px] font-semibold`, hover shows a border and tint | |
| Small (card actions) | `rounded-lg border px-3 py-1.5 text-[12px] font-semibold` | 12 / 6px padding, height 32px |
| Extra small (row) | `rounded-lg border px-2 py-1 text-[11px] font-semibold` / `font-bold` | 8 / 4px padding, height 26.5px |
| Approve in row | `rounded-md border-0 px-3.5 py-1.5 text-[12px] font-bold` (admin) / `rounded-md px-3 py-1.5` (client) | |
| Pagination | `rounded-lg border px-3.5 py-1.5 text-[12.5px] font-semibold` | |
| Icon only | `RowMenu` 28px (`h-7 w-7 rounded-lg`); `HelpButton` 28px `rounded-full`, icon 14px; header bell 32px (`h-8 w-8 rounded-lg`, icon 17px); CampaignDetail edit/delete 32px; FAB 56px (`size-14`, icon 26px) |
| With icon | `inline-flex items-center gap-1.5` (6px) and 14px icon (RefreshButton, Generate); `gap-1` (4px) with 11px icon in chips |
| Refresh (`RefreshButton`) | wraps the passed class (usually `ghostCls`), `inline-flex items-center gap-1.5`, 14px icon spinning while fetching, `disabled:opacity-60`; below 768px label hidden and padding `max-md:px-2.5` (icon only, 10px sides); "Updated X ago" `text-[11px]` hidden below 768px |
| Floating action (`MobileFab`) | `fixed right-5 z-40 grid size-14 place-items-center rounded-full`, bottom `calc(20px + env(safe-area-inset-bottom))` (client Campaigns: `84px + safe area` to clear the bottom nav), shadow `0 8px 24px -6px` + `0 2px 6px`, 1px ring, `active:scale-95`, only below 768px |
| Loading | label swap (`'Saving…'`, `'Adding…'`), refresh icon `animate-spin`, inline 12px spinner (`h-3 w-3 animate-spin rounded-full border-2`) for running jobs |
| Disabled | `disabled:opacity-50` (primary), `opacity-40` (pagination, RowMenu items), `opacity-60` (refresh), plus `cursor-not-allowed` on some |
| Full width | mobile card primary (`flex-1` in ApprovalQueue card footer), Billing checkout (`.checkout-btn { padding: 15px 0; border-radius: 14px; font-size: 15.5px }`, overridden to 8px by `rounded-lg`) |
| shadcn `Button` (marketing only) | `h-10 px-4 py-2` default, `h-9 px-3` sm, `h-11 px-8` lg, `h-10 w-10` icon; `rounded-md text-sm font-medium`; `focus-visible:ring-2 ring-offset-2` |

### G. Cards and stat tiles

**Stat tiles**

| Tile | Container | Label | Value | Extra |
|---|---|---|---|---|
| `StatTile` (admin ApprovalQueue, copied in client Approvals) | `flex flex-col rounded-lg border px-5 py-[18px]` (8px radius, 20 / 18px padding), `boxShadow: 0 1px 2px`, hover `shadow-md` (admin) / `shadow-sm` (client), `cursor-pointer` when clickable; one tile can be "accent" (filled) | icon 13px + label `text-[11px] font-bold uppercase tracking-[.08em] leading-none`, row `gap-[5px] mb-[10px]` | `text-[30px] font-extrabold leading-none tracking-[-0.04em] tabular-nums mb-[7px]` | sub line `text-[11px] font-semibold leading-none` |
| `MetricTile` (admin Analytics) | `flex flex-col gap-1 rounded-lg border px-5 py-[18px]` | `text-[12px]` below the value | `text-[28px] font-extrabold leading-none tracking-tight tabular-nums` | none |
| `StatTile` (ReplyBreakdown, toggle) | `button rounded-lg border px-3.5 py-2.5`, `aria-pressed`, container-query row layout at 420px | `text-[12.5px] font-semibold` | `text-[16px] font-bold` + `text-[12px]` percent | active state border + fill |
| `.stat-card` (client Dashboard) | `border: 1px; border-radius: 8px; padding: 14px 16px 12px`, hover `box-shadow: 0 2px 12px` + stronger border, `transition: box-shadow 0.14s, border-color 0.14s`; whole card is a `button` | `.stat-label { 11.5px; 500 }`, header `gap: 5px; margin-bottom: 8px` | `.stat-value { 30px; 800; letter-spacing: -0.04em; line-height: 1; margin-bottom: 6px }` | `.stat-trend` (11px / 600, gap 3px) is defined but the JSX does not render it, and the icon is computed but not rendered |
| `.an-kpi-card` (client Analytics) | `padding: 14px 16px; border-radius: 14px; border: 1px; gap: 2px` | `12px / 600` | `22px / 800, letter-spacing -0.02em` | sub `11.5px`; warn variant swaps border |
| `SkeletonTiles` | `rounded-lg border px-5 py-[18px]`, value bar `h-8 w-16`, label bar `h-2.5 w-24` | | | |

**Stat grids**

| Grid | Columns | Gap |
|---|---|---|
| Admin Approvals, client Approvals, admin Analytics | `grid grid-cols-2 md:grid-cols-4` | `gap-3` (12px) |
| Client Dashboard `.stat-grid` | `1fr 1fr`, 768px+ `repeat(4, 1fr)` | `gap: 10px`, `padding: 4px 18px 18px` (768px+: `0 28px 24px`) |
| Client Analytics `.an-kpi-grid` | `1fr 1fr`, 768px+ `repeat(5, 1fr)` | `gap: 10px`, `padding: 4px 18px 18px` |
| ReplyBreakdown toggles | `grid grid-cols-2` | `gap-3`, `mt-5` |

Trend / delta indicator: not rendered anywhere (see `.stat-card` note).

**Content cards**

| Card | Values |
|---|---|
| Admin chart / panel card (`ChartCard`, ReplyBreakdown `CARD`) | `rounded-lg border p-5` (8px radius, 20px padding), shadow `0 1px 2px` (4%) + `0 8px 28px` (6%); title `h3 m-0 mb-4 text-[14.5px] font-bold` (16px below) |
| Admin A/B test card | `rounded-lg border p-5`, header `mb-4 flex items-center justify-between` |
| Admin Blog generator card | `rounded-xl border p-4 flex flex-col gap-3`, title `text-[13.5px] font-bold`, sub `mt-0.5 text-[12px]` |
| Mobile row card (admin + client list pages) | `rounded-xl border p-4` (12px radius, 16px padding); title row `flex items-start justify-between gap-2` or `gap-3`, name `font-bold text-[14px] truncate`; meta `mt-1` / `mt-1.5 text-[12px]`; action row `mt-3 border-t pt-3 flex flex-wrap items-center gap-2`; list `flex flex-col gap-3` |
| Client Dashboard `.lead-row` | `border: 1px; border-radius: 12px; padding: 14px 16px; min-height: 68px; gap: 12px`, 8px status dot, name 14.5px / 650, meta 12.5px, excerpt 13px 2-line clamp; hover `box-shadow: 0 2px 12px`; list `padding: 12px 14px 0; gap: 8px` |
| Client settings / targeting group card | `overflow-hidden rounded-2xl border` (16px radius), rows `p-5` separated by `border-t`; group label above `mb-2 px-0.5 text-[10.5px] font-bold uppercase tracking-[.08em]`; card `mb-6` |
| Client Results insight card | `rounded-2xl border px-5 py-4`, `flex items-start gap-2.5`, title `text-[14.5px] font-bold`, body `mt-1 text-[13px] leading-relaxed` |
| Client Results funnel card | `rounded-2xl border p-5`, steps `px-3 py-1 min-w-[88px]`, value 22px / 800, label 11px, progress bar `h-1 rounded-full` |
| Client Analytics `.an-chart-card` / `.an-table-card` | `padding: 16px; border-radius: 14px; border: 1px; margin: 0 18px 16px`; title `.an-section-title { 14.5px; 800; margin: 0 0 10px }` |
| Client Billing credit hero | `.credit-hero { padding: 24px 24px 22px; border-radius: 18px; margin-bottom: 28px }` but the element also has `rounded-lg`, so the rendered radius is 8px; number 64px, label 17px |
| Client Billing pack row | `.pack-row { padding: 16px 18px; border-radius: 14px; gap 14px }` with `rounded-lg` utility (8px wins); 20px radio, 7px dot; name 15px, price 19px; list `gap: 10px`, `md:grid grid-cols-3 md:gap-4` |
| Warm prospects panel | `.warm-panel { margin: 0 18px 16px; border-radius: 14px; border: 1px; overflow: hidden }`, head `padding: 14px 16px 12px; gap: 10px`, title 14.5px / 800, sub 12.5px |
| Public Blog card | `flex flex-col border pb-4`, image `aspect-[2/1]`, body `pt-5 px-4`, title 16px bold `leading-snug`, excerpt 13.5px 3-line clamp, footer `mt-4 border-t pt-4`; grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12` |

### H. Pills, badges, tags

| Pill | Classes / CSS | Size |
|---|---|---|
| `.atbl-pill` (table status) | `display: inline-flex; border-radius: 5px; padding: 2px 7px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; line-height: 1.6` | height 2 + 16.8 + 2 = 20.8px |
| `.atbl-pill` with icon | adds `inline-flex items-center gap-1`, 10px icon (Domains scope) |
| `.atbl-pill w-[120px] justify-center` | fixed width invite pill (Clients) | 120px |
| Mobile card status pill | `inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]` | height 4 + 16.5 + 4 = 24.5px |
| Small round pill | `rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.04em]` (Clients mobile, EuBadge) | height 19px |
| Result chip | `inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold`, optional `Info` 11px icon with `gap-1` | |
| Notice chip | `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold` (client Prospects, admin Campaigns mobile) | |
| Status toggle pill (admin Campaigns mobile) | `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[.04em]` with an 8px dot | |
| Client Prospects panel badge | `inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold` | |
| Settings status pill | `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide` (0.025em) | |
| Targeting "updated" pill | `rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide` | |
| `.status-pill` (client Dashboard) | `font-size: 11px; 700; border-radius: 5px; padding: 2px 7px; uppercase; letter-spacing: 0.05em; line-height: 1.6` | |
| `.waiting-pill` | `11.5px; 600; border-radius: 5px; padding: 2px 8px; line-height: 1.6` | |
| `.pay-pill` (Billing) | `font-size: 11px; border-radius: 99px; padding: 3px 9px` | |
| `.warm-opens-badge` | `11.5px; 700; radius 999px; padding: 3px 9px` | |
| Count badge (tabs) | `rounded-full px-1.5 min-w-[18px] h-[18px] text-[10.5px] font-bold` or `px-1.5 py-0.5 text-[10.5px]`; `.filter-badge` 17 x 17px min, 11px | |
| Nav badges | admin bell `h-[15px] min-w-[15px] rounded-full px-1 text-[9.5px]`; client sidebar `.cside-nav-badge { min-width: 18px; height: 18px; padding: 0 5px; font-size: 10.5px }`; bottom nav `.cbnav-badge-dot { min-width: 15px; height: 15px; padding: 0 3px; font-size: 9px }` | |
| Source tag (Monitoring) | `rounded-sm border px-2 py-0.5 font-mono text-[11px]` (mobile uses `rounded`, both 4px in admin) | |
| Tag chip (read-only) | `rounded-full border px-2.5 py-1 text-[12px]`, list `flex flex-wrap gap-1.5` | |
| Dots inside pills | 8px (`h-2 w-2`) status dot in the toggle pill; 6px (`h-1.5 w-1.5`) repeated-failure dot | |

### I. Empty, loading and error states

**Empty state (page level, shared pattern copied on every list page)**

```
<div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed p-10 text-center">
  <strong className="text-[15px] font-bold">Title.</strong>
  <span className="text-[13px]">Description.</span>
  <button className={`${primaryCls} mt-2`}>+ New ...</button>   // optional
</div>
```

| Property | Value |
|---|---|
| Container | 16px radius, 1px dashed border, 40px padding (`p-10`), centered |
| Gap | `gap-1` (4px); `gap-2` (8px) when a button is included (Clients, client Campaigns, Domains) |
| Title | 15px / 700 |
| Description | 13px; max width only on Domains (`max-w-[440px]`) |
| Button | primary, `mt-2` (8px) |
| Illustration / icon | not present |
| In-table / filtered empty (Hot leads) | `py-10 text-center text-[13px]` inside the card; mobile adds `rounded-xl border` |
| No-results after filtering | same page-level box with "No matches." / "Try adjusting your filters or search query." |
| Client Dashboard `.leads-empty` | `padding: 56px 24px; gap: 6px`, title 16px / 700 with `margin-bottom: 2px`, text 13.5px / 1.5, note 13px; link-style button 13.5px / 600 underlined with 3px offset |
| Client Analytics `.an-empty` | `margin: 20px 18px; padding: 28px 20px; border-radius: 14px; border: 1px dashed; font-size: 13.5px` |
| Billing `.bill-empty` | `padding: 40px 20px; gap 4px; font-size: 14px`, title 15px |
| Modal list empty | see modal spec |

**Loading**

| Skeleton | Values |
|---|---|
| `SkeletonTable` | wrapper `overflow-hidden rounded-lg border`; header row `flex gap-4 border-b px-4 py-3` with `h-2.5` (10px) bars; body rows `flex gap-4 border-b px-4 py-4 last:border-0` with `h-3` (12px) bars, first column `max-w-[160px]`; bars `animate-pulse rounded-md`; rows default 6, pages pass `PAGE_SIZE` |
| `SkeletonCards` | `flex flex-col gap-3`, card `rounded-xl border p-4`, bars `h-4 w-36`, pill `h-5 w-16 rounded-full`, then `h-3 w-48` and `h-3 w-28` |
| `SkeletonTiles` | grid matching the tile grid, tile `rounded-lg border px-5 py-[18px]`, bars `h-8 w-16` and `h-2.5 w-24` |
| `SkeletonChart` | `rounded-lg border p-5`, title bar `h-4 w-32 mb-4`, chart block `h-[240px] w-full rounded-lg` |
| Client Dashboard | mobile rows `borderRadius: 14, padding: '16px 18px', minHeight: 72`, 9px dot (`h-2.25`), bars `h-4 w-2/5`, `h-5 w-14 rounded-full`, `h-3`; desktop table rows with `h-4 w-40`, `h-3 w-24`, `h-5 w-16 rounded-full` |
| Admin Blog list | `h-14 animate-pulse rounded-xl border` rows, `flex flex-col gap-2` |
| Client Analytics | `.an-skeleton-card { height: 84px; border-radius: 14px; animation: an-shimmer 1.4s ease infinite }` (the only shimmer gradient; everything else is `animate-pulse`) |
| Settings / Targeting / Results | `animate-pulse p-5` blocks: `h-4 w-40`, `h-9 w-full rounded-lg`, `h-16 w-full rounded-lg` |
| Public Blog | card skeleton with `aspect-[2/1]` image block and `h-3` / `h-4` bars |
| Refetch dimming | client Prospects table `opacity: 0.6` while fetching, `transition: opacity 0.15s` |
| Spinners | refresh icon 14px `animate-spin`; inline job spinner 12px (`h-3 w-3 border-2`) |

**Error banners**

| Banner | Values |
|---|---|
| Standard (admin + client list pages) | `rounded-xl border px-4 py-3 text-[13px]` (12px radius, 16 / 12px padding), no icon |
| Client secondary pages | `mb-5 rounded-xl border px-4 py-3.5 text-[13.5px]` |
| Warning with icon (`CountryHoldBanner`, client limit banners) | `flex items-start gap-3 rounded-xl border px-4 py-3.5`; icon chip `h-7 w-7 rounded-full` (28px) with 15px icon; text `pt-0.5 text-[13px] leading-snug`, optional context `mt-1 block text-[12px]` |
| Client Dashboard `.lead-error-msg` | `font-size: 13px; padding: 12px 18px`, bottom border, full bleed |
| Client Analytics `.an-error` | `margin: 0 18px 14px; padding: 10px 14px; border-radius: 10px; font-size: 13px` |
| Billing `.bill-error` | `font-size: 13.5px; padding: 12px 15px; border-radius: 10px` |
| Approval nudge (`.appr-nudge`) | `gap: 10px; margin: 0 18px 14px; padding: 12px 16px; border-radius: 12px`, 16px icons, text 13.5px |

### J. Forms on pages

| Element | Values |
|---|---|
| Input (client pages, `inputCls`) | `w-full rounded-lg border px-3.5 py-2.5 text-[13px] outline-none transition-colors` (41.5px tall) |
| Label (`fieldLbl`) | `mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em]` |
| Helper text | `mt-1 text-[11px]` (e.g. "Saving…", empty hints) |
| Error text | page-level banner (see I); inline field errors on pages: not present |
| Textarea | `inputCls` + `resize-y` (Targeting notes) |
| Field layout | Targeting: one field per `p-5` row in a divided card; label row `mb-1.5 flex items-center justify-between gap-2` with an optional status pill |
| Grid layouts | not present on pages (only in modals) |
| Switch (Settings) | `button role="switch" relative h-6 w-11 rounded-full` (44 x 24px), knob `absolute top-0.5 h-5 w-5 rounded-full` (20px) at `left: 2` / `left: 22`, `transition-all` |
| Settings row (link / button) | `flex w-full items-center gap-3 p-5 text-left transition-colors`, icon chip `h-9 w-9 rounded-xl` (36px), title `text-[15px] font-bold`, sub `text-[13px] mt-0.5` |
| Settings section | `p-5`, title `h2 text-[15px] font-bold flex items-center gap-2 mb-1` with 16px icon, body `text-[13px] mb-3` / `mb-4`, button `rounded-lg border px-4 py-2 text-[13px] font-bold` |
| Focus ring | none on page inputs (border color swap only). One explicit ring: ReplyBreakdown `focus-visible:outline-2 focus-visible:outline-offset-2` (2px outline, 2px offset). shadcn `Button`: `focus-visible:ring-2 ring-offset-2` |
| Disabled | `disabled:opacity-50` |

### K. Lists and rows outside tables

| List | Values |
|---|---|
| Admin Hot leads mobile list | card `rounded-xl border overflow-hidden`, `divide-y`; row `flex w-full items-start gap-3 px-4 py-4 text-left`; 8px status dot `mt-1.5`; name 14px / 600; meta `mt-0.5 text-[12px]`; excerpt `mt-1.5 line-clamp-2 text-[13px]`; trailing 15px chevron |
| Admin Blog list | card `overflow-hidden rounded-xl border`; row `flex items-center gap-3 px-4 py-3`, separated by `border-t`; leading category pill `rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.04em]`; title `truncate font-semibold`; small action `rounded-lg border px-2.5 py-1.5 text-[11.5px]`; 16px chevron |
| Reply list (ReplyBreakdown) | `max-h-[420px] overflow-y-auto`; items `border-t py-2.5 first:border-t-0 first:pt-0`; name 13px / 700 |
| Donut legend rows | `grid grid-cols-[10px_1fr_auto_auto] items-center gap-x-3 rounded-lg px-3 py-2 text-[13px]`, 10px dot, `max-w-[420px]` list |
| Warm prospects rows | `.warm-row { padding: 12px 16px; gap: 8px; border-top: 1px }`, name 13.5px / 700, meta 12px, phone 12px mono, call button 30 x 30px radius 9px, secondary button `padding: 6px 10px; border-radius: 9px; 12px / 600` |
| Billing card lists (below lg) | `.payment-item { padding: 14px 16px; border-radius: 12px }` (with `rounded-lg` utility: 8px), list `gap: 8px`; `.activity-item { padding: 13px 16px }` |
| Settings grouped rows | see J |
| Notification rows | in the bell modal (see modal spec) |
| Activity feed | not present beyond Billing activity |

### L. Motion

| Element | Motion |
|---|---|
| Buttons, tabs, pills | `transition-colors` 150ms default easing; pill tabs use `transition-all` |
| Table rows | `transition: background 0.1s` (`.atbl`, `.dash-leads`); client Analytics rows 0.12s |
| Stat tiles | `transition-shadow` 150ms to `shadow-md` (admin) / `shadow-sm` (client); `.stat-card` 0.14s box-shadow + border |
| Press | `MobileFab active:scale-95`; bottom nav item `:active { transform: scale(0.93) }` |
| Bottom nav pill | framer `layoutId` spring, stiffness 420, damping 32; label weight transition 0.15s; nav color 0.18s |
| Public Blog card image | `transition-transform duration-300 group-hover:scale-[1.04]`; arrow `group-hover:translate-x-0.5` (2px) |
| Page / section enter | not present in app pages (marketing `Home.tsx` uses `staggerChildren: 0.11`) |
| Skeleton to content | instant swap, no crossfade; refetch dims to 60% opacity over 0.15s (client Prospects) |
| Tab indicator | no animation (instant border swap) |
| Dropdown open / close | Radix + tw-animate-css: `fade-in-0 zoom-in-95` and `slide-in-from-top-2` (8px) on open, `fade-out-0 zoom-out-95` on close, library default duration. `RowMenu`: no animation |
| Reduced motion | `index.css` disables CSS animations and transitions; framer motion (bottom nav pill) is not covered |

### M. Responsive behavior

| Breakpoint | Changes |
|---|---|
| below 768px (admin uses `max-width: 767px` so it never overlaps `md:`) | Admin sidebar replaced by a sticky top bar (`padding: 12px 18px`) and fullscreen menu; client shows mobile top bar + fixed bottom nav. Page header switches to the mobile grid. Tables `hidden md:block` are replaced by card lists (`md:hidden`). Primary header button hidden, `MobileFab` shown. Pill tabs scroll horizontally. RefreshButton collapses to an icon |
| 640px (`sm`) | public Blog grid 2 columns; some page grids switch |
| 768px (`md`) | tables appear; stat grids go to 4 columns (client Analytics 5); toolbars go from stacked to row (admin Docs); `.content` grows to 720px with 32px padding |
| 1024px (`lg`) | `.content` max width 1100px; Billing switches from card lists to tables; admin Analytics A/B + DNC side by side; public Blog 3 columns |
| Tables without a mobile card view | admin Domains, Monitoring escalated / notifications tables, admin Results, client Prospects: they keep `min-width: 640px` and scroll horizontally inside the card |
| Columns hidden per breakpoint | not present (whole table swaps to cards instead) |
| Touch targets | FAB 56px; bottom nav items full height of 32px icon box plus label; pill tabs about 32px tall; `RowMenu` 28px (desktop only). No explicit 44px minimum on pages |
| Safe area | bottom nav `calc(7px + env(safe-area-inset-bottom))`; FAB offset `calc(20px + env(...))` / `calc(84px + env(...))`; admin mobile page bottom padding 96px |

### N. Spacing scale and typography

**Spacing values used on pages (px):** `1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 40, 48, 56, 64, 80, 96`

Most common, by role:

| Value | Where it repeats |
|---|---|
| 24px | page section gap (`gap-6`), client `.content` padding, card bottom margins (`mb-6`) |
| 16px | table cell sides (`16px`), card padding (`p-4`), pagination sides (`px-4`), banners (`px-4`) |
| 12px | table cell vertical (`12px`), pagination vertical (`py-3`), toolbar gap (`gap-3`), grid gaps (`gap-3`), card action row (`mt-3 pt-3`) |
| 8px | button group gaps (`gap-2`), icon gaps, pill tab gaps |
| 20px | content card padding (`p-5`), stat tile sides (`px-5`), client secondary page spacing (`mb-5`) |
| 4 / 6px | label and meta offsets (`mt-1`, `mt-0.5`, `mb-1.5`) |
| 18px | client mobile side gutters (Dashboard, Analytics), stat tile vertical (`py-[18px]`) |
| 28 / 32px | desktop page padding (admin `28px 32px`, client `32px`, Dashboard `28px`) |

Rhythm: a 4px grid with 4 / 8 / 12 / 16 / 20 / 24 as the working set; tables run on 12 x 16, cards on 16 or 20, sections on 24. The client CSS screens add off-grid values (5, 7, 9, 11, 13, 14, 18, 22) from hand-written CSS.

**Typography**

| Role | Size | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|
| Page title (admin + client list pages) | 26px (22px below 768px) | 800 | 1.5 (1.2 below 768px) | -0.025em |
| Page title (client Dashboard / Analytics) | 22px | 800 | 1.1 | -0.03em |
| Page title (client Results / Targeting / Settings) | 22px | 800 | 1.5 | -0.025em |
| Page description | 13px (13.5px on client CSS pages) | 400 | 1.5 | normal |
| Section title (Analytics) | 18px | 700 | 1.5 | normal |
| Card title | 14.5px (`ChartCard`, insights, `.an-section-title`), 15px (Settings, Results table header) | 700 / 800 | 1.5 | normal |
| Table header | 10.5px | 700, uppercase | 1.5 | 0.11em (`.atbl`, Dashboard, Billing); 0.06em (Results, Targeting); `.an-table` 11.5px / 0.02em |
| Table cell | 13px | 400, primary 700 | 1.5 | normal |
| Table secondary text | 11px or 12px | 400 | 1.5 | normal |
| Field label | 11px | 700, uppercase | 1.5 | 0.06em |
| Group / eyebrow label | 10.5px | 700, uppercase | 1.5 | 0.08em |
| Helper text | 11px | 400 | 1.5 | normal |
| Button | 13px (12 / 12.5 / 11px small) | 700 primary, 600 secondary | 1.5 | normal |
| Pagination | 12.5px | 600 buttons, 400 label | 1.5 | normal |
| Pill (table) | 10.5px | 700, uppercase | 1.6 | 0.06em |
| Pill (round) | 11px | 700, uppercase | 1.5 | 0.04em |
| Count badge | 10.5px | 700 | 1.5 | normal |
| Stat value | 30px (`StatTile`, `.stat-card`), 28px (`MetricTile`), 22px (`.an-kpi-value`) | 800 | 1 | -0.04em / -0.025em / -0.02em |
| Stat label | 11px uppercase 0.08em (`StatTile`), 12px (`MetricTile`), 11.5px / 500 (`.stat-label`) | 700 / 400 / 500 | 1 / 1.5 | |
| Empty title / text | 15px / 13px | 700 / 400 | 1.5 | normal |

---

## 3. Comparison (Step 3)

### 3.1 Every table

Row height is for a single-line row computed from padding and the 13px x 1.5 line box plus the 1px divider.

| File | Purpose | Cols | Row height | Cell padding | Hover | Pagination | Search | Filters | Row actions | Mobile | Shared (`.atbl`) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| admin/ApprovalQueue.tsx | Drafts awaiting approval | 5 | 44.5px | 12 / 16 | yes | yes (inline) | no | no | Approve + RowMenu | cards | yes |
| admin/Clients.tsx | Client list | 7 | 44.5px | 12 / 16 | yes, clickable, underline | yes (inline) | no | no | inline button + RowMenu | cards | yes |
| admin/Prospects.tsx | All prospects | 6 | 44.5px | 12 / 16 | yes | yes (inline) | yes | status, category | RowMenu | cards | yes |
| admin/CampaignsAndLeads.tsx Campaigns | Campaigns | 6 | content driven (multi-line first cell) | 12 / 16 | yes, clickable | yes (`Pagination`) | no | no | Edit / Approve + RowMenu | cards | yes |
| admin/CampaignsAndLeads.tsx HotLeads | Hot leads | 5 | 44.5px | 12 / 16, `align-top` | yes, clickable | yes (`Pagination`, inside card) | no | tabs (5) | chevron | divided list + pill tabs | yes, with `.atbl-tabs` |
| admin/Monitoring.tsx Escalated | Escalated leads | 4 | 44.5px | 12 / 16 | yes | no | no | no | no | table scrolls | yes |
| admin/Monitoring.tsx Notifications | Failed notifications | 4 | 44.5px | 12 / 16 | yes | no | no | no | no | table scrolls | yes |
| admin/Monitoring.tsx Errors | Error log | 5 | content driven | 12 / 16 | yes | yes (inline) | no | show resolved toggle | Resolve button | cards | yes |
| admin/Domains.tsx | Blocked domains | 6 | 44.5px | 12 / 16 | yes | no | no | scope select | RowMenu | table scrolls | yes |
| admin/DocsAdmin.tsx | Docs articles | 6 | two-line | 12 / 16 | yes, clickable | no | yes | category, audience | no (version text) | cards | yes |
| admin/AdminResults.tsx | Client funnels | 6 | 44.5px+ | 12 / 16 | yes | no | no | no | no | table scrolls | yes |
| client/Dashboard.tsx | Hot leads | 5 | 44.5px | 12 / 16 | yes | yes (`.dash-pagination`) | no | tabs (filter bar) | chevron | row cards | no (`.dash-leads table`, same values) |
| client/Prospects.tsx | Prospect pipeline | 7 | two-line | 12 / 16 | yes, cells clickable | yes (inline, server offset) | yes | status pill tabs | note editor | table scrolls | yes |
| client/Campaigns.tsx | Campaigns | 6 | 44.5px | 12 / 16 | yes, clickable | no | no | no | chevron | cards | yes |
| client/Approvals.tsx | Drafts with bulk select | 5 (incl. checkbox) | 44.5px+ | 12 / 16, checkbox `px-3` | yes | yes (inline) | no | no | Approve / Edit buttons | cards | yes |
| client/Analytics.tsx | Per-campaign stats | 7 | 10 + 19.5 + 10 + 1 = 40.5px | 10 | yes, selectable | no | no | no | row select | scrolls | no (`.an-table`) |
| client/Billing.tsx Payments | Payments | 4 | 12 + 21 + 12 + 1 = 46px | 12 / 8 | yes | yes (Billing `Pagination`) | no | date range | no | card list below lg | no |
| client/Billing.tsx Activity | Credit ledger | 3 | 46px | 12 / 8 | yes | yes | no | date range | no | card list below lg | no |
| client/Results.tsx | By category | 5 | 12 + 19.5 + 12 + 1 = 44.5px | 12 / 20 first, 12 / 12 others | no | no | no | no | no | scrolls | no |
| client/TargetingProfile.tsx | Category performance | 5 | 44.5px | as Results | no | no | no | no | no | scrolls | no |

### 3.2 Same element, different styling

1. **Page title:** 26px / 800 on list pages, 22px / 800 on Dashboard, Analytics, Results, Targeting, Settings, and 24px / 700 (`text-2xl font-bold`, an `h2`) on Billing. Title icons are 40, 36 or 32px with 4 or 8px gaps.
2. **Page structure:** admin pages use `gap-6`; client CSS pages (Dashboard, Analytics) use per-section margins with 18 / 28px gutters; Results / Targeting / Settings use `mb-5` / `mb-6`.
3. **Button radius:** `rounded-xl` (12px) for header and modal buttons, `rounded-lg` (8px) for card and row buttons and all client Settings / Results buttons, `rounded-md` (6px) for Approve buttons and the ApprovalQueue Refresh button, `.dash-page-btn` 6px, Billing pager 8px, cookie / docs buttons 10px.
4. **Button height:** primary 35.5px vs ghost 37.5px (border), pagination 32.75px, small 32px, row 26.5px, Settings 35.5 to 37.5px, shadcn `Button` 40px (marketing only).
5. **Refresh button:** `RefreshButton` everywhere except ApprovalQueue (inline copy with `rounded-md`), client Dashboard (`.filter-refresh` icon button, 7px padding) and Billing (text link `.bill-refresh`).
6. **Search input:** 37.5px (`py-2`, Prospects pages) vs 41.5px (`py-2.5`, Docs); icon 16px vs 14px; left padding 36px vs 32px (Analytics); width `flex-1 min-w-[220px]` vs `max-w-sm`.
7. **Select trigger height:** 32px (Billing), 36px (Prospects, Domains), 40px (Docs, all modals). Widths 155 / 160 / 180 / 220px.
8. **Toolbar container:** none (Prospects), bordered card `rounded-lg p-3` (Domains), stacked column (Docs).
9. **Pagination:** five implementations. Bordered card below table (most admin and client pages), `border-t` strip inside the card (CampaignsAndLeads `Pagination`, Dashboard), Billing strip with 13px text and `pt-4 mt-2`, and the numbered round pager on the public Blog. Button radius 8px vs 6px (`.dash-page-btn`), padding `px-3.5` vs `14px` vs `px-3`.
10. **Pill tabs:** Tailwind version (1px border, `px-3.5 py-1.5`, badge 18px) vs Dashboard CSS version (1.5px border, `6px 13px`, badge 17px, gap 5 vs 6px). Underline tabs: `px-4 py-3 text-[13px] 600` (`.atbl-tabs`) vs `13px 10px 13.5px 500` (Dashboard desktop).
11. **Status pills:** 5px-radius rectangles in tables (`.atbl-pill` 10.5px / 0.06em, `.status-pill` 11px / 0.05em) vs fully rounded pills in mobile cards (`px-2.5 py-1 text-[11px]` or `px-2 py-0.5 text-[10px]`), so the same status changes shape between desktop and mobile. Billing `.pay-pill` 11px with `3px 9px`.
12. **Stat tiles:** three different JSX tiles (`StatTile` 30px value with uppercase label, `MetricTile` 28px value with label below, ReplyBreakdown toggle tile) plus two CSS tiles (`.stat-card` 30px, `.an-kpi-card` 22px). Radius 8px vs 14px; padding `20 x 18` vs `16 x 14`; grid gap 12px vs 10px.
13. **Card radius:** `.atbl` 10px, `SkeletonTable` 8px, mobile row cards 12px, empty states 16px, client settings cards 16px, `.an-*` cards 14px, `.warm-panel` 14px, chart cards 8px. Billing CSS radii (18 / 14 / 12px) are silently overridden to 8px by `rounded-lg` on the same elements.
14. **Card padding:** 16px (mobile cards, `.an-*` cards), 20px (chart cards, settings rows), `20 x 18` (tiles), `24 24 22` (credit hero).
15. **Table header tracking:** 0.11em (`.atbl`, Dashboard, Billing) vs 0.06em (Results, Targeting) vs 0.02em at 11.5px (client Analytics). Cell padding 12 / 16 vs 10 vs 12 / 8 vs 12 / 20.
16. **Empty states:** standard dashed box (16px radius, 40px padding, 15 / 13px) vs `.leads-empty` (56 / 24px padding, 16 / 13.5px) vs `.an-empty` (14px radius, 28 / 20px) vs `.bill-empty` (40 / 20px, 15 / 14px).
17. **Error banners:** `px-4 py-3 text-[13px] rounded-xl` vs `px-4 py-3.5 text-[13.5px]` (client secondary pages) vs `.an-error` (10 / 14px, 10px radius) vs `.bill-error` (12 / 15px, 13.5px) vs full-bleed `.lead-error-msg`.
18. **Skeleton style:** `animate-pulse` everywhere except client Analytics' shimmer gradient.
19. **Mobile table strategy:** most tables swap to cards, but admin Domains, Monitoring (2 tables), admin Results and client Prospects keep a 640px scrolling table on phones.
20. **Unused shared code:** shadcn `Button` is unused in the app; `Screens.css` defines a full table / toolbar / pill system that is never imported; `.stat-trend` and the stat-card icon are computed but never rendered.

---

## 4. Page design rules (Step 4)

### 4.1 Frame

| Token | Value |
|---|---|
| Shell top bar | 52px |
| Sidebar | 252px, `18px 12px 16px` padding, nav item `8.5px 10px`, 13.5px |
| Page padding | desktop `28px 32px 40px` (admin) or `32px` (client `.content`); mobile `20px 16px` + bottom clearance (96px with FAB, 80px with bottom nav) |
| Client max width | 640px mobile, 720px at 768px, 1100px at 1024px |
| Section gap | 24px |
| Page header | title 26px / 800 / -0.025em (22px / line-height 1.2 below 768px), 40px icon optional with 4px gap, description 13px 4px below, actions right aligned with 8px gaps, primary action last and replaced by a FAB on phones |

### 4.2 Table

| Token | Value |
|---|---|
| Container | 10px radius, 1px border, `0 1px 2px` shadow, `overflow-x: auto`, table `min-width: 640px` |
| Header cell | `11px 16px 10px`, 10.5px / 700 / uppercase / 0.11em, nowrap, 1px divider below |
| Body cell | `12px 16px`, 13px, vertical middle, 1px row divider, none on last row |
| Row hover | background change, 0.1s |
| Columns | `table-fixed` + `<colgroup>` percentages; action column last, 6 to 16%, `px-3 text-right` |
| Primary cell | 700 weight, `truncate` with `title`; secondary line 11 or 12px, 2px above |
| Row actions | 28px kebab (`RowMenu`), menu 192px wide, 12px radius, items `8px 12px` 13px, 4px from trigger, flips above |
| Status | `.atbl-pill` (5px radius, `2px 7px`, 10.5px / 700 / uppercase / 0.06em) |
| Mobile | hide the table below 768px and render cards: `rounded-xl border p-4`, `gap-3` list, title row + meta + `mt-3 border-t pt-3` action row with 32px small buttons |
| Pagination | below the table in its own card: `rounded-lg border px-4 py-3 text-[12.5px]`, "Page N of M" left, Previous / Next right (`rounded-lg border px-3.5 py-1.5 text-[12.5px] font-semibold`, 8px gap, disabled 40% opacity); hidden when one page |

### 4.3 Toolbar and filters

- Order: search (flex-1, min 220px) then selects, `flex flex-wrap items-center gap-3`. Actions stay in the page header.
- Search: `rounded-lg border py-2 pl-9 pr-3 text-[13px]` with a 16px icon at `left-3`; no clear button.
- Select trigger: 36px (`h-9`), 8px radius, 13px, fixed width 155 to 220px, no focus ring (border swap).
- Menu: Radix default (6px radius, `shadow-md`, 4px offset, `p-1`, items `py-1.5 pl-8 pr-2` with the check at 8px).
- Status tabs: inside a table card use underline tabs (`px-4 py-3 text-[13px] font-semibold`, 2px indicator, count badge 10.5px); on phones use scrolling pills (`rounded-full border px-3.5 py-1.5 text-[13px]`, 8px gap, 18px count badge).
- Two-state view switch: segmented control (`rounded-xl border p-1`, buttons `rounded-lg px-4 py-1.5 text-[13px] font-semibold`).

### 4.4 Size variants

**Buttons**

| Variant | Spec | Use |
|---|---|---|
| `md` (default) | `rounded-xl px-4 py-2 text-[13px]`, 700 primary / 600 ghost, about 36px | Page header actions, modal footers, empty state CTA |
| `sm` | `rounded-lg px-3 py-1.5 text-[12px] font-semibold`, 32px | Card action rows, inline resolve, mobile card buttons |
| `xs` | `rounded-lg px-2 py-1 text-[11px]`, about 26px | Inside table cells |
| `pager` | `rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold`, about 33px | Pagination |
| `icon` | 28px (`h-7 w-7`), 14 to 17px icon | Row menu, help, header icons |
| `fab` | 56px round, 26px icon | Phone-only create |
| `block` | full width, `rounded-xl px-4 py-2.5 text-[14px]` | Single acknowledgement / checkout |

**Inputs**

| Variant | Spec | Use |
|---|---|---|
| `md` | `rounded-lg border px-3.5 py-2.5 text-[13px]`, about 42px; select `h-10` | Forms |
| `sm` | `rounded-lg border py-2 pl-9 pr-3 text-[13px]`, about 38px; select `h-9` | Toolbar search and filters |
| `xs` | select `h-8` | Inline range picker inside a card header |

**Pills**

| Variant | Spec | Use |
|---|---|---|
| `table` | 5px radius, `2px 7px`, 10.5px / 700 / uppercase / 0.06em | Status in table cells |
| `round` | `rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]` | Status on cards, modal headers |
| `round-sm` | `rounded-full px-2 py-0.5 text-[10px]` | Secondary badges (channel, EU) |
| `chip` | `rounded-full px-2 py-0.5 text-[11.5px] font-semibold` | Result summaries, clickable info chips |
| `tag` | `rounded-full border px-2.5 py-1 text-[12px]` | Read-only value lists |
| `count` | `rounded-full min-w-[18px] h-[18px] px-1.5 text-[10.5px] font-bold` | Counts in tabs |

**Cards**

| Variant | Spec | Use |
|---|---|---|
| `tile` | `rounded-lg border px-5 py-[18px]`, value 30px / 800 / -0.04em, label 11px uppercase 0.08em, grid 2 then 4 columns, 12px gap | KPI row above a table |
| `panel` | `rounded-lg border p-5`, two-layer soft shadow, title 14.5px / 700 with 16px below | Charts, analytic blocks |
| `row-card` | `rounded-xl border p-4` | Mobile replacement for a table row |
| `group` | `rounded-2xl border overflow-hidden`, rows `p-5` divided by 1px lines, group label 10.5px uppercase above | Settings and profile sections |
| `empty` | `rounded-2xl border-dashed p-10`, 15px title, 13px text, optional CTA 8px below | Empty or no-results states |

### 4.5 States

- Loading: pulse skeletons that mirror the final layout (`SkeletonTable` rows = page size, `SkeletonTiles` matching the grid).
- Error: `rounded-xl border px-4 py-3 text-[13px]` banner at the top of the content, no icon; warnings use the 28px icon chip variant.
- Empty: the `empty` card; filtered-empty text "No matches." with a hint, no CTA.

---

## 5. Reference snippets (Step 5)

Color classes and values are removed or marked `[color omitted]`. Everything else is verbatim.

### 5.1 Shared table (`src/styles/admin-tables.css`)

```css
@layer components {

  /* ── Table wrapper ────────────────────────────────────────────────── */
  /* overflow-x: auto so nowrap action buttons/pills in narrow fixed-%
     columns become reachable via horizontal scroll on tablet widths
     instead of being silently clipped by the card's rounded corners. */
  .atbl {
    overflow-x: auto;
    overflow-y: hidden;
    border-radius: 10px;
    border: 1px solid [color omitted];
    background: [color omitted];
    box-shadow: 0 1px 2px [color omitted, 4% opacity];
  }

  /* ── table element ───────────────────────────────────────────────── */
  .atbl table {
    width: 100%;
    min-width: 640px;
    border-collapse: collapse;
    font-size: 13px;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  /* ── Head ────────────────────────────────────────────────────────── */
  .atbl thead tr {
    border-bottom: 1px solid [color omitted];
  }

  .atbl thead th {
    padding: 11px 16px 10px;
    text-align: left;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.11em;
    white-space: nowrap;
  }

  /* ── Body rows ────────────────────────────────────────────────────── */
  .atbl tbody tr {
    border-bottom: 1px solid [color omitted];
    transition: background 0.1s;
  }
  .atbl tbody tr:last-child {
    border-bottom: none;
  }
  .atbl tbody tr:hover {
    background: [color omitted];
  }

  /* ── Body cells ───────────────────────────────────────────────────── */
  .atbl tbody td {
    padding: 12px 16px;
    vertical-align: middle;
  }

  /* ── Status / severity pill - rectangular (matches reference) ─────── */
  .atbl-pill {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    border-radius: 5px;
    padding: 2px 7px;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    line-height: 1.6;
  }

  /* ── Inner filter-tab bar (used by HotLeads inside .atbl) ─────────── */
  .atbl-tabs {
    display: flex;
    align-items: center;
    border-bottom: 1px solid [color omitted];
    padding: 0 4px;
  }
}
```

Best table page usage (`src/screens/admin/Prospects.tsx`, desktop table, row menu items abbreviated where marked):

```tsx
          {/* Desktop table */}
          <div className="atbl hidden md:block">
            <table className="table-fixed">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[24%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead>
                <tr>
                  {['Business', 'Contact', 'Category', 'Location', 'Status', ''].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => {
                  const pill = STATUS_PILL[r.pipeline_status] ?? STATUS_PILL.new;
                  {/* [omitted for length: statusMenuItems, copyEmailItem, editDeleteItems arrays] */}
                  return (
                    <tr key={r.id}>
                      <td className="min-w-0">
                        <div className="truncate font-bold" title={r.business_name}>{r.business_name}</div>
                      </td>
                      <td className="min-w-0">
                        <div className="truncate" title={r.contact_name ?? undefined}>{r.contact_name ?? '-'}</div>
                        {r.email && (
                          <div className="mt-0.5 truncate font-mono text-[11px]" title={r.email}>
                            {r.email}
                          </div>
                        )}
                      </td>
                      <td className="min-w-0">
                        <div className="truncate" title={r.category ?? undefined}>{r.category ?? '-'}</div>
                      </td>
                      <td className="min-w-0">
                        <div className="truncate" title={r.location ?? undefined}>{r.location ?? '-'}</div>
                      </td>
                      <td className="pr-3">
                        <span className="atbl-pill" style={{ /* [color omitted] */ }}>
                          {r.pipeline_status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3 text-right">
                        <RowMenu items={[...statusMenuItems, ...copyEmailItem, ...editDeleteItems]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
```

### 5.2 Toolbar with search and filters (`src/screens/admin/Prospects.tsx`)

```tsx
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex min-w-[220px] flex-1 items-center">
          <Search className="absolute left-3 h-4 w-4 pointer-events-none" />
          <input
            value={q}
            onChange={(e) => updateQ(e.target.value)}
            placeholder="Search name, email, contact…"
            style={FONT}
            className="w-full rounded-lg border py-2 pl-9 pr-3 text-[13px] outline-none transition-colors"
          />
        </div>

        <Select value={status} onValueChange={updateFilterStatus}>
          <SelectTrigger
            style={FONT}
            className="h-9 w-[155px] rounded-lg text-[13px] focus:ring-0 focus:ring-offset-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={FONT} className="text-[13px]">
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={cat} onValueChange={updateCat}>
          <SelectTrigger
            style={FONT}
            className="h-9 w-[155px] rounded-lg text-[13px] focus:ring-0 focus:ring-offset-0"
          >
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent style={FONT} className="text-[13px]">
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
```

### 5.3 Pagination (`src/screens/admin/CampaignsAndLeads.tsx`)

```tsx
/* ── Pagination ────────────────────────────────────────────────────── */
function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 text-[12.5px]">
      <span>Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} className="cursor-pointer rounded-lg border bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages} className="cursor-pointer rounded-lg border bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
```

The more common page-level variant (`src/screens/admin/Clients.tsx`) wraps the same content in its own card:

```tsx
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border px-4 py-3 text-[12.5px]">
              <span>Page {safePage} of {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} className={pagBtnCls}>Previous</button>
                <button onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages} className={pagBtnCls}>Next</button>
              </div>
            </div>
          )}
```

### 5.4 Tab bar (`src/screens/admin/Monitoring.tsx`)

```tsx
      <div className="atbl-tabs flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px shrink-0 cursor-pointer inline-flex items-center gap-1.5 border-b-2 px-4 py-3 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                active ? '[color omitted]' : 'border-transparent [color omitted]'
              }`}
            >
              {t.key === 'escalated' && <AlertTriangle size={14} />}
              {t.label}
              {t.count > 0 && (
                <span className="inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10.5px] font-bold">{t.count}</span>
              )}
            </button>
          );
        })}
      </div>
```

Mobile pill tabs (`src/screens/admin/CampaignsAndLeads.tsx`, `HotLeads`):

```tsx
            <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {HL_TABS.map((tab) => {
                const cnt    = rows.filter((r) => matchesHL(r, tab.key)).length;
                const active = filter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => selectFilter(tab.key)}
                    className={`shrink-0 cursor-pointer inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] whitespace-nowrap transition-all ${
                      active
                        ? 'border-transparent font-bold [color omitted]'
                        : 'font-semibold [color omitted]'
                    }`}
                  >
                    {tab.label}
                    {cnt > 0 && (
                      <span className="inline-flex items-center justify-center rounded-full px-1.5 min-w-[18px] h-[18px] text-[10.5px] font-bold">{cnt}</span>
                    )}
                  </button>
                );
              })}
            </div>
```

### 5.5 Stat card (`src/screens/admin/ApprovalQueue.tsx`, `StatTile`)

```tsx
  return (
    <div
      onClick={onClick}
      style={{ /* background, borderColor: [color omitted] */ boxShadow: '0 1px 2px [color omitted, 4% opacity]' }}
      className={`flex flex-col rounded-lg border px-5 py-[18px] gap-0 transition-shadow hover:shadow-md ${onClick ? 'cursor-pointer' : ''}`}
    >
      {/* Icon + label row */}
      <div className="flex items-center gap-[5px] mb-[10px]">
        <Icon size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
        <span className="text-[11px] font-bold uppercase tracking-[.08em] leading-none">
          {label}
        </span>
      </div>

      {/* Big number */}
      <span className="text-[30px] font-extrabold leading-none tracking-[-0.04em] tabular-nums mb-[7px]">
        {value}
      </span>

      {/* Secondary text */}
      <span className="text-[11px] font-semibold leading-none">
        {sub}
      </span>
    </div>
  );
```

Grid: `<div className="grid grid-cols-2 md:grid-cols-4 gap-3">`.

### 5.6 Status pill

Table cell: `<span className="atbl-pill" style={{ /* [color omitted] */ }}>{c.status}</span>` (CSS in 5.1).

Card / header variant (`src/screens/admin/Prospects.tsx`, mobile card):

```tsx
                    <span
                      style={{ /* background, color, border: [color omitted] */ }}
                      className="shrink-0 inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]"
                    >
                      {r.pipeline_status.replace('_', ' ')}
                    </span>
```

### 5.7 Empty state (`src/screens/admin/Clients.tsx`)

```tsx
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center">
          <strong className="text-[15px] font-bold">No clients yet.</strong>
          <span className="text-[13px]">Create the first client to get started.</span>
          <button onClick={() => setShowNew(true)} className={`${primaryCls} mt-2`}>+ New client</button>
        </div>
```

### 5.8 Skeleton loader (`src/components/Skeleton.tsx`)

```tsx
/* Skeleton loading primitives - shared across admin pages */

function Sk({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md ${className}`} />;
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex gap-4 border-b px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Sk key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b px-4 py-4 last:border-0">
          {Array.from({ length: cols }).map((_, j) => (
            <Sk key={j} className={`h-3 flex-1 ${j === 0 ? 'max-w-[160px]' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonTiles({ count = 4, cols = 4 }: { count?: number; cols?: number }) {
  return (
    <div className={`grid gap-3 grid-cols-2 ${cols === 4 ? 'md:grid-cols-4' : cols === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-lg border px-5 py-[18px]">
          <Sk className="mb-2 h-8 w-16" />
          <Sk className="h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}
```

### 5.9 Page header (`src/screens/admin/Clients.tsx`) and its mobile rule (`src/index.css`)

```tsx
      <header className="page-header flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div>
          <h1 className="m-0 text-[26px] flex items-center gap-2 font-extrabold tracking-tight">
            <img src="..." alt="Clients" className="w-9 h-9" />
            Clients
          </h1>
          <p className="m-0 mt-1 text-[13px]">{rows.length} client{rows.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton content={HELP} />
          <RefreshButton onRefresh={handleRefresh} isFetching={isFetching} dataUpdatedAt={dataUpdatedAt} className={ghostCls} />
          <button onClick={() => setShowNew(true)} className={`${primaryCls} hidden md:inline-flex`}>+ New client</button>
        </div>
      </header>
```

```css
@media (max-width: 767px) {
  .page-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 12px;
    row-gap: 4px;
  }
  .page-header > :first-child { display: contents; }
  .page-header > :first-child > h1 {
    grid-column: 1;
    grid-row: 1;
    min-width: 0;
    font-size: 22px;
    line-height: 1.2;
  }
  .page-header > :first-child > h1 img { width: 30px; height: 30px; flex-shrink: 0; }
  .page-header > :first-child > h1 svg { flex-shrink: 0; }
  .page-header > :first-child > p {
    grid-column: 1 / -1;
    grid-row: 2;
    margin-top: 0;
  }
  .page-header > :not(:first-child) {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
  }
  /* Headers with several labelled actions put them on their own row. */
  .page-header.page-header--stack > :not(:first-child) {
    grid-column: 1 / -1;
    grid-row: 3;
    justify-self: stretch;
    flex-wrap: wrap;
    margin-top: 8px;
  }
}
```
