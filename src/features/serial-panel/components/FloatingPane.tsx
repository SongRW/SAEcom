import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { PaneHeader } from '@/features/serial-panel/components/PaneHeader'
import { DataDisplay } from '@/features/serial-panel/components/DataDisplay'
import { SendBar } from '@/features/serial-panel/components/SendBar'
import { PaneContextMenu } from '@/features/serial-panel/components/PaneContextMenu'
import { usePanelsStore } from '@/features/serial-panel/store'
import { useIPC } from '@/shared/ipc'
import { exportPanelLog } from '@/features/serial-panel/exportLog'
import { displayName } from '@/features/serial-panel/paneViewModel'
import { usePaneDrag, usePaneResize, RESIZE_HANDLES } from '@/features/serial-panel/usePaneInteraction'
import { clampGeometry } from '@/features/serial-panel/paneViewModel'
import type { Panel, PanelGeometry } from '@/features/serial-panel/types'
import { ModbusPanelBody } from '@/features/modbus-panel/ModbusPanelBody'

interface FloatingPaneProps {
  panel: Panel
  containerRef: React.RefObject<HTMLDivElement | null>
}

/**
 * 单个浮动面板。用自写的 usePaneDrag/usePaneResize（原生 pointer events），
 * 替代 react-draggable/re-resizable（后者在 React 19 下因 findDOMNode 历史包袱失效）。
 * 移植自 legacy renderer.js 的拖拽/缩放逻辑，零第三方依赖、完全可控、React 19 无关。
 *
 * - 拖拽：标题栏 pointerdown→move 改 left/top（clamp 边界）→up 存 store
 * - 缩放：8 向手柄，按方向改 left/top/width/height（clamp minSize）
 * - z 由 panel.z 决定（pin 基线更高）
 */
export function FloatingPane({ panel, containerRef }: FloatingPaneProps) {
  const setGeometry = usePanelsStore((s) => s.setGeometry)
  const save = usePanelsStore((s) => s.save)
  const setActive = usePanelsStore((s) => s.setActive)
  const togglePin = usePanelsStore((s) => s.togglePin)
  const setHidden = usePanelsStore((s) => s.setHidden)
  const setViewMode = usePanelsStore((s) => s.setViewMode)
  const appendSysLine = usePanelsStore((s) => s.appendSysLine)
  const togglePanelOpen = usePanelsStore((s) => s.togglePanelOpen)
  const setLogging = usePanelsStore((s) => s.setLogging)
  const ipc = useIPC()

  const paneRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  // 挂载时把可能落到容器外的几何钳回可见区域。修复「大窗拖到边缘 → 重开会话/缩窗后
  // 面板在屏幕外看不到」：保存的位置基于旧窗口，新窗口（或重开）需校正一次。
  // 仅在首次挂载（即从隐藏变为可见）触发一次校正并持久化，避免与用户拖拽冲突。
  // 用 useLayoutEffect 在浏览器绘制前校正，避免一帧「屏幕外闪现」。
  useLayoutEffect(() => {
    const cont = containerRef.current
    const cw = cont?.clientWidth
    const ch = cont?.clientHeight
    if (!cw || !ch) return
    const clamped = clampGeometry(panel.geometry, { w: cw, h: ch })
    const same =
      clamped.x === panel.geometry.x &&
      clamped.y === panel.geometry.y &&
      clamped.w === panel.geometry.w &&
      clamped.h === panel.geometry.h
    if (same) return
    setGeometry(panel.id, clamped)
    save()
    // 仅依赖 panel.id + 初始 geometry：只在「面板首次出现/重开」时校正一次，
    // 不在每次 geometry 变更（如拖拽）后重复触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.id, panel.geometry.x, panel.geometry.y, panel.geometry.w, panel.geometry.h])

  // 拖拽/缩放回调 useCallback 化，避免每次重渲染（pin/open/viewMode 切换等）产生新引用
  // → usePaneInteraction 的 useEffect deps 变化 → 重绑 8+ 监听器。
  // 关键：回调只依赖稳定的 panel.id + store action 引用；geometry 通过 getState() 读最新，
  // 不进依赖数组——否则拖拽过程中 panel.geometry 变化仍会让 useCallback 每次重建回调。
  const onDragStart = useCallback(() => setActive(panel.id), [setActive, panel.id])
  const onDragEnd = useCallback((x: number, y: number) => {
    const cur = usePanelsStore.getState().panels[panel.id]?.geometry
    if (cur) setGeometry(panel.id, { ...cur, x, y })
    save()
  }, [setGeometry, save, panel.id])
  const onResizeEnd = useCallback((geo: PanelGeometry) => {
    setGeometry(panel.id, geo)
    save()
  }, [setGeometry, save, panel.id])

  usePaneDrag(headerRef, paneRef, containerRef, onDragStart, onDragEnd)
  usePaneResize(paneRef, containerRef, onResizeEnd)

  function handleToggleOpen() {
    void togglePanelOpen(panel.id)
  }

  async function handleToggleLogging() {
    if (panel.logging.active) {
      setLogging(panel.id, false, null)
      appendSysLine(panel.id, '[系统] 已停止记录日志')
    } else {
      try {
        const path = await ipc.logger.pickFile()
        if (!path) return
        setLogging(panel.id, true, path)
        appendSysLine(panel.id, `[系统] 开始记录日志到 ${path}`)
      } catch (e) {
        appendSysLine(panel.id, `[错误] 选日志路径失败：${String(e)}`)
      }
    }
  }

  async function handleExport() {
    try {
      await exportPanelLog(panel)
      appendSysLine(panel.id, '[系统] 已导出数据')
    } catch (e) {
      appendSysLine(panel.id, `[错误] 导出失败：${String(e)}`)
    }
  }

  function handlePopout() {
    try {
      if (panel.type === 'modbus' && panel.modbus) {
        // modbus 面板：借用 viewMode 槽位传 'modbus' 标识，optionsStr 槽位传 modbus 配置快照。
        // 主进程 panel:popout handler 不区分类型，原样转发到 popout URL。
        ipc.panel.popout(
          panel.id,
          displayName(panel),
          '[]',
          panel.pinned,
          panel.open,
          'modbus',
          JSON.stringify({
            connectOptions: panel.modbus.connectOptions,
            blocks: panel.modbus.blocks,
            blockValues: panel.modbus.blockValues,
          })
        )
      } else {
        ipc.panel.popout(
          panel.id,
          displayName(panel),
          JSON.stringify(panel.chunks),
          panel.pinned,
          panel.open,
          panel.viewMode,
          JSON.stringify(panel.options)
        )
      }
      setHidden(panel.id, true)
    } catch {
      /* web 预览无 ipc */
    }
  }

  return (
    <PaneContextMenu
      panel={panel}
      onToggleOpen={handleToggleOpen}
      onToggleLogging={handleToggleLogging}
      onExport={handleExport}
      onPopout={handlePopout}
    >
      <div
        ref={paneRef}
        onPointerDown={() => setActive(panel.id)}
        style={{
          position: 'absolute',
          left: panel.geometry.x,
          top: panel.geometry.y,
          width: panel.geometry.w,
          height: panel.geometry.h,
          zIndex: panel.z
        }}
        className={`flex flex-col overflow-hidden rounded-md border bg-card shadow-md ${panel.pinned ? 'ring-2 ring-primary' : ''}`}
      >
        <div ref={headerRef}>
          <PaneHeader
            panel={panel}
            onToggleOpen={handleToggleOpen}
            onToggleHex={() => setViewMode(panel.id, panel.viewMode === 'text' ? 'hex' : 'text')}
            onTogglePin={() => togglePin(panel.id)}
            onHide={() => setHidden(panel.id, true)}
            onPopout={handlePopout}
            onToggleLogging={handleToggleLogging}
            onExport={handleExport}
          />
        </div>
        {panel.type === 'modbus' && panel.modbus ? (
          <ModbusPanelBody panel={panel} />
        ) : (
          <>
            <div className="flex flex-1 flex-col overflow-hidden">
              <DataDisplay panel={panel} />
            </div>
            <SendBar panel={panel} />
          </>
        )}
        {/* 8 向缩放手柄 */}
        {RESIZE_HANDLES.map((h) => (
          <div
            key={h.dir}
            data-dir={h.dir}
            className={`absolute z-10 ${h.className}`}
            style={{ touchAction: 'none' }}
          />
        ))}
      </div>
    </PaneContextMenu>
  )
}
