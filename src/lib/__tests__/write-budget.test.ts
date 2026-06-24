import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordWrites,
  getRemainingBudget,
  hasBudgetFor,
  warnIfNearLimit,
  resetIfNewDay,
} from '../write-budget'

const BUDGET_KEY = 'momentum-write-budget'
const SOFT_CAP = 15_000
const HARD_CAP = 19_000

function getTodayKey(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
}

beforeEach(() => {
  localStorage.clear()
})

describe('getRemainingBudget', () => {
  it('returns full budget when nothing recorded', () => {
    expect(getRemainingBudget()).toBe(HARD_CAP)
  })

  it('decreases after recording writes', () => {
    recordWrites(500)
    expect(getRemainingBudget()).toBe(HARD_CAP - 500)
  })

  it('accumulates across multiple recordWrites calls', () => {
    recordWrites(1000)
    recordWrites(2000)
    expect(getRemainingBudget()).toBe(HARD_CAP - 3000)
  })
})

describe('hasBudgetFor', () => {
  it('returns true when budget is sufficient', () => {
    expect(hasBudgetFor(1000)).toBe(true)
  })

  it('returns true when budget is exactly enough', () => {
    recordWrites(HARD_CAP - 100)
    expect(hasBudgetFor(100)).toBe(true)
  })

  it('returns false when budget is insufficient', () => {
    recordWrites(HARD_CAP - 50)
    expect(hasBudgetFor(100)).toBe(false)
  })
})

describe('recordWrites', () => {
  it('caps used at HARD_CAP', () => {
    recordWrites(HARD_CAP + 5000)
    expect(getRemainingBudget()).toBe(0)
  })

  it('does not go below zero remaining', () => {
    recordWrites(HARD_CAP + 1000)
    expect(getRemainingBudget()).toBe(0)
    // Check the raw budget to confirm it's capped at HARD_CAP
    const raw = JSON.parse(localStorage.getItem(BUDGET_KEY)!)
    expect(raw.used).toBe(HARD_CAP)
  })
})

describe('warnIfNearLimit', () => {
  it('returns true when well under soft cap', () => {
    recordWrites(1000)
    expect(warnIfNearLimit()).toBe(true)
  })

  it('returns true with warning when between soft and hard cap', () => {
    recordWrites(SOFT_CAP + 1)
    expect(warnIfNearLimit()).toBe(true)
  })

  it('returns false when at or above hard cap', () => {
    recordWrites(HARD_CAP)
    expect(warnIfNearLimit()).toBe(false)
  })
})

describe('resetIfNewDay', () => {
  it('resets budget when stored day differs from today', () => {
    // Seed with yesterday's budget
    const yesterday = new Date()
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const yKey = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}`

    localStorage.setItem(BUDGET_KEY, JSON.stringify({ day: yKey, used: 5000 }))

    resetIfNewDay()
    expect(getRemainingBudget()).toBe(HARD_CAP)
  })

  it('preserves budget when stored day matches today', () => {
    const today = getTodayKey()
    localStorage.setItem(BUDGET_KEY, JSON.stringify({ day: today, used: 3000 }))

    resetIfNewDay()
    expect(getRemainingBudget()).toBe(HARD_CAP - 3000)
  })

  it('handles corrupted localStorage data gracefully', () => {
    localStorage.setItem(BUDGET_KEY, 'not-json')
    resetIfNewDay()
    // Should reset to fresh budget
    expect(getRemainingBudget()).toBe(HARD_CAP)
  })
})

describe('integration: write budget lifecycle', () => {
  it('full cycle: record, check, warn, reset', () => {
    expect(getRemainingBudget()).toBe(HARD_CAP)

    recordWrites(SOFT_CAP + 1000)
    expect(hasBudgetFor(3000)).toBe(true)
    expect(warnIfNearLimit()).toBe(true)

    recordWrites(3000)
    expect(hasBudgetFor(1)).toBe(false)
    expect(warnIfNearLimit()).toBe(false)
  })
})
