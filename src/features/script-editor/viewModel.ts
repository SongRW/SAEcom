import type { NodeCategory, NodeDef, ReteGraphExport, SerialPanelSummary, SerialPortInfo } from '@shared/types'
import type { GraphEditorState } from '@/features/script-editor/rete/graphState'
import { NODE_CATEGORIES, NODE_DEFINITIONS } from '@/features/script-editor/nodes/definitions'

export interface PaletteGroup {
  key: NodeCategory
  name: string
  color: string
  nodes: NodeDef[]
}

export interface SelectOption {
  value: string
  label: string
  description?: string
}

export const AUTO_SERIAL_PORT_REFRESH_INTERVAL_MS = 3000

export function groupNodesForPalette(): PaletteGroup[] {
  return (Object.keys(NODE_CATEGORIES) as NodeCategory[]).map((key) => ({
    ...NODE_CATEGORIES[key],
    nodes: Object.values(NODE_DEFINITIONS).filter((node) => node.category === key)
  }))
}

export function normalizeScriptName(name: string): string | null {
  // 剥离文件系统不安全字符：路径分隔符、Windows 非法字符、控制字符。
  const trimmed = name
    .trim()
    .replace(/[/\\<>:"|?*]/g, '')
    .replace(/[\x00-\x1f]/g, '')
  if (!trimmed || trimmed === '.' || trimmed === '..') return null
  return trimmed.endsWith('.js') ? trimmed : `${trimmed}.js`
}

/** 去掉 .js 后缀用于重命名弹窗预填：Foo.js → Foo。无后缀原样返回。 */
export function stripScriptExtension(name: string): string {
  return name.replace(/\.js$/i, '')
}

/** 生成下一个默认脚本名：Script_1.js、Script_2.js……跳过已占用的编号，回填空缺。 */
export function nextDefaultScriptName(existing: string[]): string {
  const taken = new Set(existing)
  let index = 1
  while (taken.has(`Script_${index}.js`)) index++
  return `Script_${index}.js`
}

/**
 * 覆盖确认的来源：决定确认后是建空脚本还是写入当前内容。
 * - 'create'：来自「新建命名」，确认后建空脚本。
 * - 'save'：来自「保存/另存为」，确认后写入当前画布内容。
 */
export type OverwriteSource = 'create' | 'save'

export function createDefaultReteGraph(): ReteGraphExport {
  return { nodes: [], connections: [] }
}

export function clampCanvasZoom(value: number): number {
  return Math.min(1.8, Math.max(0.5, Number(value.toFixed(2))))
}

export interface FitRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 计算让给定节点包围盒居中并 fit 到可视区域所需的 zoom 与 transform。
 * - 包围盒中心对准画布中心
 * - zoom 取 min(容器宽/包围盒宽, 容器高/包围盒高)，并 clamp 到 [0.5, 1.8]
 * 节点尺寸由调用方提供（从实际渲染的 nodeViews 读取，避免估算）。
 * 返回值用算出的 zoom（不做固定值兜底）。无节点时返回 null。
 */
export function fitGraphToView(
  rects: FitRect[],
  container: { width: number; height: number },
  padding = 80
): { zoom: number; x: number; y: number } | null {
  if (rects.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const rect of rects) {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }

  const bboxW = Math.max(1, maxX - minX)
  const bboxH = Math.max(1, maxY - minY)
  const targetZoom = clampCanvasZoom(Math.min(
    (container.width - padding * 2) / bboxW,
    (container.height - padding * 2) / bboxH
  ))
  const bboxCx = (minX + maxX) / 2
  const bboxCy = (minY + maxY) / 2
  return {
    zoom: targetZoom,
    x: container.width / 2 - bboxCx * targetZoom,
    y: container.height / 2 - bboxCy * targetZoom
  }
}

export function getNextCanvasNodePosition(graph: GraphEditorState): { x: number; y: number } {
  const start = { x: 64, y: 72 }
  if (graph.nodes.length === 0) return start

  const stepX = 260
  const stepY = 150
  const occupied = new Set(graph.nodes.map((node) => `${node.position.x}:${node.position.y}`))
  const rightmost = graph.nodes.reduce((candidate, node) => (
    node.position.x > candidate.position.x ? node : candidate
  ), graph.nodes[0])

  let next = { x: rightmost.position.x + stepX, y: rightmost.position.y }
  let guard = 0
  while (occupied.has(`${next.x}:${next.y}`) && guard < 100) {
    next = { x: start.x + (guard % 4) * stepX, y: start.y + Math.floor(guard / 4) * stepY }
    guard += 1
  }
  return next
}

export function getNextPaletteNodePosition(graph: GraphEditorState): { x: number; y: number } {
  return getNextCanvasNodePosition(graph)
}

export function buildSerialPanelOptions(panels: SerialPanelSummary[]): SelectOption[] {
  const activePanel = panels.find((panel) => panel.active)
  const currentDescription = activePanel
    ? panelDescription(activePanel)
    : '未选择面板'

  return [
    {
      value: '__current__',
      label: activePanel ? `当前面板：${activePanel.name}` : '当前面板',
      description: currentDescription
    },
    ...panels.map((panel) => ({
      value: panel.id,
      label: panel.name,
      description: panelDescription(panel)
    }))
  ]
}

export function buildSerialPortOptions(ports: SerialPortInfo[], _panels: SerialPanelSummary[] = []): SelectOption[] {
  const portOptions = ports.map((port) => ({
    value: port.path,
    label: port.path,
    description: [port.manufacturer, port.serialNumber].filter(Boolean).join(' · ') || undefined
  }))

  return portOptions
}

export function controlSupportsRefresh(source?: string): boolean {
  return source === 'serial-panels' || source === 'serial-ports'
}

function panelDescription(panel: SerialPanelSummary): string {
  return [
    panel.id,
    panel.open ? '已打开' : '未打开',
    serialOptionsDescription(panel)
  ].filter(Boolean).join(' · ')
}

function serialOptionsDescription(panel: SerialPanelSummary): string | null {
  if (panel.type !== 'serial' || !panel.options) return null
  return [
    panel.options.baudRate,
    panel.options.dataBits ?? 8,
    panel.options.stopBits ?? 1,
    panel.options.parity ?? 'none'
  ].join('/')
}
