/**
 * 串口面板纯逻辑单元测试 (Vitest)。
 * 覆盖 formatBytes / nowTs / trimChunks / renderChunks / calcCRC16。
 * 这些函数移植自 legacy renderer.js，断言对齐 legacy 行为。
 */
import { describe, it, expect } from 'vitest'
import {
  formatBytes,
  nowTs,
  trimChunks,
  renderChunks,
  chunksToPlainText
} from '../src/features/serial-panel/paneViewModel'
import { calcCRC16 } from '../src/features/serial-panel/transfer/crc16'

const enc = (s: string) => new TextEncoder().encode(s)
const hex = (h: string) => new Uint8Array(h.match(/.{2}/g)!.map((b) => parseInt(b, 16)))

describe('formatBytes', () => {
  it('text 模式：UTF-8 解码', () => {
    expect(formatBytes(enc('Hello'), 'text')).toBe('Hello')
    expect(formatBytes(enc('中文'), 'text')).toBe('中文')
  })

  it('hex 模式：每字节大写空格分隔，0x0A 换行', () => {
    // "AB\n" = 41 42 0A
    const out = formatBytes(enc('AB\n'), 'hex')
    expect(out).toBe('41 42 0A\n')
  })

  it('hex 模式：非换行结尾补尾空格', () => {
    // "A" = 41，无 0x0A
    expect(formatBytes(enc('A'), 'hex')).toBe('41 ')
  })

  it('hex 模式：空数组返回空尾空格', () => {
    expect(formatBytes(new Uint8Array([]), 'hex')).toBe(' ')
  })

  it('text 模式：失败编码回退 ASCII 可见过滤', () => {
    // 用一个无效编码名触发 catch
    const out = formatBytes(enc('Hi'), 'text', 'invalid-encoding')
    expect(out).toBe('Hi') // 0x48 0x69 都可见
  })

  it('text 模式：不可见字节回退为点', () => {
    // 0x01 不可见
    const out = formatBytes(new Uint8Array([0x01, 0x41]), 'text', 'invalid-encoding')
    expect(out).toBe('.A')
  })
})

describe('nowTs', () => {
  it('格式 YYYY-MM-DD HH:MM:SS.mmm', () => {
    const d = new Date(2026, 5, 25, 14, 5, 9, 37)
    expect(nowTs(d)).toBe('2026-06-25 14:05:09.037')
  })

  it('毫秒补零到 3 位', () => {
    const d = new Date(2026, 0, 1, 0, 0, 0, 5)
    expect(nowTs(d)).toMatch(/\.005$/)
  })
})

describe('trimChunks', () => {
  const mk = (t: string): { text: string; hex: string; isEcho: boolean } => ({
    text: t,
    hex: t,
    isEcho: false
  })

  it('未超限：原样返回', () => {
    const chunks = [mk('a'), mk('b')]
    const r = trimChunks(chunks, 'ab', 'ab', 5)
    expect(r.chunks).toHaveLength(2)
    expect(r.textBuffer).toBe('ab')
  })

  it('超限：移除头部，保留尾部 limit 个', () => {
    const chunks = [mk('a'), mk('b'), mk('c'), mk('d')]
    const r = trimChunks(chunks, 'abcd', 'abcd', 2)
    expect(r.chunks).toHaveLength(2)
    expect(r.chunks[0].text).toBe('c')
    expect(r.chunks[1].text).toBe('d')
  })

  it('超限：缓存也同步裁剪', () => {
    const chunks = Array.from({ length: 10 }, (_, i) => mk(`line${i}`))
    const longBuf = chunks.map((c) => c.text).join('')
    const r = trimChunks(chunks, longBuf, longBuf, 3)
    expect(r.textBuffer.length).toBeLessThanOrEqual(longBuf.length)
    expect(r.chunks).toHaveLength(3)
  })

  it('超限：buffer 精确等于保留 chunks 的拼接（不再 limit*50 估算）', () => {
    // 长 chunk（单条远超旧的 estLen=limit*50 估算），验证导出源 textBuffer/hexBuffer 精确对齐。
    const big = 'X'.repeat(2000)
    const bigHex = '4F '.repeat(2000).trim()
    const chunks = [
      { text: big, hex: bigHex, isEcho: false },
      { text: 'keep', hex: '6B 65 65 70', isEcho: false }
    ]
    const textBuf = chunks.map((c) => c.text).join('')
    const hexBuf = chunks.map((c) => c.hex).join('')
    const r = trimChunks(chunks, textBuf, hexBuf, 1)
    expect(r.chunks).toHaveLength(1)
    // 缓冲必须精确等于被保留的那个 chunk，不因估算丢字符
    expect(r.textBuffer).toBe('keep')
    expect(r.hexBuffer).toBe('6B 65 65 70')
  })
})

describe('renderChunks', () => {
  it('text 模式返回 chunk.text', () => {
    const chunks = [{ text: 'hi', hex: '68 69', isEcho: false }]
    expect(renderChunks(chunks, 'text')).toEqual([{ text: 'hi', isEcho: false }])
  })

  it('hex 模式返回 chunk.hex', () => {
    const chunks = [{ text: 'hi', hex: '68 69', isEcho: false }]
    expect(renderChunks(chunks, 'hex')).toEqual([{ text: '68 69', isEcho: false }])
  })

  it('保留 echo 标记', () => {
    const chunks = [{ text: 'echo', hex: '65', isEcho: true }]
    expect(renderChunks(chunks, 'text')[0].isEcho).toBe(true)
  })
})

describe('chunksToPlainText', () => {
  it('text 模式：把所有 chunk 的 text 拼成纯文本（虚拟化滚动下选择不可靠，复制全量用）', () => {
    const chunks = [
      { text: 'line1', hex: '6c31', isEcho: false },
      { text: 'line2', hex: '6c32', isEcho: true }
    ]
    expect(chunksToPlainText(chunks, 'text')).toBe('line1line2')
  })

  it('hex 模式：拼 hex 字段', () => {
    const chunks = [{ text: 'ab', hex: '61 62', isEcho: false }]
    expect(chunksToPlainText(chunks, 'hex')).toBe('61 62')
  })

  it('空 chunks 返回空串', () => {
    expect(chunksToPlainText([], 'text')).toBe('')
  })

  it('包含换行的文本原样保留', () => {
    const chunks = [{ text: 'a\nb\nc', hex: 'aaa', isEcho: false }]
    expect(chunksToPlainText(chunks, 'text')).toBe('a\nb\nc')
  })
})

describe('calcCRC16', () => {
  it('空缓冲返回 0', () => {
    expect(calcCRC16(new Uint8Array([]))).toBe(0)
  })

  it('已知值校验（123456789 → 0x31C3，CCITT-FALSE 标准）', () => {
    // CRC-16/CCITT-FALSE check value for "123456789" is 0x31C3... 实际 legacy 用 init 0x0000
    // 这里测 legacy 行为（init 0x0000），"123456789" 的 poly 0x1021/init0 结果
    const data = enc('123456789')
    const crc = calcCRC16(data)
    // 确定性：固定输入产出固定输出，值在合法范围
    expect(crc).toBeGreaterThanOrEqual(0)
    expect(crc).toBeLessThanOrEqual(0xffff)
    // 记录确定值供回归
    expect(crc).toBe(0x31c3)
  })

  it('确定性：相同输入相同输出', () => {
    const data = hex('01020304')
    expect(calcCRC16(data)).toBe(calcCRC16(data))
  })

  it('crc16 高低字节可拆出', () => {
    const data = hex('aabb')
    const crc = calcCRC16(data)
    const hi = (crc >> 8) & 0xff
    const lo = crc & 0xff
    expect(hi).toBeGreaterThanOrEqual(0)
    expect(lo).toBeGreaterThanOrEqual(0)
    expect((hi << 8) | lo).toBe(crc)
  })
})
