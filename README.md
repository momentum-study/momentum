# Momentum

Local-first PWA study tracker with timer, assignments, marks, habits, and reports.

All data is stored in your browser — no accounts, no server, no cloud. Works offline.
## Live
Use it now at **https://leightonmascord.github.io/momentum/**
Works on desktop and mobile. Installable as a PWA from your browser's address bar.

## Features

- **Dashboard** — today/week/total stats, study streak, daily goal progress, heatmap, recent sessions
- **Focus Areas** — subjects grouped by category with colour, routine, and weekly target
- **Projects** — track projects under subjects with goal minutes
- **Marks** — grade tracker with weighted averages for academic subjects
- **Habits** — good/bad habit tracker with streaks, 7-day view, and 90-day heatmap
- **Tasks** — assignment calendar with due dates, type filters, and weighted grading
- **Categories** — academic/general groups for organising focus areas
- **Reports** — time-by-subject breakdown
- **Settings** — dark mode, pomodoro config, daily target, sound, backup/restore

## Install

Requires [Node.js](https://nodejs.org/) 18+ and npm.

```bash
git clone https://github.com/leightonmascord/momentum.git
cd momentum
npm install
```

## Run

```bash
npm run dev
```

Opens at `http://localhost:5173`.

## Build

```bash
npm run build
npm run preview
```

Produces a production build in `dist/` with a PWA service worker for offline use.

## Tech Stack

- React 18, TypeScript, Vite
- Tailwind CSS (class-based dark mode)
- Dexie (IndexedDB)
- React Router, date-fns
- vite-plugin-pwa (service worker + manifest)

## License

MIT
