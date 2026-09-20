::: wrap
::: cover
# Offcut

Software Requirements Specification for an offline-first cutting-plan
and leftover-stock app for a carpentry workshop.

Version
:   1.0

Date
:   20 September 2026

Status
:   Approved for build

Product
:   Offcut --- installable web app (PWA)

Stack
:   React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Zustand,
    Firebase

Primary user
:   One carpenter/contractor and his workshop
:::

## [Contents]{.sec-no}Contents {#toc}

[[1]{.n}Introduction](#s1) [[2]{.n}Overall description](#s2)
[[3]{.n}Users and personas](#s3) [[4]{.n}Domain model and glossary](#s4)
[[5]{.n}The cutting engine](#s5) [[6]{.n}Data model](#s6)
[[7]{.n}Offline, sync and conflicts](#s7) [[8]{.n}Functional
requirements](#s8) [[9]{.n}Screen-by-screen UI specification](#s9)
[[10]{.n}End-to-end user journeys](#s10) [[11]{.n}Design system](#s11)
[[12]{.n}Non-functional requirements](#s12) [[13]{.n}Security and
privacy](#s13) [[14]{.n}Error, empty and edge cases](#s14)
[[15]{.n}Architecture and file layout](#s15) [[16]{.n}Build plan, step 0
to launch](#s16) [[17]{.n}Test plan](#s17) [[18]{.n}Deployment and
handover](#s18) [[19]{.n}Out of scope and future work](#s19)
[[20]{.n}Acceptance checklist](#s20)

## [Section 1]{.sec-no}Introduction {#s1}

### 1.1 Purpose

This document specifies, completely and unambiguously, the Offcut
application. It is written so that a developer can build the whole
product from this document alone, and so that the workshop owner can
confirm the behaviour is what he asked for before any code is written.

### 1.2 The problem

A carpenter buys sheet material in a standard size, 48 inches wide by 96
inches long. Every job needs pieces of other sizes. Today he works the
layout out on paper, cuts the sheet, and puts the unused offcuts against
the wall. Days later a new job arrives that would fit perfectly on one
of those offcuts, but there is no record of what is against the wall or
how big it is, so he opens a fresh sheet. The offcut is eventually
thrown away. Money is lost twice: once on the wasted offcut, once on the
unnecessary sheet.

### 1.3 The solution in one paragraph

The carpenter enters the pieces he needs. The app works out how to cut
them, checks his saved offcuts first, and only opens a new sheet if
nothing saved fits. It shows a coloured to-scale diagram of the sheet
with every piece and every remaining area labelled. When he taps
**Confirm cut**, the new offcuts are saved to a permanent stock list.
The next time he needs a piece, the app searches that stock
automatically. Everything works with no internet, and syncs between his
phones when internet returns.

### 1.4 Goals

1.  No offcut is ever forgotten. Every usable remainder is recorded the
    moment a cut is confirmed.
2.  New sheets are opened only when genuinely necessary.
3.  The carpenter can follow the plan at the saw without reading
    instructions.
4.  The app is usable in a workshop with no signal.

### 1.5 Success measures

::: tablewrap
  Measure                                         Target
  ----------------------------------------------- -------------------------------------------------------------------------
  Offcuts reused instead of opening a new sheet   Most jobs under 19 × 48 in are served from stock within 3 months of use
  Time from opening the app to a finished plan    Under 30 seconds for a single-piece job
  Training needed                                 The owner can use it after one demonstration, with no written guide
  Works with no internet                          100% of features except first login and cross-phone sync
:::

### 1.6 Definitions used throughout

Sheet
:   A full board as purchased. Default 48 in wide × 96 in long,
    changeable in Settings.

Piece
:   A rectangle the carpenter needs, entered as width × height with a
    quantity.

Job
:   One or more pieces planned and cut together.

Plan
:   The app\'s proposed layout. A plan changes nothing until it is
    confirmed.

Leftover
:   A usable rectangle remaining after a cut. Also called an offcut.
    Saved to stock.

Stock
:   The list of all free leftovers across all past jobs.

Kerf
:   The material removed by the saw blade, about 1/8 in. Optional in
    this app.

Waste
:   A remainder too small to be worth keeping. Not saved.

Record
:   One immutable entry in the history. Stock is calculated from
    records.

## [Section 2]{.sec-no}Overall description {#s2}

### 2.1 Product perspective

Offcut is a self-contained product with no dependency on existing
workshop systems. It is delivered as an installable web app. The
carpenter opens a link once, adds it to his home screen, and from then
on it behaves like any other app on the phone: its own icon, full
screen, no browser bar, and it opens with no internet.

### 2.2 Why a PWA and not a Play Store app

::: tablewrap
  Concern           How the PWA handles it
  ----------------- -------------------------------------------------------------------------------------------------------------
  Works offline     The app files are cached by a service worker; data is stored on the device by Firestore\'s on-device cache.
  Updates           Published once; every phone updates itself on next open. No reinstall, no APK file to send.
  Install           \"Add to Home Screen\" from the browser. No \"allow unknown sources\" setting to turn on.
  Multiple phones   Each phone logs into the same shop account and sees the same stock.
  Native hardware   Not needed. The app uses no camera, Bluetooth, GPS or background service.
  Future APK        The identical codebase can be wrapped with Capacitor later with no rewrite.
:::

### 2.3 Operating environment

-   Android 9 or later with Chrome 100+. iOS 16.4+ with Safari is also
    supported.
-   Screen width from 320 px upward. Portrait is the design target;
    landscape must not break.
-   Internet is required exactly once, for the first login on each
    device. Everything after that is optional.

### 2.4 Design constraints

1.  All measurements are in inches, entered as whole numbers, decimals,
    or fractions.
2.  All cuts are guillotine cuts, meaning edge to edge across the whole
    panel, because that is what a panel saw does.
3.  A single material type. Every sheet and leftover is interchangeable.
4.  Rotation is automatic but conservative: a piece is turned only when
    it does not fit unturned.
5.  Nothing in stock changes until the user taps **Confirm cut**.

### 2.5 Assumptions

-   The carpenter cuts one physical sheet at a time and follows the plan
    as shown.
-   Offcuts are physically kept and can be found by their size.
-   Material grain and face direction do not matter, so a turned piece
    is acceptable.
-   The workshop account is shared by the owner and possibly one helper.

### 2.6 Dependencies

::: tablewrap
  Dependency                Role                                 Risk if unavailable
  ------------------------- ------------------------------------ -------------------------------------------------------------------
  Firebase Authentication   Shop login                           New devices cannot log in. Existing devices keep working offline.
  Cloud Firestore           Cloud database and on-device cache   Sync stops. The app continues on local data and catches up later.
  Firebase Hosting          Serving the app over HTTPS           Installed devices keep working from cache.
:::

## [Section 3]{.sec-no}Users and personas {#s3}

### 3.1 Primary user: the workshop owner

Who
:   A working carpenter and contractor. Decades of trade experience,
    limited experience with apps.

Device
:   A mid-range Android phone, often with a cracked screen, low battery
    and weak signal.

Context
:   Standing at the saw, hands dusty, possibly wearing gloves, in poor
    light.

Needs
:   Large tap targets, large numbers, no jargon, no more than two taps
    to the answer he wants.

Does not want
:   Accounts, settings, sync explanations, or anything that must be
    learned.

### 3.2 Secondary user: a helper or son

Uses a second phone on the same account. Can plan and confirm cuts. Is
the reason cross-device conflicts must be handled rather than assumed
away.

### 3.3 Design rules derived from the personas

1.  Primary buttons are at least 52 px tall; the main action on a screen
    is 56 to 60 px.
2.  Sizes are shown at 18 px or larger, in plain fractions such as
    `22 1/2`, never as `22.5` unless the user typed it that way.
3.  Every screen has exactly one obvious next action.
4.  No screen requires horizontal scrolling or pinch-zoom.
5.  Words used are the words spoken in a workshop: cut, sheet, piece,
    leftover, waste. Never \"bin packing\", \"kerf\" without
    explanation, \"rectangle\", \"entity\" or \"sync conflict\".

## [Section 4]{.sec-no}Domain model and glossary {#s4}

### 4.1 How the pieces of the domain relate

``` mermaid
graph TD
  A["Physical sheet
48 x 96 in"] -->|is cut by| B["Cut record
immutable"]
  B -->|places| C["Pieces
delivered to the customer"]
  B -->|creates| D["Leftovers
saved to stock"]
  D -->|can be used by| B
  D -->|too small| E["Waste
not saved"]
  F["Manual record"] -->|adds| D
  G["Discard record"] -->|removes| D
```

### 4.2 Coordinate system

The top-left corner of a sheet is the origin, `(0, 0)`. `x` increases to
the right across the 48 in width. `y` increases downward along the 96 in
length. Inside the engine, sizes are written width × height (48 × 96).
On screen, a sheet is written length × width (**96 × 48**), because that
is how the material is bought and spoken. Every piece and every leftover
is stored as `{x, y, w, h}` in the coordinates of the original full
sheet, never relative to a leftover. This is what allows the app to draw
a sheet that has been cut across three separate jobs on three different
days as one coherent picture.

### 4.3 Naming of leftovers

Leftovers created from a full sheet are lettered `A`, `B`, `C` in order
of size, largest first. When leftover `A` is later cut into, its
remainder is called `A2`, then `A3`. The chain of names lets the
carpenter identify a physical board against the wall without measuring
it.

### 4.4 Sizes: how they are entered and shown

::: tablewrap
  User types                Stored as   Shown as
  ------------------------- ----------- ---------------
  `22`                      22          22
  `22.5`                    22.5        22 1/2
  `22 1/2`                  22.5        22 1/2
  `22-1/2"`                 22.5        22 1/2
  `3/8`                     0.375       3/8
  `22 in`                   22          22
  `0`, `-5`, `abc`, empty   rejected    error message
:::

Internally every size is a number of inches rounded to four decimal
places. Display rounds to the nearest sixteenth of an inch and renders
it as a fraction, because that is how a tape measure is read. A piece
entered as width × height keeps that order when shown. A leftover is
always shown short side first, so `19 × 48`, never `48 × 19`, which
makes the stock list scannable.

## [Section 5]{.sec-no}The cutting engine {#s5}

This is the heart of the product and the only part where a wrong answer
costs the user real money. It is written as pure functions with no user
interface and no database, so it can be tested exhaustively.

### 5.1 Guillotine cutting

A panel saw cuts edge to edge. It cannot cut an L shape or stop halfway.
The engine therefore models every cut as a full-width or full-length cut
of the area being worked on. When a piece is placed in the top-left
corner of a free rectangle, exactly two cuts are possible, and they
split the rest of that rectangle into two new free rectangles:

``` mermaid
graph LR
  X["One free rectangle"] --> P["The piece
w x h, top-left corner"]
  X --> R["Right strip
keeps the piece height"]
  X --> B["Bottom strip
keeps the full width"]
```

The cut across the full width is listed first in the instructions, then
the cut down, because cutting the long strip off first is how the
material is actually handled at the saw.

### 5.2 Placement order

Pieces are sorted largest area first, with taller pieces breaking a tie.
Large pieces are hardest to place, so placing them first leaves the most
usable remainder. For each piece, the engine tries four things in strict
order and stops at the first success:

1.  A saved leftover, unturned.
2.  A sheet already opened for this job, unturned.
3.  A saved leftover, turned 90°.
4.  A sheet already opened for this job, turned 90°.

Only if all four fail does the engine open a brand new sheet. On a new
sheet the piece is placed unturned if it fits that way, and turned only
if it must be.

::: note
This order is why the app satisfies the core requirement. A leftover is
*always* preferred over a new sheet, and an unturned fit is always
preferred over a turned one.
:::

### 5.3 Choosing which leftover to use

When several free rectangles could hold the piece, the engine picks the
one with the **smallest area**. A tie is broken by the tightest fit on
the shorter remaining side. The effect is that a small piece consumes a
small offcut and the large offcuts stay intact for large work. Choosing
the largest instead would destroy the workshop\'s most valuable stock
first.

### 5.4 Blade thickness (kerf)

Off by default. When switched on in Settings, the blade width, 1/8 in by
default, is removed from the material after every placement: the right
strip starts at `x + pieceWidth + kerf` and the bottom strip at
`y + pieceHeight + kerf`. The pieces themselves are never shrunk,
because the carpenter wants the finished size he asked for. The kerf
value used is recorded on the job, so an old plan still shows correctly
if the setting is later changed.

### 5.5 Minimum leftover size

A remaining rectangle is saved only if its shorter side is at least the
minimum leftover size, 1 inch by default and editable. Anything smaller
is waste and is silently dropped. The default is deliberately low
because the owner specifically asked that even a 2 in strip be saved.

### 5.6 Worked example: the owner\'s own case

Input: 23 × 77, quantity 2. Sheet: 96 × 48 (96 long, 48 wide), kerf off,
minimum leftover 1 in.

::: tablewrap
  Step                                          Result
  --------------------------------------------- -----------------------------------------------------------------------
  Stock is empty, so a new sheet is opened      Free: one rectangle, 48 wide by 96 long, at (0,0)
  Piece 1 placed at (0,0)                       Right strip 25 × 77 at (23,0); bottom strip 48 × 19 at (0,77)
  Piece 2 placed in the right strip at (23,0)   Right strip becomes 2 × 77 at (46,0)
  Remainders checked against the 1 in minimum   48 × 19 kept as `A`; 2 × 77 kept as `B`
  Sheet usage                                   2 × 23 × 77 = 3,542 of 4,608 sq in = **77%**
  Cut instructions                              1\. Cut across at 77 in · 2. Cut down at 23 in · 3. Cut down at 46 in
:::

Days later the owner needs 19 × 22, quantity 1. The engine finds
leftover `A`, which is 48 wide by 19 tall. The piece does not fit as 19
wide × 22 tall, because 22 exceeds the 19 in height. Turned, it becomes
22 wide × 19 tall and fits exactly. The remainder, 26 × 19, is saved as
`A2`. No new sheet is opened. This is the exact scenario the owner
described, and it is covered by an automated test.

### 5.7 Pieces that can never fit

If a piece is larger than a full sheet in both orientations, it is
returned as unplaced. The plan screen shows it in a clearly marked block
explaining it is too big for a sheet of the current size, and suggests
either splitting it or changing the sheet size in Settings. A job
containing an unplaced piece can still be confirmed for the pieces that
did fit.

### 5.8 Engine contract

    packJob(
      pieces:      Piece[],           // what the user wants
      stock:       Leftover[],        // only free leftovers
      options:     { sheetW, sheetH, kerf, minLeftover },
      excludedIds: Set<string>,       // leftovers the user rejected
      sheetLetters: Map<sheetId, Set<letter>>  // so new letters never repeat
    ): {
      sheets:   SheetPlan[],          // one per physical sheet or leftover used
      unplaced: Item[]                // pieces that fit nowhere
    }

The function is deterministic and side-effect free. The same inputs
always produce the same plan, which is what makes it testable and what
lets the app re-plan safely after a conflict.

## [Section 6]{.sec-no}Data model {#s6}

### 6.1 The central decision: an append-only history

Stock is **not** stored as a list that phones edit. Editing a shared
list from two offline phones is exactly the situation that loses data.
Instead every phone only *adds* immutable records. The current stock is
recalculated from those records every time they change. Two phones
adding records can never overwrite each other, because nothing is ever
written twice.

``` mermaid
graph LR
  R1["Cut record
15 Sep"] --> D["deriveStock()"]
  R2["Cut record
19 Sep"] --> D
  R3["Manual record"] --> D
  R4["Discard record"] --> D
  R5["Resolution
answers"] --> D
  D --> S["Current stock
+ job list
+ conflicts"]
```

### 6.2 Firestore layout

    shops/{shopId}/cuts/{cutId}           create + read only, never updated
    shops/{shopId}/resolutions/{cutId}    the answer to a conflict
    shops/{shopId}/settings/main          one document, read and write

`shopId` is the authenticated user\'s id, so a shop can only ever
address its own data. Security rules forbid update and delete on `cuts`
at the database level, which makes the append-only rule impossible to
break even by a bug in the app.

### 6.3 Record types

::: tablewrap
  Type        Written when                               Effect on stock
  ----------- ------------------------------------------ ------------------------------------------------------
  `cut`       Confirm cut is tapped                      Marks used leftovers as used; adds the new leftovers
  `manual`    A leftover is added by hand                Adds one leftover with no parent sheet
  `discard`   A leftover is thrown away or marked lost   Marks that leftover as no longer free
:::

### 6.4 Record shape

    CutDoc {
      id:        string        // made on the phone, unique without a server
      type:      'cut' | 'manual' | 'discard'
      createdAt: number        // phone clock, ms
      syncedAt:  number | null // server clock; null until it reaches the server
      deviceId:  string        // which phone wrote it
      pieces?:   Piece[]       // what the user asked for
      kerf?:     number        // blade width actually used
      sheets:    SheetPlan[]   // the layout that was confirmed
      discardIds?: string[]
    }

    SheetPlan {
      sheetId:   string        // identity of the physical board
      sheetW, sheetH, sheetDate
      isNew:     boolean       // fresh sheet or a saved leftover
      usedLeftoverId?: string
      usedLetter?: string
      region:    Rect          // the area worked on
      placements: Placed[]     // pieces, in full-sheet coordinates
      newLeftovers: LeftoverRect[]
      steps:     string[]      // cut instructions in order
    }

### 6.5 Identifiers

Every id is generated on the device from `crypto.randomUUID()`. The
probability of two phones generating the same id is negligible, so no
server round trip is needed to create a record. This is what makes
offline creation safe. A `deviceId` is generated once per phone and kept
in local storage, and is used only to word conflict messages (\"used on
another phone\").

### 6.6 Derived state

`deriveStock(cuts, resolutions)` is a pure function that returns
everything the interface needs:

::: tablewrap
  Field             Meaning
  ----------------- ---------------------------------------------------------------------------
  `leftovers`       Every leftover ever created, each marked free or used
  `freeLeftovers`   Current stock, the input to the next plan
  `jobs`            Job history, newest first, each with a status
  `conflicts`       Jobs needing the user\'s answer
  `activeCuts`      Counted cuts, used to draw earlier pieces on a shared sheet
  `sheetLetters`    Letters already used on each sheet, so a new leftover never reuses a name
:::

### 6.7 Data kept on the device

::: tablewrap
  Key               Contents                                     Why on the device
  ----------------- -------------------------------------------- ------------------------------------------------------
  Firestore cache   All cuts, resolutions and settings           Full offline operation and instant reads
  `sc-settings`     Sheet size, blade toggle, minimum leftover   Available before login and before the first sync
  `sc-job-draft`    Pieces typed but not yet planned             A dropped phone or a closed app does not lose typing
  `sc-device-id`    This phone\'s id                             Conflict wording
  `sc-last-sync`    Time of the last confirmed sync              Shown on the home screen
:::

## [Section 7]{.sec-no}Offline, sync and conflicts {#s7}

### 7.1 Offline behaviour

::: tablewrap
  Action                         Offline?   Notes
  ------------------------------ ---------- -----------------------------------------------------
  Open the app                   Yes        Served from the service worker cache
  First login on a device        No         The one action that needs internet, once per device
  Staying logged in              Yes        The session persists on the device indefinitely
  Enter pieces and make a plan   Yes        The engine runs entirely on the phone
  Confirm a cut                  Yes        Saved locally at once, queued for the server
  View stock and history         Yes        Read from the on-device cache
  Change settings                Yes        Applied locally, synced later
  See another phone\'s cuts      No         Requires sync
:::

### 7.2 Sync status shown to the user

::: tablewrap
  Condition                                                       Badge                           Colour
  --------------------------------------------------------------- ------------------------------- --------------------------
  Online and everything confirmed by the server                   Synced 2 min ago                Green
  Records waiting to be sent                                      3 waiting to sync               Amber
  No internet                                                     Offline · saved on this phone   Grey
  Last sync older than 24 hours and more than one device exists   Stock may be out of date        Amber, shown as a banner
:::

The badge is a status, not a button. Tapping it opens a short
plain-language explanation. The carpenter never has to press anything to
sync; it is automatic.

### 7.3 The conflict case, in full

The only situation that needs a decision from the user is this: two
phones, both offline, both confirm a cut that consumes the *same*
leftover. When they reconnect, the material can only have been cut once.

``` mermaid
sequenceDiagram
  participant P1 as Phone 1
  participant S as Server
  participant P2 as Phone 2
  Note over P1,P2: Both offline. Stock holds leftover A (19 x 48).
  P1->>P1: Confirm cut using A
  P2->>P2: Confirm cut using A
  P1->>S: sync (arrives first)
  S-->>P1: accepted, A is claimed
  P2->>S: sync (arrives second)
  S-->>P2: stored, but A is already claimed
  Note over P2: Sync check screen appears
  P2->>P2: "Re-plan this job" or "I cut a different piece"
  P2->>S: resolution record
```

### 7.4 Resolution rules

1.  **First to the server wins.** Ordering is by the server timestamp,
    never the phone clock, which may be wrong. A tie is broken by
    creation time, then by id, so every device reaches the identical
    conclusion.
2.  **The loser is never deleted.** Its record stays in the history. It
    is simply not counted until answered.
3.  **While unanswered, it contributes nothing.** Its leftovers do not
    enter stock, so the user can never plan against material that may
    not exist.
4.  **Re-plan this job** marks it voided and opens the job again with
    the same pieces, so the engine finds another leftover or a new
    sheet.
5.  **I cut a different piece** marks it kept, which tells the app the
    physical reality differed from the record; its leftovers then enter
    stock.
6.  Conflicts are surfaced immediately on the home screen as a red
    banner and cannot be dismissed without answering, because unanswered
    conflicts make stock wrong.

### 7.5 Why this is enough

The workshop has one owner cutting one board at a time. A conflict
requires two people to cut the same offcut while both are offline. It is
rare by construction. The design goal is therefore not to prevent it,
which would require locking and thus internet, but to make sure it is
detected, explained in one sentence, and fixed in one tap.

## [Section 8]{.sec-no}Functional requirements {#s8}

Each requirement has an identifier, a priority (M = must, S = should, C
= could) and an acceptance condition. Requirements marked M are all in
scope for version 1.0.

### 8.1 Authentication

::: tablewrap
  ID      P   Requirement                                                                   Accepted when
  ------- --- ----------------------------------------------------------------------------- -------------------------------------------------------------------
  FR-A1   M   A user can create a shop account with an email and password                   Account exists; the user lands on Home
  FR-A2   M   A user can log in with email and password                                     Correct details reach Home; wrong details show one plain sentence
  FR-A3   M   The session survives closing the app and restarting the phone                 Reopening after 7 days offline still shows Home
  FR-A4   M   Login errors are translated into plain language                               No Firebase error code is ever visible
  FR-A5   M   Attempting to log in with no internet explains that internet is needed once   The message names the one-time nature
  FR-A6   M   A user can log out, which clears local data listeners                         Returning to Login; stock no longer readable
  FR-A7   S   A user can reset a forgotten password by email                                Reset email is received
  FR-A8   M   All devices logging into the same account see the same stock                  A cut on phone 1 appears on phone 2 after sync
:::

### 8.2 Entering a job

::: tablewrap
  ID       P   Requirement                                                           Accepted when
  -------- --- --------------------------------------------------------------------- -------------------------------------------------------
  FR-J1    M   Enter a piece as width, height and quantity                           The piece appears in the job list
  FR-J2    M   Accept whole numbers, decimals and fractions                          All forms in §4.4 parse correctly
  FR-J3    M   Reject zero, negative and non-numeric input with a specific message   The field is marked and the message names the problem
  FR-J4    M   Quantity is adjusted with large plus and minus buttons, minimum 1     Buttons are at least 44 px; minus disabled at 1
  FR-J5    M   Add several different piece sizes to one job                          All appear in the list and all are planned together
  FR-J6    M   Remove a piece from the job                                           The piece disappears and the plan is discarded
  FR-J7    M   Turn the blade thickness on or off for this job                       The plan changes accordingly
  FR-J8    M   Typed pieces survive the app being closed                             Reopening restores the job list
  FR-J9    M   Warn when a piece is larger than the sheet, before planning           Message names the sheet size
  FR-J10   S   Re-run a past job\'s pieces as a new job                              The job list is prefilled from history
:::

### 8.3 Planning

::: tablewrap
  ID       P   Requirement                                                                                 Accepted when
  -------- --- ------------------------------------------------------------------------------------------- ----------------------------------------------------------
  FR-P1    M   Produce a plan for all pieces in the job                                                    Every piece is either placed or listed as unplaceable
  FR-P2    M   Search saved leftovers before opening a new sheet                                           A fitting leftover is always used in preference
  FR-P3    M   Choose the smallest leftover that fits                                                      Verified by automated test
  FR-P4    M   Turn a piece only when it does not fit unturned                                             Verified by automated test in both directions
  FR-P5    M   Mark a turned piece visibly on the diagram                                                  A \"turned\" tag is shown on that piece
  FR-P6    M   Draw the sheet to scale with pieces, new leftovers, other free leftovers and earlier cuts   Four visual states are distinguishable
  FR-P7    M   Label every piece and every leftover with its size                                          Readable without zooming on a 360 px screen
  FR-P8    M   Show the percentage of the sheet used                                                       Matches a hand calculation
  FR-P9    M   List the cuts in the order they should be made                                              Each names a direction and a measurement
  FR-P10   M   Say clearly whether the plan uses a new sheet or a saved leftover, and which one            The leftover\'s letter, size and origin date are shown
  FR-P11   M   Plan across several sheets when one is not enough                                           Each sheet is shown separately and numbered
  FR-P12   M   Offer to use a different leftover and re-plan without it                                    The rejected leftover is excluded and a new plan appears
  FR-P13   M   A plan changes nothing until it is confirmed                                                Leaving the plan screen leaves stock untouched
  FR-P14   M   Return to the job to change the pieces                                                      The job list is intact
:::

### 8.4 Confirming a cut

::: tablewrap
  ID      P   Requirement                                                         Accepted when
  ------- --- ------------------------------------------------------------------- -------------------------------------------
  FR-C1   M   Confirm cut writes one immutable record                             The record appears in history immediately
  FR-C2   M   Used leftovers become unavailable; new leftovers enter stock        Stock count changes as expected
  FR-C3   M   Confirming works with no internet and never blocks on the network   The screen advances within 100 ms offline
  FR-C4   M   A confirmation message names what was saved                         \"Cut saved. 2 leftovers added.\"
  FR-C5   M   The job list is cleared after confirming                            Starting another job begins empty
  FR-C6   M   Double-tapping Confirm cannot create two records                    The button disables on first press
:::

### 8.5 Leftover stock

::: tablewrap
  ID      P   Requirement                                                  Accepted when
  ------- --- ------------------------------------------------------------ -----------------------------------------------------
  FR-S1   M   List all free leftovers, largest first                       Order is by area, descending
  FR-S2   M   Show each leftover\'s size, letter and origin date           All three visible in the row
  FR-S3   M   Show the total count and total free area                     Matches the sum of the list
  FR-S4   M   Open a leftover to see it drawn on its parent sheet          Its position within the sheet is shown
  FR-S5   M   Add a leftover by hand, for boards already in the workshop   It enters stock and is usable in the next plan
  FR-S6   M   Discard a leftover that was lost, damaged or thrown away     It leaves stock; a discard record is written
  FR-S7   M   Empty stock shows an invitation to act, not a blank screen   Offers both \"Add by hand\" and \"New cutting job\"
  FR-S8   S   Search stock by a size that must fit                         Only leftovers holding that size are listed
:::

### 8.6 History

::: tablewrap
  ID      P   Requirement                                                    Accepted when
  ------- --- -------------------------------------------------------------- ---------------------------------------------------
  FR-H1   M   List past jobs newest first, with pieces, date and source      Matches the confirmed records
  FR-H2   M   Open a past job and see its original diagram                   Pieces shown exactly as cut
  FR-H3   M   A past job shows which of its leftovers have since been used   Used leftovers are drawn as earlier cuts
  FR-H4   M   History is never editable                                      No edit or delete control exists; rules forbid it
:::

### 8.7 Sync and conflicts

::: tablewrap
  ID      P   Requirement                                                     Accepted when
  ------- --- --------------------------------------------------------------- ------------------------------------------------
  FR-Y1   M   Sync happens automatically with no user action                  Records reach the server on reconnection
  FR-Y2   M   Show sync status per §7.2                                       All four states reachable in testing
  FR-Y3   M   Detect when two devices used the same leftover                  The later record is flagged
  FR-Y4   M   Order by server time, not phone time                            A wrong phone clock does not change the winner
  FR-Y5   M   An unanswered conflict contributes nothing to stock             Its leftovers are absent from stock
  FR-Y6   M   Offer exactly two answers: re-plan, or keep                     Both produce the documented outcome
  FR-Y7   M   Conflicts are announced on Home and cannot be ignored           A red banner persists until answered
  FR-Y8   M   The warning names the leftover, the other device and the time   All three appear in the message
:::

### 8.8 Settings

::: tablewrap
  ID      P   Requirement                                        Accepted when
  ------- --- -------------------------------------------------- -----------------------------------------
  FR-T1   M   Change the sheet width and length                  The next plan uses the new size
  FR-T2   M   Turn blade thickness on or off and set its value   Plans change accordingly
  FR-T3   M   Set the smallest leftover worth saving             Smaller remainders become waste
  FR-T4   M   Settings sync to other devices                     Changed on one phone, seen on another
  FR-T5   M   Changing settings never alters past records        Old jobs still show their original kerf
  FR-T6   M   Show the signed-in email and a log out button      Both present
:::

### 8.9 Install and platform

::: tablewrap
  ID      P   Requirement                                                   Accepted when
  ------- --- ------------------------------------------------------------- --------------------------------------------
  FR-I1   M   Installable to the home screen with its own icon and name     Chrome offers the install prompt
  FR-I2   M   Opens full screen with no browser bar                         Display mode is standalone
  FR-I3   M   Opens with no internet                                        Airplane mode test passes
  FR-I4   M   Updates itself silently on next open                          A new deployment is live without reinstall
  FR-I5   S   An install hint appears if the app is used in a browser tab   Shown once, dismissible
:::

## [Section 9]{.sec-no}Screen-by-screen UI specification {#s9}

Eight screens make up the whole product. Each is specified below with
its approved design, its purpose, every element it contains, every
action, and every state it can be in. The designs shown are normative:
the built app must match them.

### 9.1 Screen map

``` mermaid
graph TD
  L["1 Login"] -->|first login only| H["2 Home"]
  H --> J["3 New job"]
  J --> P["4 / 5 Cutting plan"]
  P -->|Confirm cut| H
  P -->|Change pieces| J
  H --> S["6 Leftover stock"]
  S --> SD["6b Leftover detail"]
  S --> SA["6c Add leftover by hand"]
  H --> C["7 Sync check"]
  C -->|Re-plan| J
  C -->|Keep| H
  H --> T["8 Settings"]
  T -->|Log out| L
  H --> HD["2b Job detail"]
```

### 9.2 Screen 1 --- Login

**Purpose:** the one screen that needs internet, seen once per device.
Everything about it exists to make that single moment painless and to
promise that it will not happen again.

::: fig
::: screens
<div>

::: phone
::: {style="text-align:center;margin-bottom:26px"}
::: {style="width:56px;height:56px;border-radius:14px;background:var(--blue-bg);color:var(--blue-tx);display:inline-flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;font-family:var(--disp)"}
SC
:::

Offcut

Plan cuts. Reuse every leftover.
:::

Shop email

::: {.p-in .ph style="margin-bottom:14px"}
name@company.com
:::

Password

::: {.p-in .ph style="margin-bottom:20px"}
••••••••
:::

::: {.p-btn style="height:52px"}
Log in
:::

Create shop account

::: {style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;color:var(--faint)"}
Works offline after your first login
:::
:::

1 · Login

</div>

<div>

::: phone
::: {style="text-align:center;margin-bottom:22px"}
::: {style="width:56px;height:56px;border-radius:14px;background:var(--blue-bg);color:var(--blue-tx);display:inline-flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;font-family:var(--disp)"}
SC
:::

Create shop account

One account for all your phones.
:::

Shop email

::: {.p-in style="margin-bottom:12px"}
rafiq.carpentry@gmail.com
:::

Password

::: {.p-in style="margin-bottom:6px;border-color:var(--red-bd)"}
•••••
:::

Use a password with at least 6 characters.

::: {.p-btn style="height:52px"}
Create account
:::

I already have an account
:::

1b · Register, with an error shown

</div>
:::
:::

::: tablewrap
  Element               Behaviour
  --------------------- -----------------------------------------------------------------------------------------
  Email field           Type email, autocomplete username, trimmed of spaces before use
  Password field        Type password, autocomplete current-password; new-password on the register screen
  Log in button         Disabled until both fields have content; shows \"Logging in...\" while working
  Create shop account   Switches the same screen into register mode; heading, button and footer link all change
  Offline note          Always visible. This is the promise that the internet requirement is one-time
  Error area            Appears under the offending field, in plain language, per FR-A4
:::

**States:** idle · submitting · error · offline (the button is replaced
by a note explaining that first login needs internet) · not configured
(a build without Firebase keys shows a setup message instead of the
form, so a misconfigured deploy fails loudly).

### 9.3 Screen 2 --- Home

**Purpose:** answer three questions at a glance --- is my data current,
what do I have, what did I do recently --- and offer one dominant
action.

::: fig
::: screens
<div>

::: phone
::: p-h
Offcut

[Synced 2 min ago]{.pill}
:::

::: {style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px"}
::: p-card
Saved leftovers

4
:::

::: p-card
Jobs this month

12
:::
:::

::: {.p-btn style="height:60px;font-size:17px;margin-bottom:10px"}
\+ New cutting job
:::

::: {.p-btn2 style="height:48px;margin-bottom:18px"}
Leftover stock
:::

Recent jobs

::: p-row
<div>

23 × 77, 2 pcs

15 Sep · new sheet

</div>

[›]{.chev}
:::

::: p-row
<div>

20 × 31, 2 pcs

10 Sep · from leftover

</div>

[›]{.chev}
:::

::: tabbar
[Home]{.on}StockSettings
:::
:::

2 · Home, normal state

</div>

<div>

::: phone
::: p-h
Offcut

[3 waiting to sync]{.pill .amber}
:::

::: {style="background:var(--red-bg);border-radius:10px;padding:13px;margin-bottom:14px"}
1 job needs your answer

A leftover was used on another phone too.

::: {style="background:var(--red-tx);color:#fff;border-radius:8px;height:40px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600"}
Check it now
:::
:::

::: {style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px"}
::: p-card
Saved leftovers

4
:::

::: p-card
Jobs this month

12
:::
:::

::: {.p-btn style="height:60px;font-size:17px;margin-bottom:10px"}
\+ New cutting job
:::

::: {.p-btn2 style="height:48px"}
Leftover stock
:::

::: tabbar
[Home]{.on}StockSettings
:::
:::

2b · Home with a conflict and queued records

</div>

<div>

::: phone
::: p-h
Offcut

[Offline]{.pill .grey}
:::

::: {style="text-align:center;padding:26px 8px 22px"}
::: {style="width:52px;height:52px;border-radius:12px;background:var(--mute);display:inline-flex;align-items:center;justify-content:center;font-size:26px;color:var(--faint)"}
▦
:::

No cuts yet

Start your first job, or add the offcuts already standing in the
workshop.
:::

::: {.p-btn style="height:60px;font-size:17px;margin-bottom:10px"}
\+ New cutting job
:::

::: {.p-btn2 style="height:48px"}
Add leftover by hand
:::

::: tabbar
[Home]{.on}StockSettings
:::
:::

2c · Home, first ever use

</div>
:::
:::

::: tablewrap
  Element           Behaviour
  ----------------- --------------------------------------------------------------------------------------
  Sync badge        Four states per §7.2. Tapping opens a plain explanation sheet
  Conflict banner   Only when an unanswered conflict exists. Cannot be dismissed. Opens Screen 7
  Saved leftovers   Count of free leftovers. Tapping opens Stock
  Jobs this month   Count of confirmed cuts in the current calendar month
  New cutting job   The dominant action, 60 px tall. Opens Screen 3 with an empty job
  Recent jobs       The latest five confirmed jobs. Each row: pieces, date, source. Opens the job detail
  Tab bar           Home, Stock, Settings. Persistent across the three top-level screens
:::

**Empty state:** when no cut has ever been confirmed, the counters and
recent list are replaced by an invitation offering both a first job and
adding existing offcuts, because a workshop adopting the app already has
material against the wall.

### 9.4 Screen 3 --- New job

**Purpose:** collect the sizes. Every design decision here serves a man
typing with dusty thumbs.

::: fig
::: screens
<div>

::: phone
::: {style="display:flex;align-items:center;gap:10px;margin-bottom:16px"}
[‹]{style="font-size:20px"}

New job
:::

::: {style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px"}
<div>

Width (in)

::: {.p-in style="height:42px;font-size:18px"}
23
:::

</div>

<div>

Height (in)

::: {.p-in style="height:42px;font-size:18px"}
77
:::

</div>
:::

Fractions work too, like 22 1/2 or 22.5

How many pieces

::: {style="display:flex;align-items:center;justify-content:space-between;border:0.5px solid var(--rule-2);border-radius:8px;padding:6px;margin-bottom:12px"}
::: {style="width:44px;height:44px;border-radius:8px;background:var(--mute);display:flex;align-items:center;justify-content:center;font-size:22px"}
−
:::

[2]{style="font-size:22px;font-weight:600;font-family:var(--disp)"}

::: {style="width:44px;height:44px;border-radius:8px;background:var(--mute);display:flex;align-items:center;justify-content:center;font-size:22px"}
\+
:::
:::

::: {.p-btn2 style="height:48px;margin-bottom:18px"}
\+ Add this piece
:::

Pieces in this job

::: p-row
[23 × 77 [· 2
pcs]{style="font-weight:400;color:var(--ink-2)"}]{style="font-size:16px;font-weight:600"}[✕]{.chev}
:::

::: p-row
[19 × 22 [· 1
pc]{style="font-weight:400;color:var(--ink-2)"}]{style="font-size:16px;font-weight:600"}[✕]{.chev}
:::

::: {style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 18px;font-size:15px"}
Include blade thickness[]{.tog}
:::

::: {.p-btn style="height:56px;font-size:17px"}
Make cutting plan
:::
:::

3 · New job

</div>

<div>

::: phone
::: {style="display:flex;align-items:center;gap:10px;margin-bottom:16px"}
[‹]{style="font-size:20px"}

New job
:::

::: {style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:6px"}
<div>

Width (in)

::: {.p-in style="height:42px;font-size:18px;border-color:var(--red-bd)"}
0
:::

</div>

<div>

Height (in)

::: {.p-in style="height:42px;font-size:18px"}
77
:::

</div>
:::

Width must be more than 0. Try 23 or 22 1/2.

How many pieces

::: {style="display:flex;align-items:center;justify-content:space-between;border:0.5px solid var(--rule-2);border-radius:8px;padding:6px;margin-bottom:12px"}
::: {style="width:44px;height:44px;border-radius:8px;background:var(--mute);display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--faint)"}
−
:::

[1]{style="font-size:22px;font-weight:600;font-family:var(--disp)"}

::: {style="width:44px;height:44px;border-radius:8px;background:var(--mute);display:flex;align-items:center;justify-content:center;font-size:22px"}
\+
:::
:::

::: {.p-btn2 style="height:48px;margin-bottom:18px;opacity:.5"}
\+ Add this piece
:::

Pieces in this job

::: {style="background:var(--mute);border-radius:8px;padding:18px 12px;text-align:center;margin-bottom:18px"}
Add a piece above to begin.
:::

::: {.p-btn style="height:56px;font-size:17px;opacity:.5"}
Make cutting plan
:::
:::

3b · Validation and empty job list

</div>

<div>

::: phone
::: {style="display:flex;align-items:center;gap:10px;margin-bottom:16px"}
[‹]{style="font-size:20px"}

New job
:::

::: {style="background:var(--amb-bg);border-radius:10px;padding:12px;margin-bottom:14px"}
**Too big for a sheet.** Your sheets are 96 × 48 in. A 60 × 120 piece
will not fit even turned.
:::

::: {style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px"}
<div>

Width (in)

::: {.p-in style="height:42px;font-size:18px"}
60
:::

</div>

<div>

Height (in)

::: {.p-in style="height:42px;font-size:18px"}
120
:::

</div>
:::

Change the sheet size in Settings, or split the piece.

How many pieces

::: {style="display:flex;align-items:center;justify-content:space-between;border:0.5px solid var(--rule-2);border-radius:8px;padding:6px;margin-bottom:12px"}
::: {style="width:44px;height:44px;border-radius:8px;background:var(--mute);display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--faint)"}
−
:::

[1]{style="font-size:22px;font-weight:600;font-family:var(--disp)"}

::: {style="width:44px;height:44px;border-radius:8px;background:var(--mute);display:flex;align-items:center;justify-content:center;font-size:22px"}
\+
:::
:::

::: {.p-btn2 style="height:48px;opacity:.5"}
\+ Add this piece
:::
:::

3c · Piece larger than a sheet

</div>
:::
:::

::: tablewrap
  Element             Behaviour
  ------------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  Width and height    `inputMode="text"`, so the full keyboard opens and the / of a fraction can be typed (a decimal number pad has no slash on most phones). 18 px text. Accepts the formats in §4.4
  Fraction hint       Permanent, not an error. It teaches the input format without a help page
  Quantity stepper    44 px targets. Minus greys out at 1. The number is also directly editable
  Add this piece      Disabled until width and height are valid. Adds to the list and clears the fields for the next size
  Piece list          Each row shows size and quantity with a remove ✕. Removing discards any existing plan
  Blade thickness     Mirrors the Settings value. Changing it here changes it everywhere, so there is one source of truth
  Make cutting plan   Disabled while the list is empty. Runs the engine and opens Screen 4 or 5
  Back                Keeps the typed pieces; they are also saved on the phone per FR-J8
:::

### 9.5 Screens 4 and 5 --- Cutting plan

**Purpose:** the screen the carpenter holds at the saw. It must be
readable at arm\'s length and must make the reuse of a leftover obvious
and reassuring.

::: fig
::: screens
<div>

::: phone
::: {style="display:flex;align-items:center;gap:10px;margin-bottom:3px"}
[‹]{style="font-size:20px"}

Cutting plan
:::

New sheet 96 × 48 · 23 × 77, 2 pcs

::: {style="display:flex;gap:24px;align-items:flex-start;margin-bottom:14px"}
::: {.sheet style="width:144px;height:288px"}
::: {.bl .cut style="left:0;top:0;width:69px;height:231px"}
23 × 77\
Piece 1
:::

::: {.bl .cut style="left:69px;top:0;width:69px;height:231px"}
23 × 77\
Piece 2
:::

::: {.bl .free style="left:138px;top:0;width:6px;height:231px"}
:::

::: {.bl .free style="left:0;top:231px;width:144px;height:57px"}
A · 19 × 48 free
:::

::: {style="position:absolute;left:150px;top:100px;width:20px;height:20px;border-radius:50%;background:var(--grn-bg);color:var(--grn-tx);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center"}
B
:::
:::

::: {.legend style="flex:1;min-width:0"}
<div>

[]{.sw .cut}Cut pieces

</div>

::: {style="margin-bottom:12px"}
[]{.sw .free}Saved leftover
:::

Sheet used

77%

Leftovers

A: 19 × 48

B: 2 × 77
:::
:::

::: {.p-card style="font-size:13px;margin-bottom:14px"}
Cut order

1\. Cut across at 77 in\
2. Cut down at 23 in\
3. Cut down at 46 in
:::

::: {.p-btn style="height:56px;font-size:17px;margin-bottom:10px"}
✓ Confirm cut and save leftovers
:::

::: p-btn2
Change pieces
:::
:::

4 · Plan on a new sheet

</div>

<div>

::: phone
::: {style="display:flex;align-items:center;gap:10px;margin-bottom:12px"}
[‹]{style="font-size:20px"}

Cutting plan
:::

::: {style="background:var(--grn-bg);color:var(--grn-tx);border-radius:8px;padding:10px 12px;font-size:14px;margin-bottom:14px"}
✓ It fits in a saved leftover. No new sheet needed.
:::

::: {style="display:flex;gap:24px;align-items:flex-start;margin-bottom:14px"}
::: {.sheet style="width:144px;height:288px"}
::: {.bl .old style="left:0;top:0;width:69px;height:231px"}
Already cut
:::

::: {.bl .old style="left:69px;top:0;width:69px;height:231px"}
Already cut
:::

::: {.bl .free style="left:138px;top:0;width:6px;height:231px"}
:::

::: {.bl .cut style="left:0;top:231px;width:66px;height:57px"}
19 × 22\
New
:::

::: {.bl .free style="left:66px;top:231px;width:78px;height:57px;font-size:11px"}
A2 · 19 × 26\
free
:::

::: {style="position:absolute;left:150px;top:100px;width:20px;height:20px;border-radius:50%;background:var(--grn-bg);color:var(--grn-tx);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center"}
B
:::
:::

::: {.legend style="flex:1;min-width:0"}
Use this leftover

A · 19 × 48

From the sheet cut on 15 Sep

<div>

[]{.sw .old}Already cut

</div>

<div>

[]{.sw .cut}New piece

</div>

<div>

[]{.sw .free}Free after this cut

</div>

[Turned to fit]{.pill .grey style="margin-top:4px;display:inline-block"}
:::
:::

::: {.p-btn style="height:56px;font-size:17px;margin-bottom:10px"}
✓ Confirm cut and save leftovers
:::

::: p-btn2
Pick a different leftover
:::
:::

5 · Plan reusing a saved leftover

</div>

<div>

::: phone
::: {style="display:flex;align-items:center;gap:10px;margin-bottom:3px"}
[‹]{style="font-size:20px"}

Cutting plan
:::

2 sheets needed · 30 × 50, 5 pcs

::: {style="display:flex;gap:10px;margin-bottom:12px"}
[Sheet 1]{.pill style="background:var(--ink);color:var(--paper)"} [Sheet
2]{.pill .grey}
:::

::: {style="display:flex;gap:24px;align-items:flex-start;margin-bottom:12px"}
::: {.sheet style="width:144px;height:288px"}
::: {.bl .cut style="left:0;top:0;width:90px;height:150px"}
30 × 50\
Piece 1
:::

::: {.bl .cut style="left:0;top:150px;width:90px;height:150px;height:138px"}
30 × 50\
Piece 2
:::

::: {.bl .free style="left:90px;top:0;width:54px;height:288px;font-size:11px"}
C · 18 × 96\
free
:::
:::

::: {.legend style="flex:1;min-width:0"}
Sheet used

65%

<div>

[]{.sw .cut}Cut pieces

</div>

<div>

[]{.sw .free}Saved leftover

</div>
:::
:::

::: {style="background:var(--amb-bg);border-radius:8px;padding:10px 12px;font-size:13.5px;color:var(--amb-tx);margin-bottom:12px"}
Piece 5 does not fit on any sheet. Split it or change the sheet size.
:::

::: {.p-btn style="height:56px;font-size:17px"}
✓ Confirm cut and save leftovers
:::
:::

5b · Several sheets, with an unplaceable piece

</div>
:::
:::

::: tablewrap
  Element                     Behaviour
  --------------------------- -----------------------------------------------------------------------------------------------------------------------------
  Header line                 Says immediately whether this is a new sheet or a leftover, and restates the pieces
  Green reuse banner          Only on a reuse plan. This is the app\'s main payoff, so it is stated in words, not implied by colour alone
  Diagram                     Drawn to scale, 1:2 aspect for a 96 × 48 sheet. Four block types: cut piece, new leftover, other free leftover, earlier cut
  Narrow blocks               A block too small for text shows a lettered dot beside the sheet instead, as with leftover B
  Turned tag                  Shown whenever a piece was rotated, so the carpenter orients the board correctly
  Sheet used                  Placed area ÷ region area, rounded to a whole percent
  Cut order                   Numbered instructions measured from the corner of the region being cut
  Sheet tabs                  Appear only when a job spans more than one sheet
  Confirm cut                 56 px, the dominant action. Writes the record, shows a confirmation, returns Home
  Pick a different leftover   Excludes the suggested leftover and re-plans. Repeatable until nothing suitable is left, then a new sheet is proposed
  Change pieces               Returns to Screen 3 with the job intact
:::

**Accessibility:** colour is never the only signal. Cut pieces carry a
size label, leftovers carry a letter and the word \"free\", and earlier
cuts carry the words \"Already cut\". A colour-blind user, or one in
bright sun, can read the plan.

### 9.6 Screen 6 --- Leftover stock

**Purpose:** replace the mental inventory of what is standing against
the wall. It is also the screen that makes the app trustworthy: the
carpenter can verify that what it claims to have matches what he can
see.

::: fig
::: screens
<div>

::: phone
::: {style="display:flex;align-items:center;gap:10px;margin-bottom:14px"}
[‹]{style="font-size:20px"}

Leftover stock
:::

::: {style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px"}
::: p-card
Pieces

4
:::

::: p-card
Free area

2,520 [sq in]{style="font-size:13px;font-weight:400;color:var(--ink-2)"}
:::
:::

Biggest first

::: p-row
<div>

30 × 40

C · from 4 Sep sheet

</div>

[›]{.chev}
:::

::: p-row
<div>

14 × 48

A · from 9 Sep sheet

</div>

[›]{.chev}
:::

::: p-row
<div>

19 × 26

A2 · from 15 Sep sheet

</div>

[›]{.chev}
:::

::: {.p-row style="border-bottom:0"}
<div>

2 × 77

B · from 15 Sep sheet

</div>

[›]{.chev}
:::

::: {.p-btn2 style="height:50px;margin-top:16px"}
\+ Add leftover by hand
:::

::: tabbar
Home[Stock]{.on}Settings
:::
:::

6 · Leftover stock

</div>

<div>

::: phone
::: {style="display:flex;align-items:center;gap:10px;margin-bottom:14px"}
[‹]{style="font-size:20px"}

Leftover A2
:::

::: {style="display:flex;gap:22px;align-items:flex-start;margin-bottom:16px"}
::: {.sheet style="width:120px;height:240px"}
::: {.bl .old style="left:0;top:0;width:57.5px;height:192.5px;font-size:10px"}
Already cut
:::

::: {.bl .old style="left:57.5px;top:0;width:57.5px;height:192.5px;font-size:10px"}
Already cut
:::

::: {.bl .free style="left:115px;top:0;width:5px;height:192.5px"}
:::

::: {.bl .old style="left:0;top:192.5px;width:55px;height:47.5px;font-size:10px"}
Already cut
:::

::: {.bl .free style="left:55px;top:192.5px;width:65px;height:47.5px;font-size:11px"}
A2
:::
:::

::: {style="flex:1;min-width:0"}
19 × 26

494 sq in

From

Sheet cut on 15 Sep

Position on the sheet

22 in from the left,\
77 in from the top
:::
:::

::: {.p-btn style="height:52px;margin-bottom:10px"}
Use this in a new job
:::

::: {.p-btn2 style="color:var(--red-tx);border-color:var(--red-bd)"}
Throw away / lost
:::
:::

6b · Leftover detail

</div>

<div>

::: phone
::: {style="display:flex;align-items:center;gap:10px;margin-bottom:14px"}
[‹]{style="font-size:20px"}

Add leftover by hand
:::

For offcuts already standing in your workshop.

::: {style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px"}
<div>

Width (in)

::: {.p-in style="height:42px;font-size:18px"}
24
:::

</div>

<div>

Height (in)

::: {.p-in style="height:42px;font-size:18px"}
36
:::

</div>
:::

Measure the piece and enter both sides.

How many like this

::: {style="display:flex;align-items:center;justify-content:space-between;border:0.5px solid var(--rule-2);border-radius:8px;padding:6px;margin-bottom:16px"}
::: {style="width:44px;height:44px;border-radius:8px;background:var(--mute);display:flex;align-items:center;justify-content:center;font-size:22px"}
−
:::

[3]{style="font-size:22px;font-weight:600;font-family:var(--disp)"}

::: {style="width:44px;height:44px;border-radius:8px;background:var(--mute);display:flex;align-items:center;justify-content:center;font-size:22px"}
\+
:::
:::

::: {.p-card style="margin-bottom:18px;font-size:13.5px"}
These are saved as loose pieces with no parent sheet, so they will not
appear inside a sheet diagram.
:::

::: {.p-btn style="height:56px;font-size:17px"}
Add to stock
:::
:::

6c · Add leftover by hand

</div>
:::
:::

::: tablewrap
  Element                 Behaviour
  ----------------------- -----------------------------------------------------------------------------------------------------------------
  Pieces / Free area      Count and summed area of free leftovers. Free area is the workshop\'s recovered value, shown to justify the app
  Sort                    Largest area first, so the most valuable stock is at the top
  Row                     Size in large type, then letter and origin date. Size is shown short side first
  Leftover detail         Draws the leftover in its position on the parent sheet, so the physical board can be identified
  Use this in a new job   Opens Screen 3 and restricts the next plan to this leftover
  Throw away / lost       Confirmation required. Writes a discard record. Never deletes history
  Add by hand             Adds one or more loose leftovers with no parent sheet. Essential for the first weeks of use
:::

#### 9.6.1 Leftover-restricted planning must never silently open a new sheet

When a job is planned from "Use this in a new job", the plan is
restricted to that one leftover: the engine runs with
`allowNewSheets: false`, so a piece that does not fit that leftover,
even turned, is left unplaced rather than quietly starting a fresh
sheet. New job shows `Planning with leftover A2 (28 × 48) only.`
(short side first, per §4.4).

If every piece fits, planning proceeds straight to the plan screen as
normal, with any turned piece marked "Turned to fit". If one or more
pieces do not fit, New job does not navigate. Instead it shows a
dialog:

- **Title:** "Doesn't fit this leftover"
- **Body:** names every piece that does not fit, with quantity, for
  example "The 30 × 48 piece does not fit in leftover A2 (28 × 48),
  even turned." When some pieces do fit, it adds "The other pieces
  fit."
- **Use a new sheet** (primary) --- plans again using only this
  leftover plus a new sheet for whatever does not fit it. No other
  saved leftover is considered. The plan's reuse banner then reads
  "Uses 1 saved leftover and 1 new sheet." (or shows no leftover use
  at all if nothing fit the leftover).
- **Change the size** (outlined) --- closes the dialog and returns to
  New job with the typed pieces untouched.
- **Choose another leftover** (text link) --- clears the restriction
  and returns to Leftover stock.

### 9.7 Screen 7 --- Sync check

**Purpose:** resolve the one situation the app cannot decide alone. The
screen must state what happened in one sentence, then offer exactly two
answers.

::: fig
::: screens
<div>

::: phone
::: {style="display:flex;align-items:center;gap:10px;margin-bottom:16px"}
[‹]{style="font-size:20px"}

Sync check
:::

::: {style="background:var(--amb-bg);border-radius:12px;padding:16px;margin-bottom:16px"}
⚠ Leftover already used

The 19 × 48 leftover from the 15 Sep sheet was already used on another
phone at 4:12 pm.

Check the pieces in your workshop, then choose what to do.
:::

::: {.p-card style="font-size:13px;margin-bottom:18px"}
Affected job

19 × 22, 1 pc · 19 Sep
:::

::: {.p-btn style="height:54px;font-size:16px;margin-bottom:10px"}
Re-plan this job
:::

::: {.p-btn2 style="height:48px"}
I cut a different piece
:::

Nothing is deleted. The job stays in your history either way.
:::

7 · Sync check

</div>

<div>

::: phone
::: {style="display:flex;align-items:center;gap:10px;margin-bottom:16px"}
[‹]{style="font-size:20px"}

Sync check
:::

::: {style="background:var(--grn-bg);border-radius:12px;padding:16px;margin-bottom:16px"}
✓ All clear

Every job on this phone matches the shop record.
:::

::: {.p-card style="font-size:13.5px;margin-bottom:18px"}
Sync status

Last synced: 2 min ago

Waiting to send: none

Devices on this account: 2
:::

::: {.p-btn2 style="height:48px"}
Back to home
:::
:::

7b · Sync check with nothing to answer

</div>
:::
:::

::: tablewrap
  Element                   Behaviour
  ------------------------- ----------------------------------------------------------------------------------------------
  Warning card              Names the leftover size, its origin, the other device and the time. No technical terms
  Affected job              The pieces and date of the job in question, so it can be recognised
  Re-plan this job          Voids the record and reopens the job with the same pieces so the engine finds another source
  I cut a different piece   Keeps the record and lets its leftovers into stock
  Reassurance line          Present because the moment is stressful and the user must know nothing is lost either way
  Multiple conflicts        Handled one at a time, oldest first, with a \"1 of 3\" counter in the header
:::

### 9.8 Screen 8 --- Settings

**Purpose:** hold the few values that change how plans are made, and the
account. Nothing else. Every additional setting is a chance for the
owner to break his own app.

::: fig
::: screens
<div>

::: phone
::: {style="display:flex;align-items:center;gap:10px;margin-bottom:12px"}
[‹]{style="font-size:20px"}

Settings
:::

::: {style="padding:12px 0;border-bottom:0.5px solid var(--rule)"}
Sheet size (in)

::: {style="display:grid;grid-template-columns:1fr 1fr;gap:12px"}
::: p-in
96
:::

::: p-in
48
:::
:::

Length, then width.
:::

::: {style="padding:12px 0;border-bottom:0.5px solid var(--rule)"}
::: {style="display:flex;justify-content:space-between;align-items:center"}
[Include blade thickness]{style="font-size:15px"}[]{.tog}
:::

Blade width: 1/8 in. Used when the toggle is on.
:::

::: {style="padding:12px 0;border-bottom:0.5px solid var(--rule)"}
Save leftovers bigger than (in)

::: p-in
1
:::

Anything smaller is treated as waste.
:::

::: {style="padding:12px 0;border-bottom:0.5px solid var(--rule);display:flex;justify-content:space-between;align-items:center"}
[Rotate pieces]{style="font-size:15px"}[Only if
needed]{style="font-size:14px;color:var(--ink-2)"}
:::

::: {style="padding:12px 0 16px"}
Signed in as

rafiq.carpentry@gmail.com
:::

::: p-btn2
Log out
:::

::: tabbar
HomeStock[Settings]{.on}
:::
:::

8 · Settings

</div>

<div>

::: phone
::: {style="display:flex;align-items:center;gap:10px;margin-bottom:14px"}
[‹]{style="font-size:20px"}

23 × 77, 2 pcs
:::

Cut on 15 Sep · new sheet · blade off

::: {style="display:flex;gap:22px;align-items:flex-start;margin-bottom:14px"}
::: {.sheet style="width:120px;height:240px"}
::: {.bl .cut style="left:0;top:0;width:57.5px;height:192.5px;font-size:11px"}
23 × 77
:::

::: {.bl .cut style="left:57.5px;top:0;width:57.5px;height:192.5px;font-size:11px"}
23 × 77
:::

::: {.bl .free style="left:115px;top:0;width:5px;height:192.5px"}
:::

::: {.bl .old style="left:0;top:192.5px;width:55px;height:47.5px;font-size:10px"}
A · used since
:::

::: {.bl .free style="left:55px;top:192.5px;width:65px;height:47.5px;font-size:11px"}
A2 free
:::
:::

::: {.legend style="flex:1;min-width:0"}
Sheet used

77%

<div>

[]{.sw .cut}Cut that day

</div>

<div>

[]{.sw .old}Used since

</div>

<div>

[]{.sw .free}Still free

</div>
:::
:::

::: {.p-card style="font-size:13px;margin-bottom:14px"}
Cut order used

1\. Cut across at 77 in\
2. Cut down at 23 in\
3. Cut down at 46 in
:::

::: p-btn2
Cut these pieces again
:::
:::

2b · Job detail from history

</div>
:::
:::

::: tablewrap
  Element            Behaviour
  ------------------ ----------------------------------------------------------------------------------------
  Sheet size         Two fields. Validated the same way as piece sizes. Applies to future plans only
  Blade thickness    Toggle plus a value field, revealed when the toggle is on
  Minimum leftover   Default 1 in, so even a 2 in strip is kept, as the owner requested
  Rotate pieces      Shown as a fixed, explained rule rather than an option, to keep behaviour predictable
  Log out            Confirmation required, warning that logging in again needs internet
  Job detail         Shows the job as it was cut, and marks which of its leftovers have since been consumed
:::

## [Section 10]{.sec-no}End-to-end user journeys {#s10}

Each journey is a complete path through the product, written as the
sequence the user actually experiences. Together they exercise every
requirement in Section 8.

### 10.1 Journey A --- First day with the app

1.  The son sends his father a link. He opens it in Chrome and taps
    **Add to Home Screen**. The icon appears on the home screen.
2.  He opens the app. Screen 1 asks for an email and password. He taps
    **Create shop account**, enters them and is taken to Home.
3.  Home shows the first-use state: no cuts yet, with two offers.
4.  He taps **Add leftover by hand**, measures the four boards against
    his wall and enters each one. Stock now shows 4 pieces.
5.  He is ready to work. Total time: under five minutes.

### 10.2 Journey B --- The owner\'s original example, day one

1.  Home → **New cutting job**.
2.  Width 23, height 77, quantity 2 → **Add this piece**. The piece
    appears in the list.
3.  **Make cutting plan**.
4.  Screen 4 shows the sheet with two blue pieces side by side, a green
    19 × 48 strip along the bottom labelled `A`, a narrow green strip on
    the right labelled `B`, 77% used, and three numbered cuts.
5.  He cuts the sheet following the order shown, then taps **Confirm cut
    and save leftovers**.
6.  A message reads: \"Cut saved. 2 leftovers added.\" He is returned to
    Home, where Saved leftovers now reads 2.

### 10.3 Journey C --- Four days later, the reuse

1.  He opens the app with no internet in the workshop. It opens
    immediately from cache and shows the grey Offline badge.
2.  Home → **New cutting job** → 19 × 22, quantity 1 → **Make cutting
    plan**.
3.  Screen 5 opens with a green banner: *It fits in a saved leftover. No
    new sheet needed.*
4.  The diagram greys out the two pieces cut four days ago, shows the
    new piece in blue inside leftover `A`, and the 19 × 26 remainder in
    green as `A2`. A tag reads *Turned to fit*.
5.  The side panel tells him exactly which board to fetch: **A · 19 ×
    48, from the sheet cut on 15 Sep**.
6.  He fetches that board, cuts it, taps **Confirm cut**. The record is
    saved on the phone at once. No new sheet was opened.
7.  That evening the phone reaches WiFi and the badge turns green:
    *Synced just now*.

::: note
This journey is the reason the product exists, and it is covered end to
end by the automated test suite (§17.2).
:::

### 10.4 Journey D --- Rejecting the suggestion

1.  The plan suggests leftover `A`, but that board has a damaged corner.
2.  He taps **Pick a different leftover**. The engine re-plans with `A`
    excluded and proposes `C`.
3.  He accepts and confirms. `A` remains in stock, untouched.

### 10.5 Journey E --- Two phones, one offcut

1.  Morning: both phones are offline. Stock holds leftover `A`, 19 × 48.
2.  The owner confirms a cut using `A`. The helper, unaware, confirms a
    different cut also using `A`.
3.  Afternoon: the owner\'s phone syncs first. His record claims `A`.
4.  The helper\'s phone syncs. Home shows a red banner: *1 job needs
    your answer*.
5.  He taps it and reaches Screen 7, which tells him the 19 × 48
    leftover from the 15 Sep sheet was already used on another phone at
    4:12 pm.
6.  He looks at the bench, sees the board is gone, and taps **Re-plan
    this job**. The job reopens with his pieces; the engine proposes a
    different leftover.
7.  Stock is now correct on both phones and the banner disappears.

### 10.6 Journey F --- Losing a board

1.  A leftover is damaged by water. Stock → the leftover → **Throw away
    / lost** → confirm.
2.  A discard record is written. The leftover leaves stock and will
    never be proposed again. The original job remains in history
    unchanged.

### 10.7 Journey G --- Changing the material size

1.  The supplier switches to 60 × 120 sheets. Settings → sheet size → 60
    and 120.
2.  All future plans use the new size. Existing leftovers keep their own
    recorded dimensions and remain usable. Past jobs still display at
    their original size.

## [Section 11]{.sec-no}Design system {#s11}

### 11.1 Colour

::: tablewrap
  Token                            Light                Dark                 Used for
  -------------------------------- -------------------- -------------------- ---------------------------------------
  `--background`                   #ffffff              #262624              Screen background
  `--foreground`                   #1f1e1c              #f3f2ee              Body text, primary button fill
  `--muted`                        #f5f4f0              #1f1e1d              Cards, earlier-cut blocks
  `--border` / `--border-strong`   #e6e4de / #c9c7c0    #3a3937 / #55534f    Dividers, field outlines
  Blue (accent)                    #378add on #e6f1fb   on #0c447c           Cut pieces, links, active tab
  Green                            #3b6d11 on #eaf3de   #c0dd97 on #27500a   Free leftovers, synced state, success
  Amber                            #854f0b on #faeeda   #fac775 on #633806   Sync warnings, unplaceable pieces
  Red                              #a32d2d on #fcebeb   #f7c1c1 on #791f1f   Validation errors, conflicts, discard
:::

The palette is deliberately small and semantic. Blue always means \"this
is the material you are cutting\". Green always means \"this is material
you still have\". Those two meanings carry the whole product.

### 11.2 Type

::: tablewrap
  Role             Size        Weight   Notes
  ---------------- ----------- -------- ----------------------------------------------------------
  Screen title     18 px       600      Left-aligned beside the back arrow
  Large number     22--24 px   600      Counts, percentages, quantity
  Stock size       18 px       600      The most-read text in the app
  Body             15--16 px   400      Rows and labels
  Field label      13 px       400      Sentence case, never all caps
  Hint / caption   12--13 px   400      Muted colour, never carries essential information alone
  Diagram label    11--13 px   600      Shrinks with block size; a dot replaces text below 12 px
:::

The system font stack is used, so the app looks native on the device and
needs no font download, which matters on a first load over a weak
connection.

### 11.3 Spacing, shape and motion

-   Screen padding 16 px. Vertical rhythm in multiples of 4 px.
-   Corner radius: 8 px for controls and cards, 999 px for badges. One
    radius per role, not one radius for everything.
-   Borders are hairline (0.5 px) so that a dense screen does not read
    as a grid of boxes.
-   Motion is limited to what answers a tap: a button press scales to
    0.98, a screen change slides. Nothing animates on load.
    `prefers-reduced-motion` is respected.

### 11.4 Controls

::: tablewrap
  Control            Height       Where
  ------------------ ------------ ----------------------------------------------------
  Hero button        60 px        New cutting job
  Primary button     56 px        Confirm cut, Make cutting plan
  Standard primary   52 px        Log in, Use this leftover
  Secondary button   46--48 px    Change pieces, Pick a different leftover
  Stepper button     44 × 44 px   Quantity
  Text field         38--42 px    All inputs; 16 px text minimum to stop iOS zooming
:::

### 11.5 Writing rules

-   Buttons name the outcome: *Confirm cut and save leftovers*, not
    *Submit*.
-   An action keeps its name throughout, so *Confirm cut* produces *Cut
    saved*.
-   Errors say what happened and what to do: *Width must be more than 0.
    Try 23 or 22 1/2.*
-   Empty screens invite action rather than report emptiness.
-   No technical vocabulary reaches the user. There is no word \"sync
    conflict\" on Screen 7; there is a sentence about a leftover being
    used on another phone.

### 11.6 Accessibility

-   Text contrast meets WCAG AA against its background in both themes.
-   Every interactive element has a visible focus ring and an accessible
    name.
-   Diagram blocks carry text labels; colour is never the only carrier
    of meaning.
-   Tap targets are at least 44 × 44 px.
-   The app respects the system light or dark setting, because the
    workshop is dark and the yard is bright.

## [Section 12]{.sec-no}Non-functional requirements {#s12}

### 12.1 Performance

::: tablewrap
  ID       Requirement                                          Target
  -------- ---------------------------------------------------- --------------------------------------------------------
  NFR-P1   App opens from the home-screen icon, offline         Interactive within 2 s on a mid-range Android phone
  NFR-P2   A plan is produced after tapping Make cutting plan   Under 100 ms for up to 50 pieces against 200 leftovers
  NFR-P3   Confirm cut returns control to the user              Under 100 ms, never waiting on the network
  NFR-P4   Stock and history render                             Under 300 ms with 2,000 records
  NFR-P5   First load over a 3G connection                      Under 5 s, total JavaScript under 400 KB compressed
:::

### 12.2 Reliability

-   No confirmed cut may ever be lost, including if the app is killed
    immediately after confirming. The local write completes before the
    screen changes.
-   No record is ever modified or deleted, at the app level and at the
    database-rules level.
-   Derived stock is a pure function, so the same records always produce
    the same stock on every device.
-   A corrupt or unreadable record is skipped with a logged warning
    rather than crashing the stock calculation.

### 12.3 Usability

-   The primary journey, entering a piece and reaching a plan, takes no
    more than four taps and two number entries.
-   No screen requires horizontal scrolling at 320 px width.
-   The app is operable one-handed: primary actions sit in the lower
    half of the screen.
-   No feature requires reading documentation.

### 12.4 Capacity

-   Designed for up to 5,000 cut records and 2,000 leftovers, far beyond
    a single workshop\'s lifetime use.
-   Firestore\'s free tier covers this workload with a wide margin; the
    expected running cost is zero.

### 12.5 Maintainability

-   The cutting engine and stock calculation are pure TypeScript with no
    framework imports, so they can be tested and reasoned about alone.
-   TypeScript strict mode is on, including unused-variable checks.
-   Every non-obvious rule carries a comment explaining the workshop
    reason, not the code mechanics.

## [Section 13]{.sec-no}Security and privacy {#s13}

### 13.1 What is protected

The data is a workshop\'s cutting history. It is commercially sensitive
but not personal beyond an email address. The security goal is therefore
simple and absolute: one shop\'s data must be unreachable by anyone
else.

### 13.2 Rules

    match /shops/{shopId} {
      function isShopOwner(shopId) {
        return request.auth != null && request.auth.uid == shopId;
      }
      match /cuts/{cutId} {
        allow read, create: if isShopOwner(shopId);
        allow update, delete: if false;      // history is immutable
      }
      match /resolutions/{cutId} {
        allow read, create, update: if isShopOwner(shopId);
        allow delete: if false;
      }
      match /settings/{docId} {
        allow read, write: if isShopOwner(shopId);
      }
    }

Every path is scoped to the authenticated user\'s id, so a shop cannot
address another shop\'s documents even by guessing. The
`update, delete: if false` lines enforce the append-only design in the
database itself, which means a future bug in the app still cannot
destroy history.

### 13.3 Credentials and configuration

-   Firebase web configuration values are public by design; they
    identify the project, they do not grant access. Access is granted
    only by the rules above.
-   Configuration lives in a `.env` file that is never committed. A
    `.env.example` documents the required names.
-   Passwords are handled entirely by Firebase Authentication. The app
    never stores or transmits a password itself.
-   All traffic is HTTPS, enforced by Firebase Hosting.

### 13.4 Device security

-   Local data is stored in the browser\'s own storage for the app\'s
    origin and is not readable by other sites or apps.
-   Logging out stops all data listeners and returns the user to the
    login screen.
-   If a phone is lost, changing the shop password prevents future
    sign-ins; the lost device retains a cached copy until it is signed
    out or wiped. This limitation is documented for the owner.

## [Section 14]{.sec-no}Error, empty and edge cases {#s14}

Each case below has a defined behaviour and message. Nothing in this
list may be handled by a crash, a blank screen, or a technical error
code.

### 14.1 Input

::: tablewrap
  Case                             Behaviour
  -------------------------------- ------------------------------------------------------------------------------------
  Empty width or height            Add button stays disabled; no error shown until the user tries
  Zero or negative                 Field marked; \"Width must be more than 0. Try 23 or 22 1/2.\"
  Letters or symbols               \"That is not a size. Type a number like 23, 22.5 or 22 1/2.\"
  Fraction with zero denominator   Treated as invalid, same message
  Piece bigger than the sheet      Amber card before planning, naming the current sheet size
  Quantity below 1                 Impossible; minus is disabled at 1
  Absurd quantity, e.g. 500        Allowed, but the plan screen warns how many sheets it would need before confirming
:::

### 14.2 Planning

::: tablewrap
  Case                                                   Behaviour
  ------------------------------------------------------ ------------------------------------------------------------------------------------------------------------
  Nothing in stock fits                                  A new sheet is proposed, with a line explaining that no saved leftover was big enough
  All leftovers excluded by the user                     A new sheet is proposed; the exclusions are listed so the user can undo them
  A piece fits nowhere at all                            Listed separately as unplaceable; the rest of the job can still be confirmed
  Job needs several sheets                               Tabs per sheet; the total sheet count is stated in the header
  Plan produced, then stock changes from another phone   The plan is recomputed before confirming; if the chosen leftover vanished, the user is told and re-planned
:::

### 14.3 Data and sync

::: tablewrap
  Case                                                 Behaviour
  ---------------------------------------------------- ----------------------------------------------------------------------------------
  Offline at first launch, never logged in             Login screen explains that internet is needed once, and that it is only once
  Offline for weeks                                    Everything works; the badge shows Offline and the last sync time
  Phone clock wrong                                    Ordering uses server time, so the outcome is unaffected
  Two phones use the same leftover                     Screen 7, per §7.4
  Record references a leftover that no longer exists   Treated as a conflict of kind \"missing\", same two answers
  Browser storage blocked, e.g. private mode           App falls back to in-memory storage and warns that data will not survive closing
  Storage full                                         Writes fail loudly with a message to free space; nothing is silently dropped
:::

### 14.4 Empty states

::: tablewrap
  Screen                          Message and offer
  ------------------------------- --------------------------------------------------------------------
  Home, no cuts ever              \"No cuts yet.\" Offers a first job and adding existing offcuts
  Stock, nothing saved            \"No leftovers saved yet.\" Offers Add by hand and New cutting job
  New job, no pieces added        \"Add a piece above to begin.\"
  History, no jobs                The Recent jobs section is hidden entirely rather than shown empty
  Sync check, nothing to answer   Green all-clear card with the current sync figures
:::

## [Section 15]{.sec-no}Architecture and file layout {#s15}

### 15.1 Layers

``` mermaid
graph TD
  UI["Screens
src/pages"] --> ST["State
Zustand stores"]
  ST --> EN["Engine
packer.ts, stock.ts
pure, tested"]
  ST --> DB["Data
db.ts, firebase.ts"]
  DB --> FS["Firestore
on-device cache + cloud"]
  UI --> CMP["Components
shadcn/ui + SheetDiagram"]
```

The rule that keeps this maintainable: the engine knows nothing about
React or Firebase, the stores know nothing about how screens look, and
the screens contain no cutting logic.

### 15.2 File layout

    offcut/
    ├─ index.html
    ├─ vite.config.ts            PWA manifest and service worker
    ├─ tailwind.config.js        design tokens
    ├─ firebase.json             hosting and rules
    ├─ firestore.rules           security rules from §13.2
    ├─ .env.example              required configuration names
    ├─ public/icons/             app icons, 192 / 512 / maskable
    └─ src/
       ├─ main.tsx               entry, router, service worker registration
       ├─ index.css              colour tokens, light and dark
       ├─ lib/
       │  ├─ types.ts            every shared type
       │  ├─ inches.ts           parsing and fraction display
       │  ├─ id.ts               device-generated ids
       │  ├─ packer.ts           the cutting engine
       │  ├─ stock.ts            records → stock, jobs, conflicts
       │  ├─ sheetView.ts        plan → drawable blocks
       │  ├─ summary.ts          human-readable job summaries
       │  ├─ format.ts           dates, "2 min ago", plurals
       │  ├─ firebase.ts         app, auth, Firestore with on-device cache
       │  ├─ db.ts               record writers
       │  └─ packer.test.ts      engine and stock tests
       ├─ store/
       │  ├─ auth.ts             login state and plain-language errors
       │  ├─ data.ts             live records, sync status, derived stock
       │  ├─ job.ts              the job being entered and its plan
       │  ├─ settings.ts         settings, saved locally and synced
       │  └─ toast.ts            confirmation messages
       ├─ components/
       │  ├─ ui/                 button, input, label, switch
       │  ├─ SheetDiagram.tsx    the to-scale coloured sheet
       │  ├─ AppShell.tsx        header, tab bar, banners
       │  └─ SyncBadge.tsx       the four sync states
       └─ pages/
          ├─ Login.tsx           Screen 1
          ├─ Home.tsx            Screen 2
          ├─ NewJob.tsx          Screen 3
          ├─ Plan.tsx            Screens 4 and 5
          ├─ Stock.tsx           Screen 6
          ├─ LeftoverDetail.tsx  Screen 6b
          ├─ AddLeftover.tsx     Screen 6c
          ├─ SyncCheck.tsx       Screen 7
          ├─ Settings.tsx        Screen 8
          └─ JobDetail.tsx       Screen 2b

### 15.3 State ownership

::: tablewrap
  Store        Owns                                      Persisted
  ------------ ----------------------------------------- ---------------------------------
  `auth`       Login status, shop id, email              By Firebase, on the device
  `data`       All records, derived stock, sync status   By Firestore\'s on-device cache
  `job`        Pieces being entered, the current plan    Pieces only, in local storage
  `settings`   Sheet size, blade, minimum leftover       Local storage and Firestore
  `toast`      Transient confirmations                   Not persisted
:::

## [Section 16]{.sec-no}Build plan, step 0 to launch {#s16}

Eleven stages. Each ends with something demonstrable, so progress is
visible to the owner rather than only to the developer.

### Stage 0 --- Tools on the machine

-   Install Node.js 20 or later, VS Code and Git.
-   Install the Firebase CLI: `npm install -g firebase-tools`, then
    `firebase login`.
-   Confirm with `node -v` and `firebase --version`.

**Done when:** both commands print a version.

### Stage 1 --- Firebase project

1.  At
    [console.firebase.google.com](https://console.firebase.google.com),
    create a project. Analytics is not needed.
2.  **Build → Authentication → Get started → Email/Password → Enable.**
3.  **Build → Firestore Database → Create database → Production mode.**
    Choose the region closest to the workshop.
4.  **Project settings → Your apps → Web (\</\>)**. Register the app and
    copy the configuration values.

**Done when:** six configuration values are in hand and pasted into
`.env`.

### Stage 2 --- Project skeleton

-   Create the Vite React TypeScript project; add Tailwind, shadcn/ui,
    Zustand, Firebase, React Router and `vite-plugin-pwa`.
-   Apply the colour tokens from §11.1 to `index.css` and
    `tailwind.config.js`.
-   Add the four UI primitives: button, input, label, switch.

**Done when:** `npm run dev` serves a styled blank page in both light
and dark mode.

### Stage 3 --- The engine, before any screens

-   Write `types.ts`, `inches.ts`, `id.ts`, `packer.ts`, `stock.ts`.
-   Write the tests in §17.2 *as the engine is written*, not afterwards.

**Done when:** `npm test` passes, including the owner\'s 23 × 77 and 19
× 22 scenarios. Building the engine first means the risky part is proven
before a single pixel is designed.

### Stage 4 --- Login and shell

-   `firebase.ts` with on-device persistence enabled, `auth` store,
    Screen 1, the tab bar and protected routes.

**Done when:** an account can be created, the session survives a reload,
and every Firebase error appears as a plain sentence.

### Stage 5 --- Records and derived stock

-   `db.ts` writers, the `data` store with live listeners, and sync
    status tracking.
-   Publish the security rules:
    `firebase deploy --only firestore:rules`.

**Done when:** a record written on one device appears on another, and an
attempt to edit a record is refused by the rules.

### Stage 6 --- Job entry and the diagram

-   Screen 3 with validation, the quantity stepper and the draft saved
    locally.
-   `SheetDiagram.tsx`, drawn to scale with the four block types and the
    small-block lettered dot.

**Done when:** the owner\'s example renders exactly as shown in §9.5.

### Stage 7 --- Plan and confirm

-   Screens 4 and 5, multi-sheet tabs, unplaceable pieces, \"Pick a
    different leftover\", and the confirm write.

**Done when:** Journeys B and C in §10 can be completed end to end.

### Stage 8 --- Stock, history and settings

-   Screens 6, 6b, 6c, 8, and the job detail screen. Discard and
    manual-add records.

**Done when:** Journeys A, F and G can be completed.

### Stage 9 --- Conflicts

-   Screen 7, the Home banner, resolution records and the two answers.
-   Test with two browser profiles, both put offline through developer
    tools.

**Done when:** Journey E completes and stock ends correct on both
devices.

### Stage 10 --- PWA and polish

-   Manifest, icons at 192, 512 and maskable, service worker, offline
    verification in airplane mode.
-   Accessibility pass: focus rings, contrast, tap targets, reduced
    motion.

**Done when:** the app installs to a home screen and opens fully
offline.

### Stage 11 --- Launch

-   `npm run build`, then `firebase deploy`.
-   Install on the owner\'s phone together with him. Enter his real
    existing offcuts as the first task.
-   Watch him use it for one real job without helping. Note every
    hesitation; hesitations are design bugs.

**Done when:** he completes a real job unaided.

## [Section 17]{.sec-no}Test plan {#s17}

### 17.1 Strategy

The cutting engine is tested exhaustively and automatically, because a
wrong plan wastes material. The interface is tested manually against the
journeys in Section 10, because it is small and its correctness is a
matter of judgement.

### 17.2 Automated engine tests

::: tablewrap
  ID     Test                                                      Expected
  ------ --------------------------------------------------------- -----------------------------------------------------------------------------------------
  T-01   Parse 22, 22.5, 22 1/2, 22-1/2\", 3/8, 22 in              22, 22.5, 22.5, 22.5, 0.375, 22
  T-02   Parse \"abc\", \"0\", \"\"                                Rejected
  T-03   Display 22.5, 0.125, 19                                   22 1/2, 1/8, 19
  T-04   23 × 77 × 2 on an empty sheet                             Placements at (0,0) and (23,0); leftovers 48 × 19 and 2 × 77; 77% used; three cut steps
  T-05   19 × 22 against the leftovers from T-04                   Uses leftover A, turned, remainder A2 = 26 × 19, no new sheet
  T-06   20 × 60 on an empty sheet                                 Not turned
  T-07   60 × 20 on an empty sheet                                 Turned to 20 × 60
  T-08   100 × 100                                                 Reported unplaceable, no sheet opened
  T-09   48 × 96 × 2                                               Two sheets
  T-10   23 × 40 × 2 with kerf 1/8                                 Second piece starts at x = 23.125
  T-11   47.5 × 95 with minimum leftover 1                         0.5 in strip discarded, 1 in strip kept
  T-12   Small piece with a large and a small leftover available   The smaller leftover is chosen
  T-13   Two records claiming the same leftover                    Later record flagged; its leftovers absent from stock
  T-14   Conflict answered \"voided\"                              Conflict clears; leftovers still absent
  T-15   Conflict answered \"kept\"                                Conflict clears; leftovers enter stock
  T-16   Record not yet synced                                     Counted in stock immediately
  T-17   Discard record                                            Leftover leaves stock
  T-18   Same records in a different order                         Identical derived stock
:::

The starter already covers T-01 to T-17 in 14 test cases in
`packer.test.ts` (some cases combine two rows, for example T-14 and
T-15). T-18, order independence, is added in Stage 3. All run with
`npm test`, and the build does not ship unless they pass.

### 17.3 Manual test script

1.  Install to the home screen; confirm the icon, name and full-screen
    launch.
2.  Airplane mode; confirm the app opens and a plan can be made and
    confirmed.
3.  Create an account; confirm a wrong password gives a plain-language
    message.
4.  Run Journey B; confirm the diagram matches §9.5 exactly.
5.  Close the app mid-entry; reopen; confirm typed pieces survive.
6.  Run Journey C after changing the device date forward four days.
7.  Reject a suggested leftover; confirm it stays in stock.
8.  Two profiles, both offline, both cut the same leftover; confirm
    Journey E.
9.  Discard a leftover; confirm it leaves stock and history is
    unchanged.
10. Change sheet size; confirm old jobs still render at their original
    size.
11. Turn on blade thickness; confirm placements shift by 1/8 in.
12. View every screen at 320 px and at 430 px; confirm no horizontal
    scrolling.
13. Switch the phone to dark mode; confirm every screen is readable.
14. Navigate the whole app with a keyboard; confirm visible focus
    throughout.
15. Deploy an update; confirm installed devices update on next open
    without reinstalling.

### 17.4 Acceptance by the owner

The product is accepted when the workshop owner, without assistance,
completes a real cutting job from opening the app to confirming the cut,
and when a leftover created that day is successfully proposed and used
by the app in a later job.

## [Section 18]{.sec-no}Deployment and handover {#s18}

### 18.1 Deployment

    npm test          # all engine tests must pass
    npm run build     # produces dist/
    firebase deploy   # hosting + firestore rules

The app is served from a Firebase Hosting URL over HTTPS. A custom
domain can be attached later without changing any code.

### 18.2 Cache strategy

::: tablewrap
  Asset          Cache-Control         Why
  -------------- --------------------- ----------------------------------------------
  `index.html`   no-cache              So a new version is noticed on every open
  `sw.js`        no-cache              So the service worker itself can be replaced
  `/assets/*`    one year, immutable   Content-hashed filenames make this safe
:::

### 18.3 Installing on the owner\'s phone

1.  Open the hosting link in Chrome.
2.  Menu → **Add to Home Screen** → Install.
3.  Open from the new icon and log in once, with internet.
4.  Enter the existing offcuts by hand as the first real task.

### 18.4 Backup

Firestore holds the authoritative copy. Enable daily automated backups
in the Firebase console, or export manually with
`gcloud firestore export`. Because history is append-only, a restore can
never lose an intermediate state.

### 18.5 Handover to the owner

-   The link, the shop email and the password, written down and kept
    somewhere safe.
-   One sentence to remember: *tap Confirm cut only after the board is
    actually cut.*
-   One sentence for trouble: *if a leftover is not really there, open
    it in Stock and mark it thrown away.*

## [Section 19]{.sec-no}Out of scope and future work {#s19}

### 19.1 Deliberately excluded from version 1.0

::: tablewrap
  Excluded                           Reason
  ---------------------------------- --------------------------------------------------------------------------------------------------------
  Several materials or thicknesses   The workshop uses one. Adding a material field to every screen would cost clarity for no benefit today
  Grain direction                    Not relevant to the current material. Would forbid rotation and reduce reuse
  Edge banding and trim allowance    Handled by the carpenter\'s own habit; encoding it would add a setting he would have to understand
  Costing and invoicing              A different product. The free-area figure already shows the value recovered
  Customer or order tracking         Out of the problem being solved
  Printing and PDF export            The phone goes to the saw; paper does not
  Multiple user roles                Two people, one shop, full trust
  Play Store release                 The PWA covers every need; an APK can be produced later from the same code
:::

### 19.2 Likely version 2 candidates, in order of value

1.  **Material types.** A material field on sheets and leftovers, with
    stock filtered to the matching material. The single largest change
    if the workshop starts using two boards.
2.  **Photo of a leftover.** Attach a picture when adding by hand, so
    the physical board is identified at a glance.
3.  **Stock search by size.** \"What can hold 19 × 22?\" without
    creating a job.
4.  **Urdu labels.** A language toggle, with the same short sentences
    translated.
5.  **Cut-list import.** Paste a list of sizes from a message instead of
    typing them one by one.
6.  **Waste report.** Monthly summary of sheets opened, area reused and
    material saved.
7.  **Capacitor APK.** Same code, wrapped, if a store presence is ever
    wanted.

### 19.3 Known limitations, stated honestly

-   The app assumes the carpenter cuts exactly what the plan shows. If
    he deviates, stock drifts from reality until he corrects it by
    discarding or adding by hand. This is why both controls exist and
    are easy to reach.
-   Guillotine cutting is not the mathematically densest packing
    possible. It is the densest packing that can actually be cut on a
    panel saw, which is the only kind that matters here.
-   A lost phone keeps a cached copy of the shop\'s data until it is
    signed out or wiped.
-   Conflicts require a human decision. No design can decide for the
    user which board was physically cut.

## [Section 20]{.sec-no}Acceptance checklist {#s20}

The project is complete when every line below is true. This is the
document to sign off against.

### 20.1 Authentication

-   A shop account can be created and logged into
-   The session survives restarts and weeks offline
-   Every error appears as a plain sentence, never a code
-   Two devices on one account see the same stock

### 20.2 Core cutting

-   Sizes accept whole numbers, decimals and fractions, and are
    displayed as fractions
-   A plan is produced for any valid job
-   Saved leftovers are always checked before a new sheet is opened
-   The smallest fitting leftover is chosen
-   A piece is turned only when it does not fit unturned, and is marked
    when turned
-   Blade thickness applies only when the toggle is on
-   Remainders below the minimum become waste; everything else is saved
-   The 23 × 77 × 2 example produces exactly the documented result
-   The 19 × 22 reuse example uses leftover A and opens no new sheet

### 20.3 The diagram

-   Drawn to scale, with cut pieces, new leftovers, other free leftovers
    and earlier cuts all distinguishable
-   Every block is labelled with its size or letter; colour alone never
    carries meaning
-   Sheet usage percentage is shown and correct
-   Cut instructions are numbered, directional and measured
-   Readable on a 320 px screen without zooming, in light and dark mode

### 20.4 Stock and history

-   Nothing changes in stock until Confirm cut is tapped
-   Confirming saves the new leftovers and consumes the used one
-   Stock lists every free leftover, largest first, with size, letter
    and origin
-   A leftover can be opened, located on its parent sheet, used, or
    discarded
-   Leftovers can be added by hand for boards already in the workshop
-   History is complete and cannot be edited or deleted

### 20.5 Offline and sync

-   The app opens and works fully with no internet after the first login
-   Confirming a cut offline never blocks and never loses the record
-   Records sync automatically when internet returns, with no user
    action
-   Sync status is always visible and truthful
-   A same-leftover clash is detected, explained in one sentence, and
    fixed in one tap
-   An unanswered conflict never contributes to stock
-   Ordering uses server time, so a wrong phone clock changes nothing

### 20.6 Platform and quality

-   Installs to the home screen with its own icon and opens full screen
-   Updates itself on next open with no reinstall
-   All eighteen engine tests pass
-   All fifteen manual tests pass
-   Security rules deployed; history is immutable at the database level
-   Tap targets at least 44 px; contrast meets AA; focus is visible;
    reduced motion respected

### 20.7 The real test

-   The workshop owner completes a real job unaided, from opening the
    app to confirming the cut
-   A leftover saved on one day is successfully proposed and used by the
    app on a later day

------------------------------------------------------------------------

End of specification. Version 1.0 · 20 September 2026 · Offcut.
:::
