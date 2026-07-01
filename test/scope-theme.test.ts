import { describe, expect, it, beforeEach, vi } from 'vitest'
import { readTheme, buildSeriesStyles } from '../src/features/oscilloscope/components/theme'

describe('scope theme', () => {
  beforeEach(() => {
    // mock getComputedStyle 返回 globals.css 的变量值
    const vars: Record<string, string> = {
      '--background': 'oklch(0.148 0.004 228.8)',
      '--border': 'oklch(1 0 0 / 10%)',
      '--muted-foreground': 'oklch(0.723 0.014 214.4)',
      '--chart-1': 'oklch(0.855 0.138 181.071)',
      '--chart-2': 'oklch(0.704 0.14 182.503)',
      '--chart-3': 'oklch(0.6 0.118 184.704)',
      '--chart-4': 'oklch(0.511 0.096 186.391)',
      '--chart-5': 'oklch(0.437 0.078 188.216)'
    }
    const fakeStyle = { getPropertyValue: (name: string) => vars[name] ?? '' }
    // node 测试环境无 document，注入最小桩
    vi.stubGlobal('document', { documentElement: {} })
    vi.stubGlobal('getComputedStyle', () => fakeStyle)
  })

  it('reads background, grid, text from CSS variables', () => {
    const t = readTheme()
    expect(t.bg).toBe('oklch(0.148 0.004 228.8)')
    expect(t.grid).toBe('oklch(1 0 0 / 10%)')
    expect(t.text).toBe('oklch(0.723 0.014 214.4)')
  })

  it('reads 5 chart series colors', () => {
    const t = readTheme()
    expect(t.series).toHaveLength(5)
    expect(t.series[0]).toBe('oklch(0.855 0.138 181.071)')
    expect(t.series[4]).toBe('oklch(0.437 0.078 188.216)')
  })

  it('buildSeriesStyles cycles colors for channels beyond 5 and alternates line style', () => {
    const styles = buildSeriesStyles(readTheme(), 8)
    expect(styles).toHaveLength(8)
    // 通道 0-4 用 chart-1..5
    expect(styles[0].stroke).toBe('oklch(0.855 0.138 181.071)')
    expect(styles[4].stroke).toBe('oklch(0.437 0.078 188.216)')
    // 通道 5-7 循环复用 chart-1..3
    expect(styles[5].stroke).toBe('oklch(0.855 0.138 181.071)')
    expect(styles[7].stroke).toBe('oklch(0.6 0.118 184.704)')
    // 第 6 个起（index>=5）用虚线区分
    expect(styles[4].dash).toBeUndefined()
    expect(styles[5].dash).toEqual([6, 4])
  })
})
