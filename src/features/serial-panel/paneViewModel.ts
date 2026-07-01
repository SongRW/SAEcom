/**
 * 面板数据纯函数。移植自 legacy renderer.js，去除全局 settings 依赖（改传参），可单测。
 */
import type { PanelChunk, PanelGeometry, ViewMode } from '@/features/serial-panel/types'

/**
 * 字节数组 → 可展示字符串（文本或 HEX 双格式）。
 * 移植自 legacy renderer.js:2797 formatBytes。
 *
 * - hex: 每字节 XX 大写，空格分隔；0x0A 后换行；非 \n 结尾补尾空格
 * - text: 按 encoding 解码（utf-8/gbk 等），失败回退 ASCII 可见字符过滤
 */
export function formatBytes(bytes: Uint8Array, mode: ViewMode, encoding = 'utf-8'): string {
  if (mode === 'hex') {
    let str = Array.from(bytes)
      .map((b) => {
        const h = b.toString(16).padStart(2, '0').toUpperCase()
        return b === 10 ? `${h}\n` : h
      })
      .join(' ')
      .replace(/\n /g, '\n')
    if (!str.endsWith('\n')) str += ' '
    return str
  }
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(bytes)
  } catch {
    return Array.from(bytes)
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
      .join('')
  }
}

/**
 * 当前时间戳。移植自 legacy renderer.js:1506 nowTs。
 * 格式：YYYY-MM-DD HH:MM:SS.mmm
 */
export function nowTs(d: Date = new Date()): string {
  const pad = (n: number, len = 2) => n.toString().padStart(len, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.` +
    `${pad(d.getMilliseconds(), 3)}`
  )
}

/**
 * 裁剪 chunks 到上限（纯数据版，移植自 legacy trimPane renderer.js:1396 的裁剪部分，去掉 DOM 删除）。
 * 超限时移除头部最旧的 chunk，并同步裁剪 textBuffer/hexBuffer。
 */
export function trimChunks(
  chunks: PanelChunk[],
  textBuffer: string,
  hexBuffer: string,
  limit: number
): { chunks: PanelChunk[]; textBuffer: string; hexBuffer: string } {
  if (chunks.length <= limit) return { chunks, textBuffer, hexBuffer }
  const dropped = chunks.length - limit
  const next = chunks.slice(dropped)
  // 缓冲同步裁剪：按被丢弃 chunk 的实际字符数精确裁剪，保证 chunks 与 buffer 严格对齐。
  // textBuffer/hexBuffer 始终是各 chunk text/hex 的顺序拼接（见 store.appendChunk/restoreChunks），
  // 故裁掉与被丢弃 chunk 等量的头部字符即可——chunks 与 buffer 完全同步。
  // 此前用 limit*50 估算会让长会话导出丢数据，且 hex/text 共用同一 estLen 导致两种视图导出不一致。
  let dropText = 0
  let dropHex = 0
  for (let i = 0; i < dropped; i++) {
    dropText += chunks[i].text.length
    dropHex += chunks[i].hex.length
  }
  return {
    chunks: next,
    textBuffer: textBuffer.slice(dropText),
    hexBuffer: hexBuffer.slice(dropHex)
  }
}

/**
 * 派生展示文本：把 chunks 按 viewMode 拼成可渲染字符串。
 * echo 行用换行分隔（DataDisplay 渲染时给 .echo-line 样式）。
 * 返回 { text, isEcho } 数组，DataDisplay 负责实际 DOM 渲染。
 */
export function renderChunks(chunks: PanelChunk[], viewMode: ViewMode): { text: string; isEcho: boolean }[] {
  return chunks.map((c) => ({ text: viewMode === 'hex' ? c.hex : c.text, isEcho: c.isEcho }))
}

/**
 * 把所有 chunk 拼成纯文本（按 viewMode 取 text/hex）。
 * 用于「复制全部」：工作区 DataDisplay 走虚拟化滚动，跨虚拟行选择不可靠，
 * 且非可视区 chunk 根本未渲染，故提供全量复制通道（数据源是 panel.chunks，与渲染无关）。
 */
export function chunksToPlainText(chunks: PanelChunk[], viewMode: ViewMode): string {
  return chunks.map((c) => (viewMode === 'hex' ? c.hex : c.text)).join('')
}

/** 默认串口参数（对应 legacy createPane 的 options 默认） */
export const DEFAULT_SERIAL_OPTIONS = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none' as const
}

/** 默认发送选项（append=CRLF, bufferTime=50, hex 不勾；echo 默认开，对齐 legacy renderer.js:4215 启动强制勾选 #echoSend） */
export const DEFAULT_SERIAL_SEND_OPTIONS = {
  append: 'CRLF' as const,
  hexMode: false,
  echoSend: true,
  bufferTime: 50
}

/** 默认面板尺寸（对应 legacy createPane 的 420×240） */
export const DEFAULT_PANEL_W = 420
export const DEFAULT_PANEL_H = 240

/** 面板最小尺寸（对应 legacy resize minW=200, minH=120） */
export const MIN_PANEL_SIZE = { w: 200, h: 120 }

/**
 * 计算第 index 个新建/加载面板的初始几何，复刻 legacy renderer.js:2185-2193
 * createPane 的级联错位意图（避免所有面板恒定叠在 (30,30)）。
 *
 * - 第 0 个落默认起点 (30,30)
 * - 之后按 index 做阶梯级联：x += STEP_X、y += STEP_Y，封顶后回落，形成对角错位
 * - 始终 clamp 到工作区内，保证不溢出右/下边界、不小于最小尺寸
 *
 * containerW/H 传工作区（含面板的容器）可用宽高；未知时回退到窗口尺寸估算。
 */
export function cascadeGeometry(
  index: number,
  opts: { containerW?: number; containerH?: number } = {}
): PanelGeometry {
  const cw = opts.containerW ?? (typeof window !== 'undefined' ? window.innerWidth : 1024)
  const ch = opts.containerH ?? (typeof window !== 'undefined' ? window.innerHeight : 600)
  const margin = 16
  const STEP_X = 28
  const STEP_Y = 28
  const MAX_STEPS = 6

  const steps = Math.max(0, Math.min(index, MAX_STEPS))
  const baseX = 30
  const baseY = 30
  const x = baseX + steps * STEP_X
  const y = baseY + steps * STEP_Y

  const leftMax = Math.max(margin, cw - DEFAULT_PANEL_W - margin)
  const topMax = Math.max(margin, ch - DEFAULT_PANEL_H - margin)
  return {
    x: Math.min(x, leftMax),
    y: Math.min(y, topMax),
    w: Math.min(DEFAULT_PANEL_W, Math.max(MIN_PANEL_SIZE.w, cw - 2 * margin)),
    h: Math.min(DEFAULT_PANEL_H, Math.max(MIN_PANEL_SIZE.h, ch - 2 * margin))
  }
}

/** 默认面板几何（保留导出兼容既有引用，等价于第 0 个级联位置） */
export const DEFAULT_GEOMETRY: PanelGeometry = { x: 30, y: 30, w: DEFAULT_PANEL_W, h: DEFAULT_PANEL_H }

/**
 * 把面板几何钳制进可见容器范围。
 * 用于从持久化恢复 / 重新显示面板前，避免上次会话在更大窗口下保存的位置
 * 落到当前（更小的）容器外，导致面板重开后在屏幕外不可见。
 *
 * 规则（与拖拽 clamp 意图一致，对齐 usePaneInteraction 的边界语义）：
 * - 宽/高不小于 MIN_PANEL_SIZE；若比容器还大，按最小尺寸收拢（不放大原值）
 * - x/y 不小于 0；右上/左下溢出时整体平移，使右/下边界恰好贴容器边
 * - 容器比最小尺寸还小时退化为贴左上角、按最小尺寸，保证标题栏可见可拖
 *
 * @param geo 待钳制的几何
 * @param view 当前可见容器尺寸（工作区 clientWidth/Height）
 */
export function clampGeometry(geo: PanelGeometry, view: { w: number; h: number }): PanelGeometry {
  const w = Math.max(MIN_PANEL_SIZE.w, Math.min(geo.w, view.w))
  const h = Math.max(MIN_PANEL_SIZE.h, Math.min(geo.h, view.h))
  // 右/下溢出 → 平移；否则取原值（再 clamp 到 ≥0）。Math.max(0, ...) 兜负坐标。
  const maxX = Math.max(0, view.w - w)
  const maxY = Math.max(0, view.h - h)
  const x = Math.min(Math.max(0, geo.x), maxX)
  const y = Math.min(Math.max(0, geo.y), maxY)
  return { x, y, w, h }
}

/** 解析 "964px" / "964" 这类字符串数值，非法返回 null */
export function parsePx(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * 未读条数 → 角标文本。0 不显示（返回 null）；1~99 返回数字；>99 返回 "99+"。
 * 对应 spec：侧栏未读角标显示上限 99+ 封顶。
 */
export function formatUnread(n: number): string | null {
  if (n <= 0) return null
  return n > 99 ? '99+' : String(n)
}

/**
 * 面板显示名：note 优先，无 note 回退 name。对应 legacy renderer.js 的
 * `pane.note || pane.info.name`（refreshPanelList/nameEl 等处实时派生）。
 * name 字段保持"系统友好名"语义（load 时不再混入 note），改 note 后显示即时生效，
 * 清空 note 自动回退到 name——避免旧实现里把 note 缓存进 name 导致回退失效。
 */
export function displayName(panel: { note: string; name: string }): string {
  return panel.note && panel.note.trim() ? panel.note : panel.name
}

/**
 * 解析 legacy 持久化的几何字段（left/top/width/height，可能带 "px"）为 PanelGeometry。
 * 缺关键 left/top 时返回 null（交由上层用 cascadeGeometry 兜底）。
 */
export function parseLegacyGeometry(c: Record<string, unknown>): PanelGeometry | null {
  const x = parsePx(c.left)
  const y = parsePx(c.top)
  const w = parsePx(c.width)
  const h = parsePx(c.height)
  if (x === null || y === null) return null
  return {
    x,
    y,
    w: w ?? DEFAULT_PANEL_W,
    h: h ?? DEFAULT_PANEL_H
  }
}
