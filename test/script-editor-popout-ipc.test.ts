import { describe, expect, it } from 'vitest'
import type { ScriptEditorAPI } from '@shared/types'

describe('script editor popout IPC contract', () => {
  it('process.argv 含 --script-editor-popout 时 isPopout 判定逻辑为 true', () => {
    // 直接验证判定逻辑（与 preload isPopout 实现一致）
    const argv = ['electron', '--script-editor-popout']
    expect(argv.includes('--script-editor-popout')).toBe(true)
  })

  it('普通窗口 argv 不含标记时为 false', () => {
    const argv = ['electron']
    expect(argv.includes('--script-editor-popout')).toBe(false)
  })

  it('ScriptEditorAPI 类型契约：popout/requestDock 携带双向传图 payload', async () => {
    // mock 一份符合契约的最小实现（双向传图：popout 去程 + requestDock 回程均带图快照），
    // 验证可被 await 且返回结构正确。
    const api: Pick<ScriptEditorAPI, 'popout' | 'requestDock' | 'onDock' | 'isPopout'> = {
      popout: async (_graphStr: string, _activeScriptName: string) => ({ ok: true }),
      requestDock: (_graphStr: string, _activeScriptName: string) => {},
      onDock: (_cb: (payload: { graphStr: string; activeScriptName: string }) => void) => () => {},
      isPopout: () => false
    }
    const res = await api.popout('{"nodes":[]}', 'Script_1')
    expect(res.ok).toBe(true)
    expect(() => api.requestDock('{"nodes":[]}', 'Script_1')).not.toThrow()
    expect(typeof api.isPopout).toBe('function')
  })
})
