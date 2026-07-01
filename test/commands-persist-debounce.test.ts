/**
 * 命令持久化防止单测：验证 updateCommand 触发的 persist 被防抖，
 * 连续多次变更只在防抖窗口后写一次；flushNow 立即触发挂起的写入。
 * 覆盖 spec C8 防抖部分。
 */
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { useCommandsStore } from '../src/features/commands/store'

const apiShim = {
  commands: { save: vi.fn(), load: vi.fn().mockResolvedValue([]) }
}
const lsStore = new Map<string, string>()
const lsShim = {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
  clear: () => lsStore.clear()
}

beforeEach(() => {
  const g = globalThis as Record<string, unknown>
  g.window = { api: apiShim }
  g.api = apiShim
  g.localStorage = lsShim
  lsStore.clear()
  useCommandsStore.setState({
    commands: [{ id: 'a', name: '', data: '', mode: 'text', group: '默认分组' }],
    groupsMeta: { groups: ['默认分组'], active: '默认分组', visible: ['默认分组'] },
    loaded: true
  })
  apiShim.commands.save.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('persist 防抖', () => {
  it('连续 updateCommand 在防抖窗口内只写一次盘', () => {
    vi.useFakeTimers()
    const store = useCommandsStore.getState()
    store.updateCommand('a', { data: 'x' })
    store.updateCommand('a', { data: 'xx' })
    store.updateCommand('a', { data: 'xxx' })
    // 防抖窗口内尚未写盘
    expect(apiShim.commands.save).not.toHaveBeenCalled()
    // 推进防抖窗口（store 用 400ms，这里推 500ms 确保触发）
    vi.advanceTimersByTime(500)
    expect(apiShim.commands.save).toHaveBeenCalledTimes(1)
  })

  it('flushNow 立即写盘（不等防抖窗口）', () => {
    vi.useFakeTimers()
    const store = useCommandsStore.getState()
    store.updateCommand('a', { data: 'y' })
    expect(apiShim.commands.save).not.toHaveBeenCalled()
    store.flushNow()
    expect(apiShim.commands.save).toHaveBeenCalledTimes(1)
  })
})
