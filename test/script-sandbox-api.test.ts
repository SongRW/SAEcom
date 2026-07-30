import { describe, expect, it } from 'vitest'
import {
  bytesToNumber,
  checksum,
  chunkString,
  convertEncoding,
  crc8,
  crc16,
  crc16ccitt,
  crc32,
  createSandboxState,
  swapBytes,
  updateLastRecv
} from '../electron/scriptSandbox'

describe('script sandbox helpers', () => {
  it('converts text between encodings when iconv-lite is available', () => {
    const gbkBinary = convertEncoding('中文', 'utf8', 'gbk')
    const roundTrip = convertEncoding(gbkBinary, 'gbk', 'utf8')

    expect(roundTrip).toBe('中文')
    // gbk 字节容器可被 textToHex 风格消费（每 char 一字节）
    expect([...gbkBinary].every((ch) => ch.charCodeAt(0) <= 0xff)).toBe(true)
  })

  it('round-trips utf8 payload carried in a latin1 byte bag', () => {
    const raw = Buffer.from('应答UTF8', 'utf8').toString('binary')
    expect(convertEncoding(raw, 'latin1', 'utf8')).toBe('应答UTF8')
  })

  it('swaps bytes in fixed-size groups', () => {
    expect(swapBytes('11223344', 2)).toBe('22114433')
    expect(swapBytes('1122334455667788', 4)).toBe('4433221188776655')
  })

  it('chunks strings by length', () => {
    expect(chunkString('abcdef', 2)).toEqual(['ab', 'cd', 'ef'])
    expect(chunkString('abcde', 2)).toEqual(['ab', 'cd', 'e'])
  })

  it('reads integers and floats from bytes', () => {
    expect(bytesToNumber('1234', 'uint16', '大端')).toBe(0x1234)
    expect(bytesToNumber('1234', 'uint16', '小端')).toBe(0x3412)
    expect(bytesToNumber([0xff, 0xfe], 'int16', '大端')).toBe(-2)

    const floatBytes = Buffer.allocUnsafe(4)
    floatBytes.writeFloatBE(1.5, 0)
    expect(bytesToNumber(floatBytes, 'float', '大端')).toBeCloseTo(1.5)
  })

  it('computes checksum and CRC variants', () => {
    expect(checksum('123456789')).toBe('DD')
    expect(crc8('123456789')).toBe('F4')
    expect(crc16('123456789')).toBe('4B37')
    expect(crc16ccitt('123456789')).toBe('29B1')
    expect(crc32('123456789')).toBe('CBF43926')
  })

  it('tracks _last_recv when wait helpers receive data', () => {
    const state = createSandboxState()

    expect(state.globalVars).toEqual({})
    expect(state._last_recv).toBe('')
    updateLastRecv(state, 'payload')

    expect(state._last_recv).toBe('payload')
  })
})
