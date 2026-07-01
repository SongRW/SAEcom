import { create } from 'zustand'
import { getIPC } from '@/shared/ipc'
import type { Panel, PanelChunk, PanelGeometry, PanelType, SendOptions, SerialOptions, ViewMode } from '@/features/serial-panel/types'
import { DEFAULT_SERIAL_OPTIONS, DEFAULT_SERIAL_SEND_OPTIONS, DEFAULT_PANEL_W, DEFAULT_PANEL_H, cascadeGeometry, parseLegacyGeometry, trimChunks } from '@/features/serial-panel/paneViewModel'

/** chunk 数量软上限（对应 legacy LIMIT_VIEW_COUNT，避免无界增长） */
const CHUNK_LIMIT = 1000
/** 默认保留条数（对应 legacy renderer.js:1144 LIMIT_VIEW_COUNT，作为 limitView 开启时的初始值） */
const LIMIT_VIEW_COUNT = 1000
/** 普通/置顶面板的 z 基线。pin 面板恒浮于非 pin 之上。 */
const PIN_Z_BASE = 100000
const NORMAL_Z_BASE = 10
/** 最大面板数上限。超出时 addPanel 返回 false（防御 listOrder 无界增长）。 */
const MAX_PANELS = 64

function genPanel(params: {
  id: string
  name?: string
  note?: string
  type: PanelType
  geometry?: PanelGeometry
  options?: SerialOptions
  sendOptions?: SendOptions
  pinned?: boolean
  /** 无显式 geometry 时按该序号做级联错位（复刻 legacy createPane 定位） */
  cascadeIndex?: number
}): Panel {
  return {
    id: params.id,
    name: params.name || params.id,
    note: params.note ?? '',
    type: params.type,
    options: params.options || { ...DEFAULT_SERIAL_OPTIONS },
    sendOptions: params.sendOptions ?? { ...DEFAULT_SERIAL_SEND_OPTIONS },
    open: false,
    viewMode: 'text',
    pinned: params.pinned ?? false,
    hidden: false,
    geometry: params.geometry || cascadeGeometry(params.cascadeIndex ?? 0),
    chunks: [],
    textBuffer: '',
    hexBuffer: '',
    autoScroll: true,
    sendText: '',
    logging: { active: false, path: null },
    limitView: false,
    limitCount: LIMIT_VIEW_COUNT,
    unread: 0,
    z: NORMAL_Z_BASE
  }
}

/**
 * 串口列表条目。主进程 serial:list 返回 path/manufacturer/serialNumber/friendlyName
 * （friendlyName = i.friendlyName || i.pnpId，见 main.ts listSerialPortsSafe）。
 * 对齐 legacy renderer.js:2943 的 `${path} ${friendlyName ? '(friendlyName)' : ''}` 展示。
 */
export interface KnownPort {
  path: string
  friendlyName?: string
  manufacturer?: string
}

interface PanelsState {
  panels: Record<string, Panel>
  /** 列表顺序（持久化，对应 legacy listOrder） */
  listOrder: string[]
  activeId: string | null
  knownPorts: KnownPort[]
  zCounter: number
  loaded: boolean

  // ---- 面板生命周期 ----
  addPanel: (params: { id: string; name?: string; type: PanelType; geometry?: PanelGeometry; options?: SerialOptions }) => boolean
  removePanel: (id: string) => void
  setActive: (id: string | null) => void
  setHidden: (id: string, hidden: boolean) => void
  renamePanel: (id: string, name: string) => void
  /** 设置面板备注（对应 legacy btnAddNote，≤15 字；空串清除） */
  setNote: (id: string, note: string) => void

  // ---- 几何 / 视图 ----
  setGeometry: (id: string, geo: PanelGeometry) => void
  setViewMode: (id: string, mode: ViewMode) => void
  togglePin: (id: string) => void
  setPaneOpen: (id: string, open: boolean) => void
  /** 切换面板连接（open/close，含 IPC + 乐观更新） */
  togglePanelOpen: (id: string) => Promise<void>
  updateOptions: (id: string, options: Partial<SerialOptions>) => void
  updateSendOptions: (id: string, options: Partial<SendOptions>) => void
  reorderList: (fromIndex: number, toIndex: number) => void
  setSendText: (id: string, text: string) => void
  setAutoScroll: (id: string, v: boolean) => void
  /** 开启/关闭实时日志记录（指定文件路径） */
  setLogging: (id: string, active: boolean, path: string | null) => void
  /**
   * 设置面板「保留条数」限制（对应 legacy toggleLimitView）。
   * limitView=false 时关闭限制（仅全局上限兜底）；limitView=true 时用 limitCount。
   * 立即对现有 chunks 做一次 trim，并持久化。
   */
  setLimit: (id: string, limitView: boolean, limitCount: number) => void

  // ---- 数据 ----
  /** 追加数据块（含裁剪）；opts.incrementUnread=true 时未读计数 +1（并入同一次 set） */
  appendChunk: (id: string, chunk: PanelChunk, opts?: { incrementUnread?: boolean }) => void
  /** 追加系统行（如 [已打开]/错误信息） */
  appendSysLine: (id: string, text: string) => void
  clearChunks: (id: string) => void
  /** 恢复 chunks（popout dock 回时调用，保留粒度） */
  restoreChunks: (id: string, chunks: PanelChunk[]) => void

  // ---- 端口 / 持久化 ----
  loadKnownPorts: () => Promise<void>
  load: () => Promise<void>
  save: () => void
}

/**
 * 串口面板 store。镜像 legacy state.panes + activeId + listOrder。
 * 持久化面板几何/选项/pinned/hidden/name/type/viewMode 到 config（ipc.config.save）。
 * z-order：setActive 时 ++zCounter；pin 面板 z = PIN_Z_BASE + counter，普通 = NORMAL_Z_BASE + counter。
 */
export const usePanelsStore = create<PanelsState>((set, get) => {
  function persist() {
    const { panels, listOrder } = get()
    const configs = listOrder
      .filter((id) => panels[id])
      .map((id) => {
        const p = panels[id]
        return {
          id: p.id,
          path: p.id,
          name: p.name,
          type: p.type,
          options: p.options,
          pinned: p.pinned,
          hidden: p.hidden,
          geometry: p.geometry,
          viewMode: p.viewMode,
          sendOptions: p.sendOptions,
          limitView: p.limitView,
          limitCount: p.limitCount,
          // legacy 兼容扁平字段（让 legacy renderer.js 读到不报错）
          appendMode: p.sendOptions.append,
          hexMode: p.sendOptions.hexMode,
          echoSend: p.sendOptions.echoSend,
          bufferTime: p.sendOptions.bufferTime,
          // legacy 兼容字段（双轨共用 panels.json，让 legacy 也能读到位置/大小）
          left: `${p.geometry.x}px`,
          top: `${p.geometry.y}px`,
          width: `${p.geometry.w}px`,
          height: `${p.geometry.h}px`,
          note: p.note
        }
      })
    try {
      getIPC().config.save(configs)
    } catch {
      /* web 预览无 ipc */
    }
  }

  return {
    panels: {},
    listOrder: [],
    activeId: null,
    knownPorts: [],
    zCounter: 0,
    loaded: false,

    addPanel({ id, name, type, geometry, options }) {
      if (get().panels[id]) {
        // 已存在：聚焦
        get().setActive(id)
        return true
      }
      // 面板数上限：超出拒绝，返回 false 让调用方提示用户
      if (get().listOrder.length >= MAX_PANELS) return false
      // 无显式 geometry 时按现有面板数级联错位，避免新面板恒定叠在 (30,30)
      const panel = genPanel({ id, name, type, geometry, options, cascadeIndex: get().listOrder.length })
      set((s) => ({
        panels: { ...s.panels, [id]: panel },
        listOrder: [...s.listOrder, id]
      }))
      get().setActive(id)
      persist()
      return true
    },

    removePanel(id) {
      set((s) => {
        const panels = { ...s.panels }
        delete panels[id]
        const listOrder = s.listOrder.filter((x) => x !== id)
        const activeId = s.activeId === id ? null : s.activeId
        return { panels, listOrder, activeId }
      })
      persist()
    },

    setActive(id) {
      set((s) => {
        if (!id || !s.panels[id]) return { activeId: id }
        const zCounter = s.zCounter + 1
        const p = s.panels[id]
        const base = p.pinned ? PIN_Z_BASE : NORMAL_Z_BASE
        return {
          activeId: id,
          zCounter,
          panels: { ...s.panels, [id]: { ...p, z: base + zCounter } }
        }
      })
    },

    setHidden(id, hidden) {
      set((s) => {
        if (!s.panels[id]) return s
        return { panels: { ...s.panels, [id]: { ...s.panels[id], hidden } } }
      })
      persist()
    },

    renamePanel(id, name) {
      set((s) => {
        if (!s.panels[id]) return s
        return { panels: { ...s.panels, [id]: { ...s.panels[id], name: name.slice(0, 15) } } }
      })
      persist()
    },

    setNote(id, note) {
      set((s) => {
        if (!s.panels[id]) return s
        return { panels: { ...s.panels, [id]: { ...s.panels[id], note: note.slice(0, 15) } } }
      })
      persist()
    },

    setGeometry(id, geo) {
      set((s) => {
        if (!s.panels[id]) return s
        return { panels: { ...s.panels, [id]: { ...s.panels[id], geometry: geo } } }
      })
      // 几何变化频繁，不每次持久化；drag/resize 结束时由组件调 save()
    },

    setViewMode(id, mode) {
      set((s) => {
        if (!s.panels[id]) return s
        return { panels: { ...s.panels, [id]: { ...s.panels[id], viewMode: mode } } }
      })
      persist()
    },

    togglePin(id) {
      set((s) => {
        if (!s.panels[id]) return s
        const p = s.panels[id]
        const pinned = !p.pinned
        const base = pinned ? PIN_Z_BASE : NORMAL_Z_BASE
        return { panels: { ...s.panels, [id]: { ...p, pinned, z: base + s.zCounter } } }
      })
      persist()
    },

    setPaneOpen(id, open) {
      set((s) => {
        if (!s.panels[id]) return s
        return { panels: { ...s.panels, [id]: { ...s.panels[id], open } } }
      })
    },

    /** 切换面板连接（open/close），含 IPC 调用 + 乐观更新 + 错误处理。FloatingPane/PaneList 共用。 */
    async togglePanelOpen(id) {
      const p = get().panels[id]
      if (!p) return
      const ipc = getIPC()
      try {
        if (p.open) {
          p.type === 'tcp' ? await ipc.tcp.close(id) : await ipc.serial.close(id)
        } else {
          let res: { ok?: boolean; error?: string } | undefined
          if (p.type === 'tcp') {
            const m = id.match(/^tcp:\/\/([^:]+):(\d+)$/)
            if (!m) { get().appendSysLine(id, '[错误] TCP 地址格式无效'); return }
            res = await ipc.tcp.open(m[1], Number(m[2]), p.options)
          } else {
            res = await ipc.serial.open(id, p.options)
          }
          if (res && res.ok === false) {
            get().appendSysLine(id, `[错误] ${res.error || '打开失败'}`)
            return
          }
          get().setPaneOpen(id, true) // 乐观更新
        }
      } catch (e) {
        get().appendSysLine(id, `[错误] ${String(e)}`)
      }
    },

    updateOptions(id, options) {
      set((s) => {
        if (!s.panels[id]) return s
        return { panels: { ...s.panels, [id]: { ...s.panels[id], options: { ...s.panels[id].options, ...options } } } }
      })
      persist()
    },

    updateSendOptions(id, options) {
      set((s) => {
        if (!s.panels[id]) return s
        return { panels: { ...s.panels, [id]: { ...s.panels[id], sendOptions: { ...s.panels[id].sendOptions, ...options } } } }
      })
      persist()
    },

    reorderList(fromIndex, toIndex) {
      set((s) => {
        const next = [...s.listOrder]
        if (fromIndex < 0 || fromIndex >= next.length || toIndex < 0 || toIndex >= next.length) return s
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)
        return { listOrder: next }
      })
      persist()
    },

    setSendText(id, text) {
      set((s) => {
        if (!s.panels[id]) return s
        return { panels: { ...s.panels, [id]: { ...s.panels[id], sendText: text } } }
      })
    },

    setAutoScroll(id, v) {
      set((s) => {
        if (!s.panels[id]) return s
        const p = s.panels[id]
        // 滚到底部（autoScroll=true）= 用户已看到全部内容 = 已读 → 清零未读
        const unread = v ? 0 : p.unread
        // 短路：值未变且无语义变化时返回原 state，避免 DataDisplay 每帧 onScroll
        // 触发无谓重渲染（panels 引用不变 → zustand 不通知订阅者）。
        if (p.autoScroll === v && p.unread === unread) return s
        return { panels: { ...s.panels, [id]: { ...p, autoScroll: v, unread } } }
      })
    },

    setLogging(id, active, path) {
      set((s) => {
        if (!s.panels[id]) return s
        return { panels: { ...s.panels, [id]: { ...s.panels[id], logging: { active, path } } } }
      })
    },

    setLimit(id, limitView, limitCount) {
      set((s) => {
        const p = s.panels[id]
        if (!p) return s
        const limit = limitView ? limitCount : CHUNK_LIMIT
        const trimmed = trimChunks(p.chunks, p.textBuffer, p.hexBuffer, limit)
        return {
          panels: {
            ...s.panels,
            [id]: {
              ...p,
              limitView,
              limitCount,
              chunks: trimmed.chunks,
              textBuffer: trimmed.textBuffer,
              hexBuffer: trimmed.hexBuffer
            }
          }
        }
      })
      persist()
    },

    appendChunk(id, chunk, opts) {
      set((s) => {
        const p = s.panels[id]
        if (!p) return s
        const limit = p.limitView ? p.limitCount : CHUNK_LIMIT
        const trimmed = trimChunks([...p.chunks, chunk], p.textBuffer + chunk.text, p.hexBuffer + chunk.hex, limit)
        const unread = opts?.incrementUnread ? p.unread + 1 : p.unread
        return {
          panels: {
            ...s.panels,
            [id]: {
              ...p,
              chunks: trimmed.chunks,
              textBuffer: trimmed.textBuffer,
              hexBuffer: trimmed.hexBuffer,
              unread
            }
          }
        }
      })
    },

    appendSysLine(id, text) {
      // 系统行作为非 echo chunk（hex 用 text 代替，系统行不关心 hex）
      get().appendChunk(id, { text: text + '\n', hex: text + '\n', isEcho: false })
    },

    clearChunks(id) {
      set((s) => {
        if (!s.panels[id]) return s
        return {
          panels: {
            ...s.panels,
            [id]: { ...s.panels[id], chunks: [], textBuffer: '', hexBuffer: '', unread: 0 }
          }
        }
      })
    },

    restoreChunks(id, chunks) {
      set((s) => {
        if (!s.panels[id]) return s
        const textBuffer = chunks.map((c) => c.text).join('')
        const hexBuffer = chunks.map((c) => c.hex).join('')
        // 与 appendChunk/setLimit 一致：limitView 开时用 limitCount，否则全局 CHUNK_LIMIT 兜底。
        // 此前硬编码 1000 会忽略用户自定义 limitCount，取回面板时丢数据。
        const p = s.panels[id]
        const limit = p.limitView ? p.limitCount : CHUNK_LIMIT
        const trimmed = trimChunks(chunks, textBuffer, hexBuffer, limit)
        return {
          panels: {
            ...s.panels,
            [id]: { ...s.panels[id], chunks: trimmed.chunks, textBuffer: trimmed.textBuffer, hexBuffer: trimmed.hexBuffer, unread: 0 }
          }
        }
      })
    },

    async loadKnownPorts() {
      try {
        const ports = await getIPC().serial.list()
        // 保留 friendlyName/manufacturer（对齐 legacy 展示），仅过滤空 path。
        set({
          knownPorts: ports.map((p) => ({
            path: p.path,
            friendlyName: (p as { friendlyName?: string }).friendlyName || undefined,
            manufacturer: p.manufacturer || undefined
          }))
        })
      } catch {
        /* web 预览无 ipc */
      }
    },

    async load() {
      if (get().loaded) return
      // 兼容 legacy 持久化形态：left/top/width/height（字符串 "964px"）+ note + hidden，
      // 以及新版 geometry/pinned/viewMode。两套字段都读取，新版优先。
      const configs: Record<string, unknown>[] = []
      try {
        const raw = await getIPC().config.load()
        if (Array.isArray(raw)) configs.push(...(raw as Record<string, unknown>[]))
      } catch {
        /* web 预览 */
      }
      const panels: Record<string, Panel> = {}
      const listOrder: string[] = []
      let zCounter = 0
      configs.forEach((c, idx) => {
        const id = String(c.id ?? '')
        const type = (c.type as PanelType) || (id.startsWith('tcp://') ? 'tcp' : 'serial')
        // geometry：优先新版 geometry；否则解析 legacy left/top/width/height（去 "px"）
        const legacyGeo = parseLegacyGeometry(c)
        const geometry = (c.geometry as PanelGeometry | undefined) ?? legacyGeo ?? undefined
        const note = typeof c.note === 'string' && c.note.trim() ? c.note.trim() : ''
        const p = genPanel({
          id,
          // name 保持系统友好名语义（不混入 note），显示层用 displayName 派生（note 优先）。
          // 修复旧实现：name=note||... 会把 note 缓存进 name，清空 note 后无法回退。
          name: (c.name as string) || id,
          note,
          type,
          geometry,
          options: c.options as SerialOptions,
          sendOptions: {
            ...DEFAULT_SERIAL_SEND_OPTIONS,
            ...(c.sendOptions as Partial<SendOptions> | undefined),
            // legacy 扁平字段兼容（旧数据没有 sendOptions 嵌套）
            ...(typeof c.appendMode === 'string' ? { append: c.appendMode as SendOptions['append'] } : {}),
            ...(typeof c.hexMode === 'boolean' ? { hexMode: c.hexMode } : {}),
            ...(typeof c.echoSend === 'boolean' ? { echoSend: c.echoSend } : {}),
            ...(typeof c.bufferTime === 'number' ? { bufferTime: c.bufferTime } : {})
          },
          pinned: c.pinned as boolean | undefined,
          // 既无新版 geometry 也无 legacy 几何时，按序级联错位
          cascadeIndex: geometry ? undefined : idx
        })
        p.hidden = !!c.hidden
        // 向后兼容：旧持久化数据无 limitView/limitCount，缺失时保持 genPanel 默认值
        if (typeof c.limitView === 'boolean') p.limitView = c.limitView
        if (typeof c.limitCount === 'number' && Number.isFinite(c.limitCount)) p.limitCount = c.limitCount
        if (c.viewMode) p.viewMode = c.viewMode as ViewMode
        p.z = (p.pinned ? PIN_Z_BASE : NORMAL_Z_BASE) + zCounter
        zCounter++
        panels[id] = p
        listOrder.push(id)
      })
      // 初始 activeId：复刻 legacy createPane 末尾的 `if (!saved || !saved.hidden) setActive(id)`。
      // legacy 按 savedConfig 顺序逐个 createPane，每次 setActive 把当前面板置顶；
      // 最终聚焦的是「最后一个非隐藏面板」（z 最大、视觉最上层）。无可见面板时保持 null
      // （底部工作区显示「请选择面板」，对齐 legacy 无可见面板时的空态）。
      const topVisible = listOrder
        .map((id) => panels[id])
        .filter((p) => !p.hidden)
        .reduce<Panel | null>((acc, p) => (!acc || p.z > acc.z ? p : acc), null)
      set({ panels, listOrder, zCounter, loaded: true, activeId: topVisible?.id ?? null })
    },

    save() {
      persist()
    }
  }
})
