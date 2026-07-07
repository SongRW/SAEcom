import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { FloatingPane } from '@/features/serial-panel/components/FloatingPane'
import { NewPanelDialog } from '@/features/serial-panel/components/NewPanelDialog'
import { usePanelsStore } from '@/features/serial-panel/store'
import { useSerialDataBus } from '@/features/serial-panel/dataBus'
import { useModbusDataBus } from '@/features/modbus-panel/useModbusDataBus'
import { useAppShell } from '@/shared/store/appShell'
import { useIPC } from '@/shared/ipc'
import { useOscilloscopeStore } from '@/features/oscilloscope/store'
import { OscilloscopeFloatingWindow } from '@/features/oscilloscope/OscilloscopeFloatingWindow'
import type { PanelChunk } from '@/features/serial-panel/types'
import { displayName } from '@/features/serial-panel/paneViewModel'

/** 串口列表自动轮询间隔（与脚本编辑器一致：3s），覆盖热插拔场景 */
const PORT_REFRESH_INTERVAL_MS = 3000

/**
 * 串口面板工作区容器。
 * 挂载时：注册数据总线（onData/onEvent 单次注册）+ 加载持久化面板 + 监听 popout dock 回。
 * 渲染：所有可见面板的 FloatingPane（隐藏的不渲染浮层）。
 * dock 回：从 popout 窗收回时，恢复面板并保留 chunks 粒度（不扁平化，修正 legacy 丢粒度问题）。
 */
export function SerialPanelWorkspace() {
  useSerialDataBus() // 单次注册数据监听
  useModbusDataBus() // modbus:data / modbus:event 监听（与 serial/tcp 总线并行）
  const ipc = useIPC()
  const load = usePanelsStore((s) => s.load)
  const loadKnownPorts = usePanelsStore((s) => s.loadKnownPorts)
  const setHidden = usePanelsStore((s) => s.setHidden)
  const setActive = usePanelsStore((s) => s.setActive)
  const restoreChunks = usePanelsStore((s) => s.restoreChunks)
  const visiblePanels = usePanelsStore(
    useShallow((s) => Object.values(s.panels).filter((p) => !p.hidden).sort((a, b) => a.z - b.z))
  )
  const newDialogOpen = useAppShell((s) => s.newPanelDialogOpen)
  const setNewDialogOpen = useAppShell((s) => s.setNewPanelDialogOpen)
  const containerRef = useRef<HTMLDivElement>(null)
  // 示波器窗格：订阅 panes 键列表（用 useShallow 避免每次 store 变更重渲染）
  const scopePaneIds = useOscilloscopeStore(
    useShallow((s) => Object.values(s.panes).map((p) => p.panelId))
  )

  useEffect(() => {
    load()
  }, [load])

  // 串口列表自动轮询：取代侧栏手动「刷新串口」按钮，覆盖热插拔场景。
  // 首次拉取在 load 之后立即执行，随后按 PORT_REFRESH_INTERVAL_MS 周期刷新；
  // 防重入避免上一次未返回时叠加请求；卸载时清掉定时器。
  useEffect(() => {
    let refreshing = false
    let cancelled = false
    const refresh = async () => {
      if (refreshing || cancelled) return
      refreshing = true
      try {
        await loadKnownPorts()
      } catch {
        /* web 预览无 ipc */
      } finally {
        refreshing = false
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, PORT_REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [loadKnownPorts])

  // 监听 popout dock 回：恢复面板，保留 chunks 粒度
  useEffect(() => {
    return ipc.panel.onDockRequest(({ id, html }) => {
      const payload = html || '[]'
      let chunks: PanelChunk[] = []
      try {
        const parsed = JSON.parse(payload)
        if (Array.isArray(parsed)) chunks = parsed
      } catch {
        /* 兼容 legacy 扁平文本：作为单个 chunk */
        chunks = [{ text: payload, hex: payload, isEcho: false }]
      }
      setHidden(id, false)
      restoreChunks(id, chunks)
      setActive(id)
    })
  }, [ipc, setHidden, restoreChunks, setActive])

  // 监听 popout 反向事件（对齐 legacy renderer.js:3055-3064）：
  //  - onHideRequest：独立窗点「✕隐藏」→ 主窗隐藏该面板并持久化；若它是活动面板则清空 active
  //  - onFocusFromPopout：独立窗获焦 → 主窗活动面板同步指向它（视觉对齐）
  useEffect(() => {
    const offHide = ipc.panel.onHideRequest(({ id }) => {
      if (!usePanelsStore.getState().panels[id]) return
      setHidden(id, true)
      if (usePanelsStore.getState().activeId === id) setActive(null)
    })
    const offFocus = ipc.panel.onFocusFromPopout(({ id }) => {
      if (usePanelsStore.getState().panels[id]) setActive(id)
    })
    return () => {
      offHide()
      offFocus()
    }
  }, [ipc, setHidden, setActive])

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-muted/30">
      {visiblePanels.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <p className="text-sm">暂无面板，点击侧栏「新建面板」创建</p>
        </div>
      ) : (
        visiblePanels.map((p) => <FloatingPane key={p.id} panel={p} containerRef={containerRef} />)
      )}
      {scopePaneIds.map((id) => (
          <OscilloscopeFloatingWindow
            key={`scope-${id}`}
            panelId={id}
            title={(() => { const p = usePanelsStore.getState().panels[id]; return p ? displayName(p) : id })()}
            containerRef={containerRef}
          />
        ))}
      <NewPanelDialog open={newDialogOpen} onOpenChange={setNewDialogOpen} />
    </div>
  )
}
