import { useCallback, useEffect, useRef, useState } from 'react'
import type { GraphEditorState } from '@/features/script-editor/rete/graphState'

const HISTORY_LIMIT = 100

/**
 * 图编辑历史（撤销/重做）。
 *
 * - present: 当前图状态
 * - setGraphCommit: 用户编辑入口，push 旧状态到 past，clear future
 * - setGraphReplace: 程序化替换（加载脚本/自动排版），不入栈
 * - setGraphTransient: 高频更新（拖拽中），合并到一次快照（300ms 窗口）
 * - undo / redo
 */
export function useGraphHistory(initial: GraphEditorState) {
  const [present, setPresent] = useState<GraphEditorState>(initial)
  const pastRef = useRef<GraphEditorState[]>([])
  const futureRef = useRef<GraphEditorState[]>([])
  const [, forceTick] = useState(0)
  const transientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transientBaseRef = useRef<GraphEditorState | null>(null)

  const tick = useCallback(() => forceTick((n) => n + 1), [])

  /** 用户编辑：旧状态入栈，应用新状态，清 future */
  const setGraphCommit = useCallback((next: GraphEditorState | ((prev: GraphEditorState) => GraphEditorState)) => {
    setPresent((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: GraphEditorState) => GraphEditorState)(prev) : next
      if (resolved === prev) return prev
      pastRef.current.push(prev)
      if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift()
      futureRef.current = []
      tick()
      return resolved
    })
  }, [tick])

  /** 程序化替换（加载/新建/排版）：不入栈 */
  const setGraphReplace = useCallback((next: GraphEditorState | ((prev: GraphEditorState) => GraphEditorState)) => {
    setPresent((prev) => (typeof next === 'function' ? (next as (p: GraphEditorState) => GraphEditorState)(prev) : next))
  }, [])

  /**
   * 高频瞬时更新（拖拽中）：300ms 窗口内合并为一次历史快照。
   * 第一次调用记录 base（入栈时机），窗口结束前不重复入栈。
   */
  const setGraphTransient = useCallback((next: GraphEditorState | ((prev: GraphEditorState) => GraphEditorState)) => {
    setPresent((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: GraphEditorState) => GraphEditorState)(prev) : next
      if (resolved === prev) return prev
      // 第一次瞬时更新：记录 base 作为快照起点
      if (!transientBaseRef.current) {
        transientBaseRef.current = prev
      }
      // 延迟提交：300ms 内的连续更新合并成一次 history 入栈
      if (transientTimerRef.current) clearTimeout(transientTimerRef.current)
      transientTimerRef.current = setTimeout(() => {
        if (transientBaseRef.current) {
          pastRef.current.push(transientBaseRef.current)
          if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift()
          futureRef.current = []
          transientBaseRef.current = null
          tick()
        }
        transientTimerRef.current = null
      }, 300)
      return resolved
    })
  }, [tick])

  const undo = useCallback(() => {
    setPresent((prev) => {
      if (pastRef.current.length === 0) return prev
      const previous = pastRef.current.pop()!
      futureRef.current.push(prev)
      if (futureRef.current.length > HISTORY_LIMIT) futureRef.current.shift()
      tick()
      return previous
    })
  }, [tick])

  const redo = useCallback(() => {
    setPresent((prev) => {
      if (futureRef.current.length === 0) return prev
      const next = futureRef.current.pop()!
      pastRef.current.push(prev)
      if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift()
      tick()
      return next
    })
  }, [tick])

  // 卸载时清理 transient timer
  useEffect(() => {
    return () => {
      if (transientTimerRef.current) clearTimeout(transientTimerRef.current)
    }
  }, [])

  return {
    graph: present,
    setGraphCommit,
    setGraphReplace,
    setGraphTransient,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0
  }
}
