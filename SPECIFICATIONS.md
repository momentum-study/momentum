# Momentum — Specifications & Agent Bootstrap

> This file is the **single source of truth** for the Momentum study app. It is written so that a fresh OMP instance that reads it ("read specs for momentum") is fully equipped to work on the codebase without re-deriving the architecture. It is **self-updating**: every instance that makes a durable change MUST update this file (see §Maintenance Protocol) so the knowledge compounds instead of going stale.

---

## 0. Bootstrap — read this first

If you are a new instance about to work on Momentum, do these in order:

1. **Read this whole file.** It is the ground truth for architecture, conventions, and known pitfalls.
2. **Read `momentum/README.md`** for the user-facing overview and deployment flow.
3. **Read `momentum/.bugfix-plan.md`** — a live enumeration of known bugs (CRITICAL/HIGH/MEDIUM/LOW) with fix sketches. If a bug you are asked to fix is listed there, follow its sketch and mark it done when closed.
4. **Read `momentum/src/domain/types.ts`** — the canonical domain model. When in doubt about a field, this file wins.
5. **Read `momentum/src/db/app-db.ts`** — the Dexie schema (16 versions). Never add a table or index without bumping the version and adding an `.upgrade()` if data migration is needed.
6. **Read `momentum/src/lib/settings-store.ts`** — the settings shape and defaults. This is the ONLY place settings defaults live; do not duplicate them in SettingsPage.
7. **Read `momentum/src/app/router.tsx`** — the real route table (the §Routes table below is derived from it).
8. **Read `momentum/src/app/providers.tsx`** — the data provider contract (`useData()`).
9. **Read `momentum/src/lib/shortcuts.ts`** — the shortcut registry. The registry is canonical; the keydown handler in `AppLayout.tsx` dispatches from it.
10. **Read `momentum/src/lib/use-dashboard-widgets.ts`** — the dashboard widget layout system (grid mode only; freeform removed in 72e50ec, pending re-implementation).

**Grounding rule:** the code is the source of truth. If this file and the code disagree, the code wins — and you MUST update this file to match (see §Maintenance Protocol). Never trust a stale spec over the actual implementation.

### 0.1 "Read specs for momentum" — response protocol

When a user says "read specs" (or "read specs for momentum") to a new instance, the instance MUST:
1. Read this file (`momentum/SPECIFICATIONS.md`) in full.
2. Also read `momentum/README.md` and `momentum/.bugfix-plan.md` (the two companion docs).
3. Reply with a **short confirmation message** — for example:

   > "Spec read. Momentum — local-first React/TypeScript PWA, 19 routes, Dexie/IndexedDB, deployed at momentum-study.github.io/momentum/. SPEC_VERSION 7 (2026-08-15). All bugfix-plan items closed. No open bugs. What do you want to work on?"

   The message should include: app description, current SPEC_VERSION, key facts the user is likely to care about right now (deployment status, open bugs, live URL), and an offer to proceed.
4. **Do NOT** start any work, edit any file, or run any commands. Just confirm load and wait for the user's instruction.
5. **Do NOT** summarise the entire spec. The user knows what's in it; they triggered the read to bootstrap the instance, not to receive a recap.
6. **Do NOT** do a full audit or "check for bugs" unprompted. Stay idle until the user asks for something specific.

If the user follows up with a feature request, fix request, or question, then proceed normally using the spec as ground truth.

**Verification commands** (run from `momentum/`):
```bash
npx tsc --noEmit      # type-check (MUST pass before any deploy)
npx vitest run        # unit tests
npm run build         # production build
npm run dev           # dev server on :5173
```

### 0.2 Workflow — read first, plan before doing

When you receive a bug report, fix request, or feature ticket with a medium-to-large list of things to do:
1. **Read the code comprehensively.** Understand the relevant code paths before writing anything.
2. **Make a plan.** Break the work into logical steps and order them correctly (e.g., data-layer changes before UI, migrations before the code that uses them).
3. **Execute in plan order.** Don't start work until you understand it.
4. **Verify, then deploy.** After the work passes type-check (`npx tsc --noEmit`), tests (`npx vitest run`), and the production build (`npm run build`), push to `org/main` and deploy live with `npm run deploy`. **Deploying is the default final step of every change** — do not leave verified work unshipped.

For small, self-contained tasks (a single fix, a quick feature), you can skip formal planning — just read what's needed and do it.

**Why this matters:** Jumping into code without understanding it leads to missed edge cases, wrong abstractions, and bugs that could have been caught with upfront analysis. And a verified change that is never deployed helps nobody — the live site is the deliverable.


---

## 1. Architecture

- **Local-first PWA** — all data in IndexedDB via Dexie. No server, no accounts.
- **Stack**: React 18, TypeScript, Vite, Tailwind CSS (class-based dark mode), Dexie, React Router (hash-based), date-fns, vite-plugin-pwa.
- **Hash routing**: URLs are `/#/subjects` etc. so the app works on static hosts (GitHub Pages) without server config.
- **Dark mode**: On by default. Class `dark` on `<html>`, toggled by Settings. Applied in `App.tsx` via `applyDarkMode(loadSettings().darkMode)`.
- **Provider hierarchy** (from `router.tsx`):
  ```
  AuthProvider > UndoProvider > DataProvider > AppLayout > RouterContent
  ```
- **Data provider**: `useData()` returns `{ data, isLoading, scope, rangePreset, setScope, setRangePreset, loadData, mutate }`.
  - `data` is an `AppData` object (all tables as arrays).
  - `mutate(updater)` applies an in-memory change without re-reading IndexedDB — use after a Dexie write to keep the UI in sync cheaply.
  - Selector hooks: `useDataSelector`, `useSubjects`, `useSessions`, `useAssignments`, etc.
- **Sync**: `data-sync.ts` (`pullAllData` for cloud→local on mount, `loadData` with 80ms debounce for local refresh), `sync-service.ts`, `sync-status.ts`, `settings-sync.ts`, `cloud-backup.ts`, `backup.ts`. Firestore rules in `firestore.rules`. Group presence via `use-group-presence.ts` / `use-all-groups-presence.ts`.

---

## 2. App Name

**Momentum** — branded in the sidebar and `<title>`. The user-facing semantic version is the `VERSION` constant in `src/lib/version.ts`, sourced from `package.json` at build time. Settings displays only `vMAJOR.MINOR.PATCH`; the internal build id remains available only for stale-service-worker protection.

---

## 3. Routes (actual, from `router.tsx`)

| Path | Page | Notes |
|------|------|-------|
| `/` | Dashboard | |
| `/subjects` | SubjectsPage | Nav label "Focus Areas" |
| `/subjects/:id` | SubjectDetailPage | Detail view: stats, trend, heatmap, sessions, projects, children |
| `/projects` | ProjectsPage | |
| `/projects/:id` | ProjectDetailPage | |
| `/marks` | MarksPage | Hidden from nav by default |
| `/habits` | HabitsPage | |
| `/calendar` | CalendarPage | Nav label "Tasks" |
| `/categories` | CategoriesPage | Hidden from nav by default |
| `/reports` | ReportsPage | |
| `/reviews` | AIReviewPage | Nav label "AI Review" |
| `/study` | StudyPage | |
| `/study/review` | ReviewSessionPage | |
| `/study/log` | ReviewLogPage | |
| `/study/exam` | ExamConfigPage | |
| `/schedule` | SchedulePage | Absorbs routines + activities |
| `/routines` | → redirect to `/schedule` | Legacy alias |
| `/activities` | → redirect to `/schedule` | Legacy alias |
| `/groups` | GroupsPage | Hidden from nav by default |
| `/groups/:id` | GroupDetailPage | |
| `/settings` | SettingsPage | |
| `*` | 404 page | |

**Nav items** (from `AppLayout.tsx` `NAV_ITEMS`): Dashboard, Focus Areas, Projects, Tasks, Study, Reports, Habits, Schedule, Marks, Groups, Categories, AI Review, Settings. Order/visibility persisted in `momentum-nav-prefs` (version key `momentum-nav-prefs-version`, `CURRENT_PREFS_VERSION = 4`). Default hidden: marks, groups, categories, reviews.

> **Stale-spec warning:** older specs listed `/routines` and `/hobbies` as separate pages. They are gone — routines and activities both live under `/schedule`, and there is no `/hobbies` route. Do not reintroduce them.

---

## 4. Data Model

### 4.1 Domain types (`src/domain/types.ts`)

Canonical. Key entities:

- **Category**: `id, name, scope ('academic'|'nonAcademic'), color, createdAt, updatedAt, deletedAt?`
- **Subject**: `id, categoryId, name, color, parentSubjectId (null = top-level), routine?, weeklyTargetMinutes?, createdAt, updatedAt, deletedAt?`
  - **Subject hierarchy exists**: `parentSubjectId`, `getChildSubjects`, `getTopLevelSubject`, `getSubjectPathLabel`, `getSubjectPickerOptions` in `utils.ts`.
- **Project**: `id, subjectId, name, description?, goalMinutes?, completed?, createdAt, updatedAt, deletedAt?`
- **Session**: `id, subjectId, projectId?, assignmentId?, startAt, endAt, durationMinutes, durationSeconds?, note?, focusTag?, source, routineId?, createdAt, updatedAt, deletedAt?`
  - `focusTag` is a strict union `'focused' | 'distracted' | 'group' | 'revision' | undefined`. **Never widen it to `string`** in form state or save handlers.
  - `source` values include `'manual'`, `'autoRoutine'`, timer sources, etc.
- **Mark**: `id, subjectId, name, score, total, weight, date, letterGrade?`
- **Assignment** (the "task"): `id, subjectId, projectId?, title, dueDate, type (TaskCategory), completed, category?`
  - `TaskCategory = 'homework' | 'assignments' | 'miscellaneous'`; `TASK_CATEGORIES` array in types.ts.
- **Habit**: `id, name, kind ('good'|'bad'), mode ('count'|'tick'), color, status? ('active'|'potential'), targetPerDay?, archivedAt?, finishedAt?, archivedAfterDays?, createdAt, updatedAt, deletedAt?`
  - **States**: active, potential (`status`), finished (`finishedAt` — graduated, distinct from archive), archived (`archivedAt`).
- **HabitLog**: `id, habitId, date (YYYY-MM-DD), time?, note?, value?, focusTag?, createdAt, updatedAt, deletedAt?`
- **StreakDay**: `id (YYYY-MM-DD), totalMinutes, goalMet`
- **Routine**: `id, name, subjectId, projectId?, dayMinutes (Partial<Record<DayOfWeek, number>>), color, notes?, scheduledTime?, createdAt, updatedAt, deletedAt?`
  - `dayMinutes` replaced the old `days` + `targetMinutes` (migrated in DB v14). **Do not reintroduce `days`/`targetMinutes`.**
- **RoutineLog**: `id, routineId, date, actualMinutes, completed, createdAt`
- **Activity**: `id, name, subjectId (nullable), dayMinutes, duration?, createsSession?, scheduledTime?, notes?, color, createdAt, updatedAt, deletedAt?`
- **ActivityLog**: `id, activityId, date, status ('completed'|'skipped'|'pending'), actualMinutes?, createdAt, sessionId?`
  - `sessionId` is set when an attendance confirmation creates a Session; untick reads it (do NOT re-derive from `createdAt`).
- **StudyArea / StudyReview**: FSRS spaced repetition. `ReviewRating = 1|2|3|4` (again, hard, good, easy). `fsrs-scheduler.ts`.
- **PendingSyncOp**: offline sync queue.

### 4.2 Dexie schema (`src/db/app-db.ts`)

DB name `study-app`. **16 versions** (v1→v16). Current tables: `categories, subjects, projects, sessions, progressLogs, marks, assignments, habits, habitLogs, streakDays, routines, routineLogs, activities, activityLogs, studyAreas, studyReviews, pendingSyncOps`. (Note: `tasks` and `hobbies`/`hobbySessions`/`scheduleEntries` tables were created in early versions but are orphaned/legacy — do not use them.)

**Rule:** any new table or index MUST bump the Dexie version and add an `.upgrade()` if existing rows need migration. Never reuse an old version number.

### 4.3 Soft deletes

All entities have optional `deletedAt`. **Session deletion MUST use soft-delete** (`db.sessions.update(id, { deletedAt: isoNow(), updatedAt: isoNow() })`), never hard delete. Undo clears `deletedAt` to `null`. Automatic sessions with `source === 'autoRoutine'` use `deletedAt` as a "pending confirmation" flag.

**All UI filters MUST exclude soft-deleted rows.** Two helpers:
- `isActiveSession(s)` in `src/lib/utils.ts` — `return !s.deletedAt`.
- `filterActive(arr)` in `src/lib/filterActive.ts` — generic `arr.filter(x => !x.deletedAt)`.

Use these; do not hand-roll `!s.deletedAt` everywhere (though inline is acceptable when the helper doesn't fit). **Missed soft-delete filters are the #1 recurring bug** (see §Pitfalls).

### 4.4 Session save helpers (`src/lib/save-study-session.ts`)

- `saveStudySession(input)` — builds + persists a Session, then calls `updateRoutineLogsForSession` and `updateStreakDayForSession`. Deterministic id via `sessionIdFor(startAt, subjectId, durationMinutes)`.
- `findOverlappingSessions(sessions, startAt, endAt, subjectId, excludeId?)` — overlap detection.
- `buildTodaySubjectBreakdown(sessions, subjects, todayStr, liveSubjectId?, liveMinutes?)` — per-subject today totals, optionally including the live in-flight session.

### 4.5 Routine + streak tracking (`src/lib/routine-tracker.ts`)

- `updateRoutineLogsForSession(session)` — auto-matches routines for the session's day+subject+project. **Only tags `routineId` when `session.source === 'autoRoutine'`** (H1). Explicit `session.routineId` is always logged toward.
- `revertRoutineLogsForSession(session)` — subtract on delete.
- `updateStreakDayForSession(session)` / `revertStreakDayForSession(session)` — recompute the StreakDay for the session's date from academic minutes vs `dailyTargetMinutes`.
- `recomputeStreakDaysForDates(dateKeys)` — bulk recompute after cascade soft-deletes.

---

## 5. Settings (`src/lib/settings-store.ts`)

localStorage key: `momentum-settings`. **This file is the single source of truth for the settings shape and defaults.** Do NOT duplicate defaults in SettingsPage (L1 bug).

```typescript
type Settings = {
  darkMode: boolean                    // default: true
  pomodoroEnabled: boolean             // default: true
  autoLogEnabled: boolean              // default: true
  pomodoroFocusMinutes: number         // default: 25
  pomodoroBreakMinutes: number         // default: 5
  pomodoroLongBreakMinutes: number     // default: 15
  pomodoroCyclesBeforeLongBreak: number// default: 4
  dailyTargetMinutes: number           // default: 120
  soundEnabled: boolean                // default: true
  maxActiveHabits: number              // default: 3
  defaultArchiveDays: number           // default: 66
  weekStartsOn: 0 | 1                  // default: 1 (Mon); 0 = Sun
  dashboardWeekMode: 'rolling' | 'calendar' // default: 'rolling'; rolling = last 7 days, calendar = current week aligned to weekStartsOn
  settingsUpdatedAt: string            // ISO, set on save
  devMode?: boolean                    // optional preview banner
}
```

`loadSettings()` merges stored over `DEFAULT_SETTINGS`; falls back to OS dark preference. `saveSettings()` stamps `settingsUpdatedAt`. `applyDarkMode(enabled)` toggles the `dark` class.

---

## 6. Features

### 6.1 Dashboard (`src/features/dashboard/Dashboard.tsx`)
- Stat cards (Today, This Week, Total, Sessions) — all filtered to `!deletedAt`. The Today card also shows a **last-session line** below the goal text via `formatLastSessionText()`: `Last session {Xh/Xm} ago` when recent, `No sessions yet today — last was {yesterday/Xd} ago` when ≥1 day but <7 days since the last session, a gentle re-engagement message (no specific duration) when the gap is ≥7 days, and `No sessions yet — log your first one!` when no sessions exist. Long gaps collapse to the gentle message to avoid discouraging the user.
- Study streak with weekly fire view. **Best streak** persisted in localStorage `momentum-best-streak`; display = max(computed longest, persisted record).
- Daily goal progress bar (default 120 min), green on completion.
- Study timer widget (see §6.8).
- 90-day heatmap, 5 intensity levels (slate → green-600).
- Recent sessions (all non-deleted sessions) with subject + duration + optional `focusTag` badge. **Multi-select checkboxes hidden by default; only shown after clicking "Select Sessions".**
- Achievements: dismissible celebratory card.
- **Widget position persistence**: toggling a widget off/on MUST restore its original position, not append to the end.
- **Widget layout system**: `use-dashboard-widgets.ts` is grid-mode only (freeform removed in `72e50ec`; pending fresh re-implementation). **Three-column grid** (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`); each widget occupies one column (no per-widget width/row controls — width button removed). Widgets fall upward into the shortest column. Cross-column drag via per-column `SortableContext` + `ColumnFloor` drop targets + `GhostWidget` placeholder. Storage key `momentum-dashboard-layout` may still hold stale freeform `Box` records in user browsers — these are ignored by the grid code and safe to clear via DevTools. Widgets registered via `widget-registry.ts` (`registerWidget`, `window.Momentum.registerWidget`).

### 6.2 Subjects (CRUD) — `src/features/subjects/SubjectsPage.tsx` + `SubjectDetailPage.tsx`
**List page** (`/subjects`): compact clickable cards (color dot, name, category, routine days, Today/Week/Total minutes, sub-count). Clicking a card navigates to `/subjects/:id`. Children render as compact dashed rows (not full cards). Add/Edit modal: name, category select (with "+ New" link to /categories), ColorPicker, routine checkboxes, weekly target. Warning banner if no categories. Delete with confirmation. Case-insensitive search. **Supports subject hierarchy** (parent/child).

- **Detail page** (`/subjects/:id`): rich analytics for one subject. Header (back link, color dot, name, category badge, parent label, routine days, Edit/Delete). Quick stats row (Today / This Week / This Month / All Time + session count). Weekly trend bar chart (5 weeks, daily avg, +/−% vs last week). 90-day heatmap (subject-specific daily target = `weeklyTargetMinutes / 7`, else global). Recent sessions grouped by date (time, duration, note, source badge, project badge, **with per-session Edit/Delete affordance**). Projects under the subject with total minutes. Sub-focus areas with total minutes. Delete cascades soft-delete to child subjects + their sessions, with undo.

**Color tooltips**: `ColorPicker` swatches and subject color dots show the preset name on hover (`COLOR_NAMES` map in `ColorPicker.tsx`).

### 6.3 Projects (CRUD) — `src/features/projects/ProjectsPage.tsx` + `ProjectDetailPage.tsx`
Grid with name, subject, description, goal minutes. Add/Edit modal. Delete with confirmation. Case-insensitive search by project + subject name. **Project totals MUST filter soft-deleted sessions** (H5).

### 6.4 Mark Tracker — `src/features/marks/MarksPage.tsx`
Table: Name, Subject, Score/Total, Weight, Weighted %, Date. Weighted average = `sum(score/total * weight) / sum(weight)`. Score color: green ≥80%, yellow ≥50%, red <50%. Academic subjects starred in select. Case-insensitive search.

### 6.5 Habit Tracker — `src/features/habits/HabitsPage.tsx`
Good/Bad sections. Cards: color dot, name, streak, last-7-day dots, today toggle. **Count mode** has a quick "Mark done" button; **tick mode** has a ✓ toggle. Select a habit for 90-day heatmap. Add/Edit modal with ColorPicker. **States**: Active, Potential, Finished (🎓, graduated — distinct from archive), Archived. `maxActiveHabits` from settings.

### 6.6 Assignment Calendar — `src/features/calendar/CalendarPage.tsx`
Monthly grid with colored dots per type (homework=blue, assignment=purple, exam=red, other=slate). Upcoming list (next 30 days) with type badge + completed toggle. CRUD with type select + description. **Due badge**: nav item "Tasks" shows a red badge with count of assignments due within 24h.

### 6.7 Categories (CRUD) — `src/features/categories/CategoriesPage.tsx`
Academic/General sections. Add/Edit modal with name, scope, ColorPicker. Shows subject count per category. Delete warns about orphaned subjects. **Category delete MUST cascade soft-delete to subjects, projects, sessions, assignments, routineLogs, activityLogs in a single Dexie transaction, and recompute streak days** (H4, H6).

### 6.8 Pomodoro / Study Timer — `src/components/widgets/PomodoroTimer.tsx`
- **Two modes**: Simple (count-up) and Pomodoro (count-up focus/break with the phase goal shown in brackets, e.g. `12:34 (25:00)`). Pomodoro shown only when `settings.pomodoroEnabled`.
- **Simple mode**: Start → live elapsed → Stop & Save (logs a Session, min 1 min; <1 min rounds up to 1).
- **Safety guard**: auto-pauses after 12h continuous running, notifies user.
- **Background persistence**: timer MUST NOT pause on tab hide/focus loss. Uses wall-clock timestamps (`startedAt` in localStorage `momentum-timer-state`) and recomputes elapsed on resume. Crash-safety save on `visibilitychange`/`beforeunload` via `momentum-pending-session` (see `timer-persistence.ts`).
- **Pomodoro mode**: focus → auto-logs Session; short/long break phases; Start/Pause/Reset; cycle indicator dots; sound on phase change (when `soundEnabled`); config gear opens a **popup Modal** (`PomodoroConfigForm`) with a **Save** button — draft values commit to `config`/settings only on Save (disabled while running). The timer **counts up** to the phase goal: internally `pomSeconds` still tracks remaining (so the phase-transition effect that fires at 0 is unchanged), but the rendered value is `goal − remaining` with the goal in brackets. **Last-note hint**: the notes textarea shows the previous note for the selected subject as gray placeholder text when the field is empty; focusing or clicking the field activates the hint (sets it as this session's note), and typing overwrites it. Per-subject last notes persist in localStorage (`momentum-last-note-<subjectId>`, set whenever a session with a note is saved).
- **Subject selector**: required to start either mode.
- **Focus tags**: optional `focused | distracted | group | revision`.
- **Midnight split**: `splitSessionAtMidnight` in `timer-persistence.ts` splits a session crossing local midnight into two.

### 6.9 Schedule — `src/features/schedule/SchedulePage.tsx`
Combines **Routines** (self-directed study blocks) and **Activities** (recurring external commitments) into one page with Today tab + Weekly Plan grid. Routine cards, activity cards, catch-up detection (`findMissedDate`), weekly plan grid, cell edit modal, routine/activity edit modals.

### 6.10 Settings — `src/features/settings/SettingsPage.tsx`
Dark mode, pomodoro config, sound, daily target, auto-log, habit limits, backup/restore, reset, **Dev Build toggle** (Settings → General → "Dev Build" → persistent amber `DevBanner` on every page, undismissable while active; "Disable" calls `saveSettings({ ...settings, devMode: false })`).

### 6.11 Study (FSRS) — `src/features/study/`
`StudyPage` (overview), `ReviewSessionPage` (FSRS review), `ReviewLogPage` (log activity), `ExamConfigPage` (exam-mode compression). `fsrs-scheduler.ts`.

### 6.12 Groups — `src/features/groups/`
`GroupsPage` (leaderboards + cloud session sharing), `GroupDetailPage` (per-group sessions + member stats). Presence via `use-group-presence.ts`.

### 6.13 Reports — `src/features/reports/ReportsPage.tsx`
Overview stats + time-by-subject breakdown (with axis-labeled Daily Trend chart). Listens for `momentum:reports-period-1..4`, `momentum:reports-scope-all/academic/nonacademic` events.

### 6.14 AI Review — `src/features/reviews/AIReviewPage.tsx`
AI-powered study review and feedback. Includes "Last 7 Days" sliding window date preset.

---

## 7. UI Conventions

- **Shared components** (`src/components/ui/`): `ColorPicker` (12 presets + `<input type="color">`), `Card`/`CardHeader`/`CardTitle`, `Button`, `Modal`, `Spinner`, `EmptyState`, `Kbd`, `NumberInput`, `ErrorBoundary`, `DevBanner`, `OnboardingTour`, `ReloadPrompt`, `SyncBanner`, `FloatingTimerBanner`, `CommandPalette`, `UndoToast`, `Collapsible`.
- **CSS classes**: `btn-primary`, `btn-secondary`, `btn-danger`, `input`, `label`, `card`.
- **Dark mode**: `dark:` Tailwind prefix, class on `<html>`.
- **12 preset colors**: `#6366f1, #8b5cf6, #3b82f6, #06b6d4, #10b981, #f59e0b, #ef4444, #ec4899, #14b8a6, #f97316, #8b5cf6, #64748b`.
- **Number inputs**: use `<input type="number" min={1}>` (or the shared `NumberInput`). **NEVER use the `value === 1 ? '' : String(value)` pattern** — it prevents typing numbers starting with "1".
- **Note fields**: `<textarea rows={3}>`, no `maxLength`.
- **Touch targets**: small action buttons ≥44px effective (`min-h-[44px]`, `min-w-[44px]`, or padding) on mobile.
- **Skip link**: keyboard-accessible skip-to-content link in AppLayout.
- **Backdrop layers**: modals use `backdrop-blur-sm` + layered depth.
- **Shortcut display**: source registry uses `Cmd+...` canonically; renderer adapts per platform (`formatShortcutLabel` → `Ctrl` on Windows). Registry stays canonical.
- **Australian English is mandatory for all user-facing copy**: use "Customise" (not "Customize"), "Colour" (not "Color"), "organisation", "recognise", etc. CSS property names (`color`, `background-color`) and internal identifiers stay as-is — only visible UI text is affected. New UI text MUST be written in Australian English.

---

## 8. Shortcuts (`src/lib/shortcuts.ts`)

- `SHORTCUTS` array is the single source of truth (100+ entries). Fields: `id, label, keys, category, description?, routes?, suppressInInput?`.
- `eventToShortcutKey(e)` normalizes a KeyboardEvent to a canonical key string.
- `getShortcutsForRoute(pathname)` filters by route.
- `formatShortcutLabel(keys)` adapts `Cmd+` → `⌘` (mac) / `Ctrl+` (win/linux).
- `isInputFocused()` — used to suppress shortcuts while typing.
- **The keydown handler lives in `AppLayout.tsx`** and dispatches from the registry. **Every shortcut declared in the registry MUST have a working dispatch** — a declared-but-unwired shortcut is a bug (help overlay shows it but pressing it does nothing). Page-specific shortcuts dispatch custom events (e.g. `momentum:log-time`, `momentum:timer-toggle`, `momentum:timer-stop-save`, `momentum:marks-add`, `momentum:calendar-add`, `momentum:subjects-add`) that pages listen for.
- **Input suppression**: when a text input/textarea is focused, global shortcuts (`d`, `s`, `p`, `n`, etc.) MUST NOT fire. `Esc` and `Cmd+K`/`Ctrl+K` remain allowed.

---

## 9. Session Editing & Log-Time

**Edit-session modal** MUST include: Minutes (number, min 1), Date (date input), Start time (time input, required, defaults to original `startAt`), End time (time input, optional — if omitted, computed as start + duration), Subject (select), Project (optional select, **hidden entirely when the selected subject has no projects**), Note (textarea rows 3).

`saveEditLog()` MUST derive `durationMinutes` from start/end when both provided, and MUST call `revertStreakDayForSession(prevSession)` + `updateStreakDayForSession(nextSession)` to keep streak totals consistent across date changes. MUST persist `projectId` and `note`; undo/redo MUST restore those fields too.

**Log-time modal** includes optional start/end time fields. When both provided, duration = difference; when only start, end = start + duration. Persisted in `dash-log-form` sessionStorage, reset on submit.

---

## 10. Common Pitfalls, Stalls & Misimplementations

These are the recurring failure modes. Read before editing. **If you hit one, you are not blocked — you are in a known trap; get out of it.**

### 10.1 Soft-delete filtering (the #1 recurring bug)
- **Symptom**: totals, streaks, project minutes, recent-session counts, subject breakdowns include deleted sessions.
- **Fix**: every aggregate MUST filter `!s.deletedAt` (or use `isActiveSession`/`filterActive`). Check: project totals (H5), `buildTodaySubjectBreakdown` (M11), recent-session "Showing X of Y" (regression #3), streak days, dashboard stat cards.
- **Stall trap**: "why is the count wrong?" → check the filter first, not the data.

### 10.2 Timer state / wall-clock (background persistence)
- **Symptom**: timer pauses when tab hidden, or elapsed time is wrong after returning.
- **Fix**: timer MUST derive elapsed from wall clock `(Date.now() - startedAt)`, never from a `setInterval` counter that stops when the tab is hidden. State in localStorage `momentum-timer-state`. Crash-safety via `momentum-pending-session` on `visibilitychange`/`beforeunload`.
- **Stall trap**: "timer stopped while I was in another tab" → the interval-based counter is the bug; switch to wall-clock derivation.

### 10.3 Pomodoro phase transitions (phantom sessions)
- **Symptom**: a focus session is saved even when nothing was studied, or the phase-change handler re-fires and saves duplicates.
- **Fix**: derive tick from wall clock `(Date.now() - pomStartedAt)/1000`; use a `transitionedRef` so a transition fires ONCE per render commit; clear `pomIntervalRef.current` on every phase change. (C1 in bugfix-plan.)
- **Stall trap**: "it saved a session I didn't study" → re-entrancy in the phase-change handler.

### 10.4 QuickTimer scope leaks into academic totals
- **Symptom**: a QuickTimer running on a non-academic subject still adds minutes to the academic "Today" total.
- **Fix**: `getLiveTimerSeconds` must resolve the timer's subject scope via `getSessionScope` and only include live seconds when the source is academic. (C2.)
- **Stall trap**: "Today total is too high" → check whether a live timer is leaking across scopes.

### 10.5 Subject/project/category delete cascades
- **Symptom**: deleting a category or subject leaves orphaned projects/sessions/assignments, or streak days go stale.
- **Fix**: cascade soft-delete to all dependent rows in a single Dexie transaction, then `recomputeStreakDaysForDates`. Undo must restore everything. (H4, H6.)
- **Stall trap**: "I deleted a subject but its sessions still show up" → cascade missing.

### 10.6 Routine tagging of arbitrary sessions
- **Symptom**: manually-created sessions get silently assigned a `routineId`.
- **Fix**: only set `routineId` when `session.source === 'autoRoutine'`; never overwrite an existing `routineId`. (H1.)

### 10.7 Activity untick uses wrong lookup
- **Symptom**: unticking an activity deletes the wrong session or fails.
- **Fix**: read `removedLog.sessionId` (persisted at creation), never re-derive from `createdAt`. (H2.)

### 10.8 FAB events race page mount
- **Symptom**: clicking a FAB "Add" action does nothing because the page isn't mounted yet.
- **Fix**: replace `setTimeout(dispatchEvent, 0)` with `navigate(route, { state: { openAdd: true } })`; the page reads the flag in a mount effect and clears it. (M1.)

### 10.9 Union-typed fields widened to `string`
- **Symptom**: `focusTag` (or `TaskCategory`, `HabitMode`, `ReviewRating`) becomes `string | null` in form state, breaking type safety and comparisons.
- **Fix**: keep the strict union type in form state and save handlers. (Spec §15.)

### 10.10 NumberInput / typing numbers starting with "1"
- **Symptom**: can't type `10`, `15`, `120` — the field clears or clamps.
- **Fix**: never use `value === 1 ? '' : String(value)`. Use `<input type="number" min={1}>` or shared `NumberInput`. On empty blur, don't clamp to `min`; keep empty and validate on submit. (L7.)

### 10.11 JSX parent-wrapper regressions
- **Symptom**: after merging/refactoring dashboard widgets, JSX parent-element errors or broken layout.
- **Fix**: re-check parent wrappers (e.g. the `Card` wrapper around the `today` widget) before build. (Spec §15.)

### 10.12 Stale-tag edits
- **Symptom**: an edit lands in the wrong place because the file changed since the last read.
- **Fix**: re-ground on the latest file hash before every edit. Dashboard files are large; stale-tag inserts can land inside JSX blocks. (Spec §15.)

### 10.13 Undo stack corruption
- **Symptom**: undo/redo does the wrong thing or silently drops actions.
- **Fix**: `use-undo.tsx` guards concurrent pushes with `isPushing` and surfaces "Action in progress — try again". Pushing clears the redo stack. MAX_DEPTH 50. (M12.)

### 10.14 Settings defaults duplicated
- **Symptom**: SettingsPage has its own copy of defaults that drifts from `settings-store.ts`.
- **Fix**: import from `settings-store.ts`; never redefine. (L1.)

### 10.15 Streak milestone / best-streak inconsistency
- **Symptom**: current streak and best streak disagree, or milestones show wrong values.
- **Fix**: `STREAK_MILESTONES` centralized in `utils.ts`; best streak = max(computed, persisted `momentum-best-streak`). (L2, L3.)

### 10.16 Subject picker with deleted parents
- **Symptom**: child subjects appear under a deleted parent, or the picker shows orphans.
- **Fix**: filter out children whose parent is deleted (or filter them cleanly). (L4.)

### 10.17 Dexie version bumps
- **Symptom**: adding a table/index without bumping the version → Dexie throws or data is lost.
- **Fix**: always bump the version and add `.upgrade()` for migrations. Never reuse a version number. (Spec §4.2.)

### 10.18 `flushPendingDirtyTables()` during render
- **Symptom**: side effects during render cause double-fires or warnings.
- **Fix**: move into a `useEffect` or prefix with `void`. (M8.)

### 10.19 `loadPrefs` wipes nav prefs on version bump
- **Symptom**: nav order/visibility resets unexpectedly.
- **Fix**: don't bump `CURRENT_PREFS_VERSION` casually; if the version differs but no schema-affecting change, treat as passthrough. (M9.)

### 10.20 Routine save doesn't create a Session
- **Symptom**: logging routine minutes doesn't create a Session, so it doesn't count toward study time.
- **Fix**: `RoutinePage.saveLogMinutes` MUST create a corresponding Session like TodayChecklist does (`startAt = now - mins*60_000`, `endAt = now`, `source = 'manual'`, `subjectId`, `projectId`). (M10.)

### 10.21 Non-awaited cloud deletes
- **Symptom**: bulk session delete leaves cloud rows behind.
- **Fix**: `await Promise.all(targets.map(s => syncSessionDelete(s.id)))`. (M6.)

### 10.22 Auto-log widget shows all soft-deleted autoRoutine sessions
- **Symptom**: the auto-log widget lists sessions that were already dismissed.
- **Fix**: filter to `pendingConfirmation === true` AND within 24h; add "Dismiss all". (M7.)

### 10.23 Freeform dashboard layout (REMOVED, plan to re-implement)
- **Status**: The freeform layout mode was removed in commit `72e50ec` because of persistent overlap/teleport bugs (horizontal packing that ignored width ordering, no cascade-up on widget removal). The codebase no longer references `layoutMode`, `setMode`, `setWidgetPx`, `runCascade`, or any of the cascade layout helpers.
- **Symptom (historical)**: widgets jumped to wrong positions, or saved x/y got overwritten on first switch.
- **Fix (historical)**: keep inline style until state commit lands (L9); don't overwrite saved x/y on first switch (L10). `resolveOverlaps` / `cascadeFreeformLayout` / `placeWithoutOverlap` in `use-dashboard-widgets.ts`.
- **Open follow-up**: re-implement freeform mode with a fresh design that handles horizontal packing, top-of-column cascade, and out-of-bounds clipping correctly. Do NOT try to restore the old code; write it from scratch against the new grid-only `use-dashboard-widgets.ts`.
- **Stall trap**: "the freeform code is gone, just restore it from git history" → don't; the algorithm had fundamental flaws. Start from `use-dashboard-widgets.ts`'s grid spine.

### 10.24 Timer subject fallback
- **Symptom**: QuickTimer silently falls back to `data.subjects[0]` when the configured subject was deleted.
- **Fix**: surface an alert and do NOT save a session; offer reassign. (H3.)

### 10.25 `changeSubject` over-reports / stale seconds
- **Symptom**: switching subject mid-timer over-reports minutes or shows stale elapsed.
- **Fix**: cap at `cfg.focusMinutes * 60_000` (M2); compute simple-mode elapsed from `(Date.now() - simpleStartedAt)/1000 + simplePausedOffset/1000` (M5).

### 10.26 `saveSessionWithMidnightCheck` allows empty subjectId
- **Symptom**: a session with no subject is saved.
- **Fix**: early return when `actualSubjectId` is empty. (M3.)

### 10.27 `splitSessionAtMidnight` floor mismatch
- **Symptom**: split sessions have wrong durations.
- **Fix**: use actual ms for both seconds and `durationMinutes`; reuse `Math.max(1, Math.round(...))` only for the ID. (M4.)

### 10.28 Empty project dropdown
- **Symptom**: a project dropdown renders empty when the subject has no projects.
- **Fix**: hide the dropdown entirely when the selected subject has zero projects. (Regression #6.)

### 10.29 Duplicate widget entries / copy
- **Symptom**: "Upcoming Assignments" appears twice in the widget customise list, or daily-goal copy repeats.
- **Fix**: dedupe widget list (regression #5); don't repeat daily-goal text in the Streak & Goal widget (regression #7).

### 10.30 Modal drag-to-dismiss — FIXED
- **Symptom (historical)**: dragging inside a modal dismissed it.
- **Fix**: `Modal.tsx` tracks the mousedown target in `mouseDownTargetRef` and only closes on click when both the mousedown and the click landed on the dialog element itself. Drag-from-inside-to-outside is ignored. (L6.)

### 10.31 Dashboard cross-column drag: React #185 ("Maximum update depth exceeded") — FIXED
- **Symptom (historical)**: dragging a widget between columns triggered React error #185 in the console (desktop browser only; not reproducible headless because the test browser had no stale SW precache).
- **Fix applied**: `src/main.tsx` reads `__BUILD_ID__` (defined in `vite.config.ts`) and, on every load, compares it against the value cached in `localStorage['momentum-build-id']`. On mismatch it stamps the new id and calls `window.location.reload()` before React renders, so the mismatched old JS bundle never gets a chance to mount alongside the new HTML.
- **Stall trap**: "can't reproduce, must be a flake" → it WAS reproducible, just only with a stale SW precache. Do not add a try/catch around `useSortable`/`DndContext` to silence the error — that masks the real cause (a JS/HTML bundle mismatch).

### 10.32 Log-time modal preview inflates the "Today" total
- **Symptom**: opening the Log Study Time modal and typing a duration caused the inline "Today: Xm" line to increase in lockstep with the typed minutes, making it appear the widget's total had changed before the session was saved.
- **Fix**: the modal now shows the **actual** persisted today total (computed from `data.sessions`, like the widget does), and a *separate* muted annotation that reads `— logging Nm (k to go after logging)` or `— logging Nm reaches goal`. The widget itself (which uses `liveTotalTodayMinutes` from `getTotalTodayMinutes(data.sessions, ...)`) was never affected by the modal state — the user-visible confusion was caused by the modal's projected text.
- **Stall trap**: "the widget is reading from modal state" → no, the widget reads `data.sessions`; the modal's `logDuration` is local state. Look at the modal preview text, not the widget props.

### 10.33 Subject picker omits children of deleted parents — FIXED
- **Symptom (historical)**: `getSubjectPickerOptions` in `utils.ts` only iterated top-level subjects (`isTopLevelSubject` filter). Any child subject whose `parentSubjectId` pointed to a soft-deleted parent was silently dropped from every picker (QuickTimer, Activities, Marks, Projects, Dashboard log modal).
- **Fix applied (L4)**: `getSubjectPickerOptions` now builds an `activeIds` Set and promotes any non-deleted subject whose parent is missing to the list of "parent" options, so it renders as a top-level entry. Its own children (if any) are still nested under it.
- **Stall trap**: "the subject is invisible because its parent is deleted" → yes, but `getSubjectPathLabel` and `getTopLevelSubject` in `utils.ts` already fall back to showing just the child's own name when the parent is gone — that part was fine. The picker was the only place that silently dropped the subject entirely.

### 10.34 Timer tab-lock spurious "running in another tab" — FIXED
- **Symptom**: opening the app (or a fresh tab) with a timer already running showed "Timer is running in another tab — controls disabled here" even when no other tab was actually running the timer.
- **Root cause**: `useTimerTabLock` initialised `lastPeerTsRef` to `Date.now()`, so on first render `peerStale` was `false` (0ms since "last heard"). A stale `momentum-timer-owner` key left by a previously crashed/force-quit tab (which never fired `beforeunload`) was therefore treated as a live peer → `isOwnedElsewhere = true`.
- **Fix applied**: initialise `lastPeerTsRef` to `0` so an existing owner key is treated as stale until a real heartbeat arrives. The reclaim effect then clears/claims it. A genuinely live peer still broadcasts every 2s, so real multi-tab ownership is unaffected.
- **Stall trap**: "the lock is broken, remove it" → don't. The lock prevents duplicate session saves across tabs. The bug was only the initial-staleness assumption, not the ownership mechanism.

### 10.35 Pomodoro timer settings go stale — FIXED
- **Symptom**: changing pomodoro focus / break / cycle / sound settings on the Settings page didn't update the Study Timer on the dashboard; the timer still showed the old cycle durations until a hard reload.
- **Root cause**: `PomodoroTimer` read `loadSettings()` exactly once at mount and stored the result in `useState`. Settings written by `SettingsPage` after mount never reached this component, because `localStorage` updates inside the same tab do not fire the browser `storage` event.
- **Fix applied**: `settings-store.saveSettings()` now dispatches a `momentum:settings-changed` `CustomEvent` after every write. `PomodoroTimer` listens to both that event and the cross-tab `storage` event; on either, it re-reads settings via `loadSettings()`, updates the local `settings` state, and (when idle) re-derives the local `config` so subsequent phases use the new durations. While running, only `settings` is refreshed (cycle label / `pomodoroEnabled` toggle) — durations don't change mid-session. The config was also moved out of an inline panel into a popup `Modal` (`PomodoroConfigForm`) with a Save button, so edits are committed only when the user confirms (the `PomodoroConfigForm` is the source of truth for the modal session and re-syncs from `initial` after each Save).
- **Stall trap**: "just add `useEffect(loadSettings, [])` again" → that won't help; the issue is that no event triggered a re-read. The fix is a `saveSettings()` event + listener, not more reads at mount.

### 10.36 Pomodoro break time counted toward study — FIXED
- **Symptom**: while a pomodoro break timer was running, the dashboard "Today" total inflated by the break duration. After completing a 25-min focus + 5-min break cycle, the study total jumped by ~30 min instead of ~25 min.
- **Root cause**: `getLiveTimerSeconds()` in `timer-utils.ts` added elapsed seconds for any active pomodoro timer regardless of phase. During a break the timer's `startedAt` was reset (break start), and `phaseRemaining` was non-null, so the break elapsed time was included in the academic "Today" total.
- **Fix applied**: `getLiveTimerSeconds()` now checks `state.phase === 'focus'` before adding pomodoro elapsed seconds. During `shortBreak`/`longBreak` phases, it returns 0. The dashboard "Today" card, streak-at-risk indicator, and the GroupDetailPage live minutes all derive from this function, so all are now correct. Two regression tests (`shortBreak` + `longBreak`) added to `timer-utils.test.ts`.
- **Stall trap**: "the timer saves a session when the break finishes" → no; the session is saved when the *focus* phase completes (phase-transition effect, `pomPhase === 'focus'`). Break-to-focus transitions don't write a session. The bug was only in the live counting, not in session persistence.
### 10.37 Habit log "2 today" — double-counting optimistic + persisted logs
- **Symptom**: a habit in count mode (not tick mode) showed "2 today" after the user logged it once. Re-opening the page also showed the inflated count.
- **Root cause**: `HabitsPage` keeps an optimistic overlay (`localLogAdditions`) for instant UX. The `effectiveHabitLogs` memo was `data.habitLogs.filter(notDeleted).concat(localLogAdditions)` — but `localLogAdditions` was never cleared after the Dexie write persisted the same log. After a `mutate` triggered a re-load, the data array had the persisted log AND the local addition was still there, so the count was doubled.
- **Fix applied**: `effectiveHabitLogs` now subtracts `localLogAdditions` IDs from the persisted list before concatenation. `localLogAdditions` is the source of truth until the next reload, so the persisted branch is forced to exclude any IDs still in the overlay. The `quickLogInFlightRef` Set already prevents double-add races for tick mode; this fix handles the persisted-vs-optimistic case for count mode.
- **Stall trap**: "just clear `localLogAdditions` after `mutate`" → no, the optimistic overlay exists specifically so the UI updates before the DB write completes. Clearing it eagerly would cause flicker. The fix is to deduplicate the *combination*, not to throw away the optimistic update.
- **Lesson for any domain with optimistic overlays** (sessions, assignments, marks): always filter the persisted list by the overlay's IDs before merging; otherwise the same record gets counted twice after the next reload.
### 10.38 Inserting a new JSX block into the middle of a table — broken markup
- **Symptom**: adding a new `<Card>` (e.g. "Time by Project") to `ReportsPage` produced `TS17008: JSX element 'Card' has no corresponding closing tag` and a broken table render.
- **Root cause**: the new block was inserted at a line number that fell *inside* an existing `<table>`/`<tbody>`/`<tr>` region (the "Time by Focus Area" table). The `insert after N` landed mid-table, so the new `<Card>` was nested inside a `<tr>`, and the table's closing tags were left dangling.
- **Fix applied**: re-read the surrounding JSX, removed the misplaced block, and re-inserted it *after* the enclosing `</Card>` of the focus-area card (a clean sibling boundary), then re-verified the table's `</tr></tbody></table></div>` closing sequence.
### 10.39 Habit untick visually stuck "on" after fast tick→untick
- **Symptom**: clicking the tick button on a habit immediately removes the ✓ from the state but the button still shows ✓ / "Done" after the next render.
- **Root cause**: `effectiveHabitLogs` filtered `data.habitLogs` by `localLogDeletions`, but `localLogAdditions` was concatenated *unfiltered*. When a tick was added optimistically (`localLogAdditions`) and then unticked within the same render cycle (before `mutate` cleared it from `localLogAdditions`), the deleted log survived via the unfiltered `localLogAdditions` branch.
- **Fix applied**: `effectiveHabitLogs` now also filters `localLogAdditions` by `localLogDeletions` before concatenation: `localMinusDeletions = localLogAdditions.filter(l => !localLogDeletions.has(l.id))`. The dedup against `data.habitLogs` is unchanged.
- **Stall trap**: "the delete call failed silently" → no; the issue is that the optimistic overlay was never cleaned up. Always ensure every consumer of `localLogAdditions` also subtracts `localLogDeletions`.

### 10.40 FloatingTimerBanner intercepts clicks behind it
- **Symptom**: the "Studying: subject TIME" pill at bottom-center blocks clicks on UI elements underneath it (FAB, footer, page-end buttons).
- **Root cause**: the outer `<div>` had `pointer-events-auto`, which made the entire bounding box intercept clicks even though the only interactive child is the inner `<button>`.
- **Fix applied**: outer `<div>` is now `pointer-events-none`; the inner `<button>` keeps `pointer-events-auto`. Clicks pass through the banner except directly on the button.

### 10.41 `useStreak` longestStreak undercounted runs with mid- run gap
- **Symptom**: current streak shows 10 but best/longest streak shows 8 (or any case where current > best, which should be impossible).
- **Root cause**: `longestStreak` iterated *chronologically* through sorted days, consuming freezes only for gaps that came *after* the freeze was earned in chronological order. The current-streak loop iterates *backwards from today*, so it could use a freeze earned mid-run (e.g. day 14 of a run) to cover an earlier gap (e.g. day 10) — yielding 10 — while the chronological pass couldn't, so it found only 8.
- **Fix applied**: `longestStreak` now mirrors the current-streak loop — for each logged day, it that the anchor and walks backwards using the same freeze logic (5 consecutive logged → +1 freeze, miss with freeze → consume, double miss → break). The max across all anchors is the true longest streak. The invariant `longestStreak ≥ currentStreak` now holds.
- **Stall trap**: "just `Math.max(longestStreak, currentStreak)`" → masks the bug but the displayed `bestStreak` (persisted to localStorage) would still be wrong on first render after the fix lands. Fix the computation, not the consumer.

### 10.42 HabitsPage renders with empty data during initial load
- **Symptom**: after Ctrl+R, the Habits page briefly shows "No good habits / No bad habits" before the data populates.
- **Root cause**: `useData()` starts with `emptyData`; `loadData()` runs in a `useEffect` and only fires after cloud pull completes. HabitsPage never checked `isLoading` and rendered immediately.
- **Fix applied**: HabitsPage now reads `isLoading` from `useData()` and returns `<PageSpinner />` during initial load.

### 10.43 Dashboard live-timer interval leak — "Today by Subject" percentage flicker
- **Symptom**: when you create a new subject (or otherwise change `data.subjects`/`data.categories`), the "Today by Subject" breakdown percentage for that subject flips between including and not including it once per second.
- **Root cause**: the live-timer effect in `Dashboard.tsx` (around line 743) had **no cleanup function**. Its dependency array is `[data.subjects, data.categories]`, so every change to those arrays re-ran the effect and spawned a *new* `setInterval` on top of the old one. The stale interval still closed over the OLD `subjects` array (without the new subject), so its `tick()` computed `getLiveTimerSeconds(...) → 0` for the new subject while the fresh interval computed the real value. React received both updates per second and the UI flickered.
- **Fix applied**: added `return () => { if (interval) clearInterval(interval) }` to the effect. Exactly one live interval now runs at a time, so `liveTimerSeconds` is stable.
- **Stall trap**: "the `subjects` reference in the interval closure is stale, refactor to use a ref" → that would mask the leak but not fix it. The real fix is cleanup. An interval that re-reads `data.subjects` from React state still can't, because intervals don't re-run effects. Cleanup the interval on dependency change so only the new effect's interval exists.

### 10.44 Habit "Reset Data" must also re-anchor `createdAt`
- **Symptom**: clicking "Reset Data" on a habit cleared all logs but the streak counter and 90-day heatmap still showed the old history as if the habit had been running since the original `createdAt`. For a "bad" habit this was especially bad — clearing the logs made every day count as a "successful avoidance" all the way back to `createdAt`, giving the habit a phantom streak of weeks/months.
- **Root cause**: `streakMap` and the heatmap both anchor on `habit.createdAt`. Soft-deleting the logs removes the evidence, but the anchor still points to the original creation date, so the streak loop iterates over days that the user explicitly chose to wipe.
- **Fix applied**: `resetHabitDataFn` now calls `db.habits.update(id, { createdAt: now, updatedAt: now })` and mirrors it in the `mutate` update. After reset, the habit behaves as if it were freshly created today: streak = 0, heatmap starts from today.
**Stall trap**: "add a separate `lastResetAt` field, don't overload `createdAt`" → yes, but it requires a schema bump for negligible gain. The user's mental model of "reset = start fresh today" matches overloading `createdAt`. The audit trail (true creation date) is preserved in Dexie history via `updatedAt` and prior backups. Keep it simple.

### 10.45 Current streak breaks to 0 before the user logs today — FIXED
**Symptom**: a user with an active 5+ day streak saw the dashboard streak counter drop to 0 first thing in the morning, before they had logged that day's session. The chain would still be intact by the usual "you have until end-of-day" mental model, but the number went to 0 the instant the date rolled over.
**Root cause**: `useStreak` started its loop at `new Date()` (today). If today had no session and no freeze was available, the loop hit the `else { break }` branch on the very first iteration and returned `count = 0`, regardless of how many days ended at yesterday.
**Fix applied**: `useStreak` now skips today when it isn't in `daySet`: it sets `d = subDays(d, 1)` before entering the loop, so the streak is calculated "as of yesterday" until the user logs today. The "at risk" copy (`streak > 0 && liveTotalTodayMinutes === 0`) now triggers correctly, since `streak` reflects the run that just ended. The mirrored `computeStreak` in `streak.test.ts` was updated to match, and two regression tests (`holds the streak when today is not yet logged`, `returns 0 when neither today nor yesterday has a session`) were added.
**Stall trap**: "the user just needs to log today to keep the streak" → they do, but until they do, the counter should still show the streak they have. A streak of N days isn't dead the moment N+1 begins; it's dead when two consecutive days pass without a log (or a freeze).

### 10.46 Best-streak display lags the current streak — FIXED
**Symptom**: the streak widget's "Best" number didn't reflect the current streak when the current streak exceeded the previous best (e.g. a user on a 12-day run with a stored best of 8 saw "Best: 8" while the big number showed 12).
**Root cause**: `useStreak` returns both `longestStreak` (computed from persisted sessions) and `bestStreak` (the all-time record persisted in `momentum-best-streak`, auto-climbing when `longestStreak` exceeds it). Dashboard.tsx and ReportsPage.tsx destructured `{ streak, longestStreak }` and rendered `longestStreak` as "Best" — ignoring `bestStreak` entirely. Worse, `longestStreak`'s memo did NOT include `previewDates` (the live timer's today), so while a timer was running `streak` could exceed `longestStreak`, and the `bestStreak` effect only compared against `longestStreak` — so the invariant `bestStreak ≥ streak` was broken.
**Fix applied**: (1) Dashboard.tsx and ReportsPage.tsx now destructure and render `bestStreak` (the persisted record, which is the intended "Best"). (2) `longestStreak`'s memo now also folds in `previewDates`, matching the current-streak loop. (3) The `bestStreak` effect now uses `candidate = Math.max(longestStreak, streak)` so the displayed best climbs the moment the current streak exceeds the stored record (e.g. a live timer previewing today). Regression tests added in `streak.test.ts` (`bestStreak invariant` block).
**Stall trap**: "just `Math.max(longestStreak, currentStreak)` in the component" → that masks the symptom but the persisted `bestStreak` would still be stale on next load. Fix the hook's effect (candidate = max(longest, current)) AND render `bestStreak`, not `longestStreak`.


### 10.47 Activity session start/end used wall-clock instead of `scheduledTime`
**Symptom**: clicking "Attended" on an activity created a session whose `startAt` was `Date.now() - duration * 60_000` and whose `endAt` was `Date.now()`. Logging a 50-min 4:30pm activity at 6pm produced a 5:10pm–6:00pm session, not a 4:30pm–5:20pm one — so the dashboard's "Today" total (filtered by `date(s.startAt) === today`) could miss the session entirely, and the session was incorrectly attributed to the wrong time block.
**Fix**: `attendActivity` in `SchedulePage.tsx` now derives `startAt` from `scheduledTime` (parsed against `todayStr`) when present, and computes `endAt = startAt + mins`. Falls back to `Date.now() - duration * 60_000` for activities without `scheduledTime`.
**Stall trap**: "the session isn't counted toward study time" → check whether `startAt` is anchored to the scheduled block, not the wall clock. The `actualMinutes` field on the `ActivityLog` was already correct; only the Session's `startAt`/`endAt`/`durationMinutes` were wrong.

### 10.48 Today card "last session" text ignores live timer — FIXED
**Symptom**: when a timer is running (first session of the day), the Today card shows "No sessions yet today — last was yesterday" instead of indicating a session is in progress.
**Root cause**: `lastSession` is derived from `academicSessions` (persisted sessions only). When a timer is running but no session has been saved yet, there are no today sessions, so `formatLastSessionText` returns the stale "last was yesterday" message.
**Fix applied**: `lastSessionText` now checks `isTimerActive()` first — when a timer is active, it shows "Currently studying..." instead of the persisted-session text.
**Stall trap**: "the timer isn't saving sessions" → it will, when the user stops it. The issue is the text, not the save logic.

### 10.49 Streak heatmap ignores live timer minutes — FIXED
**Symptom**: starting the first session of the day shows 0 study minutes in the streak heatmap until the session is saved (clicked stop).
**Root cause**: `minutesByDay` (used for the heatmap) only counts persisted `academicSessions`. The live timer seconds are tracked in `liveTimerWholeMinutes` but were never added to the heatmap's today entry.
**Fix applied**: the streak heatmap now adds `liveTimerWholeMinutes / 60` to today's entry when `ds === todayStr`, so the heatmap updates in real time as the timer runs.
**Stall trap**: "the heatmap data is stale" → check whether `minutesByDay` includes live timer minutes. The heatmap reads from a memo that only recomputes when `academicSessions` changes; the live timer state is separate and must be merged at render time.

### 10.50 Timer subject switch carries old notes — FIXED
**Symptom**: changing the subject while the timer is running leaves the previous subject's text in the "What are you working on?" box.
**Root cause**: `changeSubject` saved the old session correctly but reused the old `timerNotes` value when creating the new subject's persisted timer state. React state updates are asynchronous, so calling `setTimerNotes` alone was insufficient.
**Fix applied**: `changeSubject` now loads the new subject's scoped last note with `getLastNote(newSubjectId)`, updates the visible notes state, and writes that same value directly into both simple and pomodoro persisted timer states.
**Stall trap**: resetting only the React state leaves a reload path carrying the old value; the persisted `notes` field must be updated in the same subject-switch operation.

### 10.51 PomodoroTimer state bleed on subject switch / stop / discard — FIXED
**Symptom**: switching subjects while the timer is running leaves the old subject's focusTag and routineId on the new session; stopping or discarding a session also leaks these fields into the next session.
**Root cause**: `timerFocusTag` and `timerRoutineId` were never reset when calling `changeSubject`, `stopSimple`, `stopPomodoro`, `discardSession`, or `resetPomodoro`.
**Fix applied**: all five functions now reset `timerRoutineId('')` and `timerFocusTag(null)`.

### 10.52 focusTag not persisted / restored on reload — FIXED
**Symptom**: if the user selected a focusTag and then the page was reloaded while the timer was running, the focusTag was lost.
**Root cause**: `focusTag` was never written to the persisted timer state (localStorage) and was not restored on mount.
**Fix applied**: focusTag is now persisted in all timer state writes (startSimple, pauseSimple, resumeSimple, startPomodoro, resumePomodoro, pausePomodoro, changeSubject, phase transition effects) and restored from localStorage on mount alongside notes and routineId.

### 10.53 KebabMenu component for mobile-friendly context actions
**Component**: `KebabMenu` (`src/components/ui/KebabMenu.tsx`) — a `⋯` button that opens a floating action menu. Used as the mobile-friendly alternative to right-click context menus. Wraps the same action set as `ContextMenu`. Supports icons, shortcuts, and danger labels. Closes on click-outside or Escape.
**When to use**: any time a row-level action list would otherwise require Edit/Delete buttons that crowd small screens. Wrap the row in `ContextMenu` (right-click + long-press) AND add a `KebabMenu` inside the row's action area. The `ContextMenu` component handles desktop right-click and mobile long-press; `KebabMenu` handles the explicit tap affordance.

### 10.54 Notification scheduler for time-based reminders
**Module**: `src/lib/notification-scheduler.ts` — runs a 30s polling loop started from `AppLayout` on mount. Checks three sources:
 1. **Habit reminders**: for habits with a `reminderTime` set, fires "Have you logged X today?" at the configured time if no log exists for today. Only fires once per habit per day.
 2. **Due-date reminders**: for assignments, fires "X is due tomorrow" / "X is due today" / "X was due yesterday" once per assignment per day.
 3. **Study review reminders**: for FSRS study areas with `nextReview <= today`, fires "X is due for review" once per area per day.
Dedupe: all notification firings are tracked in localStorage by date key. The state is pruned weekly.

### 10.55 Streak milestone / daily goal notifications — FIXED
**Symptom**: streak milestones and daily goal completions only showed an in-app celebration toast. No browser notification was fired.
**Fix applied**: the existing celebration effect in `Dashboard.tsx` now fires `sendNotification` when a streak milestone is reached or the daily goal is met.
**Stall trap**: the celebration localStorage guard (`CELEBRATION_KEY`) already prevents duplicate firings per day; the notification is subject to the same guard.
### 10.58 React #310 hook-order violation
- **Symptom**: Minified React error #310 "Rendered more hooks than during the previous render" on initial load, especially in production builds.
- **Fix**: ALWAYS place ALL `use*()` hooks (useState, useEffect, useMemo, etc.) at the top level of the component, BEFORE any early return statements. Even if the component renders `null` or a spinner early, hooks must execute in the exact same order on every render.
- **Stall trap**: "it works in dev but breaks in production" → the production build optimizer often reveals hook-order issues that dev doesn't catch immediately. Check every early return for `use*()` hooks appearing after it.
### 10.59 Routine auto-completion false-positive (dayMinutes[sessionDow] undefined)
- **Symptom**: the Today's Checklist ticks a routine as completed when only a fraction of the target was logged — e.g. a 10-min session marking a routine with a 30-min target as "done".
- **Root cause**: `updateRoutineLogsForSession` (and `revertRoutineLogsForSession`) computed `completed = addedMinutes >= (routine.dayMinutes[sessionDow] ?? 0)`. When the routine was NOT scheduled for the session's day of week (`dayMinutes[sessionDow]` undefined), the `?? 0` defaulted the target to 0, so `addedMinutes >= 0` was always true. This happens when a routine is auto-matched or explicitly selected (via `session.routineId`) on a day it isn't scheduled.
- **Fix**: only allow `completed = true` when `dayMinutes[sessionDow]` is defined AND > 0: `const completed = targetMinutes !== undefined && targetMinutes > 0 && addedMinutes >= targetMinutes`. Same guard in the revert path.
- **Stall trap**: "the checklist ticks at 10 min" → don't chase the checklist rendering; the false-positive is in the routine-tracker completion predicate, where an undefined day target must not collapse to 0.
### 10.60 TodayChecklist routine "skipped" conflation with partial progress
- **Symptom**: Routines with partial study progress (a RoutineLog exists with `actualMinutes > 0`, but `completed: false`) appear crossed out (line-through) on Today's Checklist.
- **Root cause**: `TodayChecklist` computed `skipped` as `!!log && !log.completed`, conflating partial-progress logs with explicit skips. `isDone` then used `row.completed || row.skipped`, crossing out partial work.
- **Fix**: `skipped` now only true if `!log.completed` AND `(log.actualMinutes ?? 0) === 0`.
- **Stall trap**: "the routine log shows it's not completed, so why is it crossed out?" → check `skipped` computation in row-mapping logic.

### 10.61 Dashboard total time display lags live study
- **Symptom**: "Xm total today" line at the bottom of the Today card uses `totalTodayMinutesAll` (persisted sessions only) and does not update live with the timer.
- **Fix**: display `totalTodayMinutesAll + Math.floor(liveTimerAllSeconds / 60)` to include live timer minutes, using `Math.floor` for per-minute ticking.
- **Stall trap**: "do I need to refactor `getTotalTodayMinutes`?" → no, it's academic-only; dashboard needs an all-scope total.
---

## 11. Regression Checklist — MUST pass before deployment

1. **Timer background persistence** — start timer, switch tabs/windows, wait ≥10s, return. Elapsed MUST reflect real wall-clock time, not paused.
2. **Sub-subject project overwrite** — in Log Study Time, select a sub-subject then a project. The visible subject MUST remain the sub-subject, not snap back to parent.
3. **Recent sessions soft-delete filtering** — soft-delete a session; "Showing X of Y" MUST exclude it from `Y`.
4. **Recent sessions selection affordance** — checkboxes hidden until "Select Sessions" clicked.
5. **Duplicate upcoming assignments** — appears only once in widget customise list.
6. **Empty project dropdown** — hidden when subject has zero projects.
7. **Duplicate daily goal text** — Streak & Goal widget MUST NOT repeat the Today card's copy.
8. **Widget position persistence** — toggle off/on returns to original position.
9. **Keyboard shortcut suppression in inputs** — typing `d`/`s`/`p`/`n` in an input does nothing but type; `Esc` and `Cmd+K`/`Ctrl+K` still work.
10. **Timer subject switch resets notes** — start a timer on Subject A, type notes, switch to Subject B. The notes box MUST reset to Subject B's last note (if any) or empty — MUST NOT carry Subject A's text.
11. **Timer focusTag persistence** — start a timer, set a focus tag, reload the page. The focus tag MUST survive the reload.
12. **Timer state isolation per subject** — switch subjects while timer is running; routineId and focusTag MUST NOT carry over.
13. **Shortcut registry consistency** — registry uses `Cmd+...` canonically; render-time adaptation only.
14. **Tests and type-check** — `npx tsc --noEmit` and `npx vitest run` MUST pass.
15. **Habit reminder time** — set a reminder time on a habit, save, edit it. The time MUST persist on reload.
16. **KebabMenu opens/closes** — clicking the `⋯` button opens the menu; clicking outside or pressing Escape closes it.
17. **KebabMenu actions** — selecting an item from the menu fires its action; the menu closes after selection.
18. **CalendarPage KebabMenu** — each assignment row (mobile and desktop) MUST have a `KebabMenu` with Edit and Delete actions.

---

## 12. Pending Bugs (open, not yet closed)

Tracked in `momentum/.bugfix-plan.md` (CRITICAL/HIGH/MEDIUM/LOW with fix sketches). When you close one, update that file AND this section.

**Closed on 2026-08-15** (see .bugfix-plan.md for STATUS comments):
- **L4** Subject picker now promotes children of soft-deleted parents to top-level options in `getSubjectPickerOptions` (utils.ts), so they are no longer silently dropped from pickers.
- **L6** Modal drag-to-dismiss was already correct in `Modal.tsx` (`mouseDownTargetRef` + click-target check); verified + regression test exists.
- **BUG-185** React #185 from stale SW precache — added a startup `__MOMENTUM_BUILD_ID__` guard in `main.tsx` that reloads when the cached build id differs, forcing a clean fetch of the new bundle.

**Closed on 2026-08-13** (see .bugfix-plan.md for STATUS comments):
- C2, H2, M1, M7, L3, L11, L12

**Closed earlier** (no items re-opened):
- C1, H1, H3, H4, H5, H6, M2, M4, M6, M8, M9, M10, M11, M12, L1, L2, L7, L8, L9, L10

All items from the original bugfix plan are now closed. No open bugs remain.

**Disputed / stale-spec:** L5 (project dropdown) — contradicts Regression Checklist §6; current behavior is correct.


Feature-level open items (from earlier spec, still valid):
- Right-click context actions where appropriate (partially implemented: Dashboard sessions/routines, not Calendar/Marks/Subjects)
- Notifications audit: existing service works correctly for safety/phase/save; no bugs found
- Merge Today + This Week + Today's Schedule widgets into one "Today" widget
- Remove autolog widget from dashboard; convert to popup/modal (autolog widget is already orphaned — not in `DASHBOARD_WIDGETS_METADATA`, so it only renders if a user has it in their persisted layout)
- Remove log-time widget (redundant) — already done; log-time is now a modal triggered by FAB / Cmd+L / N shortcut
- Re-implement freeform dashboard layout (removed in commit 72e50ec; needs fresh design for horizontal packing + cascade-up on removal)
**Closed feature items:** discard-session timer leak, focus tags in study timer, notes before start, activities count toward study time, activity confirmation banner — all already implemented (verified in code).

---

## 13. Build & Deployment

```bash
cd momentum && npm install && npm run dev     # dev server on :5173
cd momentum && npm run build                  # production build
cd momentum && npx tsc --noEmit               # type-check only
cd momentum && npx vitest run                 # tests
**Deployment — mandatory final step of every change:**
- Canonical repo: `https://github.com/momentum-study/momentum.git` (remote `org`).
- Canonical live URL: `https://momentum-study.github.io/momentum/`.
- `origin` = personal fork `leightonmascord/momentum` (development only).
- **Every commit to `org/main` MUST be deployed** to `https://momentum-study.github.io/momentum/`. Verified work that is not deployed is incomplete work.
- **Mobile-responsive design is mandatory for every change:** validate all UI changes at mobile widths. Desktop-only interactions (such as right-click context menus) MUST have a touch-friendly equivalent, such as long-press or a visible kebab/action menu. Notifications MUST remain useful without blocking or overwhelming small screens.
- Release flow — run after a change passes type-check, tests, and production build:
  ```bash
  git push org main
  npm run deploy
  ```
- **Default workflow:** after `npx tsc --noEmit`, `npx vitest run`, and `npm run build` all pass, commit the changes, push to `org/main`, then run `npm run deploy`. Do not stop after a green build — the live site is the deliverable.

- **Semantic versioning is mandatory for app releases:** `MAJOR.MINOR.PATCH` follows SemVer. Increment `PATCH` for bug fixes and small non-breaking corrections, `MINOR` for backward-compatible features or meaningful UX improvements, and `MAJOR` for breaking changes or a substantial new product generation. The app version in `package.json` and `src/lib/version.ts` MUST stay synchronized; Settings MUST display the semantic version without the internal build timestamp. Every release MUST bump the app version according to this rule, and every substantive change MUST be pushed to `org/main` and deployed to the live URL before being reported complete.
- If README/comments mention `leightonmascord.github.io/momentum`, that is stale — correct to `momentum-study.github.io/momentum`.

---

## 14. Maintenance Protocol (self-updating)

This file is designed to evolve. **Every instance that makes a durable change to the codebase MUST update this file in the same change.** This is what keeps "read specs for momentum" sufficient for the next instance.

### 14.1 When to update
Update this file when you:
- Add/remove/rename a **route** (§3) or **nav item** (§3).
- Add/remove/rename a **domain type** or **field** (§4.1).
- Bump the **Dexie version** or change the **schema** (§4.2).
- Add/remove a **settings field** or change a **default** (§5).
- Add/remove a **feature** or change its behavior (§6).
- Add/remove a **shortcut** (§8).
- Change a **UI convention** (§7).
- Discover a **new pitfall** or close an old one (§10, §12).
- Change the **provider hierarchy**, **data flow**, or **sync** (§1).
- Change **build/deploy** (§13).

### 14.2 How to update
- Keep sections numbered and stable. Append, don't rewrite, unless a section is factually wrong.
- When you close a bug, move it from §12 (Pending) to §10 (Pitfalls) as a "fixed" note, or delete it if it's no longer relevant. Update `.bugfix-plan.md` too.
- Record significant user architectural and behavioral decisions in §15.
- When you add a pitfall, write it as: **Symptom** → **Fix** → **Stall trap** (the wrong conclusion a future instance might jump to). This format is what saves time.
- Keep the "Stale-spec warning" callouts when you correct something that was previously wrong — they prevent future instances from reintroducing the old behavior.
- If you change a default or a type, update the inline code blocks in §4/§5 to match exactly.

**SPEC_VERSION: 27** — 2026-08-21 Fixed activity "Attended" sessions using wall-clock instead of `scheduledTime`: `attendActivity` in SchedulePage.tsx now anchors `startAt` to the activity's scheduled time (parsed against today) and computes `endAt = startAt + mins`, so a 50-min 4:30pm activity logged at 6pm records a 4:30pm–5:20pm session that counts toward study time. Falls back to now-minus-duration when no `scheduledTime` (§10.47).
### 14.3 Grounding rule (repeated)
The code is the source of truth. If this file and the code disagree, the code wins — and you MUST update this file to match. Never trust a stale spec over the actual implementation. When you read the code and find this file wrong, fix the file, don't work around the code.

### 14.4 Version stamp
**SPEC_VERSION: 26** — 2026-08-20 Fixed the streak widget "Best" number not reflecting the current streak when it exceeded the previous best. `useStreak` now includes `previewDates` in the `longestStreak` memo and uses `candidate = Math.max(longestStreak, streak)` in the `bestStreak` effect; Dashboard.tsx and ReportsPage.tsx now render `bestStreak` instead of `longestStreak`. The "How streaks work" tooltip also now states the correct freeze rule (5 consecutive logged days → 1 freeze) instead of the stale "one missed day per chain" text. Regression tests added (§10.46). 173 tests pass.
**SPEC_VERSION: 25** — 2026-08-19 Comprehensive soft-delete audit: replaced every remaining `db.sessions.delete(id)` hard-delete with `softDelete(db.sessions, id)` across 7 files (Dashboard.tsx, TodayChecklist.tsx, ActivitiesPage.tsx, RoutinePage.tsx, SchedulePage.tsx + undo/redo handlers). Also added missing `durationSeconds` field to manual log sessions in Dashboard. All 169 tests pass.
**SPEC_VERSION: 24** — 2026-08-19 Added a default "Misc" subject to the first-launch seed data (`seedDefaults` in `app-db.ts`), so new users' Focus Areas list starts with a Misc subject under the Miscellaneous category. Existing installs unaffected (seed only runs when the categories table is empty). §15, §6.2.
**SPEC_VERSION: 23** — 2026-08-19 Fixed current streak dropping to 0 the morning after a run, before the user logged that day: `useStreak` now starts the loop from yesterday when today isn't in `daySet`, so the streak holds through the current day until the user logs (§10.45). Regression tests added in `streak.test.ts`.
**SPEC_VERSION: 22** — 2026-08-18 Fixed (1) habit "Reset Data" now re-anchors `createdAt` so streaks/heatmap reset to zero instead of showing a phantom run back to the original creation date (§10.44); (2) dashboard live-timer interval leak that made the "Today by Subject" percentage flip between including and excluding a newly-created subject (§10.43); (3) dashboard streak tooltip now states the freeze rule (5 consecutive logged days → 1 freeze) instead of the outdated "one missed day forgiven per chain" (§6.1).
**SPEC_VERSION: 21** — 2026-08-18 Fixed four bugs: (1) `FloatingTimerBanner` no longer blocks clicks behind it (pointer-events-none wrapper, §10.40). (2) Habit untick now visually updates — `effectiveHabitLogs` also filters `localLogAdditions` by `localLogDeletions` (§10.39). (3) `longestStreak` in `useStreak` now uses backwards-from-anchor logic matching the current-streak loop, so invariants like longest ≥ current hold (§10.41). (4) HabitsPage shows `<PageSpinner />` during initial load instead of rendering empty state flicker (§10.42). Added regression tests for freeze-cover streak behavior.

**SPEC_VERSION: 20** — 2026-08-18 fixed Habits auto-archive UI (removed archive-after field/banner), added "Last 7 Days" sliding window to AI Review, added axis labels to Reports Daily Trend chart, and added manual deployment instruction to §13.

**SPEC_VERSION: 19** — 2026-08-17 added §13 deployment requirement: every commit to `org/main` SHOULD be deployed to `https://momentum-study.github.io/momentum/`; `npm run deploy` is not optional for substantive changes.
  - *Dashboard*: removed "(+Xm over)" goal-exceeded text (§6.1); capped recent sessions at 3 with a "Show all (N)" modal containing a full scrollable table; streak info moved to an ⓘ button next to the streak number (HoverCard) instead of always-visible text.
**SPEC_VERSION: 32** — 2026-08-22 KebabMenu component, notification scheduler, habit reminders, and mobile-friendly context menus.
**SPEC_VERSION: 33** — 2026-08-22 Added "current session" grouping to the study timer. Consecutive timer runs within 5 minutes, and subject switches mid-session, are now folded into a single session group, displaying total accumulated time and subject breakdown (§10.56). Fixed `SubjectDetailPage` edit handler to correctly recompute routine logs and streak days (§10.57).
**SPEC_VERSION: 34** — 2026-08-22 Fixed React error #310 (hook order violation) in `Dashboard.tsx`: moved `allSessions` and `totalTodayMinutesAll` `useMemo` hooks above the `if (isLoading) return` guard so hook count is constant across renders. Also added §10.58 pitfall documenting this trap for future instances.
**SPEC_VERSION: 35** — 2026-08-22 Fixed routine-tracker false-positive completion: `updateRoutineLogsForSession` used `addedMinutes >= (dayMinutes[sessionDow] ?? 0)` which defaulted to 0 when the routine wasn't scheduled for the session's day of week, causing any partial session to mark the routine as completed. Fix requires `targetMinutes > 0` before allowing `completed = true`. Same fix applied in `revertRoutineLogsForSession`. §10.59.
**SPEC_VERSION: 36** — 2026-08-23 Substantial UI/UX overhaul: Week-start setting; Calendar widget time view; Project weekly goal calculation; Habits UX improvements (popup details, cleared warnings, clear forgiven days); Marks multi-select filter; Schedule filtering/timed routines/ordering; Color selectors.
  - New notification scheduler (`src/lib/notification-scheduler.ts`) — background polling loop for habit reminders, due-date alerts, and study review reminders. Started from `AppLayout` on mount.
  - Habit type: added optional `reminderTime` and `reminderSentDate` fields; Dexie v17 migration; UI field in the habit add/edit form.
  - Context menus added: CalendarPage (assignment rows), ActivitiesPage (activity rows), RoutinePage (routine rows), SubjectDetailPage (session rows with SessionDetailsModal).
  - Dashboard: streak milestone and daily goal browser notifications via `sendNotification`.
  - SPEC provision: "Mobile-responsive design is mandatory for every change" (§13).
**SPEC_VERSION: 31** — 2026-08-21 Fixed `PomodoroTimer` state bleed for `timerRoutineId` and `timerFocusTag` on subject switch, stop, and discard (§10.51). Fixed `focusTag` not persisting/restoring on page reload (§10.52).
**SPEC_VERSION: 30** — 2026-08-21 Timer subject switch now resets "What are you working on?" notes to the new subject's last note instead of carrying over the old subject's text (§10.50).
**SPEC_VERSION: 29** — 2026-08-21 Fixed Today card "last session" text showing "No sessions yet today" when a timer is active (now shows "Currently studying...", §10.48). Fixed streak heatmap showing 0 study minutes until session is saved (now includes live timer minutes for today in real time, §10.49).
  - *Habits*: deduplicated optimistic local log additions vs persisted logs (fixes "2 today" bug); tick mode is now explicit per habit kind (good: green ✓ "Done"; bad: red ✗ "Lapsed") with text labels; auto-archive at N days is gone — habit instead shows a "Have you finished it?" prompt that triggers "Mark as Done" (which sets `finishedAt`); archived habits are no longer auto-archived.
  - *Schedule*: catch-up prompts are now activities-only (routines removed from `catchUpItems`); activity auto-log duration falls back to `activity.duration` when `dayMinutes[dow]` is 0; Weekly Plan grid gained a daily-totals footer row + weekly-total label and rows are now auto-sorted by `scheduledTime`.
  - *Streak freeze rule* (`use-streak.ts` rewritten): every 5 consecutive logged days earns 1 missed-day freeze. The new rule consumes a freeze per missed day; chain breaks when freezes run out. The old "1 missed day per chain" rule is gone.
  - *Categories merged into Focus Areas*: `/categories` route now redirects to `/subjects`; subjects page has a "Manage Categories" button + modal (inline CRUD + cascade delete) and a "+ New" link in the subject form. Categories are still stored as a separate table — migration is not needed.
  - *"Any subject" mode* (`src/lib/subject-mode.ts`): projects and routines can now select "Any subject" (sentinel `ANY_SUBJECT_ID = "__any__"`). The routine-tracker match predicate treats this as a wildcard, so its totals accumulate time from every subject. `getSubjectPathLabel` renders the label "Any subject".
**SPEC_VERSION: 28** — 2026-08-21 Dashboard "Recent Sessions" now shows all non-deleted sessions (not just academic); Today card now displays both academic-total (primary) and all-sessions-today total (secondary). Moved streak mechanics info into the streak info button (HoverCard) and removed duplicate outside text. Added Edit/Delete affordance to sessions in Focus Areas detail view.
  - *Marks page*: multi-select checkboxes (header + per-row), "Compare N marks" button + modal with side-by-side comparison table + weighted average footer.
  - *Reports*: added Consistency score (%), Current Streak 🔥, Best streak, and a new "Time by Project" card.
  - *AI Review* (`src/features/reviews/AIReviewPage.tsx`): prompt now explicitly distinguishes `[future]` days from `[missed]` days so the AI doesn't recommend catch-up plans for days that haven't happened yet; new sections added for marks this period, open assignments (next 7 days), routine adherence, and routine auto-logs. Explicit output-format instructions to produce at most 4 short sections (Headline / What went well / What to improve / Next-week plan).
  - *Rollback infrastructure*: `momentum/CHANGELOG.md` created; `npm run release` script added (tags current version, pushes to `org`, deploys). To rollback: `git checkout v0.20.0 && npm run deploy`.
  - *Right-click context menus*: existing `ContextMenu` component now wired into Subject cards (View/Edit/Delete) and Habit cards (Mark as Done/Pause/Edit/Reset/Delete).
  - *TasksHub sidebar*: removed `/categories` from `NAV_ITEMS` and `DEFAULT_PREFS.hidden` (no longer reachable from the sidebar; `/categories` is a redirect alias).

**SPEC_VERSION: 16** — 2026-08-17 added §0.2 workflow instruction: for medium-to-large task lists, always read the code comprehensively and make a plan before executing; small self-contained tasks may skip planning.

**SPEC_VERSION: 15** — 2026-08-16 reverted the flattened-grid width-button experiment; dashboard restored to the three-column grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`) with `ColumnFloor`/`GhostWidget`. Per-widget width controls (the `{cols}w` button in `DashboardWidget` and the Width −/+ controls in the Customise modal) removed entirely — every widget is one column wide and falls upward into the shortest column (§6.1).

**SPEC_VERSION: 13** — 2026-08-16 pomodoro "Stop & Save" now works while paused: `resetPomodoro()` saves partial focus progress using `goal − remaining` when `pomStartedAt` is null, so users no longer have to discard a paused session to stop the timer; added `resumePomodoro()` so the Resume button and the timer-toggle keyboard shortcut actually resume the paused phase instead of resetting it (§6.8).

**SPEC_VERSION: 12** — 2026-08-16 dashboard Today card gained a last-session line (`formatLastSessionText`, §6.1); fixed grid-reorder flicker by caching `columnItems` by content so SortableContext doesn't re-register on every drag-over; added an editable End field to the session edit modal (editing End recomputes Duration).

**SPEC_VERSION: 11** — 2026-08-16 pomodoro timer now counts up instead of down: `pomSeconds` still tracks remaining internally (phase-transition effect unchanged), display shows `goal − remaining` with the goal in brackets (§6.8).

**SPEC_VERSION: 10** — 2026-08-16 fixed pomodoro break time being counted toward study: `getLiveTimerSeconds()` now only counts elapsed seconds when `phase === 'focus'` (§10.36); added shortBreak/longBreak regression tests.

**SPEC_VERSION: 9** — 2026-08-16 pomodoro config moved from inline panel to a popup `Modal` (`PomodoroConfigForm`) with a Save button (§6.8, §10.35); added `momentum:settings-changed` event dispatched by `settings-store.saveSettings()` so `PomodoroTimer` re-reads settings immediately instead of only at mount.

When you make a substantive update, bump the `SPEC_VERSION` marker below so instances can tell at a glance whether the file is current.
**SPEC_VERSION: 8** — 2026-08-15 added §0.1 "Read specs for momentum" response protocol: a new instance told to read specs must read this file + README + .bugfix-plan, then reply with a short confirmation (app description, SPEC_VERSION, live URL, open-bug status) and wait — no work, no full recap, no unprompted audit.
**SPEC_VERSION: 5** — 2026-08-15 closed L4 (subject picker orphaned children), L6 (verified modal drag-to-dismiss already correct), BUG-185 (build-id reload guard added in `main.tsx`); updated §12 pending bugs list; added §10.32 (log-modal projected total); §10.31 status flipped to "fixed".
**SPEC_VERSION: 4** — 2026-08-13 added §10.23 (freeform removal status), §10.31 (React #185 / stale SW cache), BUG-185 to §12 open items, freeform re-implement to feature backlog; updated §0 step 10 and §6.1 layout line.

### 14.5 Decision & Pitfall Logging (REQUIRED)

Every instance MUST document significant logic pitfalls and durable user decisions as they happen. This is what prevents the same mistake from being repeated by the next instance.

- **Logic pitfalls** (race conditions, duplicate-count bugs, wrong date math, optimistic-state mismatches, etc.) MUST be documented in §10 ("Common Pitfalls, Stalls & Misimplementations") as **Symptom** → **Fix** → **Stall trap** (the wrong conclusion a future instance might jump to). This format is what saves time.
- **User decisions** (architectural choices, behavioral rules, renaming, scope changes, infra conventions) MUST be recorded in §15 ("User Decisions & Preferences") with a concise rationale. Decisions persist across instances and are referenced, not re-litigated.
- **When to add an entry**: as soon as the pitfall is identified or the decision is made, before yielding. Do not batch these for later — they will be forgotten.



---

## 15. User Decisions & Preferences
*This section records durable decisions, architectural constraints, and user preferences that shape the Momentum app's behavior.*

- **Versioning**: No automated stable versioning. Strategy: `CHANGELOG.md` + manual `tag-before-deploy` convention.
- **UI Conventions**:
  - **Right-click / Long-press**: Use `ContextMenu` component for global actions.
  - **Notifications**: Minimal browser-native implementation. Reactive triggers (timer/pomodoro only). No service-worker push (local-first/no server).
  - **Streak Freeze Rule**: 5 consecutive logged days earns 1 missed-day freeze. Automatic consumption. Chain breaks when freezes run out.
- **Feature-Specific Logic**:
  - **Categories**: Merged into "Focus Areas" (subjects).
  - **Subject Mode**: "Any subject" (sentinel `__any__`) treats projects/routines as wildcards to accumulate time from all subjects.
  - **Default Data**: On first launch, `seedDefaults()` seeds default categories (Academic, Hobbies, Miscellaneous) AND a default "Misc" subject under the Miscellaneous category (`subj-seed-0`), so the Focus Areas list is never empty for new users. Existing installs are unaffected (the seed only runs when the categories table is empty).
**SPEC_VERSION: 37** — 2026-08-23 Fixed routine ticking bugs: (1) markDone no longer inflates routine log `actualMinutes` by overwriting timer progress with the full routine target (now preserves existing actualMinutes, creates gap-only session if needed); (2) untick now correctly distinguishes between auto-generated markDone sessions (soft-deleted) and real study sessions (preserved) by matching `source: 'autoRoutine'`.

**SPEC_VERSION: 38** — 2026-08-26 Three changes: (1) Current Session group now shows a "Expiring in Xm" countdown when idle within the 5-minute merge window; when the countdown reaches 0 the group is cleared. (2) Routines configured with "Any subject" (`ANY_SUBJECT_ID`) are now visible in the timer's routine dropdown alongside subject-specific routines, and auto-selected when the selected subject has no matching routines of its own. This makes any-subject routines visible and optional — the user can pick "No routine" to skip. (3) Fixed routine double-counting: when a session has an explicit `routineId`, `updateRoutineLogsForSession` logs only toward that routine instead of also auto-matching any-subject routines. (4) Streak heatmap legend shows concrete time thresholds (`nearThreshold = 75% of daily goal`) and `formatted` labels instead of percentage-based ranges.

**SPEC_VERSION: 39** — 2026-08-28 UX batch: (1) Dashboard "This Week" relabeled "Last 7 Days" with the actual date range shown (it is a rolling 7-day window, not a calendar week). (2) Calendar/Tasks month navigation buttons moved inline next to the month label (← Prev · Month · Today · Next →) and the duplicate month title removed from the cards. (3) Dashboard "Customize" hamburger icon replaced with a labeled `Customize` button using a layout-grid icon (distinct from the sidebar hamburger). (4) AI Review Copy / Open in ChatGPT / Share buttons moved into a sticky bottom bar so they are always visible without scrolling. (5) All `<input type="checkbox">` instances across the app replaced with a shared `Checkbox` component (`src/components/ui/Checkbox.tsx`) that renders rounded, dark-mode-aware, checked-state-styled boxes instead of plain white squares. (6) Routine/Activity row reorder controls restyled from stacked `▲`/`▼` text triangles to horizontal chevron icon buttons in a bordered group. (7) Timer no longer auto-selects any-subject routines — the dropdown lists them but defaults to "No routine" so the user opts in.

**SPEC_VERSION: 40** — 2026-08-28 established user-facing semantic versioning: app version is `0.22.0` for the current UX feature batch; PATCH is for bug fixes, MINOR for backward-compatible features/meaningful UX improvements, MAJOR for breaking/substantial product changes. Settings displays only `vMAJOR.MINOR.PATCH`; the internal build id is not user-facing. Every substantive change must bump the app version, push `org/main`, deploy, and report the displayed version.
**SPEC_VERSION: 41** — 2026-08-28 Fixed "Minified React error #185" (Maximum update depth exceeded) on production build by adding this error to the `ErrorBoundary` reload logic, ensuring that if this hook-order error occurs due to a stale service worker cache, the app reloads to fetch the current bundle. Verified clean build and tests pass.
**SPEC_VERSION: 42** — 2026-08-28 Fixed timer bug where pausing the timer would lose the elapsed progress. The pause functions were persisting a stale React state value (`simplePausedOffset`) instead of the freshly computed elapsed time, so when the timer remounted after navigating away (or the tab was closed), the displayed time was reset to 0. Also fixed the pending-session save-on-close logic so paused time is not silently discarded if the browser is killed while paused. The UI already offers Resume / Save / Discard while paused; the data flow now correctly retains the accumulated time across these actions.
**SPEC_VERSION: 43** — 2026-08-28 Fixed timer pause/resume bug where paused timers displayed idle UI controls (Start button) instead of active ones (Resume/Save/Discard). When a timer was paused, `isTimerActive` computed to `false`, causing the component to render the idle state and invite the user to start a new session (which reset progress). Updated `isTimerActive` to check for retained paused progress, ensuring the active UI remains visible. Verified in production browser reproduction.
**SPEC_VERSION: 44** — 2026-08-28 Added drag-and-drop reordering to the compact weekly plan. Blocks within each day column are now sortable via dnd-kit (`DndContext` + `SortableContext` + `useSortable`), and the new order is persisted to the database by updating each item's `orderIndex`. Blocks with a `scheduledTime` continue to sort by time first; blocks without a time fall back to `orderIndex`.