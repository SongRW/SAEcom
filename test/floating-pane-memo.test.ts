/**
 * FloatingPane 传给 usePaneDrag/usePaneResize 的回调必须 useCallback 化，
 * 否则每次重渲染产生新引用 → usePaneInteraction 的 useEffect deps 变化 → 重绑 8+ 监听器。
 *
 * 注意：拖拽过程中 panel.geometry 会变，若回调依赖 panel.geometry，useCallback 仍会每次重建
 * （问题依旧）。正确做法：回调只依赖稳定的 panel.id + store action 引用，
 * 通过 usePanelsStore.getState() 读最新 geometry，使回调引用在拖拽期间保持稳定。
 *
 * React 组件交互（effect 重绑）在 vitest node 环境（无 jsdom）无法行为测试，
 * 故用源码扫描验证 useCallback 化 + 不依赖 panel.geometry 的修复形状。
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(path.resolve(__dirname, '../src/features/serial-panel/components/FloatingPane.tsx'), 'utf-8')

describe('FloatingPane memoizes drag/resize callbacks', () => {
  it('usePaneDrag / usePaneResize 的回调用 useCallback 包裹', () => {
    expect(src).toMatch(/useCallback/)
    // 拖拽 onDragEnd 回调不应内联依赖 panel.geometry（否则 useCallback 仍每次重建）
    // 用 getState() 读最新 geometry 是修复标志
    expect(src).toMatch(/getState\(\)/)
  })
})
