import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePaneDrag, usePaneResize, RESIZE_HANDLES } from '@/features/serial-panel/usePaneInteraction'
import { useOscilloscopeStore } from '@/features/oscilloscope/store'
import { OscilloscopePane } from '@/features/oscilloscope/OscilloscopePane'
import { X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

interface Geometry {
  x: number
  y: number
  w: number
  h: number
}

interface OscilloscopeFloatingWindowProps {
  panelId: string
  title: string
  containerRef: React.RefObject<HTMLDivElement | null>
  initialGeometry?: Geometry
}

/**
 * 示波器浮动窗格。复用 serial-panel 的 usePaneDrag/usePaneResize（原生 pointer，React 19 兼容），
 * DOM 结构对齐 FloatingPane（data-dir 缩放手柄 + 内联 style 改 left/top/width/height）。
 * 几何状态本地维护（示波器几何不持久化到 panels.json，与串口面板不同）。
 */
export function OscilloscopeFloatingWindow(props: OscilloscopeFloatingWindowProps) {
  const { t } = useTranslation()
  const closePane = useOscilloscopeStore((s) => s.closePane)
  const setActive = useOscilloscopeStore((s) => s.openPane)
  const [geo, setGeo] = useState<Geometry>(props.initialGeometry ?? { x: 60, y: 60, w: 640, h: 380 })
  const paneRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  usePaneDrag(headerRef, paneRef, props.containerRef, () => setActive(props.panelId), (x, y) =>
    setGeo((g) => ({ ...g, x, y }))
  )
  usePaneResize(paneRef, props.containerRef, (next) => setGeo(next))

  return (
    <div
      ref={paneRef}
      onPointerDown={() => setActive(props.panelId)}
      style={{
        position: 'absolute',
        left: geo.x,
        top: geo.y,
        width: geo.w,
        height: geo.h,
        zIndex: 1000
      }}
      className="flex flex-col overflow-hidden rounded-md border border-border bg-card shadow-md"
    >
      <div
        ref={headerRef}
        className="flex items-center justify-between px-2 py-1 border-b border-border cursor-move select-none bg-muted/40"
      >
        <span className="text-xs font-medium">{t('oscilloscope.windowTitle', { title: props.title })}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => closePane(props.panelId)}>
          <X size={14} />
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        <OscilloscopePane panelId={props.panelId} title={props.title} />
      </div>
      {/* 8 向缩放手柄（与 FloatingPane 同构，usePaneResize 按 data-dir 定位） */}
      {RESIZE_HANDLES.map((h) => (
        <div
          key={h.dir}
          data-dir={h.dir}
          className={`absolute z-10 ${h.className}`}
          style={{ touchAction: 'none' }}
        />
      ))}
    </div>
  )
}
