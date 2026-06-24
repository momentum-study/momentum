import { useMemo, useState, useEffect } from 'react';
import { format, subDays, differenceInCalendarDays } from 'date-fns';
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
      daySet.add(format(new Date(s.startAt), 'yyyy-MM-dd'));
    }
    let count = 0;
    let missed = 0;
    let d = new Date();
    while (true) {
      const ds = format(d, 'yyyy-MM-dd');
      if (daySet.has(ds)) {
        count++;
        missed = 0;
        d = subDays(d, 1);
      } else {
        missed++;
        if (missed > 1) break;
        d = subDays(d, 1);
      }
    }
    return count;
  }, [sessions]);

  // Longest streak ever in the dataset
  const longestStreak = useMemo(() => {
    if (sessions.length === 0) return 0;
    const daySet = new Set<string>();
    for (const s of sessions) {
      daySet.add(format(new Date(s.startAt), 'yyyy-MM-dd'));
    }
    const sortedDays = Array.from(daySet).sort();
    let max = 0;
    let cur = 1;
    for (let i = 1; i < sortedDays.length; i++) {
      const diff = differenceInCalendarDays(
        new Date(sortedDays[i]),
        new Date(sortedDays[i - 1])
      );
      if (diff === 1) {
        cur++;
        if (cur > max) max = cur;
      } else {
        cur = 1;
      }
    }
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