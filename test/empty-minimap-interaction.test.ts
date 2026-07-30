import { describe, expect, it } from 'vitest'
import { computeTranslateDelta, computeWheelZoom } from '../src/features/script-editor/useEmptyMinimapInteraction'

describe('empty minimap interaction helpers', () => {
  it('computeTranslateDelta: 把 minimap 上的像素位移原样转为画布平移量（dx,dy），视口跟随取反', () => {
    // 拖动向右下 10,5 像素 → 画布 translate(-10, -5)
    expect(computeTranslateDelta(10, 5)).toEqual({ dx: -10, dy: -5 })
  })

  it('computeTranslateDelta: 左上拖动取正', () => {
    expect(computeTranslateDelta(-8, -3)).toEqual({ dx: 8, dy: 3 })
  })

  it('computeWheelZoom: deltaY<0 向前放大', () => {
    // 与 WindowsWheelZoom / wheelZoomDelta 一致：向前放大
    const next = computeWheelZoom(1, -100)
    expect(next).toBeGreaterThan(1)
    expect(next).toBeLessThanOrEqual(1.8)
  })

  it('computeWheelZoom: deltaY>0 向后缩小', () => {
    const next = computeWheelZoom(1, 100)
    expect(next).toBeLessThan(1)
    expect(next).toBeGreaterThanOrEqual(0.5)
  })

  it('computeWheelZoom: 极限值被 clamp', () => {
    expect(computeWheelZoom(0.5, 1000)).toBe(0.5)
    expect(computeWheelZoom(1.8, -1000)).toBe(1.8)
  })
})
