/**
 * 更新日志「有未读更新内容」角标 store 单测。
 * 对齐 legacy renderer.js:4547-4558：版本号 != localStorage.lastReadVersion → 有未读。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { useChangelogBadgeStore } from '../src/shared/store/changelog'

// 内存版 localStorage（store 的 getItem/setItem 在 try/catch 内）
const lsStore = new Map<string, string>()
const lsShim = {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
  clear: () => lsStore.clear()
}

beforeEach(() => {
  const g = globalThis as Record<string, unknown>
  g.localStorage = lsShim
  lsStore.clear()
  useChangelogBadgeStore.setState({ appVersion: '', lastReadVersion: '' })
})

describe('changelog badge', () => {
  it('未设置版本 → 无未读', () => {
    expect(useChangelogBadgeStore.getState().hasUnread()).toBe(false)
  })

  it('版本与已读版本不等 → 有未读', () => {
    lsStore.set('lastReadVersion', '0.5.0')
    useChangelogBadgeStore.setState({ appVersion: '0.6.0', lastReadVersion: '0.5.0' })
    expect(useChangelogBadgeStore.getState().hasUnread()).toBe(true)
  })

  it('markRead 写入当前版本并清除未读态', () => {
    useChangelogBadgeStore.setState({ appVersion: '0.6.0', lastReadVersion: '0.5.0' })
    useChangelogBadgeStore.getState().markRead()
    expect(useChangelogBadgeStore.getState().hasUnread()).toBe(false)
    expect(lsStore.get('lastReadVersion')).toBe('0.6.0') // 持久化到 legacy key
  })

  it('版本与已读版本相等 → 无未读', () => {
    lsStore.set('lastReadVersion', '0.6.0')
    useChangelogBadgeStore.setState({ appVersion: '0.6.0', lastReadVersion: '0.6.0' })
    expect(useChangelogBadgeStore.getState().hasUnread()).toBe(false)
  })
})
