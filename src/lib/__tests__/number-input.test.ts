import { describe, it, expect } from 'vitest'

describe('Number input logic', () => {
  it('should display "1" not empty when value is 1', () => {
    const value: number = 1
    const displayValue: string = value === 0 ? '' : String(value)
    expect(displayValue).toBe('1')
  })
  it('should display empty when value is 0', () => {
    const value: number = 0
    const displayValue: string = value === 0 ? '' : String(value)
    expect(displayValue).toBe('')
  })
  it('should update state correctly when user types', () => {
    // Simulate the onChange handler pattern
    let duration: number = 0
    function onChange(v: string) {
      if (v === '') { duration = 0; return }
      const n = Number(v)
      if (isNaN(n)) return
      duration = Math.max(1, n)
    }
    // User types "1"
    onChange('1')
    expect(duration).toBe(1)
    // Display value for duration=1
    expect(duration === 0 ? '' : String(duration)).toBe('1')
    // Clear the input
    onChange('')
    expect(duration).toBe(0)
    expect(duration === 0 ? '' : String(duration)).toBe('')
  })
})
