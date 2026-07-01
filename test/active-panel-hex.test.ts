/**
 * hexToBytes 单测：覆盖空串、奇数位、非法字符、正常 hex。
 * 覆盖 spec C11：空串不应抛 TypeError，非法输入应给语义化错误。
 */
import { describe, expect, it } from 'vitest'
import { hexToBytes, hexParseError } from '../src/features/main-window/components/ActivePanelConfigPanel'

describe('hexToBytes', () => {
  it('空串返回空 Uint8Array（不抛）', () => {
    expect(() => hexToBytes('')).not.toThrow()
    expect(Array.from(hexToBytes(''))).toEqual([])
  })

  it('正常偶数位 hex 正确解析', () => {
    expect(Array.from(hexToBytes('48656c6c6f'))).toEqual([72, 101, 108, 108, 111])
    expect(Array.from(hexToBytes('00ff'))).toEqual([0, 255])
  })

  it('大小写均可', () => {
    expect(Array.from(hexToBytes('AABB'))).toEqual([170, 187])
    expect(Array.from(hexToBytes('aabb'))).toEqual([170, 187])
  })

  it('含空格/空白时自动去除（兼容主进程 file.readHex 可能带的空白）', () => {
    expect(Array.from(hexToBytes('48 65'))).toEqual([72, 101])
  })
})

describe('hexParseError — 语义化校验', () => {
  it('偶数位合法 hex 返回 null', () => {
    expect(hexParseError('48656c6c6f')).toBeNull()
  })
  it('奇数位返回明确提示', () => {
    expect(hexParseError('4865c')).toMatch(/奇数位|odd/i)
  })
  it('非法字符返回明确提示', () => {
    expect(hexParseError('48gg')).toMatch(/非十六进制|invalid/i)
  })
  it('空串返回 null（空是合法的，只是没数据）', () => {
    expect(hexParseError('')).toBeNull()
  })
})
