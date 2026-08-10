import { describe, expect, it } from 'vitest'
import type { ProtocolDsl } from '@shared/protocol-dsl'
import { generateProtocolDoc } from '@/features/script-editor/dsl/generateDoc'
import {
  fieldDocToMarkdownRow,
  protocolDocToMarkdown,
  staticFieldByteWidth
} from '@shared/protocol-doc'

/** 构造含动态结构（TLV/repeat/optional/len-prefix/crc）的测试 DSL。 */
function buildTestDsl(): ProtocolDsl {
  return {
    name: '测试协议',
    messages: [
      {
        msgType: 'REQ',
        typeId: 1,
        fields: [
          { kind: 'length-prefix', name: 'len', width: 'u16' },
          {
            kind: 'tlv',
            name: '参数区',
            entries: [
              { type: 0x10, value: '01', mode: 'hex' },
              { type: 0x11, value: '040506', mode: 'hex' },
              { type: 0x12, value: '0708', mode: 'hex' }
            ]
          },
          {
            kind: 'repeat-block',
            name: '通道表',
            count: 3,
            blockFields: [
              { kind: 'uint', name: '通道号', width: 1 },
              { kind: 'uint', name: '通道值', width: 2 }
            ]
          },
          {
            kind: 'optional',
            name: '扩展时间',
            flagBit: 0,
            field: { kind: 'uint', name: '扩展时间', width: 4 }
          },
          { kind: 'crc', name: 'crc16', algorithm: 'CRC16', endian: 'little' }
        ]
      }
    ],
    transport: { mode: 'tcp-client', port: 39189, host: '127.0.0.1' },
    loop: { count: 1000 }
  }
}

describe('generateProtocolDoc 第一步：协议文档生成', () => {
  it('基本结构：name/messages/transport/description', () => {
    const doc = generateProtocolDoc(buildTestDsl())
    expect(doc.name).toBe('测试协议')
    expect(doc.messages).toHaveLength(1)
    expect(doc.messages[0].msgType).toBe('REQ')
    expect(doc.messages[0].typeId).toBe(1)
    expect(doc.transport?.mode).toBe('tcp-client')
    expect(doc.transport?.port).toBe(39189)
    expect(doc.description).toContain('多消息协议')
    expect(doc.description).toContain('循环 1000 次')
  })

  it('帧头自动加入：magic/version/msgType/seq 全部 static', () => {
    const doc = generateProtocolDoc(buildTestDsl())
    const fields = doc.messages[0].fields
    const magic = fields.find((f) => f.name === 'magic')!
    const version = fields.find((f) => f.name === 'version')!
    const msgType = fields.find((f) => f.name === 'msgType')!
    const seq = fields.find((f) => f.name === 'seq')!

    expect(magic).toMatchObject({ offsetMode: 'static', offsetBytes: 0, widthBytes: 2 })
    expect(version).toMatchObject({ offsetMode: 'static', offsetBytes: 2, widthBytes: 1 })
    expect(msgType).toMatchObject({ offsetMode: 'static', offsetBytes: 3, widthBytes: 1, parse: 'uint' })
    expect(seq).toMatchObject({ offsetMode: 'static', offsetBytes: 4, widthBytes: 2, parse: 'uint' })
  })

  it('length-prefix 标注为 static（自身），后续字段受其影响（依赖图）', () => {
    const doc = generateProtocolDoc(buildTestDsl())
    const len = doc.messages[0].fields.find((f) => f.name === 'len')!
    expect(len).toMatchObject({
      kind: 'length-prefix',
      offsetMode: 'static',
      widthBytes: 2,
      parse: 'uint'
    })
  })

  it('TLV 展开：每条目 type/len(static) + value(dynamic)', () => {
    const doc = generateProtocolDoc(buildTestDsl())
    const fields = doc.messages[0].fields
    // T10 (type=0x10)
    const t10type = fields.find((f) => f.name === '参数区.T10.type')!
    const t10len = fields.find((f) => f.name === '参数区.T10.len')!
    const t10value = fields.find((f) => f.name === '参数区.T10.value')!
    expect(t10type).toMatchObject({ kind: 'tlv-type', offsetMode: 'static', widthBytes: 1 })
    expect(t10len).toMatchObject({ kind: 'tlv-len', offsetMode: 'static', widthBytes: 1 })
    expect(t10value).toMatchObject({
      kind: 'tlv-value',
      offsetMode: 'dynamic',
      dynamicLengthFrom: 'tlv-value',
      dependsOn: ['参数区.T10.len']
    })
    // T11/T12 同样展开
    expect(fields.some((f) => f.name === '参数区.T11.value')).toBe(true)
    expect(fields.some((f) => f.name === '参数区.T12.value')).toBe(true)
  })

  it('repeat-block 展开：count(static) + 每块字段(dynamic)', () => {
    const doc = generateProtocolDoc(buildTestDsl())
    const fields = doc.messages[0].fields
    const count = fields.find((f) => f.name === '通道表.count')!
    expect(count).toMatchObject({ kind: 'repeat-count', offsetMode: 'static', widthBytes: 1 })
    // 3 块 × 2 字段 = 6 个块字段
    const blockItems = fields.filter((f) => f.kind === 'repeat-block-item')
    expect(blockItems).toHaveLength(6)
    expect(blockItems.every((f) => f.offsetMode === 'dynamic')).toBe(true)
    expect(blockItems.every((f) => f.dependsOn?.includes('通道表.count'))).toBe(true)
  })

  it('optional 标注为 dynamic（flagBit 控制）', () => {
    const doc = generateProtocolDoc(buildTestDsl())
    const ext = doc.messages[0].fields.find((f) => f.name === '扩展时间')!
    expect(ext).toMatchObject({
      kind: 'optional-field',
      offsetMode: 'dynamic',
      dependsOn: ['flags']
    })
  })

  it('CRC 标注 endian + verify 依赖', () => {
    const doc = generateProtocolDoc(buildTestDsl())
    const crc = doc.messages[0].fields.find((f) => f.name === 'crc16')!
    expect(crc).toMatchObject({ kind: 'crc', endian: 'little', parse: 'hex' })
    // 依赖图含 verify 边
    expect(doc.dependencies.some((d) => d.from === 'crc16' && d.kind === 'verify')).toBe(true)
  })

  it('依赖图含 length 类型边（TLV value ← len）', () => {
    const doc = generateProtocolDoc(buildTestDsl())
    const tlvDep = doc.dependencies.find(
      (d) => d.from === '参数区.T10.value' && d.to === '参数区.T10.len'
    )
    expect(tlvDep).toBeDefined()
    expect(tlvDep?.kind).toBe('length')
  })

  it('Markdown 渲染：字段表含表头和字段行', () => {
    const doc = generateProtocolDoc(buildTestDsl())
    const md = protocolDocToMarkdown(doc)
    expect(md).toContain('# 测试协议')
    expect(md).toContain('| 字段 | 种类 | 偏移(字节) | 宽度(字节) | 解析 | 依赖 |')
    expect(md).toContain('magic')
    expect(md).toContain('参数区.T10.value')
    expect(md).toContain('动态') // 动态偏移标注
  })

  it('fieldDocToMarkdownRow：单行格式', () => {
    const row = fieldDocToMarkdownRow({
      name: 'test',
      kind: 'uint',
      offsetMode: 'static',
      offsetBytes: 4,
      widthBytes: 2,
      parse: 'uint',
      endian: 'big',
      description: '测试'
    })
    expect(row).toBe('| test | uint | 4 | 2 big | uint | |')
  })

  it('staticFieldByteWidth：各字段宽度计算', () => {
    expect(staticFieldByteWidth({ kind: 'const', name: 'm', value: 'AA55', mode: 'hex' })).toBe(2)
    expect(staticFieldByteWidth({ kind: 'uint', name: 's', width: 2 })).toBe(2)
    expect(staticFieldByteWidth({ kind: 'uint', name: 's', width: 1 })).toBe(1)
    expect(staticFieldByteWidth({ kind: 'text', name: 'n', value: 'AB' })).toBe(2)
    expect(staticFieldByteWidth({ kind: 'crc', name: 'c', algorithm: 'CRC16' })).toBe(2)
    expect(staticFieldByteWidth({ kind: 'crc', name: 'c', algorithm: 'CRC32' })).toBe(4)
    expect(staticFieldByteWidth({ kind: 'length-prefix', name: 'l', width: 'u16' })).toBe(2)
    expect(
      staticFieldByteWidth({
        kind: 'bitfield',
        name: 'b',
        fields: [
          { name: 'a', bits: 4 },
          { name: 'b', bits: 4 }
        ]
      })
    ).toBe(1)
  })

  it('简单协议（fields 而非 messages）：不自动加帧头', () => {
    const doc = generateProtocolDoc({
      name: '简单',
      fields: [
        { kind: 'const', name: 'head', value: 'AA', mode: 'hex' },
        { kind: 'uint', name: 'val', width: 1, value: 1 }
      ]
    })
    expect(doc.messages).toHaveLength(1)
    expect(doc.messages[0].msgType).toBe('FRAME')
    // 不自动加帧头
    expect(doc.messages[0].fields.find((f) => f.name === 'magic')).toBeUndefined()
    expect(doc.messages[0].fields.find((f) => f.name === 'head')).toBeDefined()
  })
})
