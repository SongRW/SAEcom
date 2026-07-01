import { useEffect, useRef } from 'react'
import { useIPC, getIPC } from '@/shared/ipc'
import { usePanelsStore } from '@/features/serial-panel/store'
import { useSettingsStore } from '@/shared/store/settings'
import { formatBytes, nowTs } from '@/features/serial-panel/paneViewModel'

/** 文件传输接管者（YModem）。设置后其 id 的数据走这里，不进展示缓冲。 */
export interface TransferHandler {
  id: string
  onData: (bytes: Uint8Array) => void
}

/** module 级 activeTransfer 引用（仿 legacy renderer.js:9 的全局单例） */
let activeTransfer: TransferHandler | null = null
export function setActiveTransfer(t: TransferHandler | null) {
  activeTransfer = t
}
export function getActiveTransfer(): TransferHandler | null {
  return activeTransfer
}

/** per-id 缓冲门状态（仿 legacy state.buffers Map） */
interface BufferGate {
  timer: ReturnType<typeof setTimeout> | null
  open: boolean
}

/**
 * 串口数据总线：单次注册 serial/tcp onData + onEvent，按 id 路由到面板 store。
 * 关键：整个 app 只应调用一次（在 SerialPanelWorkspace 顶层）。
 * 监听随 effect 卸载移除（StrictMode 的挂载→卸载→挂载会被正确处理）。
 */
export function useSerialDataBus() {
  const ipc = useIPC()
  const gates = useRef<Map<string, BufferGate>>(new Map())

  useEffect(() => {
    /** 缓冲门 + 时间戳逻辑，移植自 legacy renderer.js:2841-2866 */
    function appendWithBuffering(id: string, bytes: Uint8Array) {
      const settings = useSettingsStore.getState()
      const store = usePanelsStore.getState()
      // bufferTime 优先读面板级 sendOptions，回退全局（向后兼容）
      const panel = store.panels[id]
      const bufferTime = panel?.sendOptions?.bufferTime ?? settings.bufferTime ?? 0
      const rxTs = settings.rxTimestamp !== false
      const enc = settings.charEncoding || 'utf-8'

      if (!store.panels[id]) return // 按 ID 过滤：非本窗面板忽略（解决双窗重复）

      // 已读判定：可见且在底部 → 收到的数据用户能看到，不计未读
      const isRead = !!panel && !panel.hidden && panel.autoScroll

      if (!gates.current.has(id)) gates.current.set(id, { timer: null, open: false })
      const g = gates.current.get(id)!

      const appendChunk = (withTs: boolean) => {
        const ts = nowTs()
        const textStr = formatBytes(bytes, 'text', enc)
        const hexStr = formatBytes(bytes, 'hex', enc)
        const useTs = withTs && rxTs
        const addText = (useTs ? `[${ts}] ` : '') + textStr
        const addHex = (useTs ? `[${ts}] ` : '') + hexStr
        store.appendChunk(id, { text: addText, hex: addHex, isEcho: false }, { incrementUnread: !isRead })
        // 实时日志：若该面板开启日志，按当前 viewMode 记录
        const cur = usePanelsStore.getState().panels[id]
        if (cur?.logging.active && cur.logging.path) {
          const piece = cur.viewMode === 'hex' ? addHex : addText
          try {
            getIPC().logger.append(cur.logging.path, piece)
          } catch {
            /* web 预览无 ipc */
          }
        }
      }

      if (bufferTime > 0) {
        if (!g.open) {
          g.open = true
          appendChunk(true)
        } else {
          appendChunk(false)
        }
        if (g.timer) clearTimeout(g.timer)
        g.timer = setTimeout(() => {
          const cur = usePanelsStore.getState().panels[id]
          if (cur && !cur.textBuffer.endsWith('\n')) {
            usePanelsStore.getState().appendChunk(id, { text: '\n', hex: '\n', isEcho: false })
          }
          g.open = false
          g.timer = null
        }, bufferTime)
      } else {
        appendChunk(true)
        const cur = usePanelsStore.getState().panels[id]
        if (cur && !cur.textBuffer.endsWith('\n')) {
          usePanelsStore.getState().appendChunk(id, { text: '\n', hex: '\n', isEcho: false })
        }
      }
    }

    // serial
    const offSerialData = ipc.serial.onData(({ id, bytes }) => {
      if (activeTransfer && activeTransfer.id === id) {
        activeTransfer.onData(bytes)
        return
      }
      appendWithBuffering(id, bytes)
    })
    const offSerialEvent = ipc.serial.onEvent((e) => {
      const store = usePanelsStore.getState()
      const p = store.panels[e.id]
      if (!p) return
      if (e.type === 'open') {
        store.setPaneOpen(e.id, true)
        store.appendSysLine(e.id, '[已打开]')
      } else if (e.type === 'close') {
        store.setPaneOpen(e.id, false)
        store.appendSysLine(e.id, '[已关闭]')
      } else if (e.type === 'error') {
        store.appendSysLine(e.id, `[错误] ${e.message || ''}`)
      }
    })

    // tcp（可选链，部分构建可能无 tcp）
    const offTcpData = ipc.tcp?.onData(({ id, bytes }) => {
      if (activeTransfer && activeTransfer.id === id) {
        activeTransfer.onData(bytes)
        return
      }
      appendWithBuffering(id, bytes)
    })
    const offTcpEvent = ipc.tcp?.onEvent((e) => {
      const store = usePanelsStore.getState()
      const p = store.panels[e.id]
      if (!p) return
      if (e.type === 'open') {
        store.setPaneOpen(e.id, true)
        store.appendSysLine(e.id, '[已连接]')
      } else if (e.type === 'close') {
        store.setPaneOpen(e.id, false)
        store.appendSysLine(e.id, '[已断开]')
      } else if (e.type === 'error') {
        store.appendSysLine(e.id, `[错误] ${e.message || ''}`)
      }
    })

    // 卸载时移除所有监听，避免每次挂载累积（原 registered ref guard 与
    // StrictMode 卸载语义冲突，已改用 React effect cleanup 正确管理生命周期）
    return () => {
      offSerialData()
      offSerialEvent()
      offTcpData?.()
      offTcpEvent?.()
    }
  }, [ipc])
}
