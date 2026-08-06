import { describe, expect, it } from 'vitest'
import {
  buildSerialPanelOptions,
  buildSerialPortOptions,
  CANVAS_PAN_EMPTY_EXTENT,
  CANVAS_ZOOM_ABSOLUTE_MIN,
  CANVAS_ZOOM_MIN,
  clampCanvasZoom,
  computeCanvasPanBounds,
  computeCanvasZoomMin,
  createDefaultReteGraph,
  fitGraphToView,
  groupNodesForPalette,
  MINIMAP_RATIO,
  MINIMAP_SIZE,
  nextDefaultScriptName,
  normalizeScriptName,
  stripScriptExtension
} from '../src/features/script-editor/viewModel'

describe('script editor view model', () => {
  it('groups node definitions for the palette in category order', () => {
    const groups = groupNodesForPalette()

    expect(groups).toHaveLength(12)
    expect(groups[0].key).toBe('input')
    expect(groups.find((group) => group.key === 'compare')?.nodes).toHaveLength(10)
    expect(groups.find((group) => group.key === 'logical')?.nodes.map((node) => node.key)).toEqual([
      'logical-and',
      'logical-or',
      'logical-not'
    ])
  })

  it('normalizes script file names', () => {
    expect(normalizeScriptName('Demo')).toBe('Demo.js')
    expect(normalizeScriptName('Demo.js')).toBe('Demo.js')
    expect(normalizeScriptName('  ')).toBeNull()
  })

  it('creates an empty Rete graph object for new scripts', () => {
    expect(createDefaultReteGraph()).toEqual({ nodes: [], connections: [] })
  })

  it('clamps canvas zoom to a usable range', () => {
    expect(clampCanvasZoom(0.1)).toBe(0.5)
    expect(clampCanvasZoom(1.25)).toBe(1.25)
    expect(clampCanvasZoom(3)).toBe(1.8)
  })

  it('clamps canvas zoom with a dynamic floor for large graphs', () => {
    // 大图允许 min 低于默认 0.5，但仍不低于 ABSOLUTE_MIN。
    expect(clampCanvasZoom(0.2, 0.25)).toBe(0.25)
    expect(clampCanvasZoom(0.05, 0.05)).toBe(CANVAS_ZOOM_ABSOLUTE_MIN)
    expect(clampCanvasZoom(1, 0.2)).toBe(1)
  })

  it('describes inherited serial panel options', () => {
    const options = buildSerialPanelOptions([
      {
        id: 'COM3',
        name: '主串口',
        type: 'serial',
        open: true,
        active: true,
        options: { baudRate: 9600, dataBits: 7, stopBits: 2, parity: 'even' }
      }
    ])

    expect(options[0]).toEqual({
      value: '__current__',
      label: '当前面板：主串口',
      description: 'COM3 · 已打开 · 9600/7/2/even'
    })
  })

  it('builds serial port options from physical serial ports only', () => {
    const options = buildSerialPortOptions(
      [{ path: 'COM9', manufacturer: 'USB' }],
      [
        { id: 'COM3', name: '主串口', type: 'serial', open: true, active: true },
        { id: 'tcp://127.0.0.1:502', name: 'PLC', type: 'tcp', open: true, active: false }
      ]
    )

    expect(options).toEqual([
      { value: 'COM9', label: 'COM9', description: 'USB' }
    ])
  })

  it('returns null when fitting an empty graph', () => {
    expect(fitGraphToView([], { width: 800, height: 600 })).toBeNull()
  })

  it('centers a single small node and clamps zoom to the upper bound', () => {
    const result = fitGraphToView(
      [{ x: 0, y: 0, width: 216, height: 120 }],
      { width: 800, height: 600 }
    )
    // 小节点在 800x600 画布里算出的 zoom 很大，被 clamp 到上限 1.8。
    expect(result?.zoom).toBe(1.8)
    // 仍以包围盒中心 (108, 60) 对准画布中心 (400, 300)。
    expect(result?.x).toBe(800 / 2 - 108 * 1.8)
    expect(result?.y).toBe(600 / 2 - 60 * 1.8)
  })

  it('shrinks zoom below the default floor to fit a wide graph', () => {
    const result = fitGraphToView(
      [{ x: 0, y: 0, width: 2000, height: 200 }],
      { width: 800, height: 600 }
    )
    // 受宽度约束：(800 - 160) / 2000 = 0.32；动态下限允许低于默认 0.5。
    expect(result?.zoom).toBe(0.32)
    // 仍以包围盒中心对准画布中心。
    expect(result?.x).toBeCloseTo(800 / 2 - 1000 * 0.32)
    expect(result?.y).toBeCloseTo(600 / 2 - 100 * 0.32)
  })

  it('keeps default zoom min for small/empty graphs', () => {
    expect(computeCanvasZoomMin([], { width: 800, height: 600 })).toBe(CANVAS_ZOOM_MIN)
    expect(computeCanvasZoomMin(
      [{ x: 0, y: 0, width: 200, height: 100 }],
      { width: 800, height: 600 }
    )).toBe(CANVAS_ZOOM_MIN)
  })

  it('lowers zoom min dynamically so large scripts can still fit', () => {
    // required = (800-160)/4000 = 0.16；headroom 0.9 → 0.144 → 0.14
    const min = computeCanvasZoomMin(
      [{ x: 0, y: 0, width: 4000, height: 400 }],
      { width: 800, height: 600 }
    )
    expect(min).toBeLessThan(CANVAS_ZOOM_MIN)
    expect(min).toBeGreaterThanOrEqual(CANVAS_ZOOM_ABSOLUTE_MIN)
    expect(min).toBe(0.14)
  })
})

describe('minimap constants', () => {
  it('keeps ratio=1 so rete-react-plugin can map X/Y with containerWidth', () => {
    // MiniNode/MiniViewport 用 containerWidth 同时换算 left/top；ratio≠1 会把内容纵向裁切成空白。
    expect(MINIMAP_RATIO).toBe(1)
    expect(MINIMAP_SIZE).toBeGreaterThanOrEqual(200)
  })
})

describe('computeCanvasPanBounds', () => {
  it('returns a loose extent for empty graphs so empty canvas can still pan', () => {
    expect(computeCanvasPanBounds([], { width: 800, height: 600 }, 1)).toEqual({
      left: -CANVAS_PAN_EMPTY_EXTENT,
      top: -CANVAS_PAN_EMPTY_EXTENT,
      right: CANVAS_PAN_EMPTY_EXTENT,
      bottom: CANVAS_PAN_EMPTY_EXTENT
    })
  })

  it('clamps so a small graph stays fully inside the viewport', () => {
    // 图比视口小：视口必须「包含」整张图，节点不会拖出视口。
    // 单节点 (0,0)-(200,100)，padding 默认 320 → graph 世界范围 (-320,-320)-(520,420)
    // zoom=1、容器 800x600：
    // rawLeft  = containerW - graphRight*k = 800 - 520 = 280
    // rawRight = -graphLeft*k = 320
    // rawTop   = containerH - graphBottom*k = 600 - 420 = 180
    // rawBottom= -graphTop*k = 320
    const bounds = computeCanvasPanBounds(
      [{ x: 0, y: 0, width: 200, height: 100 }],
      { width: 800, height: 600 },
      1
    )
    expect(bounds.left).toBe(280)
    expect(bounds.right).toBe(320)
    expect(bounds.top).toBe(180)
    expect(bounds.bottom).toBe(320)
  })

  it('node stays visible at both pan bounds (contain semantics)', () => {
    // 关键性质：把 x 钳到 left 或 right 时，节点屏幕坐标仍在 [0, containerW] 内。
    const node = { x: 100, y: 100, width: 216, height: 120 }
    const container = { width: 1000, height: 700 }
    const zoom = 1
    const bounds = computeCanvasPanBounds([node], container, zoom)
    for (const tx of [bounds.left, bounds.right]) {
      // 节点左缘屏幕坐标
      const screenLeft = node.x * zoom + tx
      const screenRight = (node.x + node.width) * zoom + tx
      expect(screenLeft).toBeGreaterThanOrEqual(-0.01)
      expect(screenRight).toBeLessThanOrEqual(container.width + 0.01)
    }
  })

  it('clamps a large graph inside its own bounds', () => {
    // 图比视口大：视口被限制在图内，看不到图外无限空白。
    // 单节点 (0,0)-(3000,3000)，padding 320 → graph (-320..3320)
    // zoom=1 容器 800x600：
    // rawLeft=800-3320=-2520, rawRight=320
    const bounds = computeCanvasPanBounds(
      [{ x: 0, y: 0, width: 3000, height: 3000 }],
      { width: 800, height: 600 },
      1
    )
    expect(bounds.left).toBe(-2520)
    expect(bounds.right).toBe(320)
    expect(bounds.top).toBe(-2720)
    expect(bounds.bottom).toBe(320)
  })

  it('scales pan limits with zoom so world-space clamp stays consistent', () => {
    const bounds = computeCanvasPanBounds(
      [{ x: 0, y: 0, width: 200, height: 100 }],
      { width: 800, height: 600 },
      0.5
    )
    expect(bounds.left).toBe(160)
    expect(bounds.right).toBe(540)
    expect(bounds.top).toBe(160)
    expect(bounds.bottom).toBe(390)
  })

  it('rejects invalid zoom / container and falls back to empty extent', () => {
    expect(computeCanvasPanBounds(
      [{ x: 0, y: 0, width: 10, height: 10 }],
      { width: 0, height: 600 },
      1
    ).left).toBe(-CANVAS_PAN_EMPTY_EXTENT)
    expect(computeCanvasPanBounds(
      [{ x: 0, y: 0, width: 10, height: 10 }],
      { width: 800, height: 600 },
      0
    ).right).toBe(CANVAS_PAN_EMPTY_EXTENT)
  })
})

describe('nextDefaultScriptName', () => {
  it('returns Script_1.js when no scripts exist', () => {
    expect(nextDefaultScriptName([])).toBe('Script_1.js')
  })

  it('skips names already taken', () => {
    expect(nextDefaultScriptName(['Script_1.js', 'Script_2.js'])).toBe('Script_3.js')
  })

  it('fills the first gap', () => {
    expect(nextDefaultScriptName(['Script_1.js', 'Script_3.js'])).toBe('Script_2.js')
  })

  it('ignores unrelated files', () => {
    expect(nextDefaultScriptName(['notes.js', 'Script_1.js'])).toBe('Script_2.js')
  })
})

describe('stripScriptExtension', () => {
  it('去掉末尾 .js 后缀', () => {
    expect(stripScriptExtension('Foo.js')).toBe('Foo')
  })
  it('无 .js 后缀时原样返回', () => {
    expect(stripScriptExtension('Foo')).toBe('Foo')
  })
  it('只去掉末尾 .js，保留中间的点', () => {
    expect(stripScriptExtension('a.b.js')).toBe('a.b')
  })
  it('大写 .JS 后缀也去掉（大小写不敏感）', () => {
    expect(stripScriptExtension('Foo.JS')).toBe('Foo')
  })
})
