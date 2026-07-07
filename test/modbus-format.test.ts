import { describe, it, expect } from 'vitest'
import { modbusAddressLabel, decodeRegisterValue, formatCellDisplay } from '../src/features/modbus-panel/format'

describe('modbusAddressLabel', () => {
  it('FC1 线圈加 0x 前缀（地址 +1 显示）', () => {
    expect(modbusAddressLabel(1, 0)).toBe('00001')
    expect(modbusAddressLabel(1, 9)).toBe('00010')
  })
  it('FC2 离散输入加 1x 前缀', () => {
    expect(modbusAddressLabel(2, 0)).toBe('10001')
  })
  it('FC4 输入寄存器加 3x 前缀', () => {
    expect(modbusAddressLabel(4, 0)).toBe('30001')
  })
  it('FC3 保持寄存器加 4x 前缀', () => {
    expect(modbusAddressLabel(3, 0)).toBe('40001')
    expect(modbusAddressLabel(3, 99)).toBe('40100')
  })
})

describe('formatCellDisplay (单寄存器)', () => {
  it('unsigned', () => {
    expect(formatCellDisplay([65535], 'unsigned')).toBe('65535')
  })
  it('signed 负数', () => {
    expect(formatCellDisplay([0xFFFF], 'signed')).toBe('-1')
  })
  it('hex', () => {
    expect(formatCellDisplay([255], 'hex')).toBe('00FF')
  })
  it('binary', () => {
    expect(formatCellDisplay([5], 'binary')).toBe('0000000000000101')
  })
})

describe('decodeRegisterValue (float32，消费 2 寄存器)', () => {
  it('float32 ABCD (big-endian)：1.0 = [0x3F80, 0x0000]', () => {
    expect(decodeRegisterValue([0x3f80, 0x0000], 'float32')).toBe('1')
  })
  it('float32-swapped CDAB：1.0 = [0x0000, 0x3F80]', () => {
    expect(decodeRegisterValue([0x0000, 0x3f80], 'float32-swapped')).toBe('1')
  })
  it('float32-byte BADC：1.0 = [0x803F, 0x0000]', () => {
    expect(decodeRegisterValue([0x803f, 0x0000], 'float32-byte')).toBe('1')
  })
  it('float32-word-byte DCBA：1.0 = [0x0000, 0x803F]', () => {
    expect(decodeRegisterValue([0x0000, 0x803f], 'float32-word-byte')).toBe('1')
  })
})
