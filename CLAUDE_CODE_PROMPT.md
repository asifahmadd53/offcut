# Sheet Cutter — master prompt for Claude Code

## How to use this file (this part is for you, not for Claude Code)

1. Unzip the kit and open the `sheet-cutter` folder in VS Code.
2. Open the VS Code terminal in that folder and run `claude`.
3. Optional but recommended: press `Shift+Tab` until Plan Mode is on, so it shows its plan before touching files.
4. Type this one line:

   `Read @CLAUDE_CODE_PROMPT.md completely, then follow it starting at section 18 "First actions".`

   (You can also paste everything between the two PROMPT lines below. Pointing at the file is easier and does not get cut off.)

5. Keep these ready. You can start without them, and it will tell you when it needs them:
   - The six Firebase web-app values (SRS Stage 1).
   - Your yes or no before any deploy.

What is in the kit:

| Path | What it is |
|---|---|
| `docs/SRS.md` | The full Software Requirements Specification. Open it in a browser. |
| `CLAUDE_CODE_PROMPT.md` | This file. |
| `src/lib/` | The cutting engine, stock logic and tests. Already written and tested. |
| `src/store/`, `src/components/ui/`, config files | Starter code that has never been compiled. Claude Code will fix it. |

---

=== PROMPT START ===

# 1. Mission

You are building **Sheet Cutter**, an installable, offline-first web app (PWA) for a carpenter and contractor.

**The problem.** He cuts pieces out of sheet material sold at 96 inches long by 48 inches wide. The unused remainders (leftovers) are kept against the wall, but nobody records them. Days later a job arrives that would fit on one of those leftovers, nobody knows what is there, so he opens a fresh sheet. Money is lost twice.

**The product.** He types the pieces he needs (width, height, quantity). The app checks his saved leftovers first, opens a new sheet only when nothing fits, and shows a coloured, to-scale diagram of the sheet. When he taps **Confirm cut**, the new leftovers are saved permanently. Next time, they are found automatically. It works with no internet and syncs between his phones when internet returns.

**The user.** Decades of trade skill, little app experience, dusty hands, a mid-range Android phone, weak signal. Every decision must favour large tap targets, plain words, and one obvious next action per screen.

**The deliverable.** A complete, working, tested, deployable app. Not a prototype, not a skeleton, no placeholder screens, no `TODO` left behind.

# 2. Source of truth and precedence

1. **`docs/SRS.md` is the specification.** Read all of it before writing code. It defines every requirement (FR-xxx, NFR-xxx), every screen, every journey and the acceptance checklist in its section 20.
2. **This prompt adds execution detail** (order of work, exact copy, component behaviour) and corrects three points in the SRS. Where this prompt and the SRS disagree, **this prompt wins**. The corrections are:
   - **C1. Sheet size is written length × width: `96 × 48`.** This applies to all on-screen text. Settings shows two fields, first **length (96)**, then **width (48)**, with the hint "Length, then width." Inside the engine, sizes stay width × height (`sheetW = 48`, `sheetH = 96`).
   - **C2. Piece size inputs use `inputMode="text"`**, not `decimal`. A decimal keypad has no slash, and fractions like `22 1/2` must be typeable.
   - **C3. Test T-18** (same records in a different order give identical stock) is not yet written. Add it.
3. If something is ambiguous or missing in both, **ask me**. Do not invent features. Do not add anything the SRS excludes (its section 19.1).
4. The eight approved screen designs are the ones drawn in SRS section 9. The built UI must match them: layout, sizes, spacing, colours, wording. If you are unsure whether something matches, it does not: compare again.

# 3. Non-negotiable rules

These are the rules that make the product correct. A change that breaks any of them is a bug, even if every test passes.

**Cutting**
- R1. The engine is **pure TypeScript**: no React, no Firebase, no `Date.now()` hidden in logic except where a sheet date is created. Same inputs, same plan.
- R2. **A saved leftover is always preferred over a new sheet.** A new sheet is opened only if no free leftover can take the piece, unturned or turned.
- R3. Among leftovers that fit, use the one with the **smallest area**. Ties: tighter fit on the shorter remaining side.
- R4. **Turn a piece only when it does not fit unturned.** Try order for each piece: leftover unturned, open sheet unturned, leftover turned, open sheet turned, then a new sheet (unturned first, turned only if it must be). A turned piece is visibly marked.
- R5. All cuts are **guillotine cuts** (edge to edge), as on a panel saw. After placing a piece at the top-left of a free rectangle, split the remainder into a full-width bottom strip and a right strip that keeps the piece height. List the "across" cut before the "down" cut.
- R6. Blade thickness (kerf) is **off by default**. When on, it is removed after each placement; pieces themselves are never shrunk.
- R7. A remainder is saved only if its shorter side is at least the minimum leftover size (default **1 inch**, so a 2 inch strip is kept). Smaller is waste and is silently dropped.

**Data**
- R8. **History is append-only.** Phones only ever *add* records (`cut`, `manual`, `discard`, plus a `resolution` answer). Nothing is edited or deleted. Stock is **calculated** from the records by a pure function, never stored or edited.
- R9. **A plan changes nothing.** Only **Confirm cut** writes a record.
- R10. **Never await the network** after a write. `setDoc` on Firestore resolves only when the server acknowledges, which can be days later when offline. Fire it, catch errors to the console, and move on. The local copy is already saved and shown.
- R11. Conflicts are ordered by **server timestamp**, never the phone clock. **First to reach the server wins.** Ties: creation time, then id. An unanswered conflict contributes **nothing** to stock.
- R12. Ids are generated **on the device** (`crypto.randomUUID`). No feature may require the server to create an id.

**Experience**
- R13. **Everything works offline** except the first login on each device.
- R14. **No technical words reach the user**: no error codes, no "sync conflict", "rectangle", "kerf" without context, "entity". Use: cut, sheet, piece, leftover, waste.
- R15. **Colour is never the only signal.** Every diagram block has a text label or a letter.
- R16. Sizes are entered as `22`, `22.5`, `22 1/2`, `22-1/2"`, `3/8`, `22 in`, and **displayed as fractions** to the nearest 1/16 (`22 1/2`). Leftovers are always shown **short side first** (`19 × 48`). Pieces keep the order the user typed (width × height).

# 4. Tech stack

**Use exactly this.**

| Concern | Choice |
|---|---|
| Build | Vite 5, React 18, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`) |
| Styling | Tailwind CSS 3, CSS variables for tokens, shadcn/ui components (new-york style) |
| State | Zustand 5 (`persist` middleware where noted) |
| Routing | React Router 6 (`BrowserRouter`) |
| Icons | `@tabler/icons-react` |
| Backend | Firebase: Authentication (email + password), Cloud Firestore with **persistent local cache**, Hosting |
| PWA | `vite-plugin-pwa` (Workbox), `registerType: 'autoUpdate'` |
| Tests | Vitest for logic; Playwright optional for journeys (section 15) |

**Allowed additions** (only when needed): other shadcn/Radix primitives, for example `@radix-ui/react-dialog` for the sync explanation sheet and confirmation dialogs.

**Forbidden.** Ask me before adding anything else.
- Dexie or any second local database. Firestore's on-device cache is the only local store for records.
- Redux, MobX, React Query.
- Next.js, any server, Cloud Functions, any custom backend.
- Any bin-packing or cutting-optimisation library. The engine is ours.
- Any UI kit other than shadcn/ui and Tailwind.
- Analytics, ads, tracking.

# 5. What already exists in the repository

The folder already contains a starter. **Read every file before you change anything.**

- `docs/SRS.md`: the specification.
- `src/lib/types.ts`, `id.ts`, `inches.ts`, `format.ts`, `summary.ts`, `utils.ts`: shared types and helpers.
- `src/lib/packer.ts`: the **cutting engine**. `src/lib/stock.ts`: **records to stock, jobs and conflicts**. `src/lib/sheetView.ts`: plan to drawable blocks.
- `src/lib/packer.test.ts`: 14 tests, all passing at handover. The engine and stock logic have been type-checked under strict TypeScript.
- `src/lib/firebase.ts`, `db.ts`; `src/store/auth.ts`, `data.ts`, `job.ts`, `settings.ts`, `toast.ts`; `src/components/ui/button|input|label|switch.tsx`; `src/index.css`; config files.

**Honest status.**
- The **engine, stock logic and tests are verified**. Treat `packer.ts` and `stock.ts` as the reference implementation. **Do not rewrite them.** Extend them only when a requirement demands it, and add a test for every change.
- Everything else was written but **never compiled**. Run `npm install` and `npm run typecheck` first and fix what breaks. Expect small type errors.
- Pages, `main.tsx`, `App.tsx`, `SheetDiagram`, `AppShell`, `SyncBadge`, `Toast`, icons and the README **do not exist yet**. You will write them.

# 6. Repository layout to end with

```
sheet-cutter/
├─ CLAUDE.md                     (you write this, section 18)
├─ README.md                     (you write this, stage 11)
├─ docs/SRS.html
├─ index.html  vite.config.ts  tailwind.config.js  postcss.config.js  tsconfig.json
├─ components.json  firebase.json  .firebaserc  firestore.rules  firestore.indexes.json
├─ .env.example  .gitignore
├─ public/icons/                 favicon.svg, icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png
└─ src/
   ├─ main.tsx  App.tsx  index.css  vite-env.d.ts
   ├─ lib/       types, id, inches, format, summary, utils, packer, stock, sheetView, firebase, db, packer.test
   ├─ store/     auth, data, job, settings, toast
   ├─ components/
   │  ├─ ui/         button, input, label, switch (+ dialog if needed)
   │  ├─ AppShell.tsx      page frame, header with back arrow, bottom tab bar
   │  ├─ SheetDiagram.tsx  the to-scale coloured sheet
   │  ├─ PlanSheet.tsx     one sheet of a plan: diagram + side panel + cut order
   │  ├─ SyncBadge.tsx     the four sync states
   │  ├─ Stepper.tsx       the quantity − / + control
   │  └─ Toast.tsx
   └─ pages/
      Login, Home, NewJob, Plan, Stock, LeftoverDetail, AddLeftover, SyncCheck, Settings, JobDetail
```

# 7. Engine specification (summary; the code is the reference)

**Coordinates.** Origin top-left of the full sheet. `x` right across the width (48), `y` down the length (96). Every piece and leftover is stored as `{x, y, w, h}` in full-sheet coordinates, never relative to a leftover.

**Records.** `cut` (Confirm cut), `manual` (leftover added by hand), `discard` (leftover thrown away or lost). Each has `id`, `createdAt`, `syncedAt` (server time, `null` until synced), `deviceId`, and for `cut` the `pieces`, `kerf` and `sheets: SheetPlan[]`.

**Letters.** New sheet: `A`, `B`, `C` largest first. What remains of leftover `A` after a later cut is `A2`, then `A3`. Letters never repeat on the same physical sheet (`sheetLetters`).

**Cut steps.** Text like `Cut across at 77 in`, `Cut down at 23 in`, measured from the top-left corner of the region being cut. If the same text would appear twice, the second gets `(in the 25 × 77 part)`.

**Golden example 1 (must always pass).** 23 × 77, qty 2, empty stock, sheet 48 wide × 96 long, kerf off, minimum 1 in:
- Placements `(0,0,23,77)` and `(23,0,23,77)`.
- Leftovers `A` = 48 wide × 19 tall at `(0,77)`, `B` = 2 wide × 77 tall at `(46,0)`.
- Steps: `Cut across at 77 in`, `Cut down at 23 in`, `Cut down at 46 in`.
- Sheet used: 3542 / 4608 = **77%**.

**Golden example 2 (must always pass).** Stock from example 1, then 19 × 22, qty 1:
- Uses leftover `A`, **turned** (placed 22 wide × 19 tall at `(0,77)`).
- New leftover `A2` = 26 wide × 19 tall at `(22,77)`. Step: `Cut down at 22 in`. No new sheet.

# 8. Data, sync and security specification

**Firestore paths** (`shopId` = the signed-in user's uid):

```
shops/{shopId}/cuts/{cutId}          create + read only
shops/{shopId}/resolutions/{cutId}   { choice: 'voided' | 'kept', at }
shops/{shopId}/settings/main         one document
```

`firestore.rules` is already written. Keep `update, delete: if false` on `cuts`. Firestore rejects `undefined`, so strip it (`db.ts` already does).

**Sync status** (the `SyncBadge`), exactly these four states:

| Condition | Text | Colour |
|---|---|---|
| Online, server-confirmed, nothing waiting | `Synced 2 min ago` (uses `timeAgo`) | green |
| Records waiting to be sent | `3 waiting to sync` | amber |
| No internet | `Offline` | grey |
| Offline or unsynced for more than 24 hours | banner `Stock may be out of date. Connect to the internet.` | amber |

`data.ts` already tracks `pending`, `fromCache`, `online`, `lastSyncedAt`. The "waiting" count is the number of cut and resolution documents with `metadata.hasPendingWrites`: add the count if the starter only has a boolean. The badge is a status, not a button, but tapping it opens a short dialog explaining the state in plain words.

**Conflict flow.** `deriveStock` already marks a job `conflict` when a leftover it used was already claimed by an earlier record, or does not exist (`missing`).
- **Re-plan this job:** `saveResolution(uid, cutId, 'voided')`, load that cut's `pieces` into the job store, clear the plan, go to `/plan`. The Plan page builds a plan from the stored pieces when none exists.
- **I cut a different piece:** `saveResolution(uid, cutId, 'kept')`, then go to the next conflict or Home.
- If several conflicts exist, handle them oldest first with a `1 of 3` counter in the header.

**Confirm cut, step by step.**
1. Disable the button on first tap (no double records).
2. Re-check that every `usedLeftoverId` in the plan is still in `derived.freeLeftovers`. If not, rebuild the plan, show the toast `A saved leftover changed. The plan was updated.`, and stop.
3. Build the `CutDoc`: `type: 'cut'`, `createdAt: Date.now()`, `deviceId`, `kerf`, `sheets`. Set `pieces` to **only the pieces that were actually placed** (count placements per `pieceId`; drop pieces with none; reduce quantities to what fit).
4. `saveCut(uid, doc)`; do not await.
5. `clearJob()`, toast `Cut saved. 2 leftovers added.` (count = total `newLeftovers`, singular when 1), navigate to `/`.

# 9. Design system

Tokens already exist in `src/index.css` and `tailwind.config.js`. Use them; do not introduce raw hex values in components.

- **Meaning of colour.** Blue = material being cut. Green = material still available. Amber = warnings. Red = errors, conflicts, discard. Grey = earlier or inactive.
- **Type.** System font stack. Screen title 18/600. Large numbers 22–24/600. Stock sizes 18/600. Body 15–16. Field labels 13, sentence case, never all caps. Hints 12–13 muted. Diagram labels 11–13/600.
- **Shape.** Radius 8 px for controls and cards, `rounded-full` for badges. **Hairline borders** (`border-hair`, 0.5 px). No shadows, no gradients.
- **Spacing.** Screen padding 16 px. Multiples of 4.
- **Control heights.** Hero button 60. Primary 56. Standard primary 52. Secondary 46–48. Stepper buttons 44 × 44. Text fields 36 by default, **42 with 18 px text** for piece sizes.
- **Buttons.** One primary per screen (dark fill in light mode, light fill in dark mode). Secondary is outlined. Button text says the outcome (`Confirm cut and save leftovers`, not `Submit`).
- **Motion.** Only responses to a tap (press scales to 0.98). Nothing animates on load. Respect `prefers-reduced-motion`.
- **Dark mode** follows the system. Every screen must be readable in both.
- **Accessibility.** Visible focus ring, accessible names on icon-only buttons, tap targets at least 44 px, text contrast AA.

# 10. Screen specifications

Layout for every screen: a column at most 480 px wide, centred, `min-h-dvh`, 16 px side padding, safe-area insets respected. Top-level screens (Home, Stock, Settings) show the bottom tab bar (Home, Stock, Settings; active tab in accent text). Other screens show a back arrow beside the title.

**Routes**

| Route | Screen | Needs login |
|---|---|---|
| `/login` (shown in place of the app when logged out) | Login / Register | no |
| `/` | Home | yes |
| `/new` | New job | yes |
| `/plan` | Cutting plan | yes |
| `/stock` | Leftover stock | yes |
| `/stock/add` | Add leftover by hand | yes |
| `/stock/:id` | Leftover detail | yes |
| `/job/:id` | Job detail | yes |
| `/sync-check` | Sync check | yes |
| `/settings` | Settings | yes |

Unknown route: redirect to `/`.

## 10.1 Login (SRS 9.2)

- Logo tile 56 px, radius 14, blue tint, cut icon. Title `Sheet cutter` 22/600. Tagline `Plan cuts. Reuse every leftover.`
- Labels `Shop email` and `Password`. Placeholders `name@company.com` and `Your password`.
- Button `Log in` (52 px), busy text `Logging in…`. Disabled until both fields have content. Link `Create shop account`. Footer, always visible: `Works offline after your first login` with the wifi-off icon.
- **Register mode** (same screen): heading `Create shop account`, sub `One account for all your phones.`, button `Create account`, link `I already have an account`, password at least 6 characters.
- Errors appear under the password field in plain words. `friendlyAuthError` in `store/auth.ts` has the wording.
- If offline on first use: show the `auth/network-request-failed` message.
- If Firebase keys are missing: show a **Setup needed** screen naming `.env.example` and the six variable names. Never a blank page.
- Autocomplete: `username` / `current-password`, `new-password` when registering.

## 10.2 Home (SRS 9.3)

Top to bottom:
1. Header row: `Sheet cutter` (18/600) and the `SyncBadge`.
2. Stale banner (only when the rule in section 8 applies).
3. **Conflict banner** (only when `derived.conflicts.length > 0`): red-tinted card, `1 job needs your answer` (plural: `3 jobs need your answer`), sub `A leftover was used on another phone too.`, button `Check it now` to `/sync-check`. It cannot be dismissed.
4. Two stat cards, two columns: `Saved leftovers` (count of free leftovers) and `Jobs this month` (confirmed jobs with status `active` or `kept` in the current calendar month). Each card is tappable: the first goes to `/stock`.
5. Hero button `+ New cutting job` (60 px) to `/new`. Clear any leftover restriction first.
6. Outlined button `Leftover stock` (48 px) to `/stock`.
7. `Recent jobs`: latest five jobs. Row title `23 × 77, 2 pcs`, sub `15 Sep · new sheet` or `· from leftover` or `· leftover + new sheet` (use `sourceSummary`). Rows with a conflict show a small amber dot. Row opens `/job/:id`. Hide the whole section when there are no jobs.
8. Tab bar.

**First-use state** (no jobs and no leftovers): replace stats and recent list with a centred invitation: icon tile, `No cuts yet`, `Start your first job, or add the offcuts already standing in the workshop.`, then the hero button and an outlined `Add leftover by hand`.

## 10.3 New job (SRS 9.4)

- Header `New job`, back to `/`.
- Two columns: `Width (in)` and `Height (in)`. 42 px fields, 18 px text, `inputMode="text"`, `autoComplete="off"`, `autoCapitalize="off"`, `enterKeyHint="next"`.
- Permanent hint under them: `Fractions work too, like 22 1/2 or 22.5`.
- `How many pieces`: bordered bar with a 44 × 44 `−`, the number (22/600, also editable), and a 44 × 44 `+`. Minimum 1, maximum 99. `−` is greyed at 1.
- Outlined button `+ Add this piece` (48 px). Disabled until width and height both parse. Adds the piece, clears width and height, resets quantity to 1, and focuses width.
- `Pieces in this job`: rows `23 × 77 · 2 pcs` with a remove `✕` (accessible name `Remove 23 by 77`). Empty: muted card `Add a piece above to begin.`
- Row `Include blade thickness` with the current state text `Off` / `On`. Tapping the row toggles `settings.kerfOn` (the same setting as in Settings).
- Primary `Make cutting plan` (56 px). If width and height hold a valid piece that was not added, add it first. Disabled only when there are no pieces and nothing valid is typed. Builds the plan, navigates to `/plan`.
- **Validation copy**
  - Zero or negative: `Width must be more than 0. Try 23 or 22 1/2.` (use `Height` for height).
  - Not a number: `That is not a size. Type a number like 23, 22.5 or 22 1/2.`
  - Show errors only after the user leaves the field or taps Add, not while typing.
- **Too big** (larger than the sheet in both orientations): amber card above the fields: `Too big for a sheet.` + `Your sheets are 96 × 48 in. A 60 × 120 piece will not fit even turned.` and the hint `Change the sheet size in Settings, or split the piece.` Adding is disabled.
- Pieces typed are saved to the phone (`job` store `persist`), so they survive closing the app.
- **Leftover-restricted mode** (from Leftover detail, `Use this in a new job`): a small blue note `Planning with leftover 19 × 26 first.` Implement as `onlyLeftoverId` in the job store: exclude every other free leftover when building the plan (a new sheet may still open if the leftover is too small). Cleared on confirm, on leaving via Home, or from Home's New job button.

## 10.4 Cutting plan (SRS 9.5, screens 4, 5, 5b)

Header `Cutting plan`, back to `/new`. If there is no plan: rebuild from the stored pieces; if there are none, redirect to `/new`.

- **Subtitle.** All new sheets: `New sheet 96 × 48 · 23 × 77, 2 pcs` (`2 new sheets 96 × 48 · …` for several). Otherwise just `23 × 77, 2 pcs`.
- **Reuse banner** (green, only when at least one sheet is a leftover): all leftovers `✓ It fits in a saved leftover. No new sheet needed.`; mixed `✓ Uses 1 saved leftover and 1 new sheet.`
- **Several sheets:** sheet tabs `Sheet 1`, `Sheet 2` as pills; the selected one is dark. One sheet only, no tabs.
- **`PlanSheet`** (one per sheet): a row with the diagram on the left (fixed, up to 144 × 288 px) and a side panel on the right (`flex-1`, 13 px).
  - New sheet panel: legend (`Cut pieces`, `Saved leftover`), `Sheet used` with a large percentage, `Leftovers` list `A: 19 × 48`, `B: 2 × 77`. No leftovers: `Leftovers` then `None`.
  - Leftover sheet panel: `Use this leftover`, `A · 19 × 48` (16/600), `From the sheet cut on 15 Sep`, legend (`Already cut` only if earlier blocks exist, `New piece`, `Free after this cut`), and a grey pill `Turned to fit` if any piece was turned.
  - Under the row, a muted card `Cut order` with the numbered `steps`.
- **Unplaced pieces:** amber card `Piece 5 does not fit on any sheet. Split it or change the sheet size.` (list every unplaced piece number). Confirm is still allowed for the pieces that fit.
- **Buttons.** Primary `✓ Confirm cut and save leftovers` (56 px). Secondary, one of: `Pick a different leftover` when the plan uses at least one leftover (adds the used leftover ids to `excluded` and rebuilds; when none is left the plan falls to a new sheet), otherwise `Change pieces` (back to `/new`). When the plan uses leftovers, also show a plain text link `Change pieces` under the secondary button.
- If `excluded` is not empty, show a muted line `1 leftover skipped. Undo` where Undo clears the exclusions and rebuilds.
- A job that would need more than 5 sheets: amber card `This job needs 7 sheets. Check the quantities before you cut.`

## 10.5 SheetDiagram (used by plan, job detail, leftover detail)

Props: `sheetW`, `sheetH`, `blocks: Block[]` (from `sheetView.ts`), optional `maxW=144`, `maxH=288`, `focusId`.

- Scale `s = min(maxW / sheetW, maxH / sheetH)`. Outer box: `position: relative`, border `1.5px` in `border-stronger`, size `(sheetW·s + 3) × (sheetH·s + 3)` so the inner area is exact. Blocks are `position: absolute` in px, `box-sizing: border-box`.
- **Block styles.**
  - `cut`: blue tint, hairline blue border, blue text, weight 600.
  - `freeNew` and `free`: green tint, **1 px dashed** green border, green text, weight 600.
  - `earlier`: muted grey fill, hairline border, faint text, weight 400, size 11.
  - `focus` (leftover detail, the selected leftover): green tint with a solid 1.5 px green border.
- **Labels by block size** (`pw`, `ph` in px):
  - `cut`: if `pw ≥ 52` and `ph ≥ 34` two lines: `23 × 77` and `Piece 1` (second line `Turned` when rotated). Else if `pw ≥ 36` and `ph ≥ 16`, one line at 11 px. Else none.
  - `free`: if `pw ≥ 110`, one line `A · 19 × 48 free`. Else if `pw ≥ 52` and `ph ≥ 34`, two lines `A2 · 19 × 26` and `free`. Else if `pw ≥ 30` and `ph ≥ 16`, the letter only. Else a **badge**: a 20 px circle with the letter, drawn just outside the right edge of the sheet, vertically centred on the block and clamped inside the sheet; if two badges would overlap, shift the second down by 22 px.
  - `earlier`: text `Already cut` if `pw ≥ 44` and `ph ≥ 24`, else none.
- Leftover dimensions in labels use `fmtLeft` (short side first). Piece labels come from the user's typing.
- `role="img"` with an `aria-label` summarising the sheet, for example `Sheet 96 by 48 inches with 2 pieces and 2 leftovers`.

## 10.6 Leftover stock (SRS 9.6)

- Header `Leftover stock`. Two stat cards: `Pieces` (count) and `Free area` (total, with a small `sq in`, thousands separators).
- `Biggest first`, then rows sorted by area descending: size (18/600, `fmtLeft`) and a sub line `A2 · from 15 Sep sheet` (manual leftovers: `Added by hand · 19 Sep`), chevron. Row opens `/stock/:id`.
- Outlined button `+ Add leftover by hand` (50 px) to `/stock/add`.
- **Empty:** icon tile, `No leftovers saved yet`, `Leftovers from your cuts are saved here.`, hero `+ New cutting job`, outlined `Add leftover by hand`.

## 10.7 Leftover detail (SRS 9.6, screen 6b)

- Header `Leftover A2`. Left: `SheetDiagram` (120 × 240) of its parent sheet with earlier cuts, other free leftovers, and this one as `focus`. Manual leftovers with no parent show the leftover alone as the sheet.
- Right: size 24/600, area `494 sq in`, `From` / `Sheet cut on 15 Sep`, `Position on the sheet` / `22 in from the left, 77 in from the top` (use `fmt`).
- Primary `Use this in a new job` (52 px) sets `onlyLeftoverId`, opens `/new`.
- Outlined red `Throw away / lost`. Tapping opens a confirmation dialog: `Remove this leftover?` / `It will leave your stock and will not be suggested again. Your job history stays as it is.` with `Remove` and `Keep`. Confirming writes a `discard` record, toasts `Leftover removed.`, returns to `/stock`.
- If the leftover id is unknown or already used, show `This leftover is no longer in stock.` and a `Back to stock` button.

## 10.8 Add leftover by hand (SRS 9.6, screen 6c)

- Header `Add leftover by hand`, sub `For offcuts already standing in your workshop.`
- Width and height fields (same rules as New job), hint `Measure the piece and enter both sides.`, stepper `How many like this` (1–99).
- Muted card: `These are saved as loose pieces with no parent sheet, so they will not appear inside a sheet diagram.`
- Primary `Add to stock` (56 px). Writes **one** `manual` record whose `sheets` holds one `SheetPlan` per piece: its own `sheetId`, `sheetW = w`, `sheetH = h`, `isNew: true`, `manual: true`, `region` = the whole piece, empty `placements`, one `newLeftovers` entry `{x:0, y:0, w, h, letter:'A'}`, empty `steps`. Toast `2 leftovers added.`, navigate to `/stock`.
- Reject a piece larger than the sheet? No: an old oversized board is still a valid leftover. Only reject invalid numbers.

## 10.9 Sync check (SRS 9.7)

- Header `Sync check` (with `1 of 3` when several).
- **Conflict present:** amber card, title `⚠ Leftover already used` (icon, not the emoji), body `The 19 × 48 leftover from the 15 Sep sheet was already used on another phone at 4:12 pm.` (leftover size via `fmtLeft`, date via `dayMonth`, time via `timeOfDay` of `winnerAt`), then `Check the pieces in your workshop, then choose what to do.` For `missing` conflicts: title `Leftover not found`, body `A leftover this job used was never saved on this phone. Check the pieces in your workshop, then choose what to do.`
- Muted card `Affected job` with `19 × 22, 1 pc · 19 Sep`.
- Primary `Re-plan this job` (54 px, refresh icon). Outlined `I cut a different piece` (48 px). Small centred line `Nothing is deleted. The job stays in your history either way.`
- **No conflict:** green card `✓ All clear` / `Every job on this phone matches the shop record.`, muted card `Sync status` with `Last synced: 2 min ago`, `Waiting to send: none` (or the count), then outlined `Back to home`. `Devices on this account` is shown only if you can compute it (distinct `deviceId` in the records); otherwise omit the line.

## 10.10 Settings (SRS 9.8)

Rows separated by hairlines:
1. `Sheet size (in)`: two fields, **length then width** (96, 48), hint `Length, then width.`. Commit on blur; parse with `parseInches`; on invalid input revert and show `Type a number like 96.`
2. `Include blade thickness` with a `Switch`. Under it `Blade width: 1/8 in. Used when the toggle is on.` When on, also show a `Blade width (in)` field (default `1/8`).
3. `Save leftovers bigger than (in)`: field (default `1`), hint `Anything smaller is treated as waste.` Accept `0` here (keep everything), unlike piece sizes.
4. `Rotate pieces` / `Only if needed` (fixed, not editable).
5. `Signed in as` and the email.
6. Outlined `Log out`. Confirmation dialog: `Log out?` / `You will need internet to log in again on this phone.` with `Log out` and `Stay`.

Changes apply to **future plans only**. Old jobs keep their own recorded kerf and sizes.

## 10.11 Job detail (SRS 9.8, screen 2b)

- Header is the job title (`23 × 77, 2 pcs`), sub `Cut on 15 Sep · new sheet · blade off` (`blade 1/8 in` when kerf was used).
- One `PlanSheet` per sheet, built with `buildBlocks(plan, derived, cut.id)`. Extra legend entries `Cut that day`, `Used since`, `Still free` (earlier blocks derived from leftovers that were used later).
- Muted card `Cut order used`.
- Outlined `Cut these pieces again`: loads `cut.pieces` into the job store and opens `/new`.
- Conflict jobs show the amber card and a button `Answer now` to `/sync-check`.
- Job history is **read-only**: no edit and no delete control anywhere.

## 10.12 App shell details

- **Toast:** top centre, dark pill, 3.5 s, `role="status"`.
- **First-use install hint (FR-I5, should):** when running in a normal browser tab (not `display-mode: standalone`), show one dismissible card on Home: `Add this app to your home screen for full-screen use and offline access.` Remember dismissal in `localStorage`.
- **Loading:** while the auth state is unknown, show the logo tile centred on a plain background, not a spinner page.

# 11. State management

- `useAuth`: status, uid, email, login, register, logout. `init()` is called once in `App`.
- `useData`: started when a uid exists, stopped on logout. Holds cuts, resolutions, `derived`, sync flags.
- `useJob`: pieces (persisted), plan (memory only), `excluded`, `onlyLeftoverId`, `buildPlan`, `clearJob`, `setPieces`.
- `useSettings`: persisted locally as `sc-settings`, mirrored to Firestore `settings/main`. Remote changes apply without writing back (no echo loop).
- `useToast`: message and auto-hide.
- Screens read stores through selectors; they hold only local UI state (form text, open dialogs). **No cutting logic and no Firestore calls inside components** other than through `db.ts` helpers.

# 12. PWA and offline requirements

- Manifest and service worker are configured in `vite.config.ts`. Confirm `display: standalone`, `orientation: portrait`, `start_url: /`, and icons 192, 512 and maskable 512.
- **Generate the icons** with a short script (Node `sharp` as a temporary dev dependency, or Python PIL, then remove the dependency): rounded square in the accent blue (`#378add`) with a simple white cut-line motif (a rectangle split by two lines). Output `icon-192.png`, `icon-512.png`, `maskable-512.png` (content inside the central 80% safe zone), `apple-touch-icon.png` (180), and `favicon.svg`.
- The app must open in airplane mode after one online visit, and a plan must be creatable and confirmable offline (FR-I3, FR-C3).
- Firestore uses `persistentLocalCache` with `persistentMultipleTabManager`, falling back to memory cache if storage is blocked. When the fallback happens, show a one-time toast `Private mode: data will not survive closing the app.`
- Cache headers are already in `firebase.json`.

# 13. Local development without a real Firebase project (recommended)

Add optional emulator support so everything, including conflicts, can be tested without touching a real project:

- Env flag `VITE_USE_EMULATORS=true` makes `firebase.ts` call `connectAuthEmulator(auth, 'http://127.0.0.1:9099')` and `connectFirestoreEmulator(db, '127.0.0.1', 8080)`. When the flag is off, nothing changes.
- Add `emulators` to `firebase.json` (auth 9099, firestore 8080, ui 4000) and an npm script `emulators`.
- The Firestore emulator needs Java. If Java is missing, say so and continue; do not block on it.

# 14. Execution plan

Work in the stages below (they mirror SRS section 16). **After every stage** run `npm run typecheck && npm test`. From stage 4 on also run `npm run build`. Then commit with a message `stage N: <what>`. Do not push. Do not deploy.

**Stage 0. Ground the work.**
`node -v` (need 20+), `git init` if needed, `npm install`, `npm run typecheck`, `npm test`. Fix compile errors in the starter. Confirm the 14 tests still pass. Write `CLAUDE.md` (section 18).
*Done when:* typecheck and tests are green.

**Stage 1. Firebase (needs me).**
Ask me for the six values and give me the click path from SRS Stage 1. Until they arrive, continue: the app shows the Setup needed screen when keys are missing, and the emulator route (section 13) can stand in.
*Done when:* `.env` exists (never committed) or emulators are working.

**Stage 2. Skeleton and design tokens.**
`main.tsx`, `App.tsx` with routes and auth gating, `AppShell`, `Toast`, `SyncBadge`, `Stepper`. Register the service worker with `registerSW`. Verify tokens in light and dark.
*Done when:* `npm run dev` shows a styled shell with a working tab bar in both themes.

**Stage 3. Engine hardening.**
Add T-18 and any missing edge tests: a piece exactly equal to a leftover; kerf with a leftover; several sheets; `excludedIds`; letter uniqueness across two jobs on the same sheet; `deriveStock` with a `missing` conflict. Keep the golden examples untouched.
*Done when:* all tests pass and T-01 to T-18 are each demonstrably covered.

**Stage 4. Login and records.**
`Login`, auth wiring, `data` store start/stop, sync badge with the four states, `firestore.rules` verified.
*Done when:* create account, log in, reload and stay logged in; wrong password shows plain words.

**Stage 5. Job entry and diagram.**
`NewJob`, `SheetDiagram`, `PlanSheet`.
*Done when:* golden example 1 renders exactly as SRS screen 4.

**Stage 6. Plan and confirm.**
`Plan` with reuse banner, tabs, unplaced card, `Pick a different leftover`, exclusions, and the confirm flow from section 8.
*Done when:* journeys B and C (SRS 10.2, 10.3) complete, including with the network switched off.

**Stage 7. Home, stock, history.**
`Home`, `Stock`, `LeftoverDetail`, `AddLeftover`, `JobDetail`, discard.
*Done when:* journeys A and F complete.

**Stage 8. Settings.**
`Settings` with commit-on-blur validation, blade field, log out dialog, sync to a second device.
*Done when:* journey G completes and a settings change on one profile appears on another.

**Stage 9. Conflicts.**
`SyncCheck`, Home banner, resolutions, both answers.
*Done when:* journey E completes with two browser profiles offline, and stock ends correct on both.

**Stage 10. PWA, polish, accessibility.**
Icons, offline check in airplane mode, install check, focus and contrast pass, 320 px and 430 px width checks, dark mode pass, reduced motion.
*Done when:* the app installs and opens fully offline.

**Stage 11. Handover.**
Write `README.md` (setup, `.env`, emulators, tests, build, deploy, installing on the owner's phone, backup, and the two sentences for the owner from SRS 18.5). Run the full acceptance checklist in SRS section 20 and report each line as pass, fail or not testable here.
*Done when:* every line passes or has a stated reason.

**Deploying** (`firebase deploy`) happens only when I say so.

# 15. Testing requirements

- **Vitest** for `inches`, `packer`, `stock`, `sheetView`, `summary`, `format`. Add tests for `sheetView.buildBlocks` (earlier, free, freeNew, cut) and `summary`.
- Each of T-01 to T-18 in SRS 17.2 maps to at least one named test. Put the id in the test name, for example `T-05 reuses leftover A turned`.
- **No test may be weakened, skipped or deleted to make a build pass.** If a test is wrong, explain why and fix it with my agreement.
- **Optional, encouraged:** Playwright with `context.setOffline(true)` for journeys B and C, and two browser contexts for journey E, running against the emulators.
- **Manual script:** SRS 17.3 has fifteen steps. Run those you can and list the ones only a real phone can verify.

# 16. Quality gates

Before you call the project finished, all of these are true:
- `npm run typecheck`, `npm test` and `npm run build` pass with no warnings you can fix.
- No `any` without a comment saying why. No `console.log` left except the deliberate error logs in `db.ts` and `data.ts`.
- No file over about 300 lines without a reason. No duplicated logic between screens.
- Every FR marked M in SRS section 8 is implemented, and you can name the file that implements it.
- The SRS section 20 checklist is complete.
- The app has been looked at, not just compiled: start the dev server and check every screen against the SRS designs at 360 px width in light and dark mode. If you cannot open a browser, say so plainly and list what still needs eyes.

# 17. Working agreements

- **Be brief in chat.** At the end of each stage write at most 12 lines: what you did, the commands you ran and their result, anything I must check, anything you need from me.
- **Ask before** adding a dependency outside section 4, changing a rule in section 3, or deviating from an approved screen.
- **Never** commit `.env`, run `firebase deploy`, push to a remote, weaken a test, or leave a placeholder.
- **Honesty over confidence.** If something is not tested, not verified, or you are guessing, say so.
- Comments explain **why** (the workshop reason), not what.
- If the SRS and reality conflict (for example a library behaves differently than assumed), stop, explain, and propose the smallest change.
- Keep changes small and commit often, so any stage can be reverted alone.

# 18. First actions

Do these in order, then continue with the stages in section 14:

1. Read `docs/SRS.md` completely. Extract its text with a command if you must; do not skim.
2. Read every file in the repository.
3. Create `CLAUDE.md` at the repository root containing: the mission in three sentences, the rules R1 to R16 as a checklist, the stack, the commands (`dev`, `test`, `typecheck`, `build`, `emulators`), the folder map, the corrections C1 to C3, and the working agreements from section 17. Keep it under 150 lines. This file is what future sessions will rely on.
4. Reply with: (a) a five-line summary of what you understood, (b) any question or contradiction you found in the SRS or this prompt, (c) your plan for stages 0 to 3 in one line each. Then wait for my "go". If I have already said "go" or you are in auto mode, proceed with stage 0.

=== PROMPT END ===
