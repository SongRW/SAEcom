import { useEffect, useRef } from 'react'
import type { PanelGeometry } from '@/features/serial-panel/types'
import { MIN_PANEL_SIZE } from '@/features/serial-panel/paneViewModel'

const DRAG_THRESHOLD = 3

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

type Dir = 't' | 'r' | 'b' | 'l' | 'tl' | 'tr' | 'bl' | 'br'

/**
 * 拖拽 hook。移植自 legacy renderer.js:2332-2410 的 pointer events 逻辑。
 * 绑定到标题栏元素 ref，拖拽时直接改面板元素 left/top（无 findDOMNode 依赖，React 19 兼容）。
 *
 * @param handleRef 标题栏 ref（pointerdown/move/up 绑在此）
 * @param paneRef 面板根 ref（被拖动的元素，改其 left/top）
 * @param containerRef 工作区容器 ref（用于 clamp 边界）
 * @param geometry 当前几何（拖拽起点）
 * @param onDragEnd 拖拽结束回调（提交新位置）
 */
export function usePaneDrag(
  handleRef: React.RefObject<HTMLElement | null>,
  paneRef: React.RefObject<HTMLDivElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  onStart: () => void,
  onDragEnd: (x: number, y: number) => void
) {
  const state = useRef({ pressed: false, dragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 })

  useEffect(() => {
    const handleEl = handleRef.current
    const pane = paneRef.current
    if (!handleEl || !pane) return
    const handle = handleEl

    // 用统一的 MouseEvent/PointerEvent 类型处理（真实环境 pointer，自动化/兜底 mouse）
    function onDown(e: PointerEvent | MouseEvent) {
      const target = e.target as HTMLElement
      if (target.closest('button')) return // 不拦截按钮点击
      onStart()
      const st = state.current
      st.pressed = true
      st.dragging = false
      if ('pointerId' in e) {
        try {
          handle.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
      st.startX = e.clientX
      st.startY = e.clientY
      st.startLeft = parseInt(pane!.style.left, 10) || 0
      st.startTop = parseInt(pane!.style.top, 10) || 0
    }

    function onMove(e: PointerEvent | MouseEvent) {
      const st = state.current
      if (!st.pressed) return
      const dx = e.clientX - st.startX
      const dy = e.clientY - st.startY
      if (!st.dragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        st.dragging = true
      }
      if (!st.dragging) return

      const cont = containerRef.current
      const cw = cont?.clientWidth ?? window.innerWidth
      const ch = cont?.clientHeight ?? window.innerHeight
      const pw = pane!.offsetWidth
      const ph = pane!.offsetHeight

      const maxLeft = Math.max(0, cw - pw) - 2
      const maxTop = Math.max(0, ch - ph) - 2
      const newLeft = clamp(st.startLeft + dx, 0, maxLeft)
      const newTop = clamp(st.startTop + dy, 0, maxTop)

      pane!.style.left = `${newLeft}px`
      pane!.style.top = `${newTop}px`
    }

    function onUp(e: PointerEvent | MouseEvent) {
      const st = state.current
      if (!st.pressed) return
      st.pressed = false
      if (st.dragging) {
        st.dragging = false
        const x = parseInt(pane!.style.left, 10) || 0
        const y = parseInt(pane!.style.top, 10) || 0
        onDragEnd(x, y)
      }
      if ('pointerId' in e) {
        try {
          handle.releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
    }

    // pointer events（真实环境主路径）
    handle.addEventListener('pointerdown', onDown as EventListener)
    window.addEventListener('pointermove', onMove as EventListener)
    window.addEventListener('pointerup', onUp as EventListener)
    window.addEventListener('pointercancel', onUp as EventListener)
    // mouse events 兜底（某些自动化/环境不发 pointer events）
    handle.addEventListener('mousedown', onDown as EventListener)
    window.addEventListener('mousemove', onMove as EventListener)
    window.addEventListener('mouseup', onUp as EventListener)
    return () => {
      handle.removeEventListener('pointerdown', onDown as EventListener)
      window.removeEventListener('pointermove', onMove as EventListener)
      window.removeEventListener('pointerup', onUp as EventListener)
      window.removeEventListener('pointercancel', onUp as EventListener)
      handle.removeEventListener('mousedown', onDown as EventListener)
      window.removeEventListener('mousemove', onMove as EventListener)
      window.removeEventListener('mouseup', onUp as EventListener)
    }
  }, [handleRef, paneRef, containerRef, onStart, onDragEnd])
}

/**
 * 缩放 hook。移植自 legacy renderer.js:2412-2489 的 8 向手柄逻辑。
 * 给面板根挂 8 个手柄子元素，pointerdown 选方向，move 改 left/top/width/height（clamp minSize + 边界）。
 *
 * @param paneRef 面板根 ref
 * @param containerRef 工作区容器 ref
 * @param onResizeEnd 缩放结束回调（提交新几何）
 */
export function usePaneResize(
  paneRef: React.RefObject<HTMLDivElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  onResizeEnd: (geo: PanelGeometry) => void
) {
  const rs = useRef({ active: false, dir: '' as Dir, sx: 0, sy: 0, sl: 0, st: 0, sw: 0, sh: 0 })

  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return

    function onHandleDown(e: PointerEvent | MouseEvent) {
      const handle = e.target as HTMLElement
      const dir = (handle.dataset.dir as Dir) || 'br'
      const r = rs.current
      r.active = true
      r.dir = dir
      r.sx = e.clientX
      r.sy = e.clientY
      r.sl = parseInt(pane!.style.left, 10) || 0
      r.st = parseInt(pane!.style.top, 10) || 0
      r.sw = pane!.offsetWidth
      r.sh = pane!.offsetHeight
      if ('pointerId' in e) {
        try {
          handle.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
      e.stopPropagation()
    }

    function onHandleMove(e: PointerEvent | MouseEvent) {
      const r = rs.current
      if (!r.active) return
      const dx = e.clientX - r.sx
      const dy = e.clientY - r.sy
      const cont = containerRef.current
      const cw = cont?.clientWidth ?? window.innerWidth
      const ch = cont?.clientHeight ?? window.innerHeight
      const minW = MIN_PANEL_SIZE.w
      const minH = MIN_PANEL_SIZE.h

      let { sl, st, sw, sh } = r
      const d = r.dir

      if (d.includes('r')) sw = clamp(r.sw + dx, minW, cw - r.sl)
      if (d.includes('b')) sh = clamp(r.sh + dy, minH, ch - r.st)
      if (d.includes('l')) {
        const leftMax = r.sl + r.sw - minW
        sl = clamp(r.sl + dx, 0, leftMax)
        sw = r.sw + (r.sl - sl)
      }
      if (d.includes('t')) {
        const topMax = r.st + r.sh - minH
        st = clamp(r.st + dy, 0, topMax)
        sh = r.sh + (r.st - st)
      }

      pane!.style.left = `${sl}px`
      pane!.style.top = `${st}px`
      pane!.style.width = `${sw}px`
      pane!.style.height = `${sh}px`
    }

    function onHandleUp(e: PointerEvent | MouseEvent) {
      const r = rs.current
      if (!r.active) return
      r.active = false
      onResizeEnd({
        x: parseInt(pane!.style.left, 10) || 0,
        y: parseInt(pane!.style.top, 10) || 0,
        w: pane!.offsetWidth,
        h: pane!.offsetHeight
      })
      if ('pointerId' in e) {
        try {
          ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
    }

    const handles = pane.querySelectorAll<HTMLElement>('[data-dir]')
    // pointer events
    handles.forEach((h) => {
      h.addEventListener('pointerdown', onHandleDown as EventListener)
    })
    window.addEventListener('pointermove', onHandleMove as EventListener)
    window.addEventListener('pointerup', onHandleUp as EventListener)
    window.addEventListener('pointercancel', onHandleUp as EventListener)
    // mouse 兜底
    handles.forEach((h) => {
      h.addEventListener('mousedown', onHandleDown as EventListener)
    })
    window.addEventListener('mousemove', onHandleMove as EventListener)
    window.addEventListener('mouseup', onHandleUp as EventListener)
    return () => {
      handles.forEach((h) => {
        h.removeEventListener('pointerdown', onHandleDown as EventListener)
        h.removeEventListener('mousedown', onHandleDown as EventListener)
      })
      window.removeEventListener('pointermove', onHandleMove as EventListener)
      window.removeEventListener('pointerup', onHandleUp as EventListener)
      window.removeEventListener('pointercancel', onHandleUp as EventListener)
      window.removeEventListener('mousemove', onHandleMove as EventListener)
      window.removeEventListener('mouseup', onHandleUp as EventListener)
    }
  }, [paneRef, containerRef, onResizeEnd])
}

/** 8 向缩放手柄的渲染数据（FloatingPane 用它渲染手柄 div） */
export const RESIZE_HANDLES: { dir: Dir; className: string }[] = [
  { dir: 't', className: 'top-0 left-2 right-2 h-1.5 cursor-ns-resize' },
  { dir: 'b', className: 'bottom-0 left-2 right-2 h-1.5 cursor-ns-resize' },
  { dir: 'l', className: 'top-2 bottom-2 left-0 w-1.5 cursor-ew-resize' },
  { dir: 'r', className: 'top-2 bottom-2 right-0 w-1.5 cursor-ew-resize' },
  { dir: 'tl', className: 'top-0 left-0 size-3 cursor-nwse-resize' },
  { dir: 'tr', className: 'top-0 right-0 size-3 cursor-nesw-resize' },
  { dir: 'bl', className: 'bottom-0 left-0 size-3 cursor-nesw-resize' },
  { dir: 'br', className: 'bottom-0 right-0 size-3 cursor-nwse-resize' }
]
