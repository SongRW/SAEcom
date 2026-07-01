/**
 * setAutoScroll 在值未变时应短路（返回原 state），避免每个 scroll tick
 * 新建 panels 对象触发无谓重渲染（DataDisplay 的 onScroll 每帧调用）。
 *
 * 断言的是「引用相等」：store 的 set 若返回入参 s，zustand 不通知订阅者。
 */
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { usePanelsStore } from '@/features/serial-panel/store'

vi.mock('@/shared/ipc', () => ({
  getIPC: () => ({
    config: { load: vi.fn(async () => []), save: vi.fn() },
    serial: { list: vi.fn(async () => []), open: vi.fn(), close: vi.fn(), write: vi.fn(), onData: vi.fn(), onEvent: vi.fn() },
    tcp: { open: vi.fn(), write: vi.fn(), close: vi.fn(), onData: vi.fn(), onEvent: vi.fn() },
    panel: { saveLog: vi.fn() },
    logger: { pickFile: vi.fn(), append: vi.fn() },
    tcpShare: { start: vi.fn(), stop: vi.fn(), status: vi.fn() }
  })
}))

function seedPanel() {
  usePanelsStore.setState({
    panels: {
      p1: {
        id: 'p1', name: 'COM1', note: '', type: 'serial' as const,
        options: { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' as const },
        open: false, viewMode: 'text' as const, pinned: false, hidden: false,
        geometry: { x: 0, y: 0, w: 400, h: 200 },
        chunks: [], textBuffer: '', hexBuffer: '',
        autoScroll: true,
        sendText: '',
        logging: { active: false, path: null },
        z: 1,
        limitView: false, limitCount: 1000,
        unread: 0,
        sendOptions: { append: 'CRLF' as const, hexMode: false, echoSend: true, bufferTime: 50 }
      }
    },
    listOrder: ['p1'], activeId: 'p1', zCounter: 1
  })
}

describe('setAutoScroll short-circuits when value unchanged', () => {
  beforeEach(() => {
    usePanelsStore.setState({ panels: {}, listOrder: [], activeId: null, zCounter: 0 })
  })

  it('重复传相同值不触发订阅（panels 引用不变）', () => {
    seedPanel() // autoScroll=true, unread=0
    let notifyCount = 0
    const unsub = usePanelsStore.subscribe(() => { notifyCount++ })

    // 第一次：true→true，值未变 → 不应通知
    usePanelsStore.getState().setAutoScroll('p1', true)
    expect(notifyCount).toBe(0)

    // 第二次：true→false，值变化 → 应通知
    usePanelsStore.getState().setAutoScroll('p1', false)
    expect(notifyCount).toBe(1)

    // 第三次：false→false，值未变 → 不应通知
    usePanelsStore.getState().setAutoScroll('p1', false)
    expect(notifyCount).toBe(1)

    unsub()
  })

  it('true→true 且 unread>0 仍清零未读（语义变化需通知）', () => {
    seedPanel()
    usePanelsStore.setState((s) => ({ panels: { ...s.panels, p1: { ...s.panels.p1, unread: 5 } } }))

    let notifyCount = 0
    const unsub = usePanelsStore.subscribe(() => { notifyCount++ })

    // autoScroll 已 true，但有未读 → true=已读 语义，应清零并通知
    usePanelsStore.getState().setAutoScroll('p1', true)
    expect(usePanelsStore.getState().panels.p1.unread).toBe(0)
    expect(notifyCount).toBe(1)

    unsub()
  })
})
