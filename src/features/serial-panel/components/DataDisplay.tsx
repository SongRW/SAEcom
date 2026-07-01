import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Panel } from '@/features/serial-panel/types'
import { renderChunks } from '@/features/serial-panel/paneViewModel'
import { usePanelsStore } from '@/features/serial-panel/store'

interface DataDisplayProps {
  panel: Panel
}

/**
 * 数据展示区。chunks 驱动渲染（文本/HEX 由 viewMode 决定），用 react-virtual 虚拟化。
 * 虚拟化：只渲染可视区域的 chunk，支持海量日志不卡顿。
 * autoScroll：新数据到达时若面板处于底部，自动滚到底（4px 容差，对应 legacy）。
 */
export function DataDisplay({ panel }: DataDisplayProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const setAutoScroll = usePanelsStore((s) => s.setAutoScroll)
  const rendered = renderChunks(panel.chunks, panel.viewMode)

  const virtualizer = useVirtualizer({
    count: rendered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 20,
    overscan: 20
  })

  useEffect(() => {
    const el = parentRef.current
    if (el && panel.autoScroll) {
      el.scrollTop = el.scrollHeight
    }
  }, [rendered.length, panel.autoScroll])

  function handleScroll() {
    const el = parentRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 4
    setAutoScroll(panel.id, atBottom)
  }

  return (
    <ScrollArea
      viewportRef={parentRef}
      onScroll={handleScroll}
      className="flex-1 font-mono text-xs leading-relaxed"
    >
      <div className="p-2">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const c = rendered[vi.index]
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)`, whiteSpace: 'pre-wrap', wordBreak: 'break-all', userSelect: 'text' }}
                className={c.isEcho ? 'text-primary' : ''}
              >
                {c.text}
              </div>
            )
          })}
        </div>
      </div>
    </ScrollArea>
  )
}
