import type { CanvasTool } from '@/features/script-editor/uiState'

export interface ToolCapabilities {
  nodeDrag: boolean
  areaPan: boolean
  nodeInteractive: boolean
  marquee: boolean
}

export function getToolCapabilities(tool: CanvasTool): ToolCapabilities {
  if (tool === 'pan') {
    return { nodeDrag: false, areaPan: true, nodeInteractive: false, marquee: false }
  }
  if (tool === 'select') {
    return { nodeDrag: true, areaPan: false, nodeInteractive: true, marquee: true }
  }
  return { nodeDrag: true, areaPan: true, nodeInteractive: true, marquee: false }
}

export interface Point {
  x: number
  y: number
}

export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

export interface NodeRect {
  id: string
  rect: Bounds
}

export function computeMarqueeRect(start: Point, current: Point): Bounds {
  return {
    left: Math.min(start.x, current.x),
    top: Math.min(start.y, current.y),
    right: Math.max(start.x, current.x),
    bottom: Math.max(start.y, current.y)
  }
}

function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

export function nodesInMarquee(nodeRects: NodeRect[], marquee: Bounds): string[] {
  return nodeRects.filter((node) => boundsIntersect(node.rect, marquee)).map((node) => node.id)
}

export function shouldOpenNodeConfig(eventType: string, detail: number): boolean {
  if (eventType === 'dblclick') return true
  if (eventType === 'click') return detail >= 2
  return false
}
