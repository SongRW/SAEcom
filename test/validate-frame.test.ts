import { describe, expect, it } from 'vitest'
import type { ProtocolDsl } from '@shared/protocol-dsl'
import { generateProtocolDoc } from '@/features/script-editor/dsl/generateDoc'
import { validateProtocolFrame } from '@/features/script-editor/dsl/validateFrame'
import { splitFrame, type FieldLayoutItem } from '@shared/protocol-tools'

/** 构造含 TLV 的协议 DSL（v3 T12 越界 bug 的核心场景）。 */
function buildTlvDsl(): ProtocolDsl {
  return {
    name: 'TLV测试',
    messages: [
      {
        msgType: 'REQ',
        typeId: 1,
        fields: [
          {
            kind: 'tlv',
            name: '参数区',
            entries: [
              { type: 0x10, value: '02', mode: 'hex' }, // len=1, value=02
              { type: 0x11, value: '040506', mode: 'hex' }, // len=3, value=040506
              { type: 0x12, value: '0708', mode: 'hex' } // len=2, value=0708
            ]
          },
          { kind: 'crc', name: 'crc16', algorithm: 'CRC16', endian: 'big' }
        ]
      }
    ]
  }
}

/**
 * 构造与 DSL 对应的示例帧 hex。
 * 帧头(magic/version/msgType/seq) + TLV(T10/T11/T12) + CRC
 * 手工拼帧确保与 DSL 声明一致。
 */
function buildExampleHex(): string {
  // 帧头：AA55 03 01 0000 (6 bytes)
  const header = 'AA5503010000'
  // T10: type=10 len=01 value=02 (3 bytes)
  const t10 = '100102'
  // T11: type=11 len=03 value=040506 (5 bytes)
  const t11 = '1103040506'
  // T12: type=12 len=02 value=0708 (4 bytes)
  const t12 = '12020708'
  // CRC16 (big endian) 占位 AABB (2 bytes)
  const crc = 'AABB'
  return header + t10 + t11 + t12 + crc
}

describe('validateProtocolFrame 第二步：工具拆分验证', () => {
  it('无示例帧时：产出 validatedLayout（结构信息有效）', () => {
    const doc = generateProtocolDoc(buildTlvDsl())
    const result = validateProtocolFrame(doc)
    // 无 exampleFrame，拆帧会用空帧 → 越界 errors，但 validatedLayout 仍产出
    expect(result.validatedLayout).not.toBeNull()
    expect(result.validatedLayout!.protocolName).toBe('TLV测试')
    expect(result.validatedLayout!.messages).toHaveLength(1)
  })

  it('有示例帧时：TLV 正确拆解（T12 不越界）', () => {
    const doc = generateProtocolDoc(buildTlvDsl())
    // 注入示例帧（generateProtocolDoc 不携带，外部填充）
    doc.messages[0].exampleFrame = {
      hex: buildExampleHex(),
      expected: {
        magic: 'AA55',
        version: '03',
        msgType: 1,
        seq: 0
      }
    }
    const result = validateProtocolFrame(doc)
    // 帧头字段应拆解正确
    const req = result.perMessage[0]
    const magic = req.result.fields.find((f) => f.name === 'magic')
    expect(magic?.hex).toBe('AA55')
    const msgType = req.result.fields.find((f) => f.name === 'msgType')
    expect(msgType?.value).toBe(1)
  })

  it('TLV value 动态长度：T11 value=3字节，T12 value=2字节（v3 bug 回归）', () => {
    // 用 generateProtocolDoc 产出的布局（offsetBytes 是正确的初始猜测）
    const doc = generateProtocolDoc(buildTlvDsl())
    const layout: FieldLayoutItem[] = doc.messages[0].fields.map((f) => ({
      name: f.name,
      kind: f.kind,
      startByte: f.offsetBytes,
      lengthBytes: f.widthBytes,
      parse: f.parse,
      width: f.width,
      endian: f.endian,
      encoding: f.encoding,
      bitFields: f.bitFields,
      dynamicLengthFrom: f.dynamicLengthFrom,
      blockSize: f.blockSize
    }))
    const hex = buildExampleHex()
    const result = splitFrame(hex, layout)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])

    // 关键断言（v3 bug 的回归）：
    const t11value = result.fields.find((f) => f.name === '参数区.T11.value')!
    expect(t11value.actualLength).toBe(3)
    expect(t11value.hex).toBe('040506')

    const t12value = result.fields.find((f) => f.name === '参数区.T12.value')!
    expect(t12value.actualLength).toBe(2) // 不是 v3 bug 的 187
    expect(t12value.hex).toBe('0708')

    const crc = result.fields.find((f) => f.name === 'crc16')!
    expect(crc.hex).toBe('AABB')
  })

  it('validatedLayout 含偏移路径（offsetFrom）：第一个字段=initial，后续=cursor-add', () => {
    const doc = generateProtocolDoc(buildTlvDsl())
    const result = validateProtocolFrame(doc)
    const fields = result.validatedLayout!.messages[0].fields
    expect(fields[0].offsetFrom).toBe('initial')
    // 后续字段含 cursor-add 或 after-（len-prefix 后）
    expect(fields.some((f) => f.offsetFrom.startsWith('cursor-add-'))).toBe(true)
  })

  it('validatedLayout：TLV value 字段标注 dynamicLengthFrom=tlv-value', () => {
    const doc = generateProtocolDoc(buildTlvDsl())
    const result = validateProtocolFrame(doc)
    const t10value = result.validatedLayout!.messages[0].fields.find(
      (f) => f.name === '参数区.T10.value'
    )!
    expect(t10value.dynamicLengthFrom).toBe('tlv-value')
    expect(t10value.dependsOn).toContain('参数区.T10.len')
  })

  it('值不符时报 mismatch', () => {
    const doc = generateProtocolDoc(buildTlvDsl())
    doc.messages[0].exampleFrame = {
      hex: buildExampleHex(),
      expected: { msgType: 99 } // 故意写错
    }
    const result = validateProtocolFrame(doc)
    const mismatch = result.perMessage[0].mismatches.find((m) => m.field === 'msgType')
    expect(mismatch).toBeDefined()
    expect(mismatch?.expected).toBe(99)
    expect(mismatch?.actual).toBe(1)
  })
})
