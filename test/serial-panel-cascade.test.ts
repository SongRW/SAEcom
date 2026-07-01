/**
 * 面板级联定位 + legacy 几何解析单测。
 * 验证新建/加载的面板不会 100% 重叠（对应 legacy renderer.js createPane 的级联错位），
 * 以及 legacy 持久化的 left/top/width/height 字段能被正确解析（记住位置和大小）。
 */
import { describe, it, expect } from 'vitest'
import { cascadeGeometry, clampGeometry, DEFAULT_GEOMETRY, MIN_PANEL_SIZE, parseLegacyGeometry, parsePx } from '../src/features/serial-panel/paneViewModel'

describe('cascadeGeometry', () => {
  it('第 0 个面板落在默认起点附近', () => {
    const g = cascadeGeometry(0, { containerW: 1024, containerH: 600 })
    expect(g.w).toBe(DEFAULT_GEOMETRY.w)
    expect(g.h).toBe(DEFAULT_GEOMETRY.h)
    expect(g.x).toBeGreaterThanOrEqual(0)
    expect(g.y).toBeGreaterThanOrEqual(0)
  })

  it('连续多个面板的 (x,y) 互不相同（不全部重叠）', () => {
    const positions = Array.from({ length: 5 }, (_, i) => cascadeGeometry(i, { containerW: 1024, containerH: 600 }))
    const uniq = new Set(positions.map((p) => `${p.x},${p.y}`))
    // 至少 3 个不同位置，证明存在级联错位而非恒定 (30,30)
    expect(uniq.size).toBeGreaterThanOrEqual(3)
  })

  it('面板不溢出工作区右边界', () => {
    const g = cascadeGeometry(3, { containerW: 800, containerH: 500 })
    expect(g.x + g.w).toBeLessThanOrEqual(800)
  })

  it('面板不溢出工作区下边界', () => {
    const g = cascadeGeometry(4, { containerW: 800, containerH: 400 })
    expect(g.y + g.h).toBeLessThanOrEqual(400)
  })

  it('保持最小尺寸', () => {
    const g = cascadeGeometry(10, { containerW: 300, containerH: 200 })
    expect(g.w).toBeGreaterThanOrEqual(MIN_PANEL_SIZE.w)
    expect(g.h).toBeGreaterThanOrEqual(MIN_PANEL_SIZE.h)
  })
})

describe('parseLegacyGeometry / parsePx', () => {
  it('解析带 px 的字符串数值', () => {
    expect(parsePx('964px')).toBe(964)
    expect(parsePx('50')).toBe(50)
    expect(parsePx(42)).toBe(42)
    expect(parsePx('abc')).toBeNull()
    expect(parsePx(undefined)).toBeNull()
  })

  it('完整 legacy 几何（left/top/width/height）转为 PanelGeometry', () => {
    const g = parseLegacyGeometry({ left: '964px', top: '50px', width: '420px', height: '240px' })
    expect(g).toEqual({ x: 964, y: 50, w: 420, h: 240 })
  })

  it('只有 left/top 时，width/height 回退默认', () => {
    const g = parseLegacyGeometry({ left: 100, top: 200 })
    expect(g).toEqual({ x: 100, y: 200, w: DEFAULT_GEOMETRY.w, h: DEFAULT_GEOMETRY.h })
  })

  it('缺 left/top 返回 null（交由级联兜底）', () => {
    expect(parseLegacyGeometry({ width: '420px', height: '240px' })).toBeNull()
    expect(parseLegacyGeometry({})).toBeNull()
  })
})

describe('clampGeometry', () => {
  it('容器内正常几何不变', () => {
    const g = { x: 100, y: 100, w: 420, h: 240 }
    expect(clampGeometry(g, { w: 1280, h: 720 })).toEqual(g)
  })

  it('右下溢出：拉回容器右下角，保证至少最小可见区域', () => {
    // 在大窗（宽 1920）下拖到右下角并保存，重启后窗口只有 1280×720
    const g = { x: 1500, y: 600, w: 420, h: 240 }
    const out = clampGeometry(g, { w: 1280, h: 720 })
    // 面板右边界 ≤ 容器宽
    expect(out.x + out.w).toBeLessThanOrEqual(1280)
    // 面板下边界 ≤ 容器高
    expect(out.y + out.h).toBeLessThanOrEqual(720)
    expect(out.x).toBeGreaterThanOrEqual(0)
    expect(out.y).toBeGreaterThanOrEqual(0)
  })

  it('负坐标：拉回左上角', () => {
    const g = { x: -100, y: -50, w: 420, h: 240 }
    const out = clampGeometry(g, { w: 1280, h: 720 })
    expect(out.x).toBeGreaterThanOrEqual(0)
    expect(out.y).toBeGreaterThanOrEqual(0)
  })

  it('面板比容器还大：收拢到容器内，不放大也不越界', () => {
    const g = { x: 0, y: 0, w: 2000, h: 2000 }
    const out = clampGeometry(g, { w: 300, h: 200 })
    // 收拢后宽度落在 [最小尺寸, 容器宽] 区间，不放大原值也不越界
    expect(out.w).toBeGreaterThanOrEqual(MIN_PANEL_SIZE.w)
    expect(out.w).toBeLessThanOrEqual(300)
    expect(out.h).toBeGreaterThanOrEqual(MIN_PANEL_SIZE.h)
    expect(out.h).toBeLessThanOrEqual(200)
    expect(out.x).toBeGreaterThanOrEqual(0)
    expect(out.y).toBeGreaterThanOrEqual(0)
    expect(out.x + out.w).toBeLessThanOrEqual(300)
    expect(out.y + out.h).toBeLessThanOrEqual(200)
  })

  it('保留可见宽高约束（不会让面板宽度变成 0）', () => {
    // 容器极扁时，宽高仍保持最小尺寸，位置贴边
    const g = { x: 500, y: 500, w: 420, h: 240 }
    const out = clampGeometry(g, { w: 250, h: 150 })
    expect(out.w).toBeGreaterThanOrEqual(MIN_PANEL_SIZE.w)
    expect(out.h).toBeGreaterThanOrEqual(MIN_PANEL_SIZE.h)
    expect(out.x).toBeGreaterThanOrEqual(0)
    expect(out.y).toBeGreaterThanOrEqual(0)
  })
})
