# Momentum — Specifications

> All design decisions and constraints for the Momentum study app. Any build that violates these specs must be fixed before deployment.

---

## 1. Architecture

- **Local-first PWA** — all data stored in IndexedDB via Dexie. No server, no accounts.
- **Stack**: React 18, TypeScript, Vite, Tailwind CSS (class-based dark mode), Dexie, React Router, date-fns
- **Dark mode**: On by default. Class `dark` on `<html>`, toggled by Settings.
- **Data provider**: Single `DataProvider` context wraps the entire app. `useData()` returns `{ data, isLoading, loadData }`.

## 2. App Name

**Momentum** — branded in the sidebar and `<title>`.

## 3. Routes (19)

| Path | Page | Description |
|------|------|-------------|
| `/` | Dashboard | Stats, streak, daily goal, timer widget, heatmap, recent sessions |
| `/subjects` | SubjectsPage | CRUD subjects with category, color, routine, weekly target |
| `/projects` | ProjectsPage | CRUD projects with subject, description, goal minutes |
| `/projects/:id` | ProjectDetailPage | Per-project sessions, assignments, and progress |
| `/routines` | RoutinePage | Daily routine scheduler with weekly progress |
| `/marks` | MarksPage | Mark tracker for academic subjects with weighted average |
| `/habits` | HabitsPage | Good/bad habit tracker with streaks, 7-day view, 90-day heatmap |
| `/hobbies` | HobbiesPage | Non-academic activity tracker |
| `/study` | StudyPage | Spaced-repetition area overview |
| `/study/review` | ReviewSessionPage | FSRS review session for study areas |
| `/study/log` | ReviewLogPage | Log study area activity |
| `/study/exam` | ExamConfigPage | Configure exam-mode compression |
| `/groups` | GroupsPage | Group leaderboards and cloud session sharing |
| `/groups/:id` | GroupDetailPage | Per-group session list and member stats |
| `/calendar` | CalendarPage | Monthly calendar with assignments + upcoming list |
| `/categories` | CategoriesPage | CRUD categories (academic/general) with color picker |
| `/reports` | ReportsPage | Overview stats and time-by-subject breakdown |
| `/reviews` | AIReviewPage | AI-powered study review and feedback |
| `/settings` | SettingsPage | Dark mode, pomodoro config, daily target, sound, reset |

## 4. Data Model

### Core Entities (v1)

| Entity | Key Fields | Dexie Indexes |
|--------|-----------|---------------|
| Category | id, name, scope (`academic`/`nonAcademic`), color | `id, scope, name` |
| Subject | id, categoryId, name, color, routine? (0-6 days), weeklyTargetMinutes? | `id, categoryId, name` |
| Project | id, subjectId, name, description?, goalMinutes? | `id, subjectId, name` |
| Task | id, projectId, name, orderIndex, done | `id, projectId, orderIndex` |
| Session | id, subjectId, projectId?, startAt, endAt, durationMinutes, source | `id, subjectId, projectId, startAt` |
| ProgressLog | id, subjectId, loggedAt, value, unit? | `id, subjectId, loggedAt` |

### Extended Entities (v2)

| Entity | Key Fields | Dexie Indexes |
|--------|-----------|---------------|
| Mark | id, subjectId, name, score, total, weight, date | `id, subjectId, date` |
| Assignment | id, subjectId, title, dueDate, type, completed | `id, subjectId, dueDate, completed` |
| Habit | id, name, kind (`good`/`bad`), color | `id, kind` |
| HabitLog | id, habitId, date (YYYY-MM-DD), note? | `id, habitId, date` |
| StreakDay | id (YYYY-MM-DD), totalMinutes, goalMet | `id, totalMinutes, goalMet` |

### Soft Deletes

All entities have an optional `deletedAt` field.

## 5. Features

### 5.1 Dashboard
- **Stat cards**: Today, This Week, Total, Sessions count
- **Study Streak**: Consecutive days with study activity. Weekly view with fire emoji.
- **Daily Goal**: Progress bar toward configurable daily target (default 120 min). Green on completion.
- **Study Timer Widget**: (see §5.8)
- **Study Heatmap**: 90-day grid, 5 intensity levels (slate → green-600).
- **Recent Sessions**: Last 8 sessions with subject name and duration.

### 5.2 Subjects (CRUD)
- Grid of subject cards with color dot, name, category
- Add/Edit modal: name, category select (with "+ New" link to /categories), **ColorPicker** (presets + custom color wheel), routine checkboxes, weekly target
- Warning banner if no categories exist yet
- Delete with confirmation

### 5.3 Projects (CRUD)
- Grid with name, subject, description, goal minutes
- Add/Edit modal with subject select, description, goal minutes
- Delete with confirmation

### 5.4 Mark Tracker
- Table: Name, Subject, Score/Total, Weight, Weighted %, Date
- Summary: total marks, weighted average = `sum(score/total * weight) / sum(weight)`
- Score color: green ≥80%, yellow ≥50%, red <50%
- Academic subjects starred in select

### 5.5 Habit Tracker
- Good Habits / Bad Habits sections
- Habit cards: color dot, name, streak, last-7-day dots, today toggle
- Select a habit to view 90-day calendar heatmap
- Add/Edit modal with **ColorPicker**

### 5.6 Assignment Calendar
- Monthly grid with colored dots per type (homework=blue, assignment=purple, exam=red, other=slate)
- Upcoming list (next 30 days) with type badge, completed toggle
- CRUD with type select and description

### 5.7 Categories (CRUD)
- Academic / General sections
- Add/Edit modal with name, scope, **ColorPicker**
- Shows subject count per category
- Delete warns about orphaned subjects

### 5.8 Pomodoro / Study Timer Widget
- **Two modes**: Simple (count-up) and Pomodoro (countdown focus/break)
- **Mode toggle**: Simple always available; Pomodoro shown only when `settings.pomodoroEnabled = true`
- **Simple mode**: Start → live elapsed display → Stop & Save (logs a Session, min 10s)
- **Pomodoro mode**:
  - Focus phase → auto-logs a Session on completion
  - Short break / Long break phases (configurable cycles before long break)
  - Start / Pause / Reset controls
  - Cycle indicator dots (filled = completed focus blocks)
  - Sound notification on phase change (when `settings.soundEnabled`)
  - **Inline config (⚙️ gear icon)**: Edit Focus, Short Break, Long Break, Cycles, Sound directly on the timer card. Disabled while timer is running. Changes persist to localStorage and sync with the Settings page.
- **Subject selector**: Required to start either mode

### 5.9 Settings
- Dark mode toggle (on by default)
- Pomodoro: enable toggle, focus minutes, short break, long break, cycles before long break
- Sound notification toggle
- Daily target minutes
- Reset settings button

## 6. Settings Storage

localStorage key: `momentum-settings`

```typescript
type Settings = {
  darkMode: boolean                           // default: true
  pomodoroEnabled: boolean                    // default: true
  pomodoroFocusMinutes: number                // default: 25
  pomodoroBreakMinutes: number                // default: 5
  pomodoroLongBreakMinutes: number            // default: 15
  pomodoroCyclesBeforeLongBreak: number       // default: 4
  dailyTargetMinutes: number                  // default: 120
  soundEnabled: boolean                       // default: true
}
```

## 7. UI Conventions

- **Shared components**: `ColorPicker` (presets + `<input type="color">`), `Card`, `Button`, `Modal`, `Spinner`, `EmptyState`
- **CSS classes**: `btn-primary`, `btn-secondary`, `btn-danger`, `input`, `label`, `card`
- **Dark mode**: `dark:` Tailwind prefix, class on `<html>`
- **12 preset colors**: `#6366f1, #8b5cf6, #3b82f6, #06b6d4, #10b981, #f59e0b, #ef4444, #ec4899, #14b8a6, #f97316, #8b5cf6, #64748b`
- **Custom color**: `<input type="color">` for infinite customisable colours on all color pickers

## 8. DB Schema Versions

- **v1**: categories, subjects, projects, tasks, sessions, progressLogs
- **v2**: + marks, assignments, habits, habitLogs, streakDays

## 9. Build

```bash
cd momentum && npm install && npm run dev     # dev server on :5173
cd momentum && npm run build                  # production build
```

## 10. Deployment

- **Canonical repo**: `https://github.com/momentum-study/momentum.git`
- **Canonical live URL**: `https://momentum-study.github.io/momentum/`
- The local repo may also have a personal-fork remote (`origin`) pointing at `leightonmascord/momentum`, but **future pushes and deployments must target `momentum-study`**.
- Recommended remote names:
  - `org` → `https://github.com/momentum-study/momentum.git`
  - `origin` → personal fork (optional)
- Release flow:

```bash
git push org main
npm run deploy
```

- If README or comments mention `leightonmascord.github.io/momentum`, that is stale and should be corrected to `momentum-study.github.io/momentum`.
