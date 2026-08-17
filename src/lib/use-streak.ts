import { useMemo, useState, useEffect } from 'react';
import { format, subDays, differenceInCalendarDays } from 'date-fns';
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
    const sortedDays = Array.from(daySet).sort();
    if (sortedDays.length <= 1) return sortedDays.length;

    let max = 1;
    let current = 1;
    let consecutiveLogged = 1;
    let freezes = 0;

    for (let i = 1; i < sortedDays.length; i++) {
      const gapDays = differenceInCalendarDays(
        new Date(sortedDays[i]),
        new Date(sortedDays[i - 1])
      ) - 1;

      if (gapDays <= 0) {
        current++;
        consecutiveLogged++;
      } else if (freezes >= gapDays) {
        freezes -= gapDays;
        current++;
        consecutiveLogged = 1;
      } else {
        if (current > max) max = current;
        current = 1;
        consecutiveLogged = 1;
        freezes = 0;
      }

      if (consecutiveLogged === 5) {
        freezes++;
        consecutiveLogged = 0;
      }
    }

    if (current > max) max = current;
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
