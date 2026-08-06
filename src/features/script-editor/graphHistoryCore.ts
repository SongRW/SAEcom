import type { GraphEditorState } from '@/features/script-editor/rete/graphState'

/**
 * 图历史状态机的纯函数核心（与 React hook 解耦，便于单元测试）。
 *
 * 导出：
 * - HISTORY_LIMIT：历史栈上限
 * - settleTransient：transient 窗口到期时的结算逻辑。
 *   不变式：pendingBase 为 null（transient 被 commit/undo/redo/replace 取消）时
 *   必须 no-op——这是「取消定时器 = 清空 base」的纯函数侧保证。
 */

export const HISTORY_LIMIT = 100

export interface SettleResult {
  past: GraphEditorState[]
  future: GraphEditorState[]
}

/** transient 到期结算：base 存在则入栈并清 future；否则（已被取消）不做任何事。 */
export function settleTransient(
  past: GraphEditorState[],
  future: GraphEditorState[],
  pendingBase: GraphEditorState | null
): SettleResult {
  if (!pendingBase) return { past, future }
  const nextPast = [...past, pendingBase]
  if (nextPast.length > HISTORY_LIMIT) nextPast.shift()
  return { past: nextPast, future: [] }
}
