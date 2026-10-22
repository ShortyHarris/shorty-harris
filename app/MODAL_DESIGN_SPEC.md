# Modal Design Spec

Read-only audit of every modal, dialog, sheet, drawer and overlay in `src/`. Covers structure and dimensions only. Colors, palettes and gradients are deliberately left out. Where a class carried a color it is omitted or marked `[color omitted]`.

Stack facts that the numbers below depend on:

- Tailwind CSS v4 (`tailwindcss ^4.3.1`), default spacing unit 4px (`p-1` = 4px). No `--spacing` or `--radius-md/lg/xl` overrides exist in the project, so Tailwind defaults apply: `rounded-md` 6px, `rounded-lg` 8px, `rounded-xl` 12px, `rounded-2xl` 16px, `rounded-full` 9999px. The client theme (`styles/theme-client.css`) redefines `--radius-sm: 10px`, which is what `rounded-sm` resolves to inside `.theme-client`.
- `shadow-2xl` (Tailwind v4 default) = `0 25px 50px -12px` at 25% opacity. `shadow-lg` = `0 10px 15px -3px, 0 4px 6px -4px`. `shadow-md` = `0 4px 6px -1px, 0 2px 4px -2px`.
- Global base (`src/index.css`): `body { font-size: 15px; line-height: 1.5 }`. Arbitrary `text-[13px]` classes in v4 set only font-size, so line-height stays at the inherited 1.5 unless a `leading-*` class is present.
- Animation: `framer-motion ^12.40.0`. Dropdowns: `@radix-ui/react-select`, `@radix-ui/react-popover` with `tw-animate-css`.
- Font sizes in the code are almost all arbitrary px values (`text-[13px]`), not the Tailwind scale.

---

## 1. Inventory (Step 1)

### 1.1 Shared pieces

| Piece | File | Role |
|---|---|---|
| `ConfirmDialog` | `src/components/ConfirmDialog.tsx` | The only shared, exported dialog component. Small centered confirm. Used 3 times (client Approvals bulk approve, client Prospects "cancel unsent emails" and "edit an approved email"). |
| `useOverlayClose` | `src/hooks/useOverlayClose.ts` | Shared backdrop click-to-close hook. Closes only when both mousedown and mouseup land on the overlay (prevents closing mid text-selection drag). Used by most modals. |
| `.modal-card` | `src/index.css` | Shared CSS hook on every card: hides scrollbars (`scrollbar-width: none`, `::-webkit-scrollbar { display: none }`) and sets `flex-shrink: 0` on children of a scrolling `.overflow-y-auto.flex-col` body. |
| `ModalShell` (local) | `src/screens/admin/Clients.tsx` | File-local wrapper (overlay + card, 560px). Not exported. |
| `CampModalShell` (local) | `src/screens/admin/CampaignsAndLeads.tsx` | File-local wrapper (overlay + card, 540px). Not exported. |
| `.panel-overlay` / `.panel` / `.lead-sheet` | `src/screens/client/Dashboard.css` | CSS-class based bottom sheet that becomes a centered wide modal at 768px+. Shared by 4 client panels. |
| `fieldLbl`, `inputCls`, `ghostCls`, `primaryCls`, `dangerCls` | redefined per file | Form and button class strings, copy-pasted into each screen (identical structure in every file). |

There is no generic `<Modal>` component. Apart from `ConfirmDialog`, every modal hand-rolls the same overlay + card markup (called **the standard pattern** below). The two local shells are just that pattern wrapped for one file.

### 1.2 All modals and overlays

Standard pattern = `fixed inset-0 ... md:items-center md:justify-center md:p-6` overlay + `modal-card flex w-full flex-col overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[Npx] md:rounded-md md:shadow-2xl` card, header / scrolling body / footer.

| # | Component | File | Type | Built on |
|---|---|---|---|---|
| 1 | `ConfirmDialog` | components/ConfirmDialog.tsx | Confirm (neutral or danger) | Shared base |
| 2 | `HelpButton` modal | components/HelpButton.tsx | Info / display | Standard pattern |
| 3 | `EditModal` | screens/admin/ApprovalQueue.tsx | Form (subject + body editor) | Standard pattern |
| 4 | `TopicModal` | screens/admin/Blog.tsx | Form | Standard pattern |
| 5 | `ReviewModal` | screens/admin/Blog.tsx | Large form + details + actions | Standard pattern |
| 6 | Cover image lightbox | screens/admin/Blog.tsx (inside ReviewModal) | Image preview | Hand-rolled, different |
| 7 | `RejectModal` | screens/admin/Blog.tsx | Destructive with input (reason) | Standard pattern |
| 8 | `DeleteModal` | screens/admin/Blog.tsx | Destructive confirm | Standard pattern |
| 9 | `ScrapeSummaryModal` (2 variants: failed, results) | screens/admin/CampaignsAndLeads.tsx | Display / details | `CampModalShell` |
| 10 | `NewCampaignModal` (admin) | screens/admin/CampaignsAndLeads.tsx | Form | Standard pattern |
| 11 | `EditCampaignModal` (admin) | screens/admin/CampaignsAndLeads.tsx | Form | `CampModalShell` |
| 12 | `DeleteCampaignModal` (admin) | screens/admin/CampaignsAndLeads.tsx | Destructive confirm | `CampModalShell` |
| 13 | `LeadDetailModal` | screens/admin/CampaignsAndLeads.tsx | Display / details with outcome actions | Standard pattern, restyled |
| 14 | `NewClientModal` | screens/admin/Clients.tsx | Large form | `ModalShell` |
| 15 | `EditClientModal` | screens/admin/Clients.tsx | Large form | `ModalShell` |
| 16 | `AddCreditsModal` | screens/admin/Clients.tsx | Form + history table | `ModalShell` |
| 17 | `DeleteClientModal` | screens/admin/Clients.tsx | Destructive confirm with blast radius | `ModalShell` |
| 18 | `ChangeLoginEmailModal` | screens/admin/Clients.tsx | Small form | `ModalShell` |
| 19 | `NewArticleModal` | screens/admin/DocsAdmin.tsx | Form | Standard pattern |
| 20 | `AddDomainModal` | screens/admin/Domains.tsx | Small form | Standard pattern |
| 21 | `FreeProvidersModal` | screens/admin/Domains.tsx | Confirm with impact notice | Standard pattern |
| 22 | `PurgeModal` | screens/admin/Domains.tsx | Multi-state (scope, dry run, result) destructive | Standard pattern |
| 23 | `NewProspectModal` | screens/admin/Prospects.tsx | Form | Standard pattern |
| 24 | `EditProspectModal` | screens/admin/Prospects.tsx | Form | Standard pattern |
| 25 | `DeleteProspectModal` | screens/admin/Prospects.tsx | Destructive confirm with blast radius | Standard pattern |
| 26 | `AdminNotificationBell` modal | screens/admin/Layout.tsx | List / picker | Standard pattern |
| 27 | Admin mobile fullscreen nav (`.amobile-overlay`) | screens/admin/Layout.tsx + Layout.css | Fullscreen nav overlay | Hand-rolled CSS |
| 28 | `EditModal` (client) | screens/client/Approvals.tsx | Form (subject + body editor) | Standard pattern |
| 29 | `NewCampaignModal` (client) | screens/client/Campaigns.tsx | Multi-step form (4 steps) | Standard pattern |
| 30 | `CampaignDetailModal` | screens/client/Campaigns.tsx | Details with in-place edit mode | Standard pattern |
| 31 | `DeleteCampaignModal` (client) | screens/client/Campaigns.tsx | Destructive confirm, stacked over #30 | Standard pattern |
| 32 | `ProfileEditModal` | screens/client/Settings.tsx | Large form | Standard pattern, variant spacing |
| 33 | `BlockedDomainsModal` | screens/client/BlockedDomains.tsx | List manager (inline add form + rows) | Standard pattern |
| 34 | `NotificationBell` modal (client) | screens/client/Shell.tsx | List | Standard pattern |
| 35 | `LeadPanel` | screens/client/Dashboard.tsx | Details + action rail (bottom sheet / wide modal) | `.panel.lead-sheet` CSS |
| 36 | `WarmProspectsModal` | screens/client/Dashboard.tsx | List with search, segmented sort, filter chip, pagination | `.panel.lead-sheet.warm-all` CSS |
| 37 | `WarmProspectHistoryModal` | screens/client/Dashboard.tsx | Details + timeline | `.panel.lead-sheet` CSS |
| 38 | `SequencePanel` | screens/client/Prospects.tsx | Details + inline edit + nested ConfirmDialog | `.panel` CSS + `rounded-lg` |
| 39 | `DocsEditorModal` | screens/docs/DocsEditorModal.tsx | Large form with Write / Preview tabs | Standard pattern |
| 40 | `DocsSearchPanel` | screens/docs/DocsSearchPanel.tsx | Command palette style search (top anchored) | Hand-rolled, different |
| 41 | Docs mobile drawer | screens/docs/Docs.tsx + Docs.css | Left slide-over drawer | Hand-rolled CSS |
| 42 | `TourOverlay` | tour/TourOverlay.tsx | Spotlight + floating coach card | Hand-rolled |
| 43 | `CookieConsent` (banner + preferences dialog) | components/CookieConsent.tsx | Bottom banner / centered settings dialog | Hand-rolled, inline styles |

Related non-modal overlays (listed for z-index and pattern context only): `RowMenu` (portal dropdown, `components/RowMenu.tsx`), `PopoverContent` and `DateTimePicker` (`components/ui/popover.tsx`, `ui/date-time-picker.tsx`), `SelectContent` (`ui/select.tsx`), `ToastHost` (`components/Toast.tsx`), PublicNav mobile menu (`components/PublicNav.tsx`), marketing header mobile menu (`components/ui/header-1.tsx`).

Not present in the project: `Dialog`, `Sheet`, `Drawer`, `AlertDialog` library primitives (no Radix Dialog, no vaul), any `createPortal` use for modals (modals render in place; only RowMenu and the two nav menus portal).

---

## 2. Exact values (Step 2)

### 2.1 Container

**Standard pattern card** (verbatim, colors omitted):
`modal-card flex w-full flex-col overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[Npx] md:rounded-md md:shadow-2xl`

| Property | Value |
|---|---|
| Width | `w-full` (100%) of overlay content box |
| Max width (md+) | per modal, see width table below |
| Height below 768px | `h-full` (100% of viewport, the card is full screen) |
| Height at 768px+ | `md:h-auto`, content-driven |
| Max height at 768px+ | `md:max-h-[calc(100vh-48px)]` = viewport height minus 48px (the overlay's 24px padding top and bottom) |
| Min height | not present |
| Radius below 768px | none (0) |
| Radius at 768px+ | `md:rounded-md` = 6px |
| Border | none, except `LeadDetailModal` adds `md:border` (1px) |
| Shadow | `md:shadow-2xl`, highest elevation level, desktop only |
| Overflow | `overflow-hidden` on card; body region scrolls (`overflow-y-auto`); scrollbars hidden by `.modal-card` |

**Max-width per modal (standard pattern)**

| max-width | Modals |
|---|---|
| 420px | ConfirmDialog (`max-w-[420px]`, always), AdminNotificationBell, client NotificationBell |
| 460px | HelpButton, client DeleteCampaignModal |
| 480px | Blog RejectModal, Blog DeleteModal, DocsAdmin NewArticleModal, Domains AddDomainModal, Domains FreeProvidersModal |
| 520px | Blog TopicModal, Domains PurgeModal |
| 540px | All `CampModalShell` modals, admin NewCampaignModal, admin Prospects (New, Edit, Delete), client NewCampaignModal |
| 560px | All Clients `ModalShell` modals, client ProfileEditModal, client BlockedDomainsModal |
| 600px | admin ApprovalQueue EditModal, client Approvals EditModal, client CampaignDetailModal |
| 620px | DocsSearchPanel (`max-w-[620px]`, always) |
| 640px | admin LeadDetailModal |
| 680px | Blog ReviewModal |
| 760px | DocsEditorModal |

**CSS panel family** (`Dashboard.css`, inside `@layer components`):

| Property | Below 768px | 768px+ |
|---|---|---|
| `.panel` width / max-width | `width: 100%`, `max-width: 640px` | `max-width: 920px` |
| `.panel.lead-sheet` max-width | 640px (inherits `.panel`) | `max-width: 1000px` |
| `.panel.warm-all` max-width | 640px | `max-width: 880px` |
| Max height | `max-height: 90vh` | `max-height: calc(100vh - 48px)` |
| Height | content-driven | content-driven |
| Radius | `.panel` and `.lead-sheet`: `6px 6px 0 0` (top corners only) | `6px` all corners |
| Shadow | `.lead-sheet`: `0 24px 64px` (18% opacity) + `0 2px 8px` (6% opacity), two-layer high elevation. Plain `.panel` has no shadow | same |
| Overflow | `overflow: hidden` on panel, `.panel-scroll { overflow-y: auto; flex: 1 }` | same, scrollbar hidden on `.lead-sheet .lp-scroll` |

`SequencePanel` adds the Tailwind utility `rounded-lg` to `.panel`. Tailwind utilities win over `@layer components`, so its radius is 8px on all four corners at every size.

**Other containers**

| Container | Values |
|---|---|
| ConfirmDialog card | `w-full max-w-[420px] rounded-md p-5 shadow-2xl` (420px, 6px radius, 20px padding, top elevation). Always centered, never full screen. |
| DocsSearchPanel card | `modal-card flex w-full max-w-[620px] flex-col overflow-hidden rounded-md shadow-2xl`. Results area `max-h-[50vh] overflow-y-auto`. |
| Blog lightbox | overlay `fixed inset-0 z-[60] flex items-center justify-center p-6`, image `max-h-full max-w-full rounded-lg object-contain` (8px radius) |
| Docs mobile drawer | `position: absolute; top: 0; left: 0; bottom: 0; width: 82%; max-width: 320px; padding: 16px 14px 24px; overflow-y: auto`. No radius, no shadow. |
| Admin mobile nav | `.amobile-overlay { position: fixed; inset: 0; display: flex; flex-direction: column }`, full screen, no radius |
| Tour card | `fixed rounded-2xl border p-4 shadow-2xl flex flex-col gap-2.5`, `width: 300px` (`CARD_WIDTH`), height estimated at 170px for placement |
| Cookie banner | `width: 100%; maxWidth: 720; borderRadius: 16; border 1px; padding: 20px 22px; gap: 14`, shadow `0 12px 40px` (18% opacity) |
| Cookie preferences | `maxWidth: 480; margin: auto; borderRadius: 16; border 1px; padding: 24px 24px 20px; gap: 16`, shadow `0 20px 60px` (25% opacity) |

### 2.2 Position and placement

| Modal family | Mobile (below 768px) | Desktop (768px+) |
|---|---|---|
| Standard pattern | Full screen sheet: overlay is `flex flex-col`, card `h-full w-full`, no padding, slides up from the bottom | Centered: overlay `md:items-center md:justify-center md:p-6` (24px from every viewport edge) |
| ConfirmDialog | Centered, overlay `p-5` (20px from edges) | Same |
| CSS panels | Bottom sheet: `.panel-overlay { align-items: flex-end; justify-content: center }`, no padding, max 90vh tall, drag handle shown | Centered: `.panel-overlay { align-items: center; padding: 24px }` (lead-sheet uses `.panel-overlay:has(.lead-sheet) { padding: 24px }`), handle hidden |
| DocsSearchPanel | Top anchored: overlay `flex flex-col items-center px-4 pt-[10vh]` (16px sides, 10vh top offset) | Same |
| Docs drawer | Left side drawer, only rendered below 900px (`@media (max-width: 899px) { .docs-mobile-overlay { display: block } }`) | Hidden (`display: none`) |
| Tour card | Positioned 14px (`GAP`) above or below the highlighted element, clamped 12px from left and right viewport edges | Same |
| Cookie | Wrapper `position: fixed; inset: 0; display: flex; align-items: flex-end; justify-content: center; padding: 16`. Banner sits bottom center; preferences dialog uses `margin: auto` to center | Same |

Right side drawer: not present.

**Z-index stack (lowest to highest)**

| z-index | Element |
|---|---|
| 30 | `.panel-overlay` (all client CSS panels: LeadPanel, WarmProspects, WarmProspectHistory, SequencePanel) |
| 40 | PublicNav mobile menu, header-1 mobile menu, MobileFab |
| 50 | Standard pattern overlay (`z-50`) for most modals; Radix `SelectContent` (`z-50`) |
| 60 | client DeleteCampaignModal (`z-60`, stacks over CampaignDetailModal), Blog lightbox (`z-[60]`), admin `.amobile-overlay` |
| 70 | TourOverlay ring, dim fallback and card |
| 100 | ConfirmDialog (`z-[100]`), AdminNotificationBell and client NotificationBell (`z-100`, comment: to beat recharts tooltips), DocsEditorModal, DocsAdmin NewArticleModal, `.docs-mobile-overlay` |
| 110 | ToastHost (`z-110`), DocsSearchPanel (`z-110`) |
| 200 | `PopoverContent` (`z-200`, comment: must clear Framer transformed modals), ImpersonationBanner |
| 9999 | RowMenu dropdown, CookieConsent wrapper |

Toasts (110) sit above every modal except DocsSearchPanel, which shares 110.

### 2.3 Backdrop

| Modal family | Opacity | Blur | Applies at | Click to close | Scroll lock |
|---|---|---|---|---|---|
| Standard pattern | `md:bg-black/40` = 40% | none | 768px+ only (mobile card covers the screen) | `useOverlayClose` (mousedown and mouseup both on overlay) | not present |
| Clients `ModalShell` | 40% | none | 768px+ | **not present** (no handler on overlay; `onClose` prop is accepted but unused by the shell) | not present |
| LeadDetailModal | `md:bg-black/50` = 50% | none | 768px+ | `useOverlayClose` | not present |
| ProfileEditModal, BlockedDomainsModal | inline `rgba(..., 0.45)` = 45% | none | all sizes | `useOverlayClose` | not present |
| ConfirmDialog | inline `rgba(..., 0.45)` = 45% | none | all sizes | `useOverlayClose`, disabled while `busy` | not present |
| HelpButton, both NotificationBells | 40% | none | 768px+ | plain `onClick` on overlay (single click, not the drag-safe hook) | not present |
| CSS panels | `rgba(..., 0.45)` = 45% | none | all sizes | `useOverlayClose` | not present |
| DocsSearchPanel | `bg-black/40` = 40% | none | all sizes | `useOverlayClose` | not present |
| Blog lightbox | `bg-black/80` = 80% | none | all sizes | plain `onClick` | not present |
| Docs drawer | `rgba(..., 0.4)` = 40% | none | below 900px | plain `onClick` | not present |
| Tour | `rgba(..., 0.65)` = 65%, drawn as a `0 0 0 9999px` box-shadow spread around the spotlight ring | none | all sizes | not present (`pointer-events-none`) | not present |
| Cookie preferences | `rgba(..., 0.4)` = 40% | none | all sizes | plain `onClick` returns to banner | not present |
| header-1 mobile menu (not a modal) | `backdrop-blur-lg` = 16px blur | 16px | below md | n/a | `document.body.style.overflow = 'hidden'` |
| PublicNav mobile menu (not a modal) | opaque | none | below md | n/a | `document.body.style.overflow = 'hidden'` |

Backdrop blur on modals: not present. Body scroll locking on modals: not present (only the two marketing nav menus lock scroll).

### 2.4 Header

**Standard header** (verbatim, colors omitted):
`flex shrink-0 items-center justify-between border-b px-5 py-4`

| Property | Value |
|---|---|
| Height | content-driven: 16px top + title line box + 16px bottom. With an 18px title at the inherited 1.5 line-height (27px) that is 59px, plus the 1px divider |
| Padding | `px-5 py-4` = 20px horizontal, 16px vertical |
| Divider | `border-b`, 1px |
| Pinned | `shrink-0`, never scrolls |
| Title | `<h2 className="m-0 text-[18px] font-bold">`: 18px, 700 |
| Title with subtitle | wrapper switches to `items-start gap-4` (16px); subtitle `m-0 mt-0.5 text-[12px]`: 12px, 2px below title. BlockedDomains subtitle is 12.5px |
| Close button | text glyph `×`, `cursor-pointer border-0 bg-transparent text-[24px] leading-none`. No explicit width or height, so the hit area is the glyph's own box (24px font, line-height 1). No `aria-label` in most modals |
| Close position | right edge via `justify-between` |
| Leading icon / badge | optional. HelpButton: `Info` icon 15px, `gap-2` (8px) before title. Blog ReviewModal: category pill above a `text-[17px]` truncated title (`mt-2`, 8px). CampaignDetailModal: status pill row `mt-1.5` (6px) under title, plus two 32px icon buttons (`h-8 w-8 rounded-lg`, icon 15px) before the close glyph in a `gap-1` (4px) group |

**Header variants**

| Modal | Padding | Title | Close control |
|---|---|---|---|
| Standard | 20 / 16px | 18px / 700 | `×` glyph 24px |
| ConfirmDialog | no separate header (card `p-5`, 20px) | `text-[16px] font-bold` | none (Cancel button only) |
| HelpButton | 20 / 16px | 16px / 700 | `×` glyph 22px in `h-7 w-7` (28px) round button, `aria-label="Close"` |
| ScrapeSummaryModal | 20 / 16px | 16px / 700 | `×` 24px |
| Blog ReviewModal | 20 / 16px, `items-start gap-4` | 17px / 700, truncated | `×` 24px |
| NotificationBells | 20 / 16px | `<span>` 15px / 700 | `×` glyph 22px; client adds a 12px / 600 "Mark all as read" text button, `gap-3` (12px) |
| LeadDetailModal | `px-6 pt-5 pb-5` = 24px sides, 20px top and bottom | `text-[24px] font-extrabold leading-[1.15] tracking-[-0.02em]`, `mt-4` (16px) below pill row | `h-9 w-9` (36px) round filled button, `X` icon 17px, `aria-label="Close"` |
| `.lp-header` (LeadPanel, WarmProspectHistory) | `12px 20px 20px`; 768px+: `20px 32px 20px` | `.lp-title`: 26px / 700, line-height 1.15, letter-spacing -0.022em, 16px top margin; 768px+: 28px, 12px top margin | `.lp-close`: 36 x 36px circle, `X` 18px |
| `.lp-subtitle` | | 15px, 6px top margin | |
| `.warm-all-head` | `12px 20px 16px`; 768px+: `24px 28px 20px` | `.warm-all-title`: 22px / 700, letter-spacing -0.02em; leading icon chip `gap-2.5` (10px) | `.lp-close` 36px |
| `.warm-all-sub` | | 14px, line-height 1.5, 8px top margin | |
| SequencePanel `.panel-top` | inside `.panel-scroll` padding, `margin-bottom: 16px; padding-top: 4px` | eyebrow 11px / 700 uppercase; business name `.panel-biz` 24px / 700, line-height 1.15, letter-spacing -0.025em | `.panel-close-btn`: glyph 19px, `padding: 4px 8px` |
| client NewCampaignModal | 20 / 16px, title row then step bar `mt-3` (12px) then step label `mt-2` (8px) | 18px / 700 | `×` 24px |
| DocsSearchPanel | `px-4 py-3.5` = 16 / 14px, `gap-2.5` (10px) | none; the header is the search input (14px) with a 16px leading icon | `p-1` (4px) button, `X` 18px, `aria-label="Close"` |

### 2.5 Body

**Standard body** (verbatim): `flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4`

| Property | Value |
|---|---|
| Padding | 20px on all four sides (`px-5 py-5`) |
| Scroll | Only the body scrolls (`flex-1 overflow-y-auto`); header and footer are `shrink-0` so they stay pinned |
| Max height | none of its own; capped by the card's `calc(100vh - 48px)` on desktop, full viewport on mobile |
| Gap between sections | `gap-4` = 16px (most). `gap-3` = 12px in HelpButton, Blog RejectModal, Blog DeleteModal. `gap-5` = 20px in CampaignDetailModal view mode. `gap-7` = 28px in LeadDetailModal (which also uses `px-6 py-6`, 24px) |
| Children | `.modal-card .overflow-y-auto.flex-col > * { flex-shrink: 0 }` so blocks keep natural height |
| Scrollbar | hidden (`scrollbar-width: none` and `::-webkit-scrollbar { display: none }`) |
| Sub-section divider | `border-t pt-3` (1px line, 12px above content), used for "Starting credits", "Save as draft", credit history |
| Section label (form) | `fieldLbl`: `mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em]` (11px / 700, 6px below) |
| Section label (display, admin) | `text-[11px] font-bold uppercase tracking-[.06em]`, `mb-2` (8px) or `mb-1.5` |
| Section label (display, client) | `text-[10.5px] font-bold uppercase tracking-[.08em]`, `mb-1.5` (6px) or `mb-2` |
| List bodies (bells) | `flex-1 overflow-y-auto` with no padding; rows carry their own `px-5 py-3.5` (20 / 14px) |

Variant bodies:

- ProfileEditModal and BlockedDomainsModal: `flex-1 overflow-y-auto px-5 py-5` without `flex-col gap`; spacing comes from `mb-4` (16px) per field (ProfileEdit) or `mb-5` (20px) per block (BlockedDomains).
- CSS panels: `.panel-scroll { padding: 4px 22px 36px; padding-bottom: max(36px, env(safe-area-inset-bottom, 36px)) }`, 768px+ `32px 40px 40px`. `.lead-sheet` zeroes this (`.lp-scroll { padding: 0 !important }`) and pads per region: `.lp-main` `24px 20px 8px` (768px+: `24px 32px 20px`); sections spaced by `.lp-section + .lp-section { margin-top: 32px }` (768px+: 24px).
- LeadPanel desktop body is a two-column grid: `.lp-body { display: grid; grid-template-columns: minmax(0, 1fr) 340px }`, the right column (`.lp-rail`) has a 1px left divider and `padding: 24px 28px`. On mobile the rail stacks below with a 1px top divider and `padding: 20px 20px 28px` (bottom `max(28px, env(safe-area-inset-bottom, 28px))`).
- SequencePanel sections: `.panel-section { margin-bottom: 20px }`, label `.panel-label` 10.5px / 700 uppercase, letter-spacing 0.08em, 8px below.
- DocsSearchPanel results: `max-h-[50vh] overflow-y-auto px-4 py-4` (16px).

### 2.6 Footer

**Standard footer** (verbatim): `shrink-0 border-t px-5 py-4 flex justify-end gap-2.5`

| Property | Value |
|---|---|
| Padding | 20px horizontal, 16px vertical |
| Divider | `border-t`, 1px |
| Sticky | pinned by flex layout (`shrink-0` outside the scrolling body), not `position: sticky` |
| Alignment | right (`justify-end`) |
| Gap | `gap-2.5` = 10px |
| Order | secondary (Cancel / Back / Close) first, primary last (rightmost) |
| Button | `ghostCls` / `primaryCls` / `dangerCls`: `rounded-xl px-4 py-2 text-[13px]`, 600 (ghost) or 700 (primary, danger). Height is content-driven: 8 + 19.5 (13px x 1.5) + 8 = 35.5px, ghost adds a 1px border each side (37.5px) |
| Mobile behavior | identical to desktop (no stacking, no full width) in the standard pattern |

Footer variants:

| Modal | Layout |
|---|---|
| HelpButton, ScrapeSummary results, BlockedDomainsModal | single full-width button: `w-full rounded-xl px-4 py-2.5 text-[14px] font-semibold` (14px, 10px vertical padding) |
| ScrapeSummary failed | two buttons, each `flex-1` (equal halves), container `flex gap-2.5` |
| Blog ReviewModal | `flex flex-col gap-3`: optional schedule row (`rounded-lg border px-3.5 py-2.5`, checkbox + DateTimePicker) above a `flex flex-wrap justify-end gap-2.5` row with up to 3 buttons (tertiary Delete, outlined Reject, primary Approve) |
| LeadDetailModal | `flex flex-col-reverse gap-2.5 px-6 py-4 sm:flex-row sm:items-center sm:justify-end`: below 640px the buttons stack full width with the primary on top; buttons `h-11` (44px) `rounded-lg px-5 text-[14px]` with 16px icons and `gap-2` (8px). Closed state replaces the buttons with a status line `px-6 py-4 text-[13.5px]` |
| CampaignDetailModal | footer only in edit mode; view mode has none |
| client NewCampaignModal | step 0: Cancel + Next; steps 1 to 2: Back + Next; step 3: Back + Create |
| ApprovalQueue EditModal | buttons use `rounded-md` (6px) instead of `rounded-xl` |
| ProfileEditModal | buttons use `rounded-lg` (8px) |
| ConfirmDialog | no divider, `mt-5` (20px) above, `flex justify-end gap-2.5`, `rounded-xl px-4 py-2 text-[13px]` |
| NotificationBells, DocsSearchPanel | no footer |
| `.lp-rail` actions (LeadPanel) | vertical stack `gap: 10px`; `.lp-btn` 48px tall (`.lp-btn-primary` 52px, `.lp-btn-sm` 44px), `padding: 0 16px`, 15px / 600, radius 8px (overridden from 12px). 768px+: all 44px, primary 48px. Paired buttons in `.lp-btn-row { display: flex; gap: 10px }`, each `flex: 1` |
| Cookie dialogs | `flex-wrap gap: 10 justify-content: flex-end`, buttons `padding: 9px 16px` (primary `9px 18px`), radius 10px, 13.5px |
| Tour card | `mt-1 flex justify-end gap-2`, buttons `rounded-lg px-3 py-1.5` (primary `px-3.5`), 12.5px |

### 2.7 Form and input elements

All values are from the shared class strings (`inputCls`, `fieldLbl`) redefined identically in each file.

| Element | Classes | Resolved |
|---|---|---|
| Text input | `w-full rounded-lg border px-3.5 py-2.5 text-[13px] outline-none transition-colors` | 8px radius, 1px border, 14px / 10px padding, 13px text. Height 10 + 19.5 + 10 + 2 = 41.5px |
| Label | `mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em]` | above the input, 11px / 700, uppercase, letter-spacing 0.06em, 6px gap to input |
| Optional marker | `<span className="normal-case font-normal">(optional)</span>` inside the label | |
| Required marker | `RequiredMark`: `ml-0.5` (2px) asterisk plus `sr-only` " (required)" | |
| Helper text | `mt-1 text-[11px]` | 11px, 4px below the input |
| Inline field error / warning | `mt-1 text-[11px]` (amber "Not found"), `mt-1.5 text-[11px]` (scope warning), BlockedDomains `mt-2 text-[12px]` | |
| Form error banner | `rounded-xl border px-4 py-3 text-[13px]` | 12px radius, 16 / 12px padding, last item in body |
| Gap between fields | body `gap-4` = 16px |
| Field pair grid | `grid grid-cols-2 gap-3` (12px), always two columns in admin Clients and Prospects. Responsive versions: `grid grid-cols-1 md:grid-cols-2 gap-3` (Blog review), `grid grid-cols-1 gap-3 sm:grid-cols-2` (ProfileEdit), `grid grid-cols-1 gap-3 sm:grid-cols-3` (DocsEditor) |
| Textarea | `inputCls` + `resize-y`. Rows: 2 (docs summary), 3 (reject reason, campaign description, not-a-fit note), `Math.max(6, lines + 1)` (draft body editors). Min height in px: not present |
| Draft editors (ApprovalQueue, client Approvals, SequenceStepRow) | always-focused look: `rounded-xl` (12px) input/textarea, `px-3.5 py-2.5` / `px-4 py-3`, plus `boxShadow: '0 0 0 3px ...'` (3px ring) in admin. SequenceStepRow uses `rounded-lg px-3 py-2` |
| Markdown editor | toolbar `px-2 py-1.5` with `h-7 w-7` (28px) buttons `rounded-md`; textarea `px-3.5 py-2.5 text-[12.5px] leading-relaxed`, rows 14 (Blog) or 16 (Docs); wrapper `rounded-lg border` with focus-within border change. Preview pane `rounded-lg border px-4 py-3.5`, `maxHeight: 380` |
| Select trigger | `SelectTrigger` with override `h-10 rounded-lg text-[13px] focus:ring-0 focus:ring-offset-0` | 40px high, 8px radius. Base component: `h-10 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2`, chevron `h-4 w-4` |
| Select content | `z-50 min-w-[8rem] rounded-md border shadow-md`, viewport `p-1`; item `rounded-sm py-1.5 pl-8 pr-2 text-sm`, check icon `h-4 w-4` at `left-2` | |
| Checkbox | native `<input type="checkbox">` with `accent-*`, browser default size. Row: `flex items-center gap-2 text-[13px]` (8px gap). With description: `items-start gap-2`, checkbox `mt-0.5`, description `text-[11px]` |
| Toggle switch | Not present inside app modals. Cookie preferences dialog: 36 x 20px track, 16px knob, 2px inset. (Settings page, not a modal: `h-6 w-11` track, `h-5 w-5` knob) |
| Radio | not present |
| Segmented control | DocsEditor Write / Preview: wrapper `flex gap-1 rounded-lg border p-0.5`, buttons `rounded-md px-2.5 py-1 text-[11px] font-bold`. LocationAreaInput mode: `rounded-md border px-2.5 py-1 text-[11.5px] font-semibold`, `gap-1.5`. Warm list sort: `.warm-all-seg { padding: 3px; border-radius: 8px }`, buttons 32px tall, `padding: 0 12px`, 13px / 600, radius 6px |
| Search input in modal | `.warm-all-search`: 40px tall, `padding: 0 12px`, radius 8px, 1px border, icon 15px, 14px text, `flex: 1 1 240px` |
| Filter chip (toggle) | `.warm-all-chip`: 40px tall, `padding: 0 12px`, radius 8px, 13px / 600 |
| Number input | `type="number"` with `inputCls`, clamped in JS (e.g. 10 to 500) |
| Date / time | `DateTimePicker`: trigger `rounded-lg border px-3 py-2 text-[12.5px]` with 13px icon; popover `w-auto p-0`; calendar `p-3`, day buttons `size-8` (32px) `rounded-md`, nav buttons `size-7` (28px); time row `border-t px-3 py-2.5`, `<input type="time">` `rounded-md px-2 py-1.5 text-[12.5px]` |
| Phone input | plain `type="tel"` with `inputCls`, normalized in JS. No mask or country picker |
| Email / URL | `type="email"` / `type="url"` with `inputCls` |
| Datalist (language) | `<input list=...>` with `inputCls` |
| Tag input | `inputCls`, chips below `mt-2 flex flex-wrap gap-1.5`, chip `rounded-full px-2.5 py-1 text-[12px] font-semibold` with 13px `×` |
| Inline input + button | `flex gap-2` (8px), button `shrink-0` ghost or `rounded-lg px-3.5 py-2.5 text-[12.5px]` |
| File upload | not present |
| Stepper (+/-) control | not present |
| Focus style | border color swap (`focus:border-*`) and background swap, `outline-none`. Ring: not used on modal inputs (Select's `focus:ring-2 ring-offset-2` is explicitly zeroed). CSS panel inputs: `box-shadow: 0 0 0 3px` (3px ring, no offset) on `.lp-textarea:focus` and `.warm-all-search:focus-within` |
| Disabled | buttons `disabled:opacity-50` (some add `disabled:cursor-not-allowed`); `.lp-btn:disabled { opacity: 0.55 }`; RowMenu items `opacity-40` |
| Loading | label swap on the primary button (`'Saving…'`, `'Creating…'`, `'Deleting…'`); inline spinner `h-3 w-3 animate-spin rounded-full border-2` (12px, 2px stroke) with 13px text; DocsSearch `Loader2` 14px spin; skeleton blocks `h-10 rounded-lg animate-pulse` (BlockedDomains), `h-6` and `h-24 rounded-xl` (SequencePanel), `SkeletonTable rows={4} cols={2}` (CampaignDetail) |

### 2.8 Display and info modals

| Pattern | Where | Values |
|---|---|---|
| Stat grid (label over value) | ScrapeSummary results | `<dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3.5 border-t pt-4">` (16px columns gap, 14px rows gap, 1px top divider, 16px above). `dt` 11px / 700 uppercase tracking .06em; `dd` `mt-0.5 text-[17px] font-bold` |
| Summary tiles | CampaignDetail | `grid grid-cols-2 gap-3 text-[13px]`, tile `rounded-xl border px-3.5 py-3`, label 10.5px / 700 uppercase tracking .08em, value `mt-0.5` bold |
| Count tiles | CampaignDetail | `grid grid-cols-3 gap-2 text-center`, tile `rounded-xl border px-2 py-2.5`, number `text-[18px] font-extrabold`, caption `mt-0.5 text-[10.5px]` |
| Read-only row (stacked) | client NewCampaign review step (`ReviewRow`) | label `mb-1 text-[10.5px] font-bold uppercase tracking-[.08em]`, value `text-[13.5px]` or tag chips; rows in `flex flex-col gap-3` |
| Label / value inline grid | `.contact-dl` (CSS panel family) | `grid-template-columns: 56px 1fr; gap: 6px 12px; font-size: 14px` |
| Divided list rows | CampaignDetail prospect list | wrapper `rounded-xl border overflow-hidden`, `divide-y`, row `flex items-center justify-between gap-2 px-3.5 py-2.5`, name 13px / 600 truncated, meta 11px |
| Divided list rows | BlockedDomains | wrapper `rounded-xl border overflow-hidden`, row `flex items-center gap-3 border-b px-4 py-3 last:border-0`, 14px leading icon, name 13.5px / 600, meta 11.5px, trailing 32px icon button `h-8 w-8 rounded-lg` |
| Divided list rows | Purge sample | `rounded-xl border`, row `px-3.5 py-2 text-[12.5px]` |
| Link rows | NotificationBells | `flex items-center gap-3 border-b px-5 py-3.5 last:border-0`; 32px round icon chip (`h-8 w-8`, icon 15px) or 6px unread dot (`h-1.5 w-1.5 mt-1.5`); text 13px; meta 11.5px |
| Table | AddCreditsModal history | `w-full text-left text-[12px]`; th `py-1 pr-2 font-semibold`; td `py-1.5 pr-2`; row `border-t` |
| Info / callout card | many | `rounded-xl border px-4 py-3` / `px-4 py-3.5` / `px-3.5 py-2.5`, text 12 to 13px. LeadDetail suggestion: `rounded-lg px-4 py-3.5` with 28px round icon (`h-7 w-7`, icon 15px), `gap-3` |
| Quote block | LeadDetail reply | `rounded-lg border px-4 py-3.5 text-[14px] leading-[1.6] whitespace-pre-line`. `.lp-quote`: `padding: 16px 20px` (768px+ `12px 16px`), radius 10px, 15px, line-height 1.6 |
| Timeline | WarmProspectHistory `.wp-*` | item `min-height: 52px; padding: 6px 0; gap: 14px`, 1px dividers, 11px dot with 2px ring, 1px vertical rail at `left: 5px`. SequenceStepRow: 10px dot (`h-2.5 w-2.5`), 1px rail `min-height: 20`, `gap-3`, `pb-4` |
| Embedded email preview | SequenceStepRow | `<iframe sandbox="">` `mt-2 w-full rounded-lg border`, `minHeight: 180` |
| Pill (status, modal header) | LeadDetail, CampaignDetail | `inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.04em]` |
| Pill (category) | Blog ReviewModal | `rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[.04em]` |
| Pill (row status) | CampaignDetail list | `rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.04em]` |
| Pill (meta) | LeadDetail "Routed" | `rounded-full px-2.5 py-1 text-[11.5px] font-medium` with 12px icon, `gap-1` |
| Pill (small alert) | ScrapeSummary "Repeated" | `rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase` |
| Pill (CSS) | `.status-pill` | 11px / 700 uppercase, letter-spacing 0.05em, radius 5px, padding 2px 7px, line-height 1.6 |
| Pill (CSS) | `.waiting-pill` | 11.5px / 600, radius 5px, padding 2px 8px, line-height 1.6 |
| Badge (CSS) | `.warm-opens-badge` | 11.5px / 700, radius 999px, padding 3px 9px |
| Tag chips | search terms | `rounded-full border px-2.5 py-1 text-[12px]`, `flex flex-wrap gap-1.5` |
| Empty state (modal list) | bells | `px-5 py-14 text-center text-[13px]` (56px vertical padding) |
| Empty state (dashed) | BlockedDomains, LeadDetail, `.lp-empty` | `rounded-xl border border-dashed px-4 py-4 text-[12.5px]`; LeadDetail `rounded-lg border-dashed px-4 py-3.5 text-[13.5px]`; `.lp-empty` padding 16px 20px, 14px |
| Empty state (list modal) | `.warm-all-empty` | `padding: 48px 20px; text-align: center; font-size: 14px` |
| Image thumbnail | Blog ReviewModal cover | `block h-24 w-40` (96 x 160px) `rounded-lg border overflow-hidden`, `object-cover`, opens lightbox |
| Image full view | Blog lightbox | `max-h-full max-w-full object-contain rounded-lg`, overlay `p-6` (24px), close glyph 28px at `right-5 top-5` (20px) |
| Map | LocationAreaInput radius mode | loading placeholder `h-[240px] w-full rounded-lg border` |
| Pagination (in modal) | `.warm-all-foot` | `padding: 12px 20px` (768px+ `12px 28px`), bottom `max(12px, env(safe-area-inset-bottom, 12px))`, 36px square page buttons radius 8px, page number `min-width: 48px` |

Aspect ratio rules for previews: not present (fixed px sizes only).

### 2.9 Confirmation and destructive modals

Two coexisting styles:

**A. Compact confirm (`ConfirmDialog`)**

| Property | Value |
|---|---|
| Size | `max-w-[420px]`, `p-5` (20px all sides), `rounded-md` (6px), `shadow-2xl` |
| Placement | always centered, never full screen, overlay `p-5` |
| Icon | not present |
| Title | `text-[16px] font-bold` |
| Body | `mt-2 text-[13px] leading-relaxed` (8px below title, line-height 1.625) |
| Buttons | `mt-5 flex justify-end gap-2.5`; Cancel ghost then Confirm; `rounded-xl px-4 py-2 text-[13px]`; danger variant swaps the primary to the destructive fill |
| Busy | both buttons disabled, confirm label becomes `'Working…'`, backdrop close disabled |
| Role | `role="alertdialog" aria-modal="true" aria-label={title}` |

**B. Full destructive modal (standard pattern)**, used by Blog Delete, admin Delete Client / Campaign / Prospect, client Delete Campaign, Purge.

| Property | Value |
|---|---|
| Size | 460 to 560px (`max-w-[460px]` client campaign, 480px Blog, 540px Campaign / Prospect, 560px Client) |
| Icon | not present as a standalone icon. Warning is a tinted callout card: `rounded-xl border px-4 py-4`, heading `text-[14px] font-bold`, body `mt-1.5 text-[13px]` (6px gap) |
| Blast radius | label `mb-2 text-[11px] font-bold uppercase tracking-[.06em]`, list `flex flex-col gap-1` (4px), each item `flex items-center gap-2 text-[13px]` with a `✕` glyph; loading spinner 12px while counting |
| Buttons | standard footer, Cancel then `dangerCls` primary; primary disabled until counts load; label includes the entity name |
| Destructive with input | Blog RejectModal: body `gap-3`, textarea rows 3, confirm disabled until a reason is typed |
| Multi-state destructive | PurgeModal: scope select, then dry-run summary (count `text-[17px] font-bold`) with warning card, then result card. Footer swaps: Cancel + "Run dry run", then Back + "Delete N prospects", then Done |

### 2.10 Multi-step and tabbed modals

| Modal | Step UI | Navigation | Height |
|---|---|---|---|
| client `NewCampaignModal` | In the header: bar row `mt-3 flex items-center gap-1.5` of 4 segments, each `h-1 flex-1 rounded-full` (4px tall, 6px gaps, filled up to and including the current step), then `mt-2 text-[11px] font-bold uppercase tracking-[.06em]` label "Step N of 4 - {label}". Steps: Basics, Who to target, Details, Review | Footer right aligned: Cancel or Back (ghost) then Next or Create (primary); per-step validation before advancing | Content-driven, the card resizes per step (`md:h-auto`), no animation between steps |
| Domains `PurgeModal` | No indicator; three states | Footer buttons swap per state | Content-driven |
| `CampaignDetailModal` | View / edit mode toggle via header pencil icon | Footer appears only in edit mode | Content-driven, body gap 20px (view) vs 16px (edit) |
| `DocsEditorModal` | Write / Preview segmented tabs above the body field | n/a | Preview pane capped at `maxHeight: 380` |
| `TourOverlay` | `"Step N of M"` 11px / 700 uppercase eyebrow, Skip link 12px / 600 | Back (from step 2) + Next / Done, right aligned `gap-2` | Card fixed 300px wide |
| LeadPanel | Inline disclosure states (call outcomes, confirm won, not a fit) inside the rail | Inline buttons | Content-driven |

### 2.11 Motion

| Element | Enter | Exit | Timing |
|---|---|---|---|
| Standard overlay | `opacity 0 to 1` | `opacity 1 to 0` | `duration: 0.15` (150ms), default easing |
| Standard card | `y: '100%'` to `y: 0` (slides up a full card height, on desktop too) | `y: '100%'` | spring `damping: 30, stiffness: 300` |
| CSS panel overlay | opacity | opacity | `duration: 0.18` (180ms) |
| CSS panel card | `y: '100%'` to 0 | `y: '100%'` | spring 30 / 300 |
| ConfirmDialog overlay | opacity | opacity | 150ms |
| ConfirmDialog card | `y: 12, opacity: 0` to `y: 0, opacity: 1` | `y: 8, opacity: 0` | 150ms |
| DocsSearchPanel card | `y: -16, opacity: 0` (drops down 16px) | `y: -16, opacity: 0` | 180ms |
| Docs drawer | `x: '-100%'` to 0 | `x: '-100%'` | spring `damping: 32, stiffness: 340`; overlay 150ms fade |
| Blog lightbox | opacity | defined but not wrapped in `AnimatePresence`, so the exit does not play | 150ms |
| Admin mobile nav | opacity | opacity | 180ms; close button `whileTap={{ scale: 0.88 }}` |
| Tour ring | `opacity 0, scale 0.96` to 1 | opacity | spring `damping: 24, stiffness: 260` |
| Tour card | `opacity 0, y: +8 or -8` | opacity | spring `damping: 26, stiffness: 280` |
| Toast | `opacity 0, y: -12, scale 0.98` | `opacity 0, y: -8, scale 0.98` | 180ms |
| Select / Popover | `fade-in-0 zoom-in-95` plus `slide-in-from-*-2` (8px) | `fade-out-0 zoom-out-95` | tw-animate-css defaults (no duration set in code) |
| `.lp-btn:active` | `transform: scale(0.985)` | | `transition: transform 0.08s` |

Exit animations: defined on every modal and played when the modal is rendered inside `<AnimatePresence>` (the pattern used at the call sites reviewed, and required by the comment on `ConfirmDialog`). The Blog lightbox is the one confirmed exception.

Reduced motion: `index.css` has `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }`. This stops CSS animations and transitions (Radix select / popover, `.lp-btn` press) but does not affect Framer Motion, which animates via inline styles. `MotionConfig` / `useReducedMotion`: not present, so modal slide and spring motion still runs under reduced motion.

### 2.12 Responsive behavior

| Breakpoint | Change |
|---|---|
| below 768px (`md`) | Standard modals are full screen (`h-full`, no radius, no backdrop, no shadow) and slide up from the bottom. CSS panels are bottom sheets with a drag handle `.panel-handle` (36 x 4px, radius 99px, `margin: 12px auto 2px`; purely visual, no drag gesture) |
| 768px+ | Centered card, 24px viewport margin, 6px radius, `shadow-2xl`, max height `100vh - 48px`. LeadPanel becomes a two-column 1000px modal with a 340px action rail |
| 640px (`sm`) | LeadDetailModal footer switches from stacked full width (`flex-col-reverse`, primary on top) to a right aligned row. Some field grids go from 1 to 2 or 3 columns. BlockedDomains add-form goes from stacked to a row with a 160px reason field. Blog scheduled card goes from stacked to row |
| 900px | Docs sidebar becomes the left drawer below 900px |

Safe-area padding: only in the CSS panel family (`.panel-scroll` bottom `max(36px, env(safe-area-inset-bottom, 36px))`, `.lp-rail` bottom `max(28px, ...)`, `.warm-all-foot` bottom `max(12px, ...)`). The standard pattern has none, so the full-screen mobile footer sits on the home indicator area.

Keyboard-aware behavior (visualViewport, `dvh`, `svh`): not present. Height uses `100vh` (desktop) and `h-full` (mobile).

Footers on small screens: standard footers keep the same right-aligned row; only LeadDetailModal and the `.lp-rail` adapt.

### 2.13 Accessibility

| Feature | Status |
|---|---|
| Focus trap | not present in any modal |
| Initial focus | not set in standard modals. Present in: DocsSearchPanel (`inputRef.current?.focus()` on mount), WarmProspectsModal (`autoFocus` on search), DateTimePicker calendar (`autoFocus`) |
| Escape to close | not present in modals, except DocsSearchPanel (Escape handled on the input's `onKeyDown` only). RowMenu dropdown closes on Escape |
| `role="dialog"` / `aria-modal` | LeadDetailModal (`aria-labelledby="hl-title"`), LeadPanel (`lp-title`), WarmProspectsModal (`warm-all-title`), WarmProspectHistoryModal (`wp-title`). ConfirmDialog uses `role="alertdialog" aria-modal="true" aria-label={title}`. CookieConsent uses `role="dialog"` with `aria-label`. All other modals: not present |
| Close button label | `aria-label="Close"` on HelpButton, LeadDetail, `.lp-close`, SequencePanel, DocsSearch; docs drawer `aria-label="Close menu"`. Standard `×` glyph buttons: not present |
| Return focus on close | not present |
| Required fields | `RequiredMark` adds a visual `*` (`aria-hidden`) and `sr-only` "(required)" |
| Labels | `<label>` elements are not linked with `htmlFor` in the standard forms (they sit directly above the input); the one `htmlFor` is in LocationAreaInput |

### 2.14 Spacing scale

Every spacing value found in modal code, in px:

`2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 48, 56`

Tally of the most frequent utilities across the 19 files that contain modals (counts include some page markup in the same files):

| Utility | px | Count | Typical use |
|---|---|---|---|
| `gap-2` | 8 | 133 | icon + text, inline control groups |
| `mt-1` | 4 | 88 | helper text below input |
| `px-4 py-3` | 16 / 12 | 80 | error banners, callout cards |
| `gap-3` | 12 | 75 | field pair grids, list rows |
| `px-5 py-4` | 20 / 16 | 62 | modal header and footer |
| `px-4 py-2` | 16 / 8 | 52 | footer buttons |
| `gap-4` | 16 | 41 | modal body section gap |
| `mt-0.5` | 2 | 41 | subtitle below title |
| `gap-2.5` | 10 | 39 | footer button gap |
| `gap-1.5` | 6 | 35 | chip groups |
| `px-5 py-5` | 20 | 31 | modal body |
| `px-3.5 py-2.5` | 14 / 10 | 28 | inputs |
| `mb-1.5` | 6 | 27 | label to input |
| `md:p-6` | 24 | 26 | overlay viewport margin |

Underlying rhythm: a 4px grid with **4 / 8 / 12 / 16 / 20 / 24** as the working set. The modal frame runs on 20 (sides and body) and 16 (header/footer vertical, section gap). Micro spacing uses 2 / 4 / 6 / 10 / 14. The CSS panel family uses an 8px grid (8 / 12 / 16 / 20 / 24 / 32) per its own comment.

### 2.15 Typography sizes

Line-height is the inherited 1.5 unless stated.

| Role | Size | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|
| Modal title (standard) | 18px | 700 | 1.5 | normal |
| Modal title (compact: ConfirmDialog, HelpButton, ScrapeSummary) | 16px | 700 | 1.5 | normal |
| Modal title (Blog review) | 17px | 700 | 1.5 | normal |
| List modal title (bells) | 15px | 700 | 1.5 | normal |
| Detail hero title (LeadDetail) | 24px | 800 | 1.15 | -0.02em |
| Detail hero title (`.lp-title`) | 26px, 28px at 768px+ | 700 | 1.15 | -0.022em |
| Detail hero title (`.panel-biz`) | 24px | 700 | 1.15 | -0.025em |
| List modal hero (`.warm-all-title`) | 22px | 700 | 1.5 | -0.02em |
| Subtitle under title | 12px (12.5px BlockedDomains) | 400 | 1.5 | normal |
| Field label | 11px | 700, uppercase | 1.5 | 0.06em |
| Section eyebrow (admin) | 11px | 700, uppercase | 1.5 | 0.06em |
| Section eyebrow (client) | 10.5px | 700, uppercase | 1.5 | 0.08em |
| Section eyebrow (LeadDetail) | 11.5px | 600, uppercase | 1.5 | 0.06em |
| Section eyebrow (`.lp-eyebrow`) | 12px | 600, uppercase | 1.5 | 0.04em |
| Input text | 13px | 400 | 1.5 | normal |
| Body copy | 13px (14px in HelpButton) | 400 | 1.625 (`leading-relaxed`) where set | normal |
| Detail body (LeadDetail summary) | 15.5px | 400 | 1.6 | normal |
| Detail body (`.lp-summary`) | 17px, 16px at 768px+ | 400 | 1.55 | normal |
| Helper / hint text | 11px | 400 | 1.5 | normal |
| Error banner text | 13px | 400 | 1.5 | normal |
| Footer button | 13px | 600 (ghost), 700 (primary, danger) | 1.5 | normal |
| Full-width footer button | 14px | 600 | 1.5 | normal |
| LeadDetail outcome button | 14px | 600 / 700 | 1.5 | normal |
| `.lp-btn` | 15px (14px small) | 600 | inherit | -0.005em |
| Status pill | 11px | 700, uppercase | 1.5 | 0.04em |
| Data value (stat) | 17px (dl), 18px (count tile, credits balance) | 700 / 800 | 1.5 | normal |
| Close glyph | 24px (22px bells and HelpButton) | 400 | 1 | normal |

---

## 3. Comparison (Step 3)

"Std" = standard pattern. Header std = `px-5 py-4`, 18px title, `×` close, 1px divider. Footer std = `px-5 py-4`, right aligned, `gap-2.5`, 1px divider. Anim std = 150ms overlay fade + card slide `y 100%` spring 30 / 300. Padding is the body padding.

| File | Modal | Type | Width (md+) | Max-height | Padding | Header | Footer | Shared base | Animation |
|---|---|---|---|---|---|---|---|---|---|
| components/ConfirmDialog.tsx | ConfirmDialog | Confirm | 420 | content | 20 (card) | no header bar, 16px title | no divider, `mt-5` | yes (is the base) | 150ms fade + y 12 |
| components/HelpButton.tsx | HelpButton | Info | 460 | 100vh-48 | 20, gap 12 | std, 16px title, leading icon, 28px close | full-width button | no | std |
| admin/ApprovalQueue.tsx | EditModal | Form | 600 | 100vh-48 | 20, gap 16 | std + subtitle | std, `rounded-md` buttons | no | std |
| admin/Blog.tsx | TopicModal | Form | 520 | 100vh-48 | 20, gap 16 | std | std | no | std |
| admin/Blog.tsx | ReviewModal | Large form | 680 | 100vh-48 | 20, gap 16 | pill + 17px truncated | 2 rows, 3 buttons | no | std |
| admin/Blog.tsx | Lightbox | Image | full | full | 24 overlay | none, floating 28px close | none | no | fade, no exit |
| admin/Blog.tsx | RejectModal | Destructive input | 480 | 100vh-48 | 20, gap 12 | std | std, danger | no | std |
| admin/Blog.tsx | DeleteModal | Destructive | 480 | 100vh-48 | 20, gap 12 | std | std, danger | no | std |
| admin/CampaignsAndLeads.tsx | ScrapeSummary | Display | 540 | 100vh-48 | 20, gap 16 | std, 16px title | full width / split | CampModalShell | std |
| admin/CampaignsAndLeads.tsx | NewCampaign | Form | 540 | 100vh-48 | 20, gap 16 | std | std | no | std |
| admin/CampaignsAndLeads.tsx | EditCampaign | Form | 540 | 100vh-48 | 20, gap 16 | std | std | CampModalShell | std |
| admin/CampaignsAndLeads.tsx | DeleteCampaign | Destructive | 540 | 100vh-48 | 20, gap 16 | std | std | CampModalShell | std |
| admin/CampaignsAndLeads.tsx | LeadDetailModal | Details | 640 | 100vh-48 | 24, gap 28 | 24/20 pad, 24px 800 title, 36px round close | 44px buttons, stacks below 640 | no | std, 50% backdrop |
| admin/Clients.tsx | 5 modals | Form / destructive | 560 | 100vh-48 | 20, gap 16 | std | std | ModalShell | std, **no backdrop close** |
| admin/DocsAdmin.tsx | NewArticle | Form | 480 | 100vh-48 | 20, gap 16 | std | std | no | std, z-100 |
| admin/Domains.tsx | AddDomain | Form | 480 | 100vh-48 | 20, gap 16 | std | std | no | std |
| admin/Domains.tsx | FreeProviders | Confirm | 480 | 100vh-48 | 20, gap 16 | std | std | no | std |
| admin/Domains.tsx | Purge | Multi-state | 520 | 100vh-48 | 20, gap 16 | std | std, swaps | no | std |
| admin/Prospects.tsx | New / Edit / Delete | Form / destructive | 540 | 100vh-48 | 20, gap 16 | std | std | no | std |
| admin/Layout.tsx | Notification bell | List | 420 | 100vh-48 | 0 (rows 20/14) | std, 15px span title | none | no | std, z-100, plain click close |
| admin/Layout.tsx | Mobile nav | Fullscreen nav | full | full | 20 | `18px 20px 16px`, 36px round close | n/a | no | 180ms fade |
| client/Approvals.tsx | EditModal | Form | 600 | 100vh-48 | 20, gap 16 | std + subtitle | std | no | std |
| client/Campaigns.tsx | NewCampaign | Multi-step | 540 | 100vh-48 | 20, gap 16 | std + step bar | std, Back/Next | no | std |
| client/Campaigns.tsx | CampaignDetail | Details + edit | 600 | 100vh-48 | 20, gap 20 (view) | std + pills + icon buttons | edit mode only | no | std |
| client/Campaigns.tsx | DeleteCampaign | Destructive | 460 | 100vh-48 | 20, gap 16 | std | std | no | std, z-60 |
| client/Settings.tsx | ProfileEdit | Large form | 560 | 100vh-48 | 20, `mb-4` per field | std | std, `rounded-lg` buttons | no | std, 45% backdrop all sizes |
| client/BlockedDomains.tsx | BlockedDomains | List manager | 560 | 100vh-48 | 20, `mb-5` blocks | std + subtitle | full-width Close | no | std, 45% backdrop all sizes |
| client/Shell.tsx | Notification bell | List | 420 | 100vh-48 | 0 (rows 20/14) | std, 15px span + text action | none | no | std, z-100, plain click close |
| client/Dashboard.tsx | LeadPanel | Details + actions | 1000 | 90vh / 100vh-48 | 20 (32 at 768+) | `.lp-header`, 26/28px title | `.lp-rail` | panel CSS | 180ms fade + slide |
| client/Dashboard.tsx | WarmProspects | List | 880 | 90vh / 100vh-48 | rows | `.warm-all-head` | pagination bar | panel CSS | 180ms fade + slide |
| client/Dashboard.tsx | WarmProspectHistory | Details | 1000 | 90vh / 100vh-48 | 20 (32 at 768+) | `.lp-header` | `.lp-rail` | panel CSS | 180ms fade + slide |
| client/Prospects.tsx | SequencePanel | Details + edit | 640 / 920 | 90vh / 100vh-48 | 22 sides (40 at 768+) | `.panel-top` eyebrow + 24px name | none | panel CSS, 8px radius | 180ms fade + slide |
| docs/DocsEditorModal.tsx | DocsEditor | Large form + tabs | 760 | 100vh-48 | 20, gap 16 | std + subtitle | std | no | std, z-100 |
| docs/DocsSearchPanel.tsx | Search | Palette | 620 | results 50vh | 16 | search input row | none | no | 180ms drop 16px |
| docs/Docs.tsx | Mobile drawer | Left drawer | 82% / 320 | full | `16px 14px 24px` | 18px icon close | none | no | spring 32 / 340 |
| tour/TourOverlay.tsx | Tour | Coach mark | 300 | content | 16 | step eyebrow | right row | no | springs |
| components/CookieConsent.tsx | Banner / prefs | Consent | 720 / 480 | content | 20x22 / 24 | 14.5px / 16px 800 title | right row | no | none |

### Deviations from the standard

1. **Clients `ModalShell` ignores `onClose`.** The overlay has no click handler, so the 5 Clients modals cannot be dismissed by clicking the backdrop. Every other standard modal can.
2. **Inconsistent backdrop close mechanics.** HelpButton and both NotificationBells use a plain `onClick` instead of `useOverlayClose`, so a text selection dragged out of the card closes them.
3. **Backdrop opacity varies:** 40% (standard, desktop only), 45% inline on ConfirmDialog, ProfileEdit, BlockedDomains and all CSS panels (applied on mobile too), 50% on LeadDetailModal.
4. **Z-index drift:** standard is 50, but DocsEditorModal, DocsAdmin NewArticleModal and both NotificationBells use 100, client DeleteCampaign uses 60, CSS panels use 30. Radix `SelectContent` is `z-50`, so by z-index alone a select dropdown opened inside a z-100 modal (DocsEditor, DocsAdmin NewArticle) would paint under the overlay. Worth verifying in the browser.
5. **Button radius drift:** `rounded-xl` (12px) is standard; ApprovalQueue EditModal uses `rounded-md` (6px), ProfileEditModal uses `rounded-lg` (8px), `.lp-btn` uses 8px.
6. **Input vs select height:** text inputs compute to 41.5px, select triggers are fixed at 40px (`h-10`), so mixed rows are 1.5px off.
7. **Title sizes:** 18px standard, but 16px (ScrapeSummary, HelpButton, ConfirmDialog), 17px (Blog review), 15px (bells), 24 to 28px (detail sheets).
8. **Body spacing method:** standard uses `flex-col gap-4`; ProfileEdit and BlockedDomains use per-element `mb-4` / `mb-5`.
9. **Close control:** standard is an unlabeled `×` glyph with no fixed hit area; LeadDetail and the CSS panels use a 36px labeled circle, HelpButton a 28px labeled circle, DocsSearch a padded icon.
10. **SequencePanel radius:** `rounded-lg` overrides the panel's top-only 6px radius, so its mobile bottom sheet has rounded bottom corners too (8px).
11. **LeadDetailModal** is the only standard-pattern modal with a desktop border, 24px padding, 28px section gap, 44px buttons and a responsive stacked footer.
12. **Blog lightbox** exit animation never runs (not inside `AnimatePresence`).
13. **No standard modal** has Escape handling, focus trap, initial focus, `role="dialog"` or body scroll lock.

---

## 4. Modal design rules (Step 4)

### 4.1 Tokens

| Token | Value |
|---|---|
| Spacing unit | 4px |
| Frame padding (header, body, footer sides) | 20px |
| Header / footer vertical padding | 16px |
| Body vertical padding | 20px |
| Section gap in body | 16px (12px for short confirm bodies, 20px for read-only detail) |
| Field pair gap | 12px |
| Label to input | 6px |
| Input to helper | 4px |
| Footer button gap | 10px |
| Viewport margin (desktop) | 24px each side, so max height is `100vh - 48px` |
| Card radius (desktop) | 6px |
| Inner card / callout radius | 12px |
| Input / select / small button radius | 8px |
| Footer button radius | 12px |
| Pill radius | 9999px (rounded) or 5px (table pills) |
| Divider | 1px, header bottom and footer top |
| Elevation | `shadow-2xl` on the card (desktop only); no shadow on mobile full-screen |
| Backdrop | 40% black, no blur |
| Input height | about 42px (`px-3.5 py-2.5`, 13px text, 1px border); select 40px |
| Button height | about 36px (`px-4 py-2`, 13px); large touch buttons 44px |
| Title | 18px / 700 |
| Subtitle | 12px, 2px below title |
| Label | 11px / 700 / uppercase / 0.06em |
| Body text | 13px, line-height 1.625 for paragraphs |
| Helper | 11px |
| Button text | 13px, 600 secondary, 700 primary |
| Motion | overlay fade 150ms; card spring damping 30, stiffness 300 from `y: 100%` |
| Z-index | backdrop + modal 50, stacked modal 60, toasts 110, popovers 200 |

### 4.2 Structure

1. Overlay: `fixed inset-0`, flex column. Below 768px no padding and no backdrop (the card is the screen). At 768px+ center the card with 24px padding and a 40% backdrop. Close on backdrop only when both mousedown and mouseup hit the overlay (`useOverlayClose`).
2. Card: `w-full flex flex-col overflow-hidden`, `h-full` on mobile, `h-auto max-h-[calc(100vh-48px)] max-w-[size] rounded-md shadow-2xl` on desktop. Hide scrollbars.
3. Header (`shrink-0`, `px-5 py-4`, bottom divider): title left, close right. Optional 12px subtitle, optional leading icon (15px) or status pill row.
4. Body (`flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4`): the only scrolling region. Children must not shrink. Error banner last.
5. Footer (`shrink-0`, `px-5 py-4`, top divider, `flex justify-end gap-2.5`): secondary first, primary last. A single acknowledgement action becomes one full-width 14px button.
6. Loading: swap the primary label to a present-participle with an ellipsis and disable it.

### 4.3 Recommended size variants

| Variant | Max width | Use for | Notes |
|---|---|---|---|
| `xs` confirm | 420px | Yes / no confirmation, list popovers (notifications) | `ConfirmDialog`: no header bar, 20px card padding, 16px title, centered on every screen size |
| `sm` | 460 to 480px | Destructive confirm with context, 1 to 3 field forms, info / help | Blog Reject / Delete, AddDomain, HelpButton |
| `md` | 520 to 560px | Standard create / edit forms, multi-step wizard, list manager | The most used band (540 and 560px). Two-column field pairs fit here |
| `lg` | 600 to 680px | Content editing (email drafts), details with edit mode, review screens | ApprovalQueue / Approvals editors, CampaignDetail, LeadDetail (640), Blog review (680) |
| `xl` | 760px | Long-form editors (markdown) | DocsEditorModal |
| Wide sheet | 880 to 1000px | Rich details with a side action rail, or long lists | CSS panel family: bottom sheet below 768px (max 90vh, handle, top-only radius, safe-area padding), centered two-column modal at 768px+ (`1fr` + 340px rail) |
| Palette | 620px | Search / command | Top anchored at 10vh, results capped at 50vh, input autofocus, Escape closes |
| Drawer | 82% wide, max 320px | Mobile navigation | Left edge, full height, `16px 14px 24px` padding, spring slide on x |

---

## 5. Reference snippets (Step 5)

Color classes and inline color values are removed and marked `[color omitted]`. Everything else is verbatim.

### 5.1 Shared base: `ConfirmDialog` and `useOverlayClose`

`src/components/ConfirmDialog.tsx`

```tsx
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useOverlayClose } from '../hooks/useOverlayClose';

/* Small centred confirm modal. Render inside <AnimatePresence> so it animates out. */
export function ConfirmDialog({
  title, children, confirmLabel, cancelLabel = 'Cancel', danger = false, busy = false, onConfirm, onCancel,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center p-5"
      style={{ background: '[color omitted, 45% opacity]', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(busy ? () => {} : onCancel)}
    >
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[420px] rounded-md p-5 shadow-2xl"
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 8, opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="m-0 text-[16px] font-bold">{title}</h2>
        {children && <div className="mt-2 text-[13px] leading-relaxed">{children}</div>}
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="cursor-pointer rounded-xl border bg-transparent px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`cursor-pointer rounded-xl px-4 py-2 text-[13px] font-bold transition-colors disabled:opacity-50 ${
              danger
                ? 'border [color omitted]'
                : 'border-0 [color omitted]'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
```

`src/hooks/useOverlayClose.ts`

```ts
import { useRef, useCallback, type MouseEvent } from 'react';

/**
 * Closes a modal/panel only when both mousedown and mouseup land on the
 * overlay itself. Without this, dragging a text selection from inside the
 * panel out past the overlay edge fires a click on the overlay (mouseup
 * target) and closes the modal mid-selection.
 */
export function useOverlayClose(onClose: () => void) {
  const downOnOverlay = useRef(false);

  const onMouseDown = useCallback((e: MouseEvent<HTMLElement>) => {
    downOnOverlay.current = e.target === e.currentTarget;
  }, []);

  const onMouseUp = useCallback((e: MouseEvent<HTMLElement>) => {
    if (downOnOverlay.current && e.target === e.currentTarget) {
      onClose();
    }
    downOnOverlay.current = false;
  }, [onClose]);

  return { onMouseDown, onMouseUp };
}
```

The de facto base for every other modal is this shell (`src/screens/admin/CampaignsAndLeads.tsx`, `CampModalShell`):

```tsx
/* ── Modal shell ───────────────────────────────────────────────────── */
function CampModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:p-6" /* md: backdrop 40% opacity [color omitted] */
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose)}
    >
      <motion.div
        style={FONT}
        className="modal-card flex w-full flex-col overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[540px] md:rounded-md md:shadow-2xl"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
```

Supporting CSS (`src/index.css`):

```css
/* Modal cards size to their content (up to the window height) with no
   visible scrollbar - overflow only kicks in on very short windows, and
   then scrolls without the bar. */
.modal-card,
.modal-card * {
  scrollbar-width: none;
}
.modal-card::-webkit-scrollbar,
.modal-card *::-webkit-scrollbar {
  display: none;
}

/* A modal body is a scrolling flex column - its children must keep their
   natural height and let the body scroll. Without this, any child with
   overflow:hidden (min-height becomes 0) gets squashed to its border when
   the content is taller than the window. */
.modal-card .overflow-y-auto.flex-col > * {
  flex-shrink: 0;
}
```

### 5.2 Input / form modal: `AddDomainModal`

`src/screens/admin/Domains.tsx`

```tsx
const ghostCls   = 'cursor-pointer whitespace-nowrap rounded-xl border bg-transparent px-4 py-2 text-[13px] font-semibold transition-colors';
const primaryCls = 'cursor-pointer whitespace-nowrap rounded-xl border-0 px-4 py-2 text-[13px] font-bold transition-colors disabled:opacity-50';

function AddDomainModal({
  clients, onClose, onAdd, onAdded,
}: {
  clients: { id: string; business_name: string }[];
  onClose: () => void;
  onAdd: (domain: string, reason: string, clientId: string | null) => Promise<{ error: string | null }>;
  onAdded: () => void;
}) {
  const [scope, setScope] = useState<'global' | string>('global');
  const [domain, setDomain] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fieldLbl = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[.06em]';
  const inputCls = 'w-full rounded-lg border px-3.5 py-2.5 text-[13px] outline-none transition-colors';

  async function submit() {
    if (!domain.trim()) { setErr('Enter a domain, website, or email address.'); return; }
    setBusy(true); setErr(null);
    const { error } = await onAdd(domain.trim(), reason, scope === 'global' ? null : scope);
    setBusy(false);
    if (error) { setErr(error); return; }
    onAdded();
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:p-6" /* md: backdrop 40% opacity [color omitted] */
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose)}
    >
      <motion.div
        style={FONT}
        className="modal-card flex w-full flex-col overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[480px] md:rounded-md md:shadow-2xl"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold">Add blocked domain</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <div>
            <label className={fieldLbl}>Scope</label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger style={FONT} className="h-10 rounded-lg text-[13px] focus:ring-0 focus:ring-offset-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={FONT} className="text-[13px]">
                <SelectItem value="global">Global - every client</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>)}
              </SelectContent>
            </Select>
            {scope === 'global' && (
              <p className="mt-1.5 text-[11px]">This blocks the domain for every client on the platform.</p>
            )}
          </div>
          <div>
            <label className={fieldLbl}>Domain<RequiredMark /></label>
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" style={FONT} className={inputCls} />
            <p className="mt-1 text-[11px]">A domain, a website address, or an email address all work.</p>
          </div>
          <div>
            <label className={fieldLbl}>Reason <span className="normal-case font-normal">(optional)</span></label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Competitor domain" style={FONT} className={inputCls} />
          </div>
          {err && <div className="rounded-xl border px-4 py-3 text-[13px]">{err}</div>}
        </div>
        <div className="shrink-0 border-t px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className={ghostCls}>Cancel</button>
          <button onClick={submit} disabled={busy} className={primaryCls}>{busy ? 'Adding…' : 'Add domain'}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
```

Two-column field pair as used in the larger forms (`src/screens/admin/Clients.tsx`, `EditClientModal`):

```tsx
<div className="grid grid-cols-2 gap-3">
  <div>
    <label className={fieldLbl}>Business type</label>
    <input value={businessType} onChange={(e) => setBusinessType(e.target.value)} style={FONT} className={inputCls} />
  </div>
  <div>
    <label className={fieldLbl}>Location</label>
    <input value={location} onChange={(e) => setLocation(e.target.value)} style={FONT} className={inputCls} />
  </div>
</div>
```

### 5.3 Display / details modal: `ScrapeSummaryModal` (results branch)

`src/screens/admin/CampaignsAndLeads.tsx`

```tsx
  return (
    <CampModalShell onClose={onClose}>
      <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
        <h2 className="m-0 text-[16px] font-bold">Scrape results</h2>
        <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
        <div>
          <p className="m-0 truncate text-[13px]" title={campaign.name}>{campaign.name}</p>
          <p className="m-0 mt-1 text-[15px] font-semibold">{sr.text}</p>
        </div>
        {rows.length > 0 && (
          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3.5 border-t pt-4">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-bold uppercase tracking-[.06em]">{label}</dt>
                <dd className="m-0 mt-0.5 text-[17px] font-bold">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="m-0 text-[11px]">{lastScrapedLabel(campaign)}</p>
      </div>
      <div className="shrink-0 border-t px-5 py-4">
        <button onClick={onClose} className="w-full cursor-pointer rounded-xl border-0 px-4 py-2.5 text-[14px] font-semibold transition-colors">
          Close
        </button>
      </div>
    </CampModalShell>
  );
```

### 5.4 Confirmation / destructive modal: Blog `DeleteModal`

`src/screens/admin/Blog.tsx` (the compact alternative is `ConfirmDialog` in 5.1)

```tsx
function DeleteModal({
  post, busy, onClose, onConfirm,
}: { post: BlogPost; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const isPublished = post.status === 'published' || post.status === 'scheduled';

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:p-6" /* md: backdrop 40% opacity [color omitted] */
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      {...useOverlayClose(onClose)}
    >
      <motion.div
        style={FONT}
        className="modal-card flex w-full flex-col overflow-hidden h-full md:h-auto md:max-h-[calc(100vh-48px)] md:max-w-[480px] md:rounded-md md:shadow-2xl"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <h2 className="m-0 text-[18px] font-bold">{isPublished ? 'Delete post' : 'Delete draft'}</h2>
          <button onClick={onClose} className="cursor-pointer border-0 bg-transparent text-[24px] leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-3">
          <div className="rounded-xl border px-4 py-4">
            <p className="m-0 text-[14px] font-bold">Delete "{post.title}"?</p>
            <p className="m-0 mt-1.5 text-[13px]">
              {isPublished
                ? 'This permanently removes it from the public site. This cannot be undone.'
                : "This isn't a rejection - WF12 will treat the topic as still needing a post and draft a fresh one on its next scheduled run."}
            </p>
          </div>
        </div>
        <div className="shrink-0 border-t px-5 py-4 flex justify-end gap-2.5">
          <button onClick={onClose} className="cursor-pointer rounded-xl border bg-transparent px-4 py-2 text-[13px] font-semibold transition-colors">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="cursor-pointer rounded-xl border-0 px-4 py-2 text-[13px] font-bold transition-colors disabled:opacity-50"
          >
            {busy ? 'Deleting…' : isPublished ? 'Delete post' : 'Delete draft'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
```

### 5.5 Drawer / slide-over

**Left drawer** (`src/screens/docs/Docs.tsx` and `Docs.css`). Right side drawer: not present.

```tsx
        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileNavOpen && (
            <motion.div
              className="docs-mobile-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMobileNavOpen(false)}
            >
              <motion.div
                className="docs-mobile-drawer"
                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 340 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button className="docs-mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
                  <X size={18} />
                </button>
                {sidebarContent}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
```

```css
/* ── Mobile drawer ───────────────────────────────────────────────────── */
.docs-mobile-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: [color omitted, 40% opacity];
  display: none;
}
.docs-mobile-drawer {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  width: 82%;
  max-width: 320px;
  background: [color omitted];
  padding: 16px 14px 24px;
  overflow-y: auto;
}
.docs-mobile-close {
  border: none;
  background: [color omitted];
  color: [color omitted];
  border-radius: 8px;
  padding: 6px;
  cursor: pointer;
  margin-bottom: 12px;
}

@media (max-width: 899px) {
  .docs-mobile-overlay { display: block; }
}
```

**Bottom sheet that becomes a centered modal** (`src/screens/client/Dashboard.css`, used by LeadPanel, WarmProspects, WarmProspectHistory, SequencePanel):

```css
  .panel-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    background: [color omitted, 45% opacity];
    z-index: 30;
  }
  .panel {
    width: 100%;
    max-width: 640px;
    max-height: 90vh;
    background: [color omitted];
    border-radius: 6px 6px 0 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .panel-handle {
    flex-shrink: 0;
    border-radius: 99px;
    width: 36px;
    height: 4px;
    background: [color omitted];
    margin: 12px auto 2px;
  }
  .panel-scroll {
    overflow-y: auto;
    flex: 1;
    padding: 4px 22px 36px;
    padding-bottom: max(36px, env(safe-area-inset-bottom, 36px));
  }

  @media (min-width: 768px) {
    .panel-overlay { align-items: center; padding: 24px; }
    .panel {
      max-width: 920px;
      max-height: calc(100vh - 48px);
      border-radius: 6px;
    }
    .panel-handle { display: none; }
    .panel-scroll { padding: 32px 40px 40px; }
  }
```

```tsx
    <motion.div
      className="panel-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      {...useOverlayClose(onClose)}
    >
      <motion.aside
        className="modal-card panel lead-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lp-title"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-handle" />

        <div className="panel-scroll lp-scroll">
          {/* [omitted for length: header, two-column body, action rail] */}
        </div>
      </motion.aside>
    </motion.div>
```
