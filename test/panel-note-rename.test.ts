/**
 * 面板备注/重命名 store 行为 + 持久化。
 *
 * 背景：UI 层「添加备注 / 更改面板名称 / 侧栏重命名」原先用 window.prompt，
 * 但 Electron 渲染进程里 prompt 被静默禁用（恒返回 null），导致 setNote/renamePanel
 * 从未被调用、面板名称无法修改。现已改用 PromptDialog（见 src/components/ui/prompt-dialog.tsx），
 * 这里覆盖底层写入与持久化链路（config.save 带 note 字段），保证 UI 改造后数据流仍正确。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePanelsStore } from '@/features/serial-panel/store'

const savedConfigs: unknown[][] = []
let loadedConfigs: unknown[] = []

const mockConfig = {
  load: vi.fn(async () => loadedConfigs),
  save: vi.fn((cfg: unknown[]) => { savedConfigs.push(cfg) })
}

vi.mock('@/shared/ipc', () => ({
  getIPC: () => ({
    config: mockConfig,
    serial: { list: vi.fn(async () => []), open: vi.fn(), close: vi.fn(), write: vi.fn(), onData: vi.fn(), onEvent: vi.fn() },
    tcp: { open: vi.fn(), write: vi.fn(), close: vi.fn(), onData: vi.fn(), onEvent: vi.fn() },
    panel: { saveLog: vi.fn() },
    logger: { pickFile: vi.fn(), append: vi.fn() },
    tcpShare: { start: vi.fn(), stop: vi.fn(), status: vi.fn() }
  })
}))

function resetStore() {
  usePanelsStore.setState({
    panels: {},
    listOrder: [],
    activeId: null,
    zCounter: 0,
    loaded: false,
    knownPorts: []
  })
}

describe('panel note / rename', () => {
  beforeEach(() => {
    resetStore()
    savedConfigs.length = 0
    loadedConfigs = []
    mockConfig.save.mockClear()
  })

  it('setNote writes note, clamps to 15 chars, and persists note field', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    mockConfig.save.mockClear()

    usePanelsStore.getState().setNote('COM1', '我的备注')

    const p = usePanelsStore.getState().panels.COM1
    expect(p.note).toBe('我的备注')
    expect(mockConfig.save).toHaveBeenCalledTimes(1)
    const last = savedConfigs[savedConfigs.length - 1] as Array<{ id: string; note: string }>
    expect(last.find((c) => c.id === 'COM1')?.note).toBe('我的备注')
  })

  it('setNote clamps to 15 characters (legacy btnAddNote 上限)', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    const long = '一二三四五六七八九十十一十二十三十四十五十六'
    usePanelsStore.getState().setNote('COM1', long)
    expect(usePanelsStore.getState().panels.COM1.note).toHaveLength(15)
  })

  it('setNote with empty string clears the note', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    usePanelsStore.getState().setNote('COM1', '临时')
    usePanelsStore.getState().setNote('COM1', '')
    expect(usePanelsStore.getState().panels.COM1.note).toBe('')
  })

  it('setNote on unknown id is a no-op (no throw, panels unchanged)', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    const before = usePanelsStore.getState().panels
    expect(() => usePanelsStore.getState().setNote('NOPE', 'x')).not.toThrow()
    // 面板集合与内容均不变（persist() 仍会触发，但属无害的既有行为）
    expect(usePanelsStore.getState().panels).toEqual(before)
  })

  it('renamePanel writes name and persists', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    mockConfig.save.mockClear()
    usePanelsStore.getState().renamePanel('COM1', '别名')
    expect(usePanelsStore.getState().panels.COM1.name).toBe('别名')
    expect(mockConfig.save).toHaveBeenCalledTimes(1)
  })

  it('load() round-trips note from persisted config (legacy 兼容字段 note)', async () => {
    loadedConfigs = [{ id: 'COM1', type: 'serial', note: '加载备注' }]
    await usePanelsStore.getState().load()
    const p = usePanelsStore.getState().panels.COM1
    // note 独立持久化；name 保持系统友好名语义（未传 name 时回退 id），显示层用 displayName 派生（note 优先）
    expect(p.note).toBe('加载备注')
    expect(p.name).toBe('COM1')
  })

  it('load() treats empty/whitespace note as cleared (no phantom name override)', async () => {
    loadedConfigs = [{ id: 'COM1', type: 'serial', name: 'COM1', note: '   ' }]
    await usePanelsStore.getState().load()
    const p = usePanelsStore.getState().panels.COM1
    expect(p.note).toBe('')
    expect(p.name).toBe('COM1')
  })
})
