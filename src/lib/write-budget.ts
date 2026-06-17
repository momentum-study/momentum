// Daily write budget tracker for Firestore Spark plan (20K writes/day).
// Tracks writes per day (UTC midnight reset) and provides quota guards.

const BUDGET_KEY = 'momentum-write-budget'
const SOFT_CAP = 15_000   // warn + throttle
const HARD_CAP = 19_000   // block non-essential syncs

interface WriteBudget {
  day: string      // YYYY-MM-DD
  used: number
}

function getTodayKey(): string {
  // Use UTC date to avoid timezone edge cases
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
}

function getBudget(): WriteBudget {
  try {
    const raw = localStorage.getItem(BUDGET_KEY)
    if (!raw) return { day: getTodayKey(), used: 0 }
    const parsed = JSON.parse(raw) as WriteBudget
    if (parsed.day === getTodayKey()) return parsed
    // New day — reset
    return { day: getTodayKey(), used: 0 }
  } catch {
    return { day: getTodayKey(), used: 0 }
  }
}

function saveBudget(budget: WriteBudget) {
  try {
    localStorage.setItem(BUDGET_KEY, JSON.stringify(budget))
  } catch (e) {
    console.warn('[Budget] Failed to save budget:', e)
  }
}

export function resetIfNewDay(): void {
  const budget = getBudget()
  if (budget.day !== getTodayKey()) {
    saveBudget({ day: getTodayKey(), used: 0 })
  }
}

export function recordWrites(count: number): void {
  const budget = getBudget()
  budget.used = Math.min(budget.used + count, HARD_CAP) // cap to avoid overflow
  saveBudget(budget)
}

export function getRemainingBudget(): number {
  const budget = getBudget()
  return HARD_CAP - budget.used
}

export function hasBudgetFor(count: number): boolean {
  const budget = getBudget()
  return budget.used + count <= HARD_CAP
}

export function warnIfNearLimit(): boolean {
  const budget = getBudget()
  if (budget.used >= SOFT_CAP && budget.used < HARD_CAP) {
    console.warn(`[Budget] Daily write budget warning: ${budget.used}/${HARD_CAP} used`)
    return true
  }
  if (budget.used >= HARD_CAP) {
    console.error(`[Budget] Daily write budget exceeded: ${budget.used}/${HARD_CAP} used`)
    return false
  }
  return true
}
