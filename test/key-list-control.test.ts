import { describe, expect, it } from 'vitest'
import { KeyListControl, type KeyEntry } from '../src/features/script-editor/rete/KeyListControl'

describe('KeyListControl key id generation', () => {
  it('seeds the id counter from existing keys so reloaded nodes do not reuse persisted ids', () => {
    // 模拟「保存→重载→新增键」场景：节点从磁盘加载时已有 id k1/k2
    const persisted: KeyEntry[] = [
      { id: 'k1', name: 'a' },
      { id: 'k2', name: 'b' }
    ]
    const control = new KeyListControl(persisted, () => {})

    // 新增的键不应复用 k1/k2，应从 k3 开始
    expect(control.newKeyId()).toBe('k3')
    expect(control.newKeyId()).toBe('k4')
  })

  it('starts from k1 when there are no existing keys', () => {
    const control = new KeyListControl([], () => {})
    expect(control.newKeyId()).toBe('k1')
  })

  it('handles existing ids that do not match the k<number> pattern', () => {
    const control = new KeyListControl(
      [{ id: 'custom', name: 'x' }, { id: 'k5', name: 'y' }],
      () => {}
    )
    expect(control.newKeyId()).toBe('k6')
  })

  it('each instance maintains an independent counter', () => {
    const a = new KeyListControl([{ id: 'k2', name: 'a' }], () => {})
    const b = new KeyListControl([], () => {})
    expect(a.newKeyId()).toBe('k3')
    expect(b.newKeyId()).toBe('k1')
  })
})
