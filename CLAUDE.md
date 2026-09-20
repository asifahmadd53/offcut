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
   ├─ lib/       types, id, inches, format, summary, utils, packer, stock, sheetView, firebase, db, packer.test
   ├─ store/     auth, data, job, settings, toast
   ├─ components/
   │  ├─ ui/         button, input, label, switch (+ dialog if needed)
   │  ├─ AppShell.tsx, SheetDiagram.tsx, PlanSheet.tsx, SyncBadge.tsx, Stepper.tsx, Toast.tsx
   └─ pages/
      Login, Home, NewJob, Plan, Stock, LeftoverDetail, AddLeftover, SyncCheck, Settings, JobDetail
```

## Corrections (prompt wins over SRS)
- **C1.** Sheet size on screen is length × width: `96 × 48`. Settings shows length field first, then width, hint "Length, then width." Engine internally stays width × height (`sheetW = 48`, `sheetH = 96`).
- **C2.** Piece size inputs use `inputMode="text"`, not `decimal` (fractions like `22 1/2` need a slash).
- **C3.** Test T-18 (same records in different order → identical derived stock) must be added; it was missing from the starter.
- **C4.** SheetDiagram: every free/freeNew/focus block shows its size, never a bare letter — see `chooseFreeLabel` in `lib/labelChoice.ts` for the exact pw/ph thresholds (wide one-line / stacked two-line / vertical / badge-with-legend-size fallback). Applies on Plan, Job detail and Leftover detail.
- **C5.** Settings uses a local draft + explicit "Save changes" bar (validated only on Save; a sheet-size change asks for confirmation first; leaving with unsaved changes asks Save/Discard/Stay). New job's own blade toggle stays instant with its own toast — it is not part of Settings' draft.
- **C6.** Home's Recent jobs shows up to 30 jobs in its own independently-scrolling list (not the whole page), so the primary buttons stay visible.
- **C7.** Normal (non-restricted) planning announces automatic leftover use on Plan: a green banner with exact copy (`lib/leftoverAnnounce.ts`: `leftoverUseMessage`, `usingLeftoverToast`, `forcedNewSheetNote`, `wouldUseLeftover`), an "Use a new sheet instead" button that sets `useJob().forceNewSheet` (packs with empty stock), and a reversible "Use the leftover" note once forced. Reset `forceNewSheet` on `clearJob`, on pieces changing, and when starting a new job from Home. Confirm-cut toast names the leftover letter when one was used. This is separate from leftover-restricted mode (`onlyLeftoverId`, C-prior), which keeps its own strict popup and never shows these banners.
- **C8.** `SheetDiagram` is an SVG technical cutting drawing built from pure geometry in `lib/diagramLayout.ts` (edge extraction for dimension lines, `chooseLabel`/`chooseFreeLabel`/`choosePieceLabel`, waste-cell coordinate compression, `nudgeLabels` label-collision avoidance, `cutLinesFor`) — zero React, fully unit-tested in `diagramLayout.test.ts`. `labelChoice.ts` is now a thin re-export of the same functions so its own tests still pass. `SheetPlan.cuts` (`packer.ts`/`types.ts`) is optional structured cut-line data (`{n, kind, pos, from, to}`) paralleling `steps` exactly, filled in `packer.ts`'s `buildCuts` right where `buildSteps` already runs; older saved records without it simply draw no numbered cut lines. `PlanSheet.tsx` wires Cut-order-list clicks to highlight the matching SVG cut line (and back), a Full screen dialog (`react-zoom-pan-pinch`, pre-approved dependency for this task), and a Save image button that rasterizes the SVG to PNG via canvas.

## Working agreements
- Be brief in chat: at most 12 lines per stage — what was done, commands run and results, what to check, what's needed from the user.
- Ask before: adding a dependency outside the stack table, changing a rule in R1–R16, or deviating from an approved screen.
- Never: commit `.env`, run `firebase deploy`, push to a remote, weaken/skip/delete a test, leave a placeholder.
- Honesty over confidence — say plainly when something is untested or guessed.
- Comments explain *why* (the workshop reason), not *what*.
- If the SRS and reality conflict, stop, explain, and propose the smallest change.
- Keep changes small; commit often so any stage can be reverted alone.
