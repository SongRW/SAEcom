/**
 * 命令发送纯逻辑单测：routeWrite（serial/tcp 路由 + 未开降级）+ RepeatManager（interval 建/清）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Panel } from '../src/features/serial-panel/types'
import type { WindowAPI } from '../shared/types'
import { routeWrite, RepeatManager, shouldEcho } from '../src/features/commands/sendCommand'

function makePanel(over: Partial<Panel> = {}): Panel {
  return {
    id: 'COM1',
    name: 'COM1',
    note: '',
    type: 'serial',
    options: { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' },
    open: true,
    viewMode: 'text',
    pinned: false,
    hidden: false,
    geometry: { x: 0, y: 0, w: 100, h: 100 },
    chunks: [],
    textBuffer: '',
    hexBuffer: '',
    autoScroll: true,
    sendText: '',
    logging: { active: false, path: null },
    limitView: false,
    limitCount: 1000,
    unread: 0,
    z: 10,
    sendOptions: { append: 'none', hexMode: false, echoSend: true, bufferTime: 50 },
    ...over
  }
}

function makeIpc(over: Partial<Pick<WindowAPI, 'serial' | 'tcp'>> = {}): Pick<WindowAPI, 'serial' | 'tcp'> {
  return {
    serial: {
      list: vi.fn(),
      open: vi.fn(),
      close: vi.fn(),
      write: vi.fn().mockResolvedValue({ ok: true, bytes: 1 }),
      onData: vi.fn(),
      onEvent: vi.fn()
    } as unknown as WindowAPI['serial'],
    tcp: {
      open: vi.fn(),
      write: vi.fn().mockResolvedValue({ ok: true, bytes: 1 }),
      close: vi.fn(),
      onData: vi.fn(),
      onEvent: vi.fn()
    } as unknown as WindowAPI['tcp'],
    ...over
  }
}

describe('routeWrite', () => {
  it('serial 面板 → 调 serial.write', async () => {
    const ipc = makeIpc()
    const res = await routeWrite(makePanel({ type: 'serial' }), ipc, 'A1', 'hex', 'none', 'utf-8')
    expect(ipc.serial.write).toHaveBeenCalledWith('COM1', 'A1', 'hex', 'none', 'utf-8')
    expect(ipc.tcp.write).not.toHaveBeenCalled()
    expect(res.ok).toBe(true)
  })

  it('tcp 面板 → 调 tcp.write', async () => {
    const ipc = makeIpc()
    const res = await routeWrite(makePanel({ id: 'tcp://1.2.3.4:9', type: 'tcp' }), ipc, 'hi', 'text', 'CRLF', 'utf-8')
    expect(ipc.tcp.write).toHaveBeenCalledWith('tcp://1.2.3.4:9', 'hi', 'text', 'CRLF', 'utf-8')
    expect(ipc.serial.write).not.toHaveBeenCalled()
    expect(res.ok).toBe(true)
  })

  it('面板未打开 → { ok:false } 不调 write', async () => {
    const ipc = makeIpc()
    const res = await routeWrite(makePanel({ open: false }), ipc, 'A1', 'hex', 'none', 'utf-8')
    expect(ipc.serial.write).not.toHaveBeenCalled()
    expect(res.ok).toBe(false)
    expect(res.error).toBe('面板未打开')
  })

  it('write 抛异常 → 捕获返回 { ok:false }', async () => {
    const ipc = makeIpc({
      serial: {
        list: vi.fn(), open: vi.fn(), close: vi.fn(),
        write: vi.fn().mockRejectedValue(new Error('boom')),
        onData: vi.fn(), onEvent: vi.fn()
      } as unknown as WindowAPI['serial']
    })
    const res = await routeWrite(makePanel(), ipc, 'A1', 'hex', 'none', 'utf-8')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('boom')
  })
})

describe('RepeatManager', () => {
  afterEach(() => vi.useRealTimers())

  it('toggle 开启 → 周期执行 doSend；再次 toggle → 停止', () => {
    vi.useFakeTimers()
    const mgr = new RepeatManager()
    const doSend = vi.fn().mockResolvedValue(undefined)
    mgr.toggle('cmd-1', 1000, doSend)
    // 开启时不立即发首帧（对齐 legacy sendCommand 重复分支：只建 interval，首发在 ms 后）
    expect(doSend).toHaveBeenCalledTimes(0)
    vi.advanceTimersByTime(1000)
    expect(doSend).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(doSend).toHaveBeenCalledTimes(2)
    mgr.toggle('cmd-1', 1000, doSend) // 再点 → 停止
    vi.advanceTimersByTime(5000)
    expect(doSend).toHaveBeenCalledTimes(2)
  })

  it('isActive 反映状态', () => {
    vi.useFakeTimers()
    const mgr = new RepeatManager()
    expect(mgr.isActive('cmd-1')).toBe(false)
    mgr.toggle('cmd-1', 1000, vi.fn())
    expect(mgr.isActive('cmd-1')).toBe(true)
    mgr.toggle('cmd-1', 1000, vi.fn())
    expect(mgr.isActive('cmd-1')).toBe(false)
  })

  it('clearAll 清空所有', () => {
    vi.useFakeTimers()
    const mgr = new RepeatManager()
    const a = vi.fn().mockResolvedValue(undefined)
    const b = vi.fn().mockResolvedValue(undefined)
    mgr.toggle('a', 1000, a)
    mgr.toggle('b', 1000, b)
    mgr.clearAll()
    vi.advanceTimersByTime(5000)
    // 开启时不立即发首帧；clearAll 后周期已停，两路均不应再发
    expect(a).toHaveBeenCalledTimes(0)
    expect(b).toHaveBeenCalledTimes(0)
  })
})

describe('shouldEcho', () => {
  // 回显跟随每面板 sendOptions.echoSend（对齐 SendBar），而非默认关闭的全局开关。
  // 历史回归：命令页曾错读全局 echoSend（默认 false），导致命令发出但不回显。
  it('sendOptions.echoSend 为 true → 回显', () => {
    expect(shouldEcho(makePanel({ sendOptions: { append: 'none', hexMode: false, echoSend: true, bufferTime: 50 } }))).toBe(true)
  })

  it('sendOptions.echoSend 为 false → 不回显', () => {
    expect(shouldEcho(makePanel({ sendOptions: { append: 'none', hexMode: false, echoSend: false, bufferTime: 50 } }))).toBe(false)
  })

  it('sendOptions 缺失 → 不回显（防御）', () => {
    const p = makePanel()
    delete (p as { sendOptions?: unknown }).sendOptions
    expect(shouldEcho(p)).toBe(false)
  })
})
