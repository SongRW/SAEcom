/**
 * restoreChunks 应尊重面板的 limitView/limitCount，而非硬编码 1000。
 * 对应 store.ts:413 的 trimChunks(chunks, ..., 1000) bug：
 *   - limitView=true 且 limitCount > 1000 时，取回面板不应丢数据
 *   - limitView=false 时用 CHUNK_LIMIT(1000) 兜底
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

function seedPanel(limitView: boolean, limitCount: number) {
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
        limitView, limitCount,
        unread: 0,
        sendOptions: { append: 'CRLF' as const, hexMode: false, echoSend: true, bufferTime: 50 }
      }
    },
    listOrder: ['p1'], activeId: 'p1', zCounter: 1
  })
}

function makeChunks(n: number) {
  return Array.from({ length: n }, (_, i) => ({ text: `l${i}\n`, hex: `l${i}\n`, isEcho: false }))
}

describe('restoreChunks respects limitView/limitCount', () => {
  beforeEach(() => {
    usePanelsStore.setState({ panels: {}, listOrder: [], activeId: null, zCounter: 0 })
  })

  it('limitView=true 用 limitCount 裁剪（高于 1000 时不丢数据）', () => {
    seedPanel(true, 1500)
    usePanelsStore.getState().restoreChunks('p1', makeChunks(1500))
    expect(usePanelsStore.getState().panels.p1.chunks.length).toBe(1500)
  })

  it('limitView=false 用 CHUNK_LIMIT(1000) 兜底', () => {
    seedPanel(false, 1500)
    usePanelsStore.getState().restoreChunks('p1', makeChunks(1200))
    // 关闭限制仍受全局 CHUNK_LIMIT=1000 兜底（与 appendChunk/setLimit 行为一致）
    expect(usePanelsStore.getState().panels.p1.chunks.length).toBe(1000)
  })
})
