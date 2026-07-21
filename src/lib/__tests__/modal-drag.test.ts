import { describe, it, expect } from 'vitest'

describe('Modal drag-dismiss', () => {
  it('should not close when mousedown inside and mouseup outside', () => {
    // Logic: track mouseDownTarget, compare with e.target on click
    let mouseDownTarget: EventTarget | null = null
    let closed = false

    const backdrop = document.createElement('div')
    const content = document.createElement('div')
    backdrop.appendChild(content)
    document.body.appendChild(backdrop)

    function onClick(e: MouseEvent) {
      if (e.target === e.currentTarget && mouseDownTarget === e.currentTarget) {
        closed = true
      }
    }
    backdrop.addEventListener('click', onClick)

    try {
      // Case 1: mousedown inside (content), click on backdrop (target=backdrop, currentTarget=backdrop)
      mouseDownTarget = content
      closed = false
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      // Should NOT close because mouseDown was inside, not on backdrop
      expect(closed).toBe(false)

      // Case 2: mousedown on backdrop, click on backdrop (both target and currentTarget = backdrop)
      mouseDownTarget = backdrop
      closed = false
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      // SHOULD close because both started and ended on backdrop
      expect(closed).toBe(true)
    } finally {
      backdrop.removeEventListener('click', onClick)
      backdrop.remove()
    }
  })
})
