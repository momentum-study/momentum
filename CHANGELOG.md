# Changelog

All notable changes to Momentum are documented here. Each entry corresponds to a git tag (`v*`) pushed to the canonical `org` remote before deployment.

## [v0.22.4] — 2026-08-28

### UX Improvements
- Compact weekly plan blocks are now draggable for reordering within each column.
- Reordering persists the new block order to the database.

---

## [v0.22.3] — 2026-08-28
### Quick Fixes
- Fixed the paused timer UI to show Resume / Save / Discard instead of Start. isTimerActive now correctly recognises a paused timer with retained progress, so the user is no longer trapped into clicking Start (which would zero the accumulator).

---

## [v0.22.2] — 2026-08-28

### Quick Fixes
- Fixed timer bug where pausing the timer would persist the wrong elapsed time (stale state closure), leading to progress loss on reload.
- Fixed timer bug where accumulated progress during a pause was not saved as a pending session.

---

## [v0.22.1] — 2026-08-28

### Quick Fixes
- ErrorBoundary now catches "Minified React error #185" (Maximum update depth exceeded) and triggers a hard reload to recover from stale service worker caches (§10.31).

---


## [v0.22.0] — 2026-08-28

### UX Improvements
- Dashboard "This Week" card relabeled "Last 7 Days" with explicit date range.
- Dashboard "Customize" hamburger replaced with a labeled button using a layout-grid icon.
- Calendar/Tasks month navigation buttons moved inline next to the month label.
- AI Review action buttons (Copy / Open in ChatGPT / Share) moved into a sticky bottom bar.
- All `<input type="checkbox">` instances replaced with a shared dark-mode-aware `Checkbox` component.
- Routine/Activity row reorder controls restyled to horizontal chevron icon buttons.
- Timer no longer auto-selects any-subject routines — the dropdown lists them but defaults to "No routine" so the user opts in.
- User-facing semantic versioning established; Settings displays `vMAJOR.MINOR.PATCH`.

---
## [v0.21.0] — 2026-08-17

### Quick Fixes
- Removed "(+Xm over)" goal-exceeded text from Today card.
- Fixed habit "2 today" bug (deduplication of optimistic local additions with persisted logs).
- Improved habit tick/untick UX: bad habits show red ✗ when lapsed, good habits show green ✓ when done; clear text labels for both states.
- Recent sessions on dashboard now show 3 items by default with a "Show all" modal.
- Routine vs activity catch-up prompts: activities-only (routines no longer ask "did you complete it today?").
- Activity auto-log now falls back to the `duration` field when `dayMinutes[dow]` is 0.
- Habit archiving replaced with manual "Mark as done" flow (user decides, not automatic at N days).

### Rules & Data
- Streak info moved to ⓘ button next to streak number (hover for explanation).
- Streak freeze rule: 5 consecutive logged days earn 1 missed-day freeze (automatic consumption). Replaces the old "1 missed day per chain" rule.
- Categories merged into Focus Areas page: `/categories` route redirects to `/subjects`; categories are managed inline via a "Manage Categories" button/modal on the Subjects page.
- "Any subject" mode for projects and routines: select "Any subject" to accumulate time from all subjects.
- Marks page now supports multi-select checkboxes and a "Compare" modal with weighted average calculation.
- Right-click context menus added to Subject cards (View/Edit/Delete) and Habit cards (Mark as Done/Pause/Edit/Reset/Delete).

### Infrastructure
- This CHANGELOG created.
- `npm run release` script added: tags the current version, pushes to `org`, and deploys.

---

## How to Rollback

To rollback to a previous version:
```bash
# List available tags
git tag -l 'v*'

# Check out the desired version
git checkout v0.20.0

# Deploy it
npm run deploy
```
