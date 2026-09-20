# CLAUDE.md

## Mission
Offcut is an installable, offline-first PWA that helps a carpenter plan cuts from sheet material and reuse leftovers instead of wasting them. He types the pieces he needs; the app checks saved leftovers first, opens a new sheet only when nothing fits, and shows a coloured to-scale diagram with cut steps. Confirming a cut permanently saves new leftovers to stock, which syncs across his phones when internet returns.

## Source of truth
`docs/SRS.html` is the specification (FR-xxx, NFR-xxx, screens in §9, checklist in §20). `CLAUDE_CODE_PROMPT.md` (from `=== PROMPT START ===`) adds execution detail and **wins on conflict**. Do not invent features; ask if something is ambiguous or missing from both.

## Rules R1–R16 (breaking any of these is a bug, even if tests pass)
- [ ] R1. Engine is pure TypeScript: no React, no Firebase, no hidden `Date.now()` except sheet dates. Same inputs, same plan.
- [ ] R2. A saved leftover is always preferred over a new sheet.
- [ ] R3. Among fitting leftovers, use smallest area; ties broken by tightest fit on the shorter remaining side.
- [ ] R4. Turn a piece only when it does not fit unturned. Try order: leftover unturned, open sheet unturned, leftover turned, open sheet turned, new sheet (unturned first).
- [ ] R5. All cuts are guillotine (edge to edge). Split remainder into full-width bottom strip + right strip keeping piece height. List "across" cut before "down" cut.
- [ ] R6. Kerf off by default; when on, removed after each placement; pieces never shrunk.
- [ ] R7. A remainder is saved only if its shorter side ≥ minimum leftover size (default 1 in). Smaller is silently dropped.
- [ ] R8. History is append-only. Phones only add records (`cut`, `manual`, `discard`, `resolution`). Stock is calculated, never stored/edited.
- [ ] R9. A plan changes nothing. Only Confirm cut writes a record.
- [ ] R10. Never await the network after a write. Fire `setDoc`, catch to console, move on.
- [ ] R11. Conflicts ordered by server timestamp, never phone clock. First to server wins; ties by creation time then id. Unanswered conflict contributes nothing to stock.
- [ ] R12. Ids generated on-device (`crypto.randomUUID`). No feature requires server-created ids.
- [ ] R13. Everything works offline except first login per device.
- [ ] R14. No technical words reach the user (no error codes, "sync conflict", "rectangle", "entity"). Use: cut, sheet, piece, leftover, waste.
- [ ] R15. Colour is never the only signal — every diagram block has a text label or letter.
- [ ] R16. Sizes entered as `22`, `22.5`, `22 1/2`, `22-1/2"`, `3/8`, `22 in`; displayed as fractions to nearest 1/16. Leftovers shown short side first (`19 × 48`). Pieces keep typed order (width × height).
- [ ] R17. Leftover-restricted planning ("Use this in a new job") never silently opens a new sheet. The engine runs with `packJob`'s `allowNewSheets: false`; anything that does not fit that one leftover, even turned, is left `unplaced` for New job's "Doesn't fit this leftover" dialog to handle (Use a new sheet / Change the size / Choose another leftover). Only an explicit "Use a new sheet" tap allows a new sheet in this mode.

## Tech stack
| Concern | Choice |
|---|---|
| Build | Vite 5, React 18, TypeScript strict (`noUnusedLocals`, `noUnusedParameters`) |
| Styling | Tailwind CSS 3, CSS variable tokens, shadcn/ui (new-york style) |
| State | Zustand 5 (`persist` where noted) |
| Routing | React Router 6 (`BrowserRouter`) |
| Icons | `@tabler/icons-react` |
| Backend | Firebase Auth (email/password), Cloud Firestore (persistent local cache), Hosting |
| PWA | `vite-plugin-pwa` (Workbox), `registerType: 'autoUpdate'` |
| Tests | Vitest for logic; Playwright optional for journeys |

Forbidden without asking first: Dexie/second local DB, Redux/MobX/React Query, Next.js/server/Cloud Functions, any bin-packing library, non-shadcn UI kit, analytics/ads/tracking.

## Commands
- `npm run dev` — start Vite dev server
- `npm test` — run Vitest (`vitest run`)
- `npm run typecheck` — `tsc -b --noEmit`
- `npm run build` — `tsc -b && vite build`
- `npm run emulators` — Firebase emulators (to be added in Stage 1: auth 9099, firestore 8080, ui 4000)

## Folder map
```
offcut/
├─ CLAUDE.md  README.md (stage 11)  docs/SRS.html
├─ index.html  vite.config.ts  tailwind.config.js  postcss.config.js  tsconfig.json
├─ components.json  firebase.json  .firebaserc  firestore.rules  firestore.indexes.json
├─ .env.example  .gitignore
├─ public/icons/            favicon.svg, icon-192/512.png, maskable-512.png, apple-touch-icon.png
└─ src/
   ├─ main.tsx  App.tsx  index.css  vite-env.d.ts
   ├─ lib/       types, id, inches, format, summary, utils, packer, stock, sheetView, diagramLayout, print, firebase, db, packer.test
   ├─ store/     auth, data, job, settings, toast
   ├─ components/
   │  ├─ ui/         button, input, label, switch (+ dialog if needed)
   │  ├─ AppShell.tsx, SheetDiagram.tsx, PlanSheet.tsx, PrintPage.tsx, SyncBadge.tsx, Stepper.tsx, Toast.tsx
   └─ pages/
      Login, Home, NewJob, Plan, Stock, LeftoverDetail, AddLeftover, SyncCheck, Settings, JobDetail, Print, CutSaved
```

## Corrections (prompt wins over SRS)
- **C1.** Sheet size on screen is length × width: `96 × 48`. Settings shows length field first, then width, hint "Length, then width." Engine internally stays width × height (`sheetW = 48`, `sheetH = 96`).
- **C2.** Piece size inputs use `inputMode="text"`, not `decimal` (fractions like `22 1/2` need a slash).
- **C3.** Test T-18 (same records in different order → identical derived stock) must be added; it was missing from the starter.
- **C4.** SheetDiagram: every block shows its size, never a bare letter — either its own on-screen label, or a listing in the Sizes list. Superseded by C15, which replaced the pw/ph-threshold label machinery this entry originally described.
- **C5.** Settings uses a local draft + explicit "Save changes" bar (validated only on Save; a sheet-size change asks for confirmation first; leaving with unsaved changes asks Save/Discard/Stay). New job's own blade toggle stays instant with its own toast — it is not part of Settings' draft.
- **C6.** Home's Recent jobs shows up to 30 jobs in its own independently-scrolling list (not the whole page), so the primary buttons stay visible.
- **C7.** Normal (non-restricted) planning announces automatic leftover use on Plan: a green banner with exact copy (`lib/leftoverAnnounce.ts`: `leftoverUseMessage`, `usingLeftoverToast`, `forcedNewSheetNote`, `wouldUseLeftover`), an "Use a new sheet instead" button that sets `useJob().forceNewSheet` (packs with empty stock), and a reversible "Use the leftover" note once forced. Reset `forceNewSheet` on `clearJob`, on pieces changing, and when starting a new job from Home. Confirm-cut toast names the leftover letter when one was used. This is separate from leftover-restricted mode (`onlyLeftoverId`, C-prior), which keeps its own strict popup and never shows these banners.
- **C8.** `SheetPlan.cuts` (`packer.ts`/`types.ts`) is optional structured cut-line data (`{n, kind, pos, from, to}`) paralleling `steps` exactly, filled in `packer.ts`'s `buildCuts` right where `buildSteps` already runs; older saved records without it simply draw no numbered cut lines. `PlanSheet.tsx` wires Cut-order-list clicks to highlight the matching SVG cut line (and back), a Full screen dialog (`react-zoom-pan-pinch`), and a Save image button that rasterizes the SVG to PNG via canvas. (The original "technical drawing" geometry this entry described — dimension lines, hatching, a ruler — was replaced by the simpler model in C15.)
- **C9.** `sheetView.ts`'s `BlockKind` has a `'waste'` member so uncovered sheet area (computed by coordinate compression, unchanged) flows through the same rendering/labelling/Sizes-list pass as every other block kind, with no special-casing. (The per-rectangle edge-label/callout machinery this entry originally described was replaced by C15's single label-or-badge-or-list model.)
- **C10.** `/print/:jobId` (`pages/Print.tsx`, deliberately not wrapped in `AppShell` — printing needs its own minimal chrome) renders one page per `cut.sheets[i]` from `buildPrintPages` (`lib/print.ts`, pure, no DOM), reusing `buildBlocks` for the same diagram geometry and C9's `allRectSizeLabels` for the same parts-table rows the screen draws. `components/PrintPage.tsx` renders a page's header/live-`SheetDiagram`/cut-order/parts-table/footer for both the on-screen preview and the actual print output — never a rasterized image. A `<style>` tag sets `@page { size: A4|letter; margin: 0 }` per `settings.paperSize`, `print-color-adjust: exact`, and `page-break-after` on all but the last page; `window.print()` is the only print mechanism, no PDF library. Reached from Job detail's new Print button and from `/cut-saved` (below).
- **C11.** `Settings.sheetW`/etc. gained `showPrintAfterConfirm: boolean` (default `true`) and `paperSize: 'A4' | 'Letter'` (default `'A4'`), wired into Settings.tsx's existing draft/dirty/Save/Discard/leave-guard flow (C5) — no parallel save path. `Plan.tsx`'s `onConfirm()` still saves the record and fires `saveCut()` exactly as before (R10 untouched); only what happens *after* that changes: when `showPrintAfterConfirm` is true it `navigate('/cut-saved', { state: { cutId, sheetCount } })` instead of toasting and going home. `pages/CutSaved.tsx` is a new route reading that router location state (not a store field — the summary is one-shot and nothing about it needs to persist), offering Print / Save as PDF (both go to `/print/:jobId`, the PDF one passing `{ state: { hint: 'pdf' } }` so Print.tsx shows an extra hint) / Done.
- **C12.** `Stock.tsx`'s leftover rows moved into their own independently-scrolling container using the identical mechanics as Home's Recent-jobs list (C6): ref + `onScroll` computing `atBottom`, `max(40vh, 220px)` cap, bottom fade div. "Add leftover by hand" is now a sibling below that container, not the last mapped row, so it stays visible without scrolling. Added a shared `.thin-scroll` class (`index.css`) with cross-browser `::-webkit-scrollbar` rules alongside the existing Firefox-only `scrollbarWidth: 'thin'` inline style, and retrofitted it onto Home's own container too so both lists match visually.
- **C13.** `AppShell.tsx` was rearchitected to fix the "tabs invisible on laptop" bug: the old shell wrapped header+main+tab bar in one `max-w-[480px] mx-auto` column with zero breakpoint variants, so on a laptop it rendered as a narrow centred phone-shaped strip. It is now three real structural siblings in a `flex h-dvh` row — never `position: fixed` — chosen by width: under `md` (768px) a floating inset bottom tab bar (Home/Stock/Settings); `md`-`lg` (768-1023px) a 72px icon rail; `lg`+ (1024px) a persistent 240px sidebar with logo, a "New cutting job" button, nav items, and a bottom block (SyncBadge, email, Log out). `AppShell` gained a `parentTab` prop so non-top-level screens (New job, Plan, Job detail, Leftover detail, Sync check) keep the rail/sidebar visible and highlighted while still showing their own back button — see each page's usage for its `parentTab` value. The sync-conflict badge (`derived.conflicts.length`) is shown on the sidebar/rail's Home item, since there is no persistent "Sync check" nav slot in the 3-tab structure. Only `AppShell.tsx`, `Login.tsx`, `main.tsx`, `index.css`, `tailwind.config.js` and `vite.config.ts` were touched for this pass — the remaining page-by-page visual restyle (Home/NewJob/Plan/Stock/etc. two-column laptop layouts, SheetThumbnail component, dialog/toast repositioning, keyboard shortcuts, motion, per-page hex audits) described in the Part 3 spec was **not completed** in this session due to budget; treat those sections of that spec as still open.
- **C14.** `src/index.css`'s `:root` (light, media-query dark mode preserved) now carries the new warm-neutral/brand token set — it is the single source of truth for every hex value; `tailwind.config.js` only maps class names onto these CSS variables, so change colors there, never inline in a `.tsx`. New tokens: `--card`, `--brand`/`--brand-hover`/`--brand-fg`/`--brand-tint`/`--brand-ink`, `--on-dark-primary`/`--on-dark-primary-foreground` (used only by Home's dark summary-card hero button once that page is restyled — not yet wired up). `--border-strong` was darkened from the spec's literal `#D3CBBE`/lightened from `#45423B` (light/dark) because those hexes measured under the WCAG 3:1 non-text-contrast minimum against `--background`; see `scripts/check-contrast.mjs`'s comment. Run `npm run check:contrast` (added to `package.json`) any time a token hex changes — it parses `index.css` directly with a regex so it can't drift from the real values, and fails non-zero with a per-pair table if any text pair drops under 4.5:1 or `border-strong` drops under 3:1. `@fontsource-variable/inter` was added (the one dependency this task permitted) and imported in `main.tsx`; `tailwind.config.js`'s `fontFamily.sans` puts it first ahead of the old system stack.
- **C15.** `SheetDiagram` was simplified after the technical-drawing rebuild (C8/C9) proved too busy to read — no dimension lines, no ruler, no hatching, no rotated text, no callout leader lines, no numbered circles on every cut line at once. `lib/diagramLayout.ts` now exposes `chooseBlockLabel`/`chooseAllLabels` (one label per block: pieces get typed-size + "Piece N"/"Turned"; leftovers get letter + short-side-first size, or one combined line when wide; earlier/waste get the size only; anything too small for its label gets a small badge instead — a number for pieces/earlier, a letter for leftovers), `sizesList` (groups identical blocks, e.g. `"C2, C3 · 1.6 × 18"`, sorted top-to-bottom then left-to-right, one row per group), `everyBlockHasASize` (the tested invariant: every block is labelled inline or covered by `sizesList`, never neither), `badgePositions` (badges sit at each block's own center; blocks tile the sheet so they never collide), and `cutLinesFor` (unchanged). `labelChoice.ts` re-exports these same functions. `components/SizesList.tsx` (new) renders `sizesList()`'s output as real HTML below the drawing, grouped under "This job" / "Saved leftovers" / "Earlier cuts" (the last collapsed by default, with a count, expandable) — used by `PlanSheet.tsx` and `LeftoverDetail.tsx`, replacing the old `badgedLeftovers` legend. `SheetDiagram` gained `showAllCutLines`: false (default, screen) shows only the tapped/clicked cut line, thick and highlighted; true (print) draws every cut line at once, thin and numbered — `PrintPage.tsx` passes `showAllCutLines`. `lib/print.ts`'s parts table now comes directly from `sizesList()` instead of the removed per-rectangle labelling function, so the printed table and the on-screen list can never diverge. `LeftoverDetail.tsx`'s header row is `flex-col sm:flex-row` with the diagram capped to a fixed width, so the drawing and its text stack instead of overlapping on narrow screens.

## Working agreements
- Be brief in chat: at most 12 lines per stage — what was done, commands run and results, what to check, what's needed from the user.
- Ask before: adding a dependency outside the stack table, changing a rule in R1–R16, or deviating from an approved screen.
- Never: commit `.env`, run `firebase deploy`, push to a remote, weaken/skip/delete a test, leave a placeholder.
- Honesty over confidence — say plainly when something is untested or guessed.
- Comments explain *why* (the workshop reason), not *what*.
- If the SRS and reality conflict, stop, explain, and propose the smallest change.
- Keep changes small; commit often so any stage can be reverted alone.
