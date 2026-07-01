import { beforeEach, describe, it, expect, vi } from 'vitest'
import { formatUnread, displayName } from '@/features/serial-panel/paneViewModel'
import { usePanelsStore } from '@/features/serial-panel/store'

const mockConfig = {
  load: vi.fn(async () => []),
  save: vi.fn()
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

function seedPanel(overrides: Partial<{ hidden: boolean; autoScroll: boolean }> = {}) {
  usePanelsStore.setState({
    panels: {
      p1: {
        id: 'p1', name: 'COM1', note: '', type: 'serial' as const,
        options: { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' as const },
        open: false, viewMode: 'text' as const, pinned: false,
        hidden: overrides.hidden ?? false,
        geometry: { x: 0, y: 0, w: 400, h: 200 },
        chunks: [], textBuffer: '', hexBuffer: '',
        autoScroll: overrides.autoScroll ?? true,
        sendText: '',
        sendOptions: { append: 'CRLF' as const, hexMode: false, echoSend: true, bufferTime: 50 },
        logging: { active: false, path: null },
        limitView: false, limitCount: 1000, z: 10,
        unread: 0
      }
    },
    listOrder: ['p1'], activeId: null, zCounter: 0, loaded: true, knownPorts: []
  })
}

describe('formatUnread', () => {
  it('0 返回 null（不显示角标）', () => {
    expect(formatUnread(0)).toBeNull()
  })
  it('1~99 返回数字字符串', () => {
    expect(formatUnread(1)).toBe('1')
    expect(formatUnread(50)).toBe('50')
    expect(formatUnread(99)).toBe('99')
  })
  it('超过 99 返回 "99+"', () => {
    expect(formatUnread(100)).toBe('99+')
    expect(formatUnread(9999)).toBe('99+')
  })
})

describe('displayName', () => {
  it('有 note → 用 note', () => {
    expect(displayName({ note: '我的串口', name: 'COM3-USB' })).toBe('我的串口')
  })
  it('note 为空 → 回退 name', () => {
    expect(displayName({ note: '', name: 'COM3-USB' })).toBe('COM3-USB')
  })
  it('note 为纯空格 → 回退 name（trim 判定）', () => {
    expect(displayName({ note: '   ', name: 'COM3-USB' })).toBe('COM3-USB')
  })
})

describe('panel unread counting', () => {
  beforeEach(() => {
    mockConfig.save.mockClear()
  })

  it('可见且在底部 → appendChunk 不增未读', () => {
    seedPanel({ hidden: false, autoScroll: true })
    usePanelsStore.getState().appendChunk('p1', { text: 'hi', hex: 'hi', isEcho: false }, { incrementUnread: false })
    expect(usePanelsStore.getState().panels.p1.unread).toBe(0)
  })

  it('隐藏 → appendChunk 增未读（incrementUnread=true）', () => {
    seedPanel({ hidden: true })
    usePanelsStore.getState().appendChunk('p1', { text: 'hi', hex: 'hi', isEcho: false }, { incrementUnread: true })
    expect(usePanelsStore.getState().panels.p1.unread).toBe(1)
  })

  it('默认（无 opts）不增未读，向后兼容', () => {
    seedPanel()
    usePanelsStore.getState().appendChunk('p1', { text: 'hi', hex: 'hi', isEcho: false })
    expect(usePanelsStore.getState().panels.p1.unread).toBe(0)
  })

  it('clearChunks 清零未读', () => {
    seedPanel()
    usePanelsStore.getState().appendChunk('p1', { text: 'a', hex: 'a', isEcho: false }, { incrementUnread: true })
    usePanelsStore.getState().appendChunk('p1', { text: 'b', hex: 'b', isEcho: false }, { incrementUnread: true })
    expect(usePanelsStore.getState().panels.p1.unread).toBe(2)
    usePanelsStore.getState().clearChunks('p1')
    expect(usePanelsStore.getState().panels.p1.unread).toBe(0)
  })

  it('restoreChunks 清零未读', () => {
    seedPanel()
    usePanelsStore.getState().appendChunk('p1', { text: 'a', hex: 'a', isEcho: false }, { incrementUnread: true })
    usePanelsStore.getState().restoreChunks('p1', [{ text: 'x', hex: 'x', isEcho: false }])
    expect(usePanelsStore.getState().panels.p1.unread).toBe(0)
  })

  it('setAutoScroll(true) 清零未读（滚到底部=已读）', () => {
    seedPanel()
    usePanelsStore.getState().appendChunk('p1', { text: 'a', hex: 'a', isEcho: false }, { incrementUnread: true })
    usePanelsStore.getState().appendChunk('p1', { text: 'b', hex: 'b', isEcho: false }, { incrementUnread: true })
    expect(usePanelsStore.getState().panels.p1.unread).toBe(2)
    usePanelsStore.getState().setAutoScroll('p1', true)
    expect(usePanelsStore.getState().panels.p1.unread).toBe(0)
  })

  it('setAutoScroll(false) 不动未读', () => {
    seedPanel()
    usePanelsStore.getState().appendChunk('p1', { text: 'a', hex: 'a', isEcho: false }, { incrementUnread: true })
    usePanelsStore.getState().setAutoScroll('p1', false)
    expect(usePanelsStore.getState().panels.p1.unread).toBe(1)
  })
})
