/**
 * YModem 发送重试上限单测（对应 review 第 5 项）。
 * 接收端死掉（永不回 ACK）时，start() 必须在固定重试次数后结束，
 * 而不是无限重发同一包导致 UI 永久卡在「发送中」。
 *
 * 用真实 timers + 注入短超时（waitTimeoutMs=50ms），驱动 start() 跑完整流程，
 * 断言：start() 会结束（不再 hang）、发了 CAN 取消序列、记录了「超限放弃」、同一包重发次数有上限。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  YM_CAN,
  YM_CNC,
  YModemSender
} from '../src/features/serial-panel/transfer/ymodem'

describe('YModemSender 死接收端重试上限', () => {
  it('数据阶段接收端永不 ACK → 超过重试上限后结束、发 CAN、记录放弃', async () => {
    const writes: number[][] = []
    const writer = vi.fn(async (data: Uint8Array) => {
      writes.push(Array.from(data))
    })
    const logs: string[] = []
    // waitTimeoutMs=50 让每次 waitFor 快速超时
    const sender = new YModemSender('COM1', writer, 'ymodem', (m) => logs.push(m), 50)

    // 跨过起始握手：同步喂 CNC；block0 后的 ACK/CNC 在 start 进入对应 waitFor 后再喂
    sender.onData(new Uint8Array([YM_CNC]))
    setTimeout(() => sender.onData(new Uint8Array([0x06])), 10) // ACK for block0
    setTimeout(() => sender.onData(new Uint8Array([YM_CNC])), 20) // 第 2 个 CNC，进入数据阶段

    const fileBytes = new Uint8Array(4 * 1024) // 4 个 1024 包

    // start() 在死接收端下会走 catch 发 CAN 后正常结束（fulfilled，不重抛）。
    // 关键是：它必须「结束」而非无限重试 hang。start 一旦结束，
    // 调用方 ActivePanelConfigPanel 的 finally { setSending(false) } 即解锁 UI。
    const done = await sender.start(fileBytes, 'f.bin').then(() => true)

    // 必须「结束」（不再无限重发同一包）。原 bug 下此处会永久 hang，测试无法走到这里。
    expect(done).toBe(true)

    // 必须发 CAN 取消序列（连续 5 个），让接收端退出接收态
    const canCount = writes.flat().filter((b) => b === YM_CAN).length
    expect(canCount).toBeGreaterThanOrEqual(5)

    // logger 应记录「超限放弃」路径（确认走的是重试上限放弃，而非正常完成）
    expect(logs.some((m) => m.includes('放弃传输'))).toBe(true)

    // 同一包(seq=1)的重发次数必须有上限：STX 头 [0x02,0x01,0xfe]（1024 包用 STX）
    const seq1Count = writes.filter(
      (w) => w.length >= 3 && w[0] === 0x02 && w[1] === 0x01 && w[2] === 0xfe
    ).length
    // 初始发送 + MAX_RETRIES 次重试 = 11 次，上限内
    expect(seq1Count).toBeLessThanOrEqual(YModemSender.MAX_RETRIES + 1)
    expect(seq1Count).toBeGreaterThan(1) // 确实发生了重试
  })
})
