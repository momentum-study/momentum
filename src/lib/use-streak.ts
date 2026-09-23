import { useMemo, useState, useEffect } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import { toLocalDateString } from './utils';
import type { Session } from '../domain/types';

const BEST_STREAK_KEY = 'momentum-best-streak';

/** Consecutive logged days needed to earn one missed-day freeze. */
const DAYS_PER_FREEZE = 5;

export interface StreakStats {
  streak: number;
  longestStreak: number;
  freezesAvailable: number;
  lastLoggedDate: Date | null;
}

/**
 * Chronological streak simulation.
 *
 * Every `DAYS_PER_FREEZE` consecutive logged days earns one missed-day freeze,
 * which the next missed day consumes automatically. A missed day with no
 * freeze banked breaks the chain; counting restarts at the next logged day.
 *
 * The walk runs FORWARDS in time. Walking backwards from today (the previous
 * implementation) credited a freeze earned by a run of logged days to a gap
 * that occurred *before* that run, which is chronologically impossible, and it
 * started at the most recent logged day without checking how stale that day
 * was — so a streak abandoned weeks ago kept reporting its old count.
 *
 * Today is exempt from the trailing gap: the user has until the end of the day
 * to log, so an unlogged today never consumes a freeze or breaks the chain.
 */
export function simulateStreak(days: string[], now: Date): StreakStats {
  if (days.length === 0) {
    return { streak: 0, longestStreak: 0, freezesAvailable: 0, lastLoggedDate: null };
  }

  let count = 0;
  let consecutive = 0;
  let freezes = 0;
  let longest = 0;
  let prev: Date | null = null;
  let lastLogged: Date | null = null;

  // A gap wider than the banked freezes kills the chain outright, so only the
  // comparison matters — no need to walk the gap day by day.
  const consume = (missed: number) => {
    if (missed <= 0) return;
    if (missed > freezes) {
      count = 0;
      consecutive = 0;
      freezes = 0;
    } else {
      freezes -= missed;
      consecutive = 0;
    }
  };

  for (const ds of days) {
    const day = new Date(ds + 'T00:00:00');
    if (prev) consume(differenceInCalendarDays(day, prev) - 1);
    count += 1;
    consecutive += 1;
    if (consecutive === DAYS_PER_FREEZE) {
      freezes += 1;
      consecutive = 0;
    }
    if (count > longest) longest = count;
    lastLogged = day;
    prev = day;
  }

  // Trailing gap: days after the last logged day, excluding today itself.
  if (lastLogged) consume(differenceInCalendarDays(now, lastLogged) - 1);

  return { streak: count, longestStreak: longest, freezesAvailable: freezes, lastLoggedDate: lastLogged };
}

/**
 * Computes current streak, longest streak, available freezes, and best streak.
 * Every five consecutive logged days earns one automatic missed-day freeze.
 */
export function useStreak(sessions: Session[], previewDates: Set<string> = new Set()) {
  const { streak, longestStreak, freezesAvailable, lastLoggedDate } = useMemo(() => {
    const daySet = new Set<string>();
    for (const s of sessions) daySet.add(toLocalDateString(s.startAt));
    for (const d of previewDates) daySet.add(d);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return simulateStreak([...daySet].sort(), now);
  }, [sessions, previewDates]);

  const [bestStreak, setBestStreak] = useState(() => {
    try {
      const stored = localStorage.getItem(BEST_STREAK_KEY);
      return stored ? Number(stored) : 0;
    } catch {
      return 0;
    }
  });
  useEffect(() => {
    // bestStreak MUST reflect the current streak when it exceeds the stored
    // record — otherwise the displayed "Best" can lag behind the live "Today"
    // count (e.g. a live timer previewing today's date), violating the
    // invariant that bestStreak >= streak.
    const candidate = Math.max(longestStreak, streak);
    if (candidate > bestStreak) {
      setBestStreak(candidate);
      try {
        localStorage.setItem(BEST_STREAK_KEY, String(candidate));
      } catch {
        // Ignore storage errors (e.g., private browsing)
      }
    }
  }, [longestStreak, streak, bestStreak]);

  return { streak, longestStreak, bestStreak, freezesAvailable, lastLoggedDate };
}