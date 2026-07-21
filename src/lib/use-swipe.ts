import { useRef, useCallback } from 'react'

interface SwipeHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
}

export function useSwipe({ onSwipeLeft, onSwipeRight }: SwipeHandlers) {
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const touchEnd = useRef<{ x: number; y: number } | null>(null)
  const MIN_SWIPE = 80

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchEnd.current = null
    touchStart.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY }
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    touchEnd.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY }
  }, [])

  const onTouchEnd = useCallback(() => {
    if (!touchStart.current || !touchEnd.current) return
    const dx = touchEnd.current.x - touchStart.current.x
    const dy = touchEnd.current.y - touchStart.current.y
    if (Math.abs(dx) < MIN_SWIPE || Math.abs(dx) < Math.abs(dy)) return
    if (dx > 0) onSwipeRight?.()
    else onSwipeLeft?.()
  }, [onSwipeLeft, onSwipeRight])

  return { onTouchStart, onTouchMove, onTouchEnd }
}
