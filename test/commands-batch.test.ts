/**
 * 命令 store 批量操作单测：removeCommands / moveCommandsToGroup / copyCommandsToGroup。
 * 对齐 legacy cmdDeleteSel / cmdMoveSel / cmdCopySel（renderer.js:4339/4352/4398）。
 *
 * node 环境无 window.api / localStorage，故注入最小 shim（commands.save 为空函数即可，
 * store 仅 catch；localStorage 用内存 Map 兜底，store persist 在 try/catch 内不会抛）。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useCommandsStore } from '../src/features/commands/store'

const apiShim = {
  commands: { save: vi.fn(), load: vi.fn().mockResolvedValue([]) }
}

// 内存版 localStorage shim（store.persist 的 setItem/getItem 在 try/catch 内）
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
  // 重置 store 到初始态
  useCommandsStore.setState({
    commands: [],
    groupsMeta: { groups: ['默认分组'], active: '默认分组', visible: ['默认分组'] },
    loaded: true
  })
  apiShim.commands.save.mockClear()
})

describe('removeCommands', () => {
  it('批量删除选中命令，保留未选中', () => {
    useCommandsStore.setState({
      commands: [
        { id: 'a', name: 'A', data: '1', mode: 'text', group: '默认分组' },
        { id: 'b', name: 'B', data: '2', mode: 'text', group: '默认分组' },
        { id: 'c', name: 'C', data: '3', mode: 'text', group: '默认分组' }
      ]
    })
    useCommandsStore.getState().removeCommands(['a', 'c'])
    const cmds = useCommandsStore.getState().commands
    expect(cmds.map((c) => c.id)).toEqual(['b'])
    // persist 已改为防抖；flushNow 立即触发挂起的写入后再断言
    useCommandsStore.getState().flushNow()
    expect(apiShim.commands.save).toHaveBeenCalled()
  })

  it('空 ids 不修改、不持久化', () => {
    useCommandsStore.setState({
      commands: [{ id: 'a', name: 'A', data: '1', mode: 'text', group: '默认分组' }]
    })
    useCommandsStore.getState().removeCommands([])
    expect(useCommandsStore.getState().commands).toHaveLength(1)
    expect(apiShim.commands.save).not.toHaveBeenCalled()
  })
})

describe('moveCommandsToGroup', () => {
  it('把选中命令 group 改为目标分组', () => {
    useCommandsStore.setState({
      groupsMeta: { groups: ['默认分组', 'G2'], active: '默认分组', visible: ['默认分组', 'G2'] },
      commands: [
        { id: 'a', name: 'A', data: '1', mode: 'text', group: '默认分组' },
        { id: 'b', name: 'B', data: '2', mode: 'hex', group: '默认分组' }
      ]
    })
    useCommandsStore.getState().moveCommandsToGroup(['a'], 'G2')
    const cmds = useCommandsStore.getState().commands
    expect(cmds.find((c) => c.id === 'a')!.group).toBe('G2')
    expect(cmds.find((c) => c.id === 'b')!.group).toBe('默认分组')
  })

  it('目标分组不存在 → 不改动', () => {
    useCommandsStore.setState({
      commands: [{ id: 'a', name: 'A', data: '1', mode: 'text', group: '默认分组' }]
    })
    useCommandsStore.getState().moveCommandsToGroup(['a'], '不存在')
    expect(useCommandsStore.getState().commands[0].group).toBe('默认分组')
  })
})

describe('copyCommandsToGroup', () => {
  it('复制选中命令到目标分组（新 id、group=target，追加到末尾），返回新建条数', () => {
    useCommandsStore.setState({
      groupsMeta: { groups: ['默认分组', 'G2'], active: '默认分组', visible: ['默认分组', 'G2'] },
      commands: [
        { id: 'a', name: 'A', data: '1', mode: 'text', group: '默认分组' },
        { id: 'b', name: 'B', data: '2', mode: 'hex', group: '默认分组' }
      ]
    })
    const n = useCommandsStore.getState().copyCommandsToGroup(['a'], 'G2')
    expect(n).toBe(1)
    const cmds = useCommandsStore.getState().commands
    expect(cmds).toHaveLength(3)
    const copy = cmds[2]
    expect(copy.id).not.toBe('a')
    expect(copy.group).toBe('G2')
    expect(copy.name).toBe('A')
    expect(copy.data).toBe('1')
    expect(copy.mode).toBe('text')
  })

  it('空 ids 返回 0，不改动', () => {
    useCommandsStore.setState({
      commands: [{ id: 'a', name: 'A', data: '1', mode: 'text', group: '默认分组' }]
    })
    const n = useCommandsStore.getState().copyCommandsToGroup([], 'G2')
    expect(n).toBe(0)
    expect(useCommandsStore.getState().commands).toHaveLength(1)
  })

  it('目标分组不存在 → 返回 0，不改动', () => {
    useCommandsStore.setState({
      commands: [{ id: 'a', name: 'A', data: '1', mode: 'text', group: '默认分组' }]
    })
    const n = useCommandsStore.getState().copyCommandsToGroup(['a'], '不存在')
    expect(n).toBe(0)
    expect(useCommandsStore.getState().commands).toHaveLength(1)
  })
})
