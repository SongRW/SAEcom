import { describe, expect, it } from 'vitest'
import { getToolCapabilities, computeMarqueeRect, nodesInMarquee, shouldOpenNodeConfig } from '../src/features/script-editor/canvasInteraction'

describe('canvas tool capabilities', () => {
  it('maps each tool to concrete capabilities', () => {
    expect(getToolCapabilities('pointer')).toEqual({
      nodeDrag: true,
      areaPan: true,
      nodeInteractive: true,
      marquee: false
    })
    expect(getToolCapabilities('pan')).toEqual({
      nodeDrag: false,
      areaPan: true,
      nodeInteractive: false,
      marquee: false
    })
    expect(getToolCapabilities('select')).toEqual({
      nodeDrag: true,
      areaPan: false,
      nodeInteractive: true,
      marquee: true
    })
  })
})

describe('marquee selection geometry', () => {
  it('normalizes a drag rect regardless of direction', () => {
    expect(computeMarqueeRect({ x: 100, y: 80 }, { x: 40, y: 200 })).toEqual({
      left: 40, top: 80, right: 100, bottom: 200
    })
  })

  it('selects nodes whose rect intersects the marquee', () => {
    const rects = [
      { id: 'a', rect: { left: 0, top: 0, right: 50, bottom: 50 } },
      { id: 'b', rect: { left: 200, top: 200, right: 260, bottom: 260 } },
      { id: 'c', rect: { left: 30, top: 30, right: 90, bottom: 90 } }
    ]
    const marquee = { left: 20, top: 20, right: 100, bottom: 100 }
    expect(nodesInMarquee(rects, marquee)).toEqual(['a', 'c'])
  })

  it('returns empty when nothing intersects', () => {
    const rects = [{ id: 'a', rect: { left: 0, top: 0, right: 10, bottom: 10 } }]
    expect(nodesInMarquee(rects, { left: 50, top: 50, right: 60, bottom: 60 })).toEqual([])
  })
})

describe('open-config gesture', () => {
  it('opens on native dblclick', () => {
    expect(shouldOpenNodeConfig('dblclick', 0)).toBe(true)
  })
  it('opens on the second click of a sequence', () => {
    expect(shouldOpenNodeConfig('click', 1)).toBe(false)
    expect(shouldOpenNodeConfig('click', 2)).toBe(true)
  })
  it('ignores other event types', () => {
    expect(shouldOpenNodeConfig('pointerdown', 2)).toBe(false)
  })
})
