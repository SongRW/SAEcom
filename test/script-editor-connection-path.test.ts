import { describe, expect, it } from 'vitest'
import {
  ARRANGE_LAYOUT_OPTIONS,
  orthogonalConnectionPath
} from '../src/features/script-editor/rete/connectionPath'

describe('script editor connection path', () => {
  it('exposes layered arrange options that favor crossing minimization', () => {
    expect(ARRANGE_LAYOUT_OPTIONS['elk.algorithm']).toBe('layered')
    expect(ARRANGE_LAYOUT_OPTIONS['elk.direction']).toBe('RIGHT')
    expect(ARRANGE_LAYOUT_OPTIONS['elk.layered.crossingMinimization.strategy']).toBe('LAYER_SWEEP')
    expect(ARRANGE_LAYOUT_OPTIONS['elk.layered.crossingMinimization.semiInteractive']).toBe('true')
    expect(ARRANGE_LAYOUT_OPTIONS['elk.layered.considerModelOrder.strategy']).toBe('NODES_AND_EDGES')
    expect(ARRANGE_LAYOUT_OPTIONS['elk.separateConnectedComponents']).toBe('false')
    expect(ARRANGE_LAYOUT_OPTIONS['elk.edgeRouting']).toBe('ORTHOGONAL')
  })

  it('draws a straight segment for nearly horizontal forward links', () => {
    expect(orthogonalConnectionPath({ x: 0, y: 10 }, { x: 120, y: 10 })).toBe('M 0 10 L 120 10')
  })

  it('uses a rounded horizontal-vertical-horizontal path for forward links', () => {
    const path = orthogonalConnectionPath({ x: 0, y: 0 }, { x: 200, y: 80 }, 12)
    expect(path.startsWith('M 0 0')).toBe(true)
    expect(path).toContain('Q')
    expect(path.endsWith('L 200 80')).toBe(true)
    // 中线在两端之间
    expect(path).toContain('100')
  })

  it('routes backward links through an outer mid-x instead of crossing nodes', () => {
    const path = orthogonalConnectionPath({ x: 200, y: 20 }, { x: 40, y: 100 }, 12)
    expect(path.startsWith('M 200 20')).toBe(true)
    expect(path.endsWith('L 40 100')).toBe(true)
    // 回边 midX 应落在 min(x)-out 一侧（left = 40-36 = 4）
    expect(path).toContain(' Q 4 ')
  })

  it('falls back to sharp elbows when radius cannot fit', () => {
    // |dy|=1 → r 被压到 0.5 < 1，走直角折线；x 反向触发外绕 midX=46
    const path = orthogonalConnectionPath({ x: 0, y: 0 }, { x: 10, y: 1 }, 12)
    expect(path).toBe('M 0 0 L 46 0 L 46 1 L 10 1')
  })
})
