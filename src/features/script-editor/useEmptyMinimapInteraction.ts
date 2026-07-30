import { useEffect } from 'react'
import { clampCanvasZoom } from '@/features/script-editor/viewModel'

/** minimap 像素位移 → 画布 translate 量（视口跟随，取反） */
export function computeTranslateDelta(dx: number, dy: number): { dx: number; dy: number } {
  return { dx: -dx, dy: -dy }
}

/**
 * wheel deltaY → 下一 zoom（经 clampCanvasZoom 约束）。
 * 与画布 WindowsWheelZoom / Rete 默认一致：向前（deltaY<0）放大，向后缩小。
 * minZoom 可由大图动态下限传入，默认 CANVAS_ZOOM_MIN。
 */
export function computeWheelZoom(
  currentZoom: number,
  deltaY: number,
  minZoom?: number
): number {
  const factor = deltaY < 0 ? 0.1 : -0.1
  return clampCanvasZoom(currentZoom + factor, minZoom)
}

interface ReteAreaLike {
  translate: (dx: number, dy: number) => void
}

interface ReteEditorLike {
  area?: { area?: ReteAreaLike }
}

/**
 * 空画布 minimap 交互修复。
 * Rete MinimapPlugin 节点数为 0 时不渲染导航框 → 点/拖/滚轮无反应。
 * 本 hook 在空画布时给 minimap 容器叠一层透传逻辑：
 * - pointer 拖动 → area.translate 平移画布
 * - pointer 点击（无显著 move）→ area.translate 把点击点对齐视口中心
 * - wheel → 由调用方经 onWheelZoom 回调控制缩放（GraphCanvas 持有 zoom state）
 * isEmpty=false 时本 hook no-op（回退 Rete 原生 minimap）。
 *
 * @param containerRef 画布外层容器 ref（用于查找 [data-testid="minimap"]）
 * @param editor Rete editor 实例（提供 area.area.translate）
 * @param isEmpty graph.nodes.length === 0
 * @param onWheelZoom 滚轮缩放回调，接收 deltaY，由调用方算下一 zoom 并写回
 */
export function useEmptyMinimapInteraction(
  containerRef: React.RefObject<HTMLElement | null>,
  editor: ReteEditorLike | null,
  isEmpty: boolean,
  onWheelZoom: (deltaY: number) => void
) {
  useEffect(() => {
    if (!isEmpty || !editor) return
    const cont = containerRef.current
    if (!cont) return

    const area = editor.area?.area
    if (!area) return

    /** 在 cont 范围内查找 minimap 节点（可能挂在 surface 内或上层 .script-editor-canvas）。 */
    const findMinimap = (): HTMLElement | null =>
      cont.querySelector<HTMLElement>('[data-testid="minimap"]') ||
      cont.closest('.script-editor-canvas')?.querySelector<HTMLElement>('[data-testid="minimap"]') ||
      null

    let cleanup: (() => void) | null = null

    /** 给 minimap 绑定 pointer/wheel 透传逻辑，返回解绑函数。 */
    const bind = (minimap: HTMLElement): (() => void) => {
      let dragging = false
      let moved = false
      let lastX = 0
      let lastY = 0
      let startX = 0
      let startY = 0

      const onDown = (e: PointerEvent) => {
        if (e.button !== 0) return
        dragging = true
        moved = false
        lastX = e.clientX
        lastY = e.clientY
        startX = e.clientX
        startY = e.clientY
        minimap.setPointerCapture(e.pointerId)
        minimap.style.cursor = 'grabbing'
      }

      const onMove = (e: PointerEvent) => {
        if (!dragging) return
        const dx = e.clientX - lastX
        const dy = e.clientY - lastY
        lastX = e.clientX
        lastY = e.clientY
        if (Math.abs(e.clientX - startX) > 2 || Math.abs(e.clientY - startY) > 2) moved = true
        const delta = computeTranslateDelta(dx, dy)
        area.translate(delta.dx, delta.dy)
      }

      const onUp = (e: PointerEvent) => {
        if (!dragging) return
        dragging = false
        minimap.style.cursor = 'grab'
        try { minimap.releasePointerCapture(e.pointerId) } catch { /* 已释放 */ }
        // 点击（无显著 move）：把点击点对齐视口中心
        if (!moved) {
          const rect = minimap.getBoundingClientRect()
          const cx = e.clientX - rect.left - rect.width / 2
          const cy = e.clientY - rect.top - rect.height / 2
          const delta = computeTranslateDelta(cx, cy)
          area.translate(delta.dx, delta.dy)
        }
      }

      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        onWheelZoom(e.deltaY)
      }

      minimap.style.cursor = 'grab'
      minimap.addEventListener('pointerdown', onDown)
      minimap.addEventListener('pointermove', onMove)
      minimap.addEventListener('pointerup', onUp)
      minimap.addEventListener('wheel', onWheel, { passive: false })

      return () => {
        minimap.style.cursor = ''
        minimap.removeEventListener('pointerdown', onDown)
        minimap.removeEventListener('pointermove', onMove)
        minimap.removeEventListener('pointerup', onUp)
        minimap.removeEventListener('wheel', onWheel)
      }
    }

    const minimap = findMinimap()
    if (minimap) {
      cleanup = bind(minimap)
    } else {
      // minimap 由 Rete MinimapPlugin 的 React render preset 异步渲染，effect 跑时尚未
      // 挂到 DOM。此处 observe 子树，待 minimap 出现后绑定并 disconnect（保证空图态
      // 重挂载/异步渲染下交互也能稳定生效）。
      const observer = new MutationObserver(() => {
        const mm = findMinimap()
        if (mm && !cleanup) {
          cleanup = bind(mm)
          observer.disconnect()
        }
      })
      observer.observe(cont, { childList: true, subtree: true })
      // 兜底：observer 最终未命中也要可被清理。
      return () => {
        observer.disconnect()
        cleanup?.()
      }
    }

    return () => {
      cleanup?.()
    }
  }, [containerRef, editor, isEmpty, onWheelZoom])
}
