import { describe, expect, it } from 'vitest'
import {
  convertBase,
  convertEncoding,
  decodeText,
  hexToText,
  normalizeToHex,
  parseBitfield,
  parseUint,
  sliceHex,
  splitFrame,
  textToHex,
  type FieldLayoutItem
} from '@shared/protocol-tools'

// ═══════════════════════════════════════════════════════════
// 基础编码工具（与 codec-provider 闭包行为一致性回归）
// ═══════════════════════════════════════════════════════════

describe('protocol-tools 基础编码', () => {
  it('textToHex / hexToText 按 charCode 往返（ASCII + latin1 字节袋）', () => {
    expect(textToHex('AB')).toBe('4142')
    expect(hexToText('4142')).toBe('AB')
    // 0xAA 等 >127 字节经 latin1 字节袋往返无损（v3 乱码根因的回归保护）
    const byteBag = String.fromCharCode(0xaa, 0x55, 0x03, 0x01)
    const hex = textToHex(byteBag)
    expect(hex).toBe('AA550301')
    expect(hexToText(hex)).toBe(byteBag)
  })

  it('convertBase 进制换算（含中文进制名 + 补零）', () => {
    expect(convertBase('FF', '十六进制', '十进制')).toBe('255')
    expect(convertBase('255', '十进制', '十六进制')).toBe('FF')
    expect(convertBase('1', '十进制', '十六进制')).toBe('01') // 补 2 位
    expect(convertBase('1', '十进制', '二进制')).toBe('00000001') // 补到 8 位
    expect(convertBase('ABCDEF', '十六进制', '二进制')).toBe('101010111100110111101111') // 24 位无补零
    expect(convertBase('zz', '十六进制', '十进制')).toBe('NaN')
  })

  it('normalizeToHex：已是 hex 直通，非 hex 走 textToHex，沙箱标记返回空', () => {
    expect(normalizeToHex('aa55')).toBe('AA55')
    expect(normalizeToHex('AA5503')).toBe('AA5503') // 奇数长度合法 hex 也直通
    expect(normalizeToHex('A')).toBe('41') // 非 hex 走 textToHex（'A' charCode 0x41）
    expect(normalizeToHex('[测试已发送]')).toBe('')
    expect(normalizeToHex('[超时]')).toBe('')
    // 含空格/逗号的 hex
    expect(normalizeToHex('AA 55,03')).toBe('AA5503')
  })
})

// ═══════════════════════════════════════════════════════════
// 拆包原子工具
// ═══════════════════════════════════════════════════════════

describe('protocol-tools 拆包原子', () => {
  // 帧：magic(AA55) version(03) msgType(01) seq(0001) flags(FF)
  const frame = 'AA5503010001FF'

  it('sliceHex 按字节偏移/长度截取', () => {
    expect(sliceHex(frame, 0, 2)).toBe('AA55') // magic
    expect(sliceHex(frame, 2, 1)).toBe('03') // version
    expect(sliceHex(frame, 3, 1)).toBe('01') // msgType
    expect(sliceHex(frame, 4, 2)).toBe('0001') // seq
    expect(sliceHex(frame, 2, 0)).toBe('03010001FF') // length=0 取到末尾
    expect(sliceHex(frame, 100, 2)).toBe('') // 越界返回空
  })

  it('parseUint 大小端解析', () => {
    expect(parseUint('0100', 2, 'big')).toBe(256) // 0x0100
    expect(parseUint('0100', 2, 'little')).toBe(1) // 小端 0x0001
    expect(parseUint('FF', 1, '大端')).toBe(255)
    expect(parseUint('0001', 2, 'big')).toBe(1)
  })

  it('decodeText utf8 文本解码', () => {
    // 'STATION-A' 的 utf8 hex
    const textHex = textToHex('STATION-A')
    expect(decodeText(textHex, 'utf8')).toBe('STATION-A')
    // 中文：先转 utf8 字节袋再 textToHex
    const chineseByteBag = convertEncoding('中文', 'utf8', 'latin1')
    expect(decodeText(textToHex(chineseByteBag), 'utf8')).toBe('中文')
  })

  it('parseBitfield 位域解包', () => {
    // 0xFF = 11111111，拆成 4+4 位 → 优先级 15、重试 15
    const result = parseBitfield('FF', [
      { name: '优先级', bits: 4 },
      { name: '重试', bits: 4 }
    ])
    expect(result).toEqual({ 优先级: 15, 重试: 15 })
    // 0x12 = 00010010 → 1, 2
    expect(parseBitfield('12', [{ name: 'a', bits: 4 }, { name: 'b', bits: 4 }])).toEqual({
      a: 1,
      b: 2
    })
  })
})

// ═══════════════════════════════════════════════════════════
// splitFrame 整帧拆解（含动态长度，v3 失败场景的回归）
// ═══════════════════════════════════════════════════════════

describe('protocol-tools splitFrame', () => {
  it('静态布局：固定偏移字段全拆解成功', () => {
    // 帧：magic(AA55) version(03) msgType(01) seq(0001) flags(FF)
    const frame = 'AA5503010001FF'
    const layout: FieldLayoutItem[] = [
      { name: 'magic', kind: 'const', startByte: 0, lengthBytes: 2, parse: 'hex' },
      { name: 'version', kind: 'const', startByte: 2, lengthBytes: 1, parse: 'hex' },
      { name: 'msgType', kind: 'uint', startByte: 3, lengthBytes: 1, parse: 'uint', width: 1, endian: 'big' },
      { name: 'seq', kind: 'uint', startByte: 4, lengthBytes: 2, parse: 'uint', width: 2, endian: 'big' },
      { name: 'flags', kind: 'uint', startByte: 6, lengthBytes: 1, parse: 'uint', width: 1, endian: 'big' }
    ]
    const result = splitFrame(frame, layout)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.fields.map((f) => f.name)).toEqual([
      'magic', 'version', 'msgType', 'seq', 'flags'
    ])
    expect(result.fields[0].hex).toBe('AA55')
    expect(result.fields[2].value).toBe(1) // msgType=0x01
    expect(result.fields[3].value).toBe(1) // seq=0x0001
    expect(result.fields[4].value).toBe(255) // flags=0xFF
  })

  it('动态长度：len-prefix 驱动 body 长度（v3 核心场景）', () => {
    // 帧：len(0003, u16 big) + body(010203) + crc(AABB)
    const frame = '00030102 03AABB'.replace(/\s/g, '')
    const layout: FieldLayoutItem[] = [
      { name: 'len', kind: 'len-prefix', startByte: 0, lengthBytes: 2, parse: 'uint', width: 2, endian: 'big' },
      {
        name: 'body',
        kind: 'body',
        startByte: 2,
        lengthBytes: 0,
        parse: 'hex',
        dynamicLengthFrom: 'len-prefix-value'
      },
      { name: 'crc', kind: 'crc', startByte: 5, lengthBytes: 2, parse: 'hex' }
    ]
    const result = splitFrame(frame, layout)
    expect(result.ok).toBe(true)
    expect(result.fields[1].actualLength).toBe(3) // body 长度 = len 解析值 3
    expect(result.fields[1].hex).toBe('010203')
    expect(result.fields[2].hex).toBe('AABB')
  })

  it('TLV 动态长度：每条目的 value 长度由 len 驱动（v3 T12 越界回归）', () => {
    // 3 个 TLV 条目：
    //   T10: type(01) len(01) value(02)
    //   T11: type(03) len(03) value(040506)
    //   T12: type(05) len(02) value(0708)
    const frame = '01010203030405060502 0708'.replace(/\s/g, '')
    const layout: FieldLayoutItem[] = [
      { name: '参数区.T10.type', kind: 'tlv-type', startByte: 0, lengthBytes: 1, parse: 'uint', width: 1, endian: 'big' },
      { name: '参数区.T10.len', kind: 'tlv-len', startByte: 1, lengthBytes: 1, parse: 'uint', width: 1, endian: 'big' },
      { name: '参数区.T10.value', kind: 'tlv-value', startByte: 2, lengthBytes: 0, parse: 'hex', dynamicLengthFrom: 'tlv-value' },
      { name: '参数区.T11.type', kind: 'tlv-type', startByte: 3, lengthBytes: 1, parse: 'uint', width: 1, endian: 'big' },
      { name: '参数区.T11.len', kind: 'tlv-len', startByte: 4, lengthBytes: 1, parse: 'uint', width: 1, endian: 'big' },
      { name: '参数区.T11.value', kind: 'tlv-value', startByte: 5, lengthBytes: 0, parse: 'hex', dynamicLengthFrom: 'tlv-value' },
      { name: '参数区.T12.type', kind: 'tlv-type', startByte: 8, lengthBytes: 1, parse: 'uint', width: 1, endian: 'big' },
      { name: '参数区.T12.len', kind: 'tlv-len', startByte: 9, lengthBytes: 1, parse: 'uint', width: 1, endian: 'big' },
      { name: '参数区.T12.value', kind: 'tlv-value', startByte: 10, lengthBytes: 0, parse: 'hex', dynamicLengthFrom: 'tlv-value' }
    ]
    const result = splitFrame(frame, layout)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    // 关键断言：T11 的 value 长度 = 3（不是 v3 bug 的吞掉所有后续字节）
    const t11value = result.fields.find((f) => f.name === '参数区.T11.value')!
    expect(t11value.actualLength).toBe(3)
    expect(t11value.hex).toBe('040506')
    // T12 的 value 长度 = 2（不是 v3 bug 的 187）
    const t12value = result.fields.find((f) => f.name === '参数区.T12.value')!
    expect(t12value.actualLength).toBe(2)
    expect(t12value.hex).toBe('0708')
  })

  it('越界检测：len 声明超过帧长时报错', () => {
    const frame = '00FF01' // len=255 但只有 1 字节 body
    const layout: FieldLayoutItem[] = [
      { name: 'len', kind: 'len-prefix', startByte: 0, lengthBytes: 2, parse: 'uint', width: 2, endian: 'big' },
      {
        name: 'body',
        kind: 'body',
        startByte: 2,
        lengthBytes: 0,
        parse: 'hex',
        dynamicLengthFrom: 'len-prefix-value'
      }
    ]
    const result = splitFrame(frame, layout)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('body') && e.includes('越界'))).toBe(true)
  })

  it('repeat-block：count 驱动重复块数', () => {
    // count(03) + 3 块（每块 2 字节）：0102 0304 0506
    const frame = '030102030405 06'.replace(/\s/g, '')
    const layout: FieldLayoutItem[] = [
      { name: 'count', kind: 'repeat-count', startByte: 0, lengthBytes: 1, parse: 'uint', width: 1, endian: 'big' },
      {
        name: 'blocks',
        kind: 'repeat-block',
        startByte: 1,
        lengthBytes: 0,
        parse: 'hex',
        dynamicLengthFrom: 'repeat-count',
        blockSize: 2
      }
    ]
    const result = splitFrame(frame, layout)
    expect(result.ok).toBe(true)
    const blocks = result.fields.find((f) => f.name === 'blocks')!
    expect(blocks.actualLength).toBe(6) // 3 块 × 2 字节
    expect(blocks.hex).toBe('010203040506')
  })
})
