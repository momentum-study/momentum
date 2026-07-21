import { useMemo, useState, useEffect } from 'react';
import { format, subDays, differenceInCalendarDays } from 'date-fns';
import { toLocalDateString } from './utils';
import type { Session } from '../domain/types';

const BEST_STREAK_KEY = 'momentum-best-streak';

/**
 * Computes current streak, longest streak, and best (persisted) streak from sessions.
 *
 * @param sessions - Array of Session objects (typically already filtered to academic & non-deleted)
 * @returns { streak: number, longestStreak: number, bestStreak: number }
 */
export function useStreak(sessions: Session[]) {
  // Current streak: consecutive days up to today (allowing one gap)
  const streak = useMemo(() => {
    const daySet = new Set<string>();
    for (const s of sessions) {
      daySet.add(toLocalDateString(s.startAt));
    }
    let count = 0;
    let missed = 0;
    let d = new Date();
    while (true) {
      const ds = format(d, 'yyyy-MM-dd');
      if (daySet.has(ds)) {
        count++;
        // missed is NOT reset — one gap per chain
        d = subDays(d, 1);
      } else {
        missed++;
        if (missed > 1) break;
        d = subDays(d, 1);
      }
    }
    return count;
  }, [sessions]);

  // Longest streak ever in the dataset — same one-gap-per-chain rule
  const longestStreak = useMemo(() => {
    const daySet = new Set<string>();
    for (const s of sessions) {
      daySet.add(toLocalDateString(s.startAt));
    }
    const sortedDays = Array.from(daySet).sort();
    if (sortedDays.length <= 1) return 0;
    let max = 0;
    let cur = 1;
    let chainMissed = 0;
    for (let i = 1; i < sortedDays.length; i++) {
      const diff = differenceInCalendarDays(
        new Date(sortedDays[i]),
        new Date(sortedDays[i - 1])
      );
      if (diff === 1) {
        cur++;
        if (cur > max) max = cur;
        chainMissed = 0;
      } else if (diff === 2) {
        chainMissed++;
        if (chainMissed > 1) {
          if (cur > max) max = cur;
          cur = 1;
          chainMissed = 0;
        } else {
          cur++;
          if (cur > max) max = cur;
        }
      } else {
        if (cur > max) max = cur;
        cur = 1;
        chainMissed = 0;
      }
    }
    if (cur > max) max = cur;
    return max;
  }, [sessions]);

  // Persisted best streak, initialized from localStorage
  const [bestStreak, setBestStreak] = useState(() => {
    try {
      const stored = localStorage.getItem(BEST_STREAK_KEY);
      return stored ? Number(stored) : 0;
    } catch {
      return 0;
    }
  });

  // Update best streak if longestStreak exceeds it
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

  return { streak, longestStreak, bestStreak };
}