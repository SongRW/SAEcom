import { describe, expect, it } from 'vitest'
import {
  OUTPUT_DOCK_DEFAULT_HEIGHT,
  OUTPUT_DOCK_MAX_HEIGHT,
  OUTPUT_DOCK_MIN_HEIGHT,
  clampOutputHeight
} from '../src/features/script-editor/components/ScriptOutputPanel'

describe('script output dock height', () => {
  it('keeps a compact default between min and max', () => {
    expect(OUTPUT_DOCK_DEFAULT_HEIGHT).toBeGreaterThanOrEqual(OUTPUT_DOCK_MIN_HEIGHT)
    expect(OUTPUT_DOCK_DEFAULT_HEIGHT).toBeLessThanOrEqual(OUTPUT_DOCK_MAX_HEIGHT)
  })

  it('clamps below min and above max', () => {
    expect(clampOutputHeight(10, 800)).toBe(OUTPUT_DOCK_MIN_HEIGHT)
    expect(clampOutputHeight(9999, 800)).toBe(Math.min(OUTPUT_DOCK_MAX_HEIGHT, Math.floor(800 * 0.72)))
  })

  it('respects shell height so the dock cannot cover the whole canvas', () => {
    expect(clampOutputHeight(400, 300)).toBe(Math.floor(300 * 0.72))
  })
})
