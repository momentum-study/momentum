# Changelog

All notable changes to Momentum are documented here. Each entry corresponds to a git tag (`v*`) pushed to the canonical `org` remote before deployment.

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
