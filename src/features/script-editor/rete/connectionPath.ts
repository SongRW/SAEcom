/** 自动排版用的 ELK 参数：强化交叉最小化，并加大层/节点间距。 */
export const ARRANGE_LAYOUT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.spacing.nodeNode': '80',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  'elk.layered.spacing.edgeNodeBetweenLayers': '48',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.thoroughness': '10'
}

export interface PathPoint {
  x: number
  y: number
}

/**
 * 左右端口风格的正交折线（圆角肘部）。
 * - 正向（右向数据流）：水平 → 竖直 → 水平
 * - 回边（目标在源左侧）：先外伸再绕行，减少穿节点
 * 仅生成 SVG path，不持久化折点。
 */
export function orthogonalConnectionPath(
  start: PathPoint,
  end: PathPoint,
  cornerRadius = 12
): string {
  const x1 = start.x
  const y1 = start.y
  const x2 = end.x
  const y2 = end.y
  const dy = y2 - y1
  const r = Math.max(0, cornerRadius)

  // 几乎水平：直连
  if (Math.abs(dy) < 0.5) {
    return `M ${x1} ${y1} L ${x2} ${y2}`
  }

  // 正向：源在左、目标在右
  if (x2 - x1 >= r * 2 + 8) {
    const midX = (x1 + x2) / 2
    return roundedHvH(x1, y1, midX, y2, x2, r)
  }

  // 回边 / 重叠：向外绕行
  const out = Math.max(36, r * 2)
  const left = Math.min(x1, x2) - out
  const right = Math.max(x1, x2) + out
  // 选绕行侧：优先走「外伸再折」的右外侧，避免贴着节点
  const midX = x1 <= x2 ? right : left
  return roundedHvH(x1, y1, midX, y2, x2, r)
}

/** 水平 → 竖直 → 水平，肘部用二次贝塞尔圆角。 */
function roundedHvH(
  x1: number,
  y1: number,
  midX: number,
  y2: number,
  x2: number,
  radius: number
): string {
  const dy = y2 - y1
  if (Math.abs(dy) < 0.5) {
    return `M ${x1} ${y1} L ${x2} ${y2}`
  }

  const dir = dy > 0 ? 1 : -1
  const horiz1 = Math.abs(midX - x1)
  const horiz2 = Math.abs(x2 - midX)
  const vert = Math.abs(dy)
  const r = Math.min(radius, horiz1 / 2, horiz2 / 2, vert / 2)

  if (r < 1) {
    return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
  }

  const sign1 = midX >= x1 ? 1 : -1
  const sign2 = x2 >= midX ? 1 : -1

  return [
    `M ${x1} ${y1}`,
    `L ${midX - sign1 * r} ${y1}`,
    `Q ${midX} ${y1} ${midX} ${y1 + dir * r}`,
    `L ${midX} ${y2 - dir * r}`,
    `Q ${midX} ${y2} ${midX + sign2 * r} ${y2}`,
    `L ${x2} ${y2}`
  ].join(' ')
}
