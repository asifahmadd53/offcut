# Manual layout check (Part 3 responsive/redesign pass)

This is a **manual, human-run** checklist. It exists because this environment's
headless browser tooling cannot submit Offcut's login form, so no authenticated
screen (Home, Plan, Stock, Settings, etc.) could be reached or screenshotted by
the agent that did this work. Only the Login screen (unauthenticated, always
reachable) was verified live — see CLAUDE.md C13/C14 and the task report for
exactly what that covered. Everything below must be checked by a person, in a
real browser, before this pass is considered visually verified.

## Setup
1. `npm run dev`, log in with a real shop account (or register one).
2. Open devtools, set "no throttling", and use the responsive device toolbar to
   hit these widths: 320, 375, 390, 768, 820, 1024, 1280, 1366, 1920.
3. Repeat the whole pass once with OS/browser set to light, once to dark
   (Offcut uses `prefers-color-scheme`, not a manual toggle).

## Navigation tiers (the core bug fix)
- [ ] Under 768px: a rounded, inset "floating" tab bar (Home/Stock/Settings) sits
      near the bottom of the screen, with visible spacing from the screen edges,
      and clears the home-indicator area on a phone with a notch/gesture bar.
- [ ] 768–1023px: the bottom tab bar is gone; a slim ~72px icon rail is pinned to
      the left edge, full height, with the three nav icons.
- [ ] 1024px and up: the icon rail is replaced by a full ~240px sidebar with the
      Offcut wordmark, a "New cutting job" button, the three nav items, and at
      the bottom a sync badge / shop email / "Log out".
- [ ] At every width from 320 to 2560px, resize the window slowly through the
      breakpoints — nav should switch tiers with no flash of both, no missing
      nav, no layout jump other than the intended tier swap.
- [ ] On a non-top-level screen (New job, Plan, Job detail, Leftover detail,
      Sync check) at 1024px+: the sidebar is still visible AND the page header
      still shows its own back button. Confirm the sidebar highlights the right
      parent item (New job/Plan → Home; Stock/:id, Stock/add → Stock).
- [ ] Trigger a sync conflict (or inspect with conflicts present) and confirm a
      badge appears on the sidebar/rail's Home item, not a separate nav slot.

## No horizontal scroll
- [ ] At 320px and at 2560px, `document.documentElement.scrollWidth <=
      document.documentElement.clientWidth` on every screen in the app (paste
      that expression into the console on each page).

## Primary action reachability
- [ ] On the Plan screen at 1366×768, the Confirm-cut button is reachable
      without scrolling the outer page (only the diagram/side-panel regions
      should scroll internally, not the whole app).
- [ ] On Settings at a short window height (e.g. 1366×480), the floating Save
      bar stays reachable and the sidebar/nav stays visible and usable.

## Short windows
- [ ] Resize the browser window to under 500px tall on a laptop-width viewport.
      Nav stays visible and compact; the primary action on the current screen
      stays reachable without the whole page needing to scroll past it.

## Visual system spot-check
- [ ] Login screen: borderless full-bleed under `sm` (640px), a centred white/
      dark card with border + soft shadow at `sm` and up — this one was also
      checked live by the agent (see report) but re-confirm by eye.
- [ ] Focus a button/input with keyboard (Tab) — a visible 2px ring in the
      brand color with a small offset appears on every interactive element.
- [ ] Confirm dark mode uses the same warm/brand hue family as light mode, not
      a generic dark grey theme.

## Known incomplete (see report / CLAUDE.md C13)
Only `AppShell.tsx`, `Login.tsx`, and the global token/build files were
restyled in this session. Home, New job, Plan, Stock, Leftover detail, Add
leftover, Job detail, Sync check, Settings, Print, and Cut-saved still use
their pre-Part-3 visual styling and have **not** been given the two-column
laptop layouts described in the full spec's section D. When that work is
picked up, re-run this whole checklist against each of those screens too.
