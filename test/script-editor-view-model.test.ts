import { describe, expect, it } from 'vitest'
import {
  buildSerialPanelOptions,
  buildSerialPortOptions,
  clampCanvasZoom,
  createDefaultReteGraph,
  fitGraphToView,
  groupNodesForPalette,
  nextDefaultScriptName,
  normalizeScriptName,
  stripScriptExtension
} from '../src/features/script-editor/viewModel'

describe('script editor view model', () => {
  it('groups node definitions for the palette in category order', () => {
    const groups = groupNodesForPalette()

    expect(groups).toHaveLength(9)
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

  it('shrinks zoom to fit a wide graph inside the viewport', () => {
    const result = fitGraphToView(
      [{ x: 0, y: 0, width: 2000, height: 200 }],
      { width: 800, height: 600 }
    )
    // 受宽度约束：(800 - 160) / 2000 = 0.32，被 clamp 到下限 0.5。
    expect(result?.zoom).toBe(0.5)
    // 仍以包围盒中心对准画布中心。
    expect(result?.x).toBeCloseTo(800 / 2 - 1000 * 0.5)
    expect(result?.y).toBeCloseTo(600 / 2 - 100 * 0.5)
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
