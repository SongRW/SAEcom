/**
 * removeGroup 单测：验证删除分组时命令迁移到 fallback（而非删除），且至少保留一个分组。
 * 覆盖 spec C6：删分组不应静默丢失命令。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
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
    commands: [],
    groupsMeta: { groups: ['默认分组'], active: '默认分组', visible: ['默认分组'] },
    loaded: true
  })
  apiShim.commands.save.mockClear()
})

describe('removeGroup — 迁移语义', () => {
  it('删除分组时，组内命令迁移到 fallback 组，命令不丢失', () => {
    useCommandsStore.setState({
      commands: [
        { id: 'a', name: 'A', data: '1', mode: 'text', group: 'G1' },
        { id: 'b', name: 'B', data: '2', mode: 'text', group: 'G2' },
        { id: 'c', name: 'C', data: '3', mode: 'text', group: '默认分组' }
      ],
      groupsMeta: {
        groups: ['默认分组', 'G1', 'G2'],
        active: 'G1',
        visible: ['默认分组', 'G1', 'G2']
      }
    })

    useCommandsStore.getState().removeGroup('G1')

    const cmds = useCommandsStore.getState().commands
    // 三条命令都在，没有丢失
    expect(cmds.map((c) => c.id).sort()).toEqual(['a', 'b', 'c'])
    // 原 G1 的命令现在归到 fallback 组（fallback = groups 里第一个非 name 的，即 '默认分组'）
    const a = cmds.find((c) => c.id === 'a')!
    expect(a.group).not.toBe('G1')
    expect(a.group).toBe('默认分组')
    // G2 的命令应保持不变（防止「全迁移」的 bug）
    const b = cmds.find((c) => c.id === 'b')!
    expect(b.group).toBe('G2')
  })

  it('删除当前 active 分组时，active 迁移到 fallback', () => {
    useCommandsStore.setState({
      commands: [],
      groupsMeta: {
        groups: ['默认分组', 'G1'],
        active: 'G1',
        visible: ['默认分组', 'G1']
      }
    })
    useCommandsStore.getState().removeGroup('G1')
    const meta = useCommandsStore.getState().groupsMeta
    expect(meta.groups).toEqual(['默认分组'])
    expect(meta.active).toBe('默认分组')
  })

  it('只有一个分组时，removeGroup 不做任何变更', () => {
    useCommandsStore.setState({
      commands: [{ id: 'a', name: 'A', data: '1', mode: 'text', group: '默认分组' }],
      groupsMeta: { groups: ['默认分组'], active: '默认分组', visible: ['默认分组'] }
    })
    useCommandsStore.getState().removeGroup('默认分组')
    // 分组与命令均不变
    expect(useCommandsStore.getState().groupsMeta.groups).toEqual(['默认分组'])
    expect(useCommandsStore.getState().commands).toHaveLength(1)
  })

  it('删除默认分组时，group 字段为空的命令迁移到 fallback（覆盖 c.group||DEFAULT_GROUP 分支）', () => {
    useCommandsStore.setState({
      commands: [{ id: 'x', name: 'X', data: '', mode: 'text', group: '' }],
      groupsMeta: { groups: ['默认分组', 'G1'], active: '默认分组', visible: ['默认分组', 'G1'] }
    })
    // 删除「默认分组」本身——空 group 的命令因 || DEFAULT_GROUP 被视为属于「默认分组」
    useCommandsStore.getState().removeGroup('默认分组')
    const cmds = useCommandsStore.getState().commands
    expect(cmds).toHaveLength(1)
    // 命令应迁移到 fallback（G1），而非被删除或仍为空
    expect(cmds[0].group).toBe('G1')
  })

  it('removeGroup 后触发 persist（commands.save 被调用）', () => {
    useCommandsStore.setState({
      commands: [{ id: 'a', name: 'A', data: '1', mode: 'text', group: 'G1' }],
      groupsMeta: { groups: ['默认分组', 'G1'], active: 'G1', visible: ['默认分组', 'G1'] }
    })
    useCommandsStore.getState().removeGroup('G1')
    // persist 已改为防抖；flushNow 立即触发挂起的写入后再断言
    useCommandsStore.getState().flushNow()
    expect(apiShim.commands.save).toHaveBeenCalledTimes(1)
  })
})
