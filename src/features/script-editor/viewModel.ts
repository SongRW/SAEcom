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

/**
 * 画布缩放「默认」下限（50%）。小图/空图手动缩放以此为地板，避免缩得过小只剩空白。
 * 大图若 fit 需要更低倍率，由 computeCanvasZoomMin 动态下调（不低于 ABSOLUTE_MIN）。
 */
export const CANVAS_ZOOM_MIN = 0.5
/**
 * 画布缩放绝对下限（10%）。再低节点不可辨且 transform 数值易漂；
 * 无论图多大都不允许越过。
 */
export const CANVAS_ZOOM_ABSOLUTE_MIN = 0.1
/** 画布缩放上限（百分比 180%）。 */
export const CANVAS_ZOOM_MAX = 1.8

/** 平移边界相对节点包围盒的世界坐标边距，避免贴边时无法再看清节点。 */
export const CANVAS_PAN_PADDING = 320
/** 空图时的宽松平移范围（世界坐标经 zoom 缩放后作为 transform 限幅）。 */
export const CANVAS_PAN_EMPTY_EXTENT = 5000
/** fit / 动态缩放下限计算时相对容器的内边距。 */
export const CANVAS_FIT_PADDING = 80
/**
 * 动态缩放下限相对「刚好 fit」再放一点的余量（0.9 = 允许再缩小约 10%），
 * 方便 fit 后仍可略微缩小做总览，而不会贴死在 fit 倍率。
 */
export const CANVAS_ZOOM_MIN_FIT_HEADROOM = 0.9

/**
 * 缩略图边长（px）。rete-react-plugin 的 MiniNode/MiniViewport 用 containerWidth
 * 同时映射 X/Y，因此 ratio 必须为 1（正方形），否则节点/视口框会被纵向拉出裁切区，
 * 表现为「缩略图空白 + 拖不动」。看全复杂图靠加大 size + 真实 bbox 缩放，不靠拉宽。
 */
export const MINIMAP_SIZE = 240
/** 必须保持 1，与 rete-react-plugin minimap 坐标系约定一致。 */
export const MINIMAP_RATIO = 1
/**
 * 缩略图坐标空间的最小边长（世界单位）。
 * 小于此值的图会居中留白；大于此值时按真实包围盒缩放，保证大图仍能看全。
 */
export const MINIMAP_MIN_DISTANCE = 1200

/**
 * 将 zoom 钳到 [minZoom, CANVAS_ZOOM_MAX]。
 * minZoom 默认 CANVAS_ZOOM_MIN；大图场景传入 computeCanvasZoomMin(...) 的结果。
 */
export function clampCanvasZoom(value: number, minZoom: number = CANVAS_ZOOM_MIN): number {
  const floor = Math.max(CANVAS_ZOOM_ABSOLUTE_MIN, Math.min(CANVAS_ZOOM_MIN, minZoom))
  return Math.min(CANVAS_ZOOM_MAX, Math.max(floor, Number(value.toFixed(2))))
}

function measureRectsBBox(rects: FitRect[]): { width: number; height: number } | null {
  if (rects.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const rect of rects) {
    const width = Math.max(1, rect.width || 0)
    const height = Math.max(1, rect.height || 0)
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + width)
    maxY = Math.max(maxY, rect.y + height)
  }
  return {
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  }
}

/**
 * 按当前节点包围盒与容器尺寸，计算允许的最小 zoom。
 * - 空图/非法输入：退回默认 CANVAS_ZOOM_MIN
 * - 小图（fit 倍率 ≥ 默认下限）：保持 CANVAS_ZOOM_MIN，避免无意义缩太小
 * - 大图（fit 倍率 < 默认下限）：下调到「刚好看全」附近（含 headroom），且 ≥ ABSOLUTE_MIN
 * 供 restrictor.scaling、工具栏/滚轮 clamp、fit 共用，保证大脚本能放进视口。
 */
export function computeCanvasZoomMin(
  rects: FitRect[],
  container: { width: number; height: number },
  padding = CANVAS_FIT_PADDING
): number {
  if (
    rects.length === 0
    || container.width <= 0
    || container.height <= 0
  ) {
    return CANVAS_ZOOM_MIN
  }

  const bbox = measureRectsBBox(rects)
  if (!bbox) return CANVAS_ZOOM_MIN

  const availW = Math.max(1, container.width - padding * 2)
  const availH = Math.max(1, container.height - padding * 2)
  const required = Math.min(availW / bbox.width, availH / bbox.height)
  if (!Number.isFinite(required) || required <= 0) return CANVAS_ZOOM_MIN

  const withHeadroom = required * CANVAS_ZOOM_MIN_FIT_HEADROOM
  return Math.max(
    CANVAS_ZOOM_ABSOLUTE_MIN,
    Math.min(CANVAS_ZOOM_MIN, Number(withHeadroom.toFixed(2)))
  )
}

export interface FitRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasPanBounds {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * 计算画布 area.transform 的平移限幅，使视口始终「兜住」节点。
 * Rete 变换：屏幕点 = 世界点 * zoom + translate，故视口世界范围是
 *   worldLeft = -x/k, worldTop = -y/k, worldRight = worldLeft + containerW/k。
 *
 * 语义（解决「拖到界外」）：
 * - 图 ≤ 视口：视口必须「包含」整张图（节点不会移出视口）
 *   → worldLeft ≤ graphLeft 且 worldRight ≥ graphRight
 * - 图 > 视口：视口被「限制在」图内（看不到图外空白）
 *   → worldLeft ≥ graphLeft 且 worldRight ≤ graphRight
 * 两种情况下 x 的可行域都是 [containerW - graphRight*k, -graphLeft*k]（图小）
 * 或 [-graphLeft*k, containerW - graphRight*k]（图大），取 min/max 归一。
 * 空图或非法输入时返回宽松范围，避免卡死空画布拖动。
 */
export function computeCanvasPanBounds(
  rects: FitRect[],
  container: { width: number; height: number },
  zoom: number,
  padding = CANVAS_PAN_PADDING
): CanvasPanBounds {
  if (
    rects.length === 0
    || container.width <= 0
    || container.height <= 0
    || !Number.isFinite(zoom)
    || zoom <= 0
  ) {
    return {
      left: -CANVAS_PAN_EMPTY_EXTENT,
      top: -CANVAS_PAN_EMPTY_EXTENT,
      right: CANVAS_PAN_EMPTY_EXTENT,
      bottom: CANVAS_PAN_EMPTY_EXTENT
    }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const rect of rects) {
    const width = Math.max(1, rect.width || 0)
    const height = Math.max(1, rect.height || 0)
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + width)
    maxY = Math.max(maxY, rect.y + height)
  }

  const graphLeft = minX - padding
  const graphRight = maxX + padding
  const graphTop = minY - padding
  const graphBottom = maxY + padding
  const k = zoom
  const { width: containerW, height: containerH } = container

  // 两种图大小下 x/y 的两个边界点相同，只是大小关系翻转；min/max 归一即可。
  // 图小：x ∈ [containerW - graphRight*k, -graphLeft*k]，前者 < 后者
  // 图大：x ∈ [-graphLeft*k, containerW - graphRight*k]，前者 > 后者
  const rawLeft = containerW - graphRight * k
  const rawRight = -graphLeft * k
  const rawTop = containerH - graphBottom * k
  const rawBottom = -graphTop * k

  return {
    left: Math.min(rawLeft, rawRight),
    right: Math.max(rawLeft, rawRight),
    top: Math.min(rawTop, rawBottom),
    bottom: Math.max(rawTop, rawBottom)
  }
}

/**
 * 计算让给定节点包围盒居中并 fit 到可视区域所需的 zoom 与 transform。
 * - 包围盒中心对准画布中心
 * - zoom 取 min(容器宽/包围盒宽, 容器高/包围盒高)，并 clamp 到
 *   [computeCanvasZoomMin(...), CANVAS_ZOOM_MAX] —— 大图可低于默认 50%
 * 节点尺寸由调用方提供（从实际渲染的 nodeViews 读取，避免估算）。
 * 返回值用算出的 zoom（不做固定值兜底）。无节点时返回 null。
 */
export function fitGraphToView(
  rects: FitRect[],
  container: { width: number; height: number },
  padding = CANVAS_FIT_PADDING
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
  const minZoom = computeCanvasZoomMin(rects, container, padding)
  const targetZoom = clampCanvasZoom(
    Math.min(
      (container.width - padding * 2) / bboxW,
      (container.height - padding * 2) / bboxH
    ),
    minZoom
  )
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
