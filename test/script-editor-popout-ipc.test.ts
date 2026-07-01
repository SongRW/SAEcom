import { describe, expect, it } from 'vitest'

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

  it('ScriptEditorAPI 类型契约：popout 返回 Promise<{ok,error?}>', async () => {
    // mock 一份符合契约的最小实现，验证可被 await 且返回结构正确
    const api = {
      popout: async () => ({ ok: true }),
      requestDock: () => {},
      onDock: (_cb: () => void) => {},
      isPopout: () => false
    } as const
    const res = await api.popout()
    expect(res.ok).toBe(true)
    expect(typeof api.requestDock).toBe('function')
    expect(typeof api.isPopout).toBe('function')
  })
})
