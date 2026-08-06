import { describe, expect, it } from 'vitest'
import { settleTransient, HISTORY_LIMIT } from '@/features/script-editor/graphHistoryCore'
import type { GraphEditorState } from '@/features/script-editor/rete/graphState'
import { createEmptyGraphState } from '@/features/script-editor/rete/graphState'

const empty = () => createEmptyGraphState()
const withNode = (count: number): GraphEditorState => {
  const g = empty()
  for (let i = 0; i < count; i++) {
    g.nodes.push({ id: String(i), key: `input-manual-${i}`, label: `n${i}`, data: {} } as never)
  }
  return g
}

describe('settleTransient（transient 窗口到期结算）', () => {
  it('pendingBase 为 null（被 commit/undo 取消）时不入栈、不动 future', () => {
    const past: GraphEditorState[] = []
    const future: GraphEditorState[] = [withNode(9)]
    const result = settleTransient(past, future, null)
    expect(result.past).toHaveLength(0)
    expect(result.future).toEqual(future)
  })

  it('pendingBase 存在时入栈并清空 future', () => {
    const past: GraphEditorState[] = []
    const future: GraphEditorState[] = [withNode(9)]
    const base = withNode(1)
    const result = settleTransient(past, future, base)
    expect(result.past).toHaveLength(1)
    expect(result.past[0]).toBe(base)
    expect(result.future).toHaveLength(0)
  })

  it('入栈后裁剪超出 HISTORY_LIMIT 的旧条目', () => {
    const past: GraphEditorState[] = []
    for (let i = 0; i < HISTORY_LIMIT; i++) past.push(withNode(i))
    const base = withNode(999)
    const result = settleTransient(past, [], base)
    expect(result.past).toHaveLength(HISTORY_LIMIT)
    // 最旧（withNode(0)，0 个节点）被挤出；新 base（999 个节点）在栈顶
    expect(result.past[0].nodes).toHaveLength(1)
    expect(result.past[result.past.length - 1]).toBe(base)
  })
})
