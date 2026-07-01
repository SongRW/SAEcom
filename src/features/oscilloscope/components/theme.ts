/**
 * CSS 变量 → uPlot 主题对象。全组件唯一颜色映射处。
 * 通过 getComputedStyle 读取 globals.css 的 OKLCH 变量，原样传给 canvas（浏览器原生支持）。
 * 通道色循环复用 --chart-1..5，超出 5 通道用虚线区分。
 */

export interface ScopeTheme {
  bg: string
  grid: string
  text: string
  series: string[] // chart-1..5
}

/** 单条曲线的样式 */
export interface SeriesStyle {
  stroke: string
  width: number
  dash?: number[]
}

const CHART_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const

export function readTheme(): ScopeTheme {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string) => css.getPropertyValue(n).trim()
  return {
    bg: v('--background'),
    grid: v('--border'),
    text: v('--muted-foreground'),
    series: CHART_VARS.map(v)
  }
}

/**
 * 为 N 个通道生成样式。颜色循环复用 5 个 chart 色；
 * 第 6 个起（index >= 5）加虚线 dash，保证可辨识。
 */
export function buildSeriesStyles(theme: ScopeTheme, channelCount: number): SeriesStyle[] {
  const styles: SeriesStyle[] = []
  for (let i = 0; i < channelCount; i++) {
    styles.push({
      stroke: theme.series[i % theme.series.length],
      width: 1.5,
      dash: i >= theme.series.length ? [6, 4] : undefined
    })
  }
  return styles
}
