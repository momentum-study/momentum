import { useMemo, useState, useEffect } from 'react';
import { format, subDays } from 'date-fns';
import { toLocalDateString } from './utils';
import type { Session } from '../domain/types';

const BEST_STREAK_KEY = 'momentum-best-streak';

/**
 * Computes current streak, longest streak, available freezes, and best streak.
 * Every five consecutive logged days earns one automatic missed-day freeze.
 */
export function useStreak(sessions: Session[], previewDates: Set<string> = new Set()) {
  const { streak, freezesAvailable } = useMemo(() => {
    const daySet = new Set<string>();
    for (const s of sessions) daySet.add(toLocalDateString(s.startAt));
    for (const d of previewDates) daySet.add(d);
    let count = 0;
    let consecutiveLogged = 0;
    let freezes = 0;
    let d = new Date();
    // If today isn't logged, start checking from yesterday so the streak
    // doesn't immediately break when today is empty.
    const todayStr = format(d, 'yyyy-MM-dd');
    if (!daySet.has(todayStr)) {
      d = subDays(d, 1);
    }
    while (true) {
      const ds = format(d, 'yyyy-MM-dd');
      if (daySet.has(ds)) {
        count++;
        consecutiveLogged++;
        if (consecutiveLogged === 5) {
          freezes++;
          consecutiveLogged = 0;
        }
      } else if (freezes > 0) {
        freezes--;
        consecutiveLogged = 0;
      } else {
        break;
      }
      d = subDays(d, 1);
    }

    return { streak: count, freezesAvailable: freezes };
  }, [sessions, previewDates]);

  const longestStreak = useMemo(() => {
    const daySet = new Set<string>();
    for (const s of sessions) daySet.add(toLocalDateString(s.startAt));
    if (daySet.size === 0) return 0;
    if (daySet.size === 1) return 1;

    // B2 fix — compute the longest streak by trying each logged day as the
    // "anchor" and counting backwards from it using the same freeze logic as
    // the current-streak loop. The previous chronological approach was
    // inconsistent: it couldn't use a freeze earned mid-run for a gap that
    // occurred earlier (chronologically) in that run, so it undercounted
    // streaks that included a frozen day before the 5th consecutive day.
    const sortedDays = Array.from(daySet).sort();
    let max = 0;
    for (const anchor of sortedDays) {
      let count = 0;
      let consecutiveLogged = 0;
      let freezes = 0;
      let d = new Date(anchor + 'T00:00:00');
      while (true) {
        const ds = format(d, 'yyyy-MM-dd');
        if (daySet.has(ds)) {
          count++;
          consecutiveLogged++;
          if (consecutiveLogged === 5) {
            freezes++;
            consecutiveLogged = 0;
          }
        } else if (freezes > 0) {
          freezes--;
          consecutiveLogged = 0;
        } else {
          break;
        }
        d = subDays(d, 1);
      }
      if (count > max) max = count;
    }
    return max;
  }, [sessions]);

  const [bestStreak, setBestStreak] = useState(() => {
    try {
      const stored = localStorage.getItem(BEST_STREAK_KEY);
      return stored ? Number(stored) : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    if (longestStreak > bestStreak) {
      setBestStreak(longestStreak);
      try {
        localStorage.setItem(BEST_STREAK_KEY, String(longestStreak));
      } catch {
        // Ignore storage errors (e.g., private browsing)
      }
    }
  }, [longestStreak, bestStreak]);

  return { streak, longestStreak, bestStreak, freezesAvailable };
}
