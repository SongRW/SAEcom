/**
 * 当前面板配置区：store 层 sendOptions 写回 + load() 向后兼容 + 组件空状态渲染。
 *
 * 注意：React 19 的 renderToStaticMarkup 在 SSR 下，zustand 的 useSyncExternalStore
 * 使用 getServerSnapshot，读不到运行时 setState 后的 store 状态。因此「切换面板回填」
 * 「TCP 隐藏行」等依赖 store 订阅的渲染行为，在此以 store 级断言覆盖（activeId/panel/type）；
 * 组件渲染层仅验证不依赖 store 运行时变更的空状态（初始 activeId=null 即空状态）。
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
// 用 @/ 别名，确保与组件内部 import 解析到同一模块实例
import { usePanelsStore } from '@/features/serial-panel/store'
import { ActivePanelConfigPanel } from '@/features/main-window/components/ActivePanelConfigPanel'

// react-i18next 在 SSR 测试环境下未初始化，mock 为 identity：t 返回 key 本身。
// 断言据此匹配 key（不耦合具体语言文案），符合 i18n 测试的稳健实践。
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-CN' } })
}))

// mock IPC（config.save/load 记录调用）
const savedConfigs: unknown[][] = []
let loadedConfigs: unknown[] = []
const mockConfig = {
  load: vi.fn(async () => loadedConfigs),
  save: vi.fn((cfg: unknown[]) => { savedConfigs.push(cfg) })
}
const mockSerial = {
  list: vi.fn(async () => []),
  open: vi.fn(async () => ({ ok: true })),
  close: vi.fn(async () => ({ ok: true })),
  write: vi.fn(async () => ({ ok: true, bytes: 1 })),
  onData: vi.fn(),
  onEvent: vi.fn()
}

vi.mock('@/shared/ipc', () => ({
  getIPC: () => ({
    config: mockConfig,
    serial: mockSerial,
    tcp: { open: vi.fn(), write: vi.fn(), close: vi.fn(), onData: vi.fn(), onEvent: vi.fn() },
    panel: { saveLog: vi.fn(async () => null) },
    file: { readHex: vi.fn(async () => ({ hex: '' })), pickOpen: vi.fn(async () => null) },
    logger: { pickFile: vi.fn(async () => null), append: vi.fn() },
    tcpShare: { start: vi.fn(async () => ({})), stop: vi.fn(async () => ({})), status: vi.fn(async () => ({ active: false })) }
  }),
  useIPC: () => ({
    config: mockConfig,
    serial: mockSerial,
    tcp: { open: vi.fn(), write: vi.fn(), close: vi.fn(), onData: vi.fn(), onEvent: vi.fn() },
    panel: { saveLog: vi.fn(async () => null) },
    file: { readHex: vi.fn(async () => ({ hex: '' })), pickOpen: vi.fn(async () => null) },
    logger: { pickFile: vi.fn(async () => null), append: vi.fn() },
    tcpShare: { start: vi.fn(async () => ({})), stop: vi.fn(async () => ({})), status: vi.fn(async () => ({ active: false })) }
  })
}))

// 顶层静态 import：与组件共享同一 store 实例（已在文件顶部 import ActivePanelConfigPanel）

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

describe('panels store sendOptions', () => {
  beforeEach(() => {
    resetStore()
    savedConfigs.length = 0
    loadedConfigs = []
  })

  it('updateSendOptions writes back to panel and persists', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    savedConfigs.length = 0
    usePanelsStore.getState().updateSendOptions('COM1', { hexMode: true, append: 'CRLF' })
    const p = usePanelsStore.getState().panels.COM1
    expect(p.sendOptions.hexMode).toBe(true)
    expect(p.sendOptions.append).toBe('CRLF')
    expect(mockConfig.save).toHaveBeenCalled()
    const last = savedConfigs[savedConfigs.length - 1] as Array<{ id: string; sendOptions?: { hexMode: boolean; append: string } }>
    expect(last.find((c) => c.id === 'COM1')?.sendOptions?.hexMode).toBe(true)
  })

  it('updateOptions writes serial params and persists', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    savedConfigs.length = 0
    usePanelsStore.getState().updateOptions('COM1', { baudRate: 9600 })
    expect(usePanelsStore.getState().panels.COM1.options.baudRate).toBe(9600)
    expect(mockConfig.save).toHaveBeenCalled()
  })

  it('load() backfills DEFAULT_SERIAL_SEND_OPTIONS for legacy data without sendOptions', async () => {
    // legacy 数据：只有 options，没有 sendOptions
    loadedConfigs = [{ id: 'COM1', name: 'COM1', type: 'serial', options: { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' } }]
    await usePanelsStore.getState().load()
    const p = usePanelsStore.getState().panels.COM1
    expect(p.sendOptions).toBeDefined()
    expect(p.sendOptions.hexMode).toBe(false)
    expect(p.sendOptions.append).toBe('CRLF')
    expect(p.sendOptions.bufferTime).toBe(50)
  })

  it('load() reads legacy flat fields (hexMode/append/echoSend/bufferTime)', async () => {
    loadedConfigs = [{
      id: 'COM2', name: 'COM2', type: 'serial',
      options: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
      hexMode: true, appendMode: 'CR', echoSend: true, bufferTime: 100
    }]
    await usePanelsStore.getState().load()
    const p = usePanelsStore.getState().panels.COM2
    expect(p.sendOptions.hexMode).toBe(true)
    expect(p.sendOptions.append).toBe('CR')
    expect(p.sendOptions.echoSend).toBe(true)
    expect(p.sendOptions.bufferTime).toBe(100)
  })

  it('genPanel default sendOptions matches DEFAULT_SERIAL_SEND_OPTIONS', () => {
    usePanelsStore.getState().addPanel({ id: 'COM3', name: 'COM3', type: 'serial' })
    const p = usePanelsStore.getState().panels.COM3
    expect(p.sendOptions).toEqual({ append: 'CRLF', hexMode: false, echoSend: true, bufferTime: 50 })
  })

  it('load() selects the top-most visible panel as active (mirrors legacy createPane setActive)', async () => {
    // 两个可见面板：load 按 listOrder 顺序重建，后建的 z 更大 → 更「靠上」
    loadedConfigs = [
      { id: 'COM1', name: 'COM1', type: 'serial' },
      { id: 'COM2', name: 'COM2', type: 'serial' }
    ]
    await usePanelsStore.getState().load()
    // 底部工作区启动时应默认选中「最上面的」（z 最大）可见面板
    expect(usePanelsStore.getState().activeId).toBe('COM2')
  })

  it('load() skips hidden panels when picking initial activeId', async () => {
    // 唯一可见面板是 COM1；COM2 被隐藏，不应被选中
    loadedConfigs = [
      { id: 'COM1', name: 'COM1', type: 'serial' },
      { id: 'COM2', name: 'COM2', type: 'serial', hidden: true }
    ]
    await usePanelsStore.getState().load()
    expect(usePanelsStore.getState().activeId).toBe('COM1')
  })

  it('load() keeps activeId=null when all panels hidden (empty workspace stays "请选择面板")', async () => {
    loadedConfigs = [{ id: 'COM1', name: 'COM1', type: 'serial', hidden: true }]
    await usePanelsStore.getState().load()
    expect(usePanelsStore.getState().activeId).toBeNull()
  })

  it('load() keeps activeId=null when no panels at all', async () => {
    loadedConfigs = []
    await usePanelsStore.getState().load()
    expect(usePanelsStore.getState().activeId).toBeNull()
  })
})

describe('ActivePanelConfigPanel', () => {
  beforeEach(() => {
    resetStore()
    savedConfigs.length = 0
    loadedConfigs = []
  })

  it('renders empty state when no active panel', () => {
    // 初始 activeId=null，SSR 渲染应显示空状态（i18n 已 mock 为 identity，断言匹配 key）
    const html = renderToStaticMarkup(React.createElement(ActivePanelConfigPanel))
    expect(html).toContain('activePanel.emptyHint')
  })

  it('store exposes the active serial panel with its serial params (drives config panel)', () => {
    // setActive 后，组件订阅的 activeId/panel 应为该串口面板（渲染层因 SSR server-snapshot 限制无法断言，
    // 这里以 store 级断言覆盖：配置区数据源 = store.activeId → panels[id]）
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    usePanelsStore.getState().setActive('COM1')
    const { activeId, panels } = usePanelsStore.getState()
    expect(activeId).toBe('COM1')
    expect(panels.COM1.type).toBe('serial')
    expect(panels.COM1.options.baudRate).toBe(115200)
  })

  it('TCP panel type drives serial-param row hiding (isSerial = type === "serial")', () => {
    usePanelsStore.getState().addPanel({ id: 'tcp://1.2.3.4:8080', name: 'TCP-A', type: 'tcp' })
    usePanelsStore.getState().setActive('tcp://1.2.3.4:8080')
    const { activeId, panels } = usePanelsStore.getState()
    expect(activeId).toBe('tcp://1.2.3.4:8080')
    // 组件用 isSerial = panel.type === 'serial' 控制串口参数行；TCP 时为 false
    expect(panels[activeId!].type).toBe('tcp')
    // 发送选项对 TCP 仍存在（组件 L3 行无条件渲染）
    expect(panels[activeId!].sendOptions).toBeDefined()
  })

  it('repopulates config source when activeId changes (store-level)', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    usePanelsStore.getState().addPanel({ id: 'COM2', name: 'COM2', type: 'serial' })
    usePanelsStore.getState().updateOptions('COM2', { baudRate: 9600 })
    usePanelsStore.getState().setActive('COM1')
    let st = usePanelsStore.getState()
    expect(st.panels[st.activeId!].name).toBe('COM1')
    usePanelsStore.getState().setActive('COM2')
    st = usePanelsStore.getState()
    expect(st.panels[st.activeId!].name).toBe('COM2')
    expect(st.panels[st.activeId!].options.baudRate).toBe(9600)
  })
})

describe('panels store limitView/limitCount', () => {
  beforeEach(() => {
    resetStore()
    savedConfigs.length = 0
    loadedConfigs = []
  })

  it('genPanel defaults: limitView=false, limitCount=1000', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    const p = usePanelsStore.getState().panels.COM1
    expect(p.limitView).toBe(false)
    expect(p.limitCount).toBe(1000)
  })

  it('setLimit(id, true, 50) writes fields and persists', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    savedConfigs.length = 0
    usePanelsStore.getState().setLimit('COM1', true, 50)
    const p = usePanelsStore.getState().panels.COM1
    expect(p.limitView).toBe(true)
    expect(p.limitCount).toBe(50)
    expect(mockConfig.save).toHaveBeenCalled()
    const last = savedConfigs[savedConfigs.length - 1] as Array<{ id: string; limitView?: boolean; limitCount?: number }>
    expect(last.find((c) => c.id === 'COM1')?.limitView).toBe(true)
    expect(last.find((c) => c.id === 'COM1')?.limitCount).toBe(50)
  })

  it('setLimit immediately trims existing chunks when enabling a smaller limit', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    // 灌入 20 个 chunk
    for (let i = 0; i < 20; i++) {
      usePanelsStore.getState().appendChunk('COM1', { text: `l${i}\n`, hex: `l${i}\n`, isEcho: false })
    }
    expect(usePanelsStore.getState().panels.COM1.chunks.length).toBe(20)
    // 开启 limit=5，应立即裁到 ≤5
    usePanelsStore.getState().setLimit('COM1', true, 5)
    expect(usePanelsStore.getState().panels.COM1.chunks.length).toBeLessThanOrEqual(5)
  })

  it('appendChunk honors limitCount when limitView=true (not global CHUNK_LIMIT)', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    usePanelsStore.getState().setLimit('COM1', true, 5)
    // setLimit 后 chunks 已空，追加 6 个
    for (let i = 0; i < 6; i++) {
      usePanelsStore.getState().appendChunk('COM1', { text: `l${i}\n`, hex: `l${i}\n`, isEcho: false })
    }
    // limitView=true 用 limitCount=5 裁剪，而不是全局 1000
    expect(usePanelsStore.getState().panels.COM1.chunks.length).toBe(5)
  })

  it('setLimit(id, false, ...) disables limit: append beyond limitCount but under CHUNK_LIMIT is NOT trimmed', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    usePanelsStore.getState().setLimit('COM1', true, 5)
    usePanelsStore.getState().setLimit('COM1', false, 5) // 关闭限制
    // 追加 10 个（>limitCount=5 但 <CHUNK_LIMIT=1000）
    for (let i = 0; i < 10; i++) {
      usePanelsStore.getState().appendChunk('COM1', { text: `l${i}\n`, hex: `l${i}\n`, isEcho: false })
    }
    expect(usePanelsStore.getState().panels.COM1.chunks.length).toBe(10)
  })

  it('load() backfills limitView/limitCount for legacy data without these fields', async () => {
    loadedConfigs = [{ id: 'COM1', name: 'COM1', type: 'serial', options: { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' } }]
    await usePanelsStore.getState().load()
    const p = usePanelsStore.getState().panels.COM1
    expect(p.limitView).toBe(false)
    expect(p.limitCount).toBe(1000)
  })

  it('load() reads persisted limitView/limitCount', async () => {
    loadedConfigs = [{ id: 'COM1', name: 'COM1', type: 'serial', limitView: true, limitCount: 42 }]
    await usePanelsStore.getState().load()
    const p = usePanelsStore.getState().panels.COM1
    expect(p.limitView).toBe(true)
    expect(p.limitCount).toBe(42)
  })
})
