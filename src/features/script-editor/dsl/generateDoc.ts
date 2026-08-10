/**
 * 第一步：协议文档生成器 —— 把 ProtocolDsl 转成结构化 ProtocolDoc。
 *
 * 职责：
 * - 遍历 messages/fields，标注每个字段的偏移（静态/动态）、宽度、字节序、依赖。
 * - 对动态结构（tlv/repeat-block/optional/length-prefix）展开成扁平字段表，
 *   标记 offsetMode='dynamic' 和 dynamicLengthFrom。
 * - 生成依赖图（length-prefix→body, crc→前序, tlv-len→value, optional→flags）。
 *
 * 这是 v3「编译期固定 offset」问题的显式化：文档里 dynamic 字段不再有固定 offset，
 * 而是标注「运行时由 cursor 累加计算」，供第三步生成运行时偏移链。
 *
 * 纯函数，无副作用。AI 可调用此函数生成文档供人审阅，也可被 pipeline 编排。
 */

import type { ProtocolDsl, ProtocolField, MessageSpec } from '@shared/protocol-dsl'
import type {
  Dependency,
  FieldDoc,
  FieldKind,
  MessageDoc,
  ProtocolDoc
} from '@shared/protocol-doc'
import { staticFieldByteWidth } from '@shared/protocol-doc'

/**
 * 生成协议文档。
 * @param dsl 协议 DSL
 * @returns 结构化协议文档（含字段表、依赖图）
 */
export function generateProtocolDoc(dsl: ProtocolDsl): ProtocolDoc {
  const multiMessage = Boolean(dsl.messages && dsl.messages.length > 0)
  const messages: MessageSpec[] = multiMessage
    ? dsl.messages!
    : [{ msgType: 'FRAME', typeId: 1, fields: dsl.fields ?? [] }]
  const autoHeader = multiMessage // 多消息 DSL 自动加 magic/version/msgType/seq 帧头

  const messageDocs = messages.map((msg, mi) =>
    buildMessageDoc(msg, mi, dsl.name, autoHeader)
  )

  const dependencies: Dependency[] = []
  for (const md of messageDocs) {
    dependencies.push(...extractDependencies(md))
  }

  return {
    name: dsl.name || '协议',
    description: buildDescription(dsl),
    transport: dsl.transport
      ? {
          mode: dsl.transport.mode,
          host: dsl.transport.host,
          port: dsl.transport.port
        }
      : undefined,
    messages: messageDocs,
    dependencies
  }
}

/** 构建单条消息的文档（含帧头 + body 字段展开）。 */
function buildMessageDoc(
  msg: MessageSpec,
  msgIndex: number,
  protocolName: string,
  autoHeader: boolean
): MessageDoc {
  const fields: FieldDoc[] = []
  let staticCursor = 0 // 静态偏移游标（只用于标注 static 字段的 offsetBytes）

  // 帧头公共字段（多消息 DSL 自动加）
  if (autoHeader) {
    fields.push(buildHeaderField('magic', 'const', staticCursor, 2, { parse: 'hex' }))
    staticCursor += 2
    fields.push(buildHeaderField('version', 'const', staticCursor, 1, { parse: 'hex' }))
    staticCursor += 1
    fields.push(
      buildHeaderField('msgType', 'uint', staticCursor, 1, {
        parse: 'uint',
        width: 1,
        endian: 'big'
      })
    )
    staticCursor += 1
    fields.push(
      buildHeaderField('seq', 'uint', staticCursor, 2, {
        parse: 'uint',
        width: 2,
        endian: 'big'
      })
    )
    staticCursor += 2
  }

  // body 字段：展开嵌套结构
  for (const field of msg.fields) {
    const subFields = expandField(field, field.name, staticCursor)
    fields.push(...subFields.items)
    staticCursor = subFields.nextCursor
  }

  return {
    msgType: msg.msgType,
    typeId: msg.typeId ?? msgIndex + 1,
    fields,
    exampleFrame: undefined // DSL 不携带示例帧，留待第二步填充或外部注入
  }
}

/** 帧头字段构造 helper。 */
function buildHeaderField(
  name: string,
  kind: FieldKind,
  offset: number,
  width: number,
  extra: Partial<FieldDoc>
): FieldDoc {
  return {
    name,
    kind,
    offsetMode: 'static',
    offsetBytes: offset,
    widthBytes: width,
    parse: 'hex',
    description: `帧头 ${name}`,
    ...extra
  }
}

/** 展开一个 ProtocolField 成 FieldDoc 子表（递归处理嵌套结构）。 */
function expandField(
  field: ProtocolField,
  namePrefix: string,
  cursor: number
): { items: FieldDoc[]; nextCursor: number } {
  const items: FieldDoc[] = []
  let currentCursor = cursor

  switch (field.kind) {
    case 'const':
    case 'uint':
    case 'text':
    case 'bitfield': {
      const w = staticFieldByteWidth(field)
      items.push(buildStaticField(field, namePrefix, currentCursor, w))
      currentCursor += w
      break
    }
    case 'length-prefix': {
      const lenWidth = field.width === 'u16' ? 2 : 1
      // len 字段本身是静态的
      items.push({
        name: namePrefix,
        kind: 'length-prefix',
        offsetMode: 'static',
        offsetBytes: currentCursor,
        widthBytes: lenWidth,
        parse: 'uint',
        width: lenWidth,
        endian: 'big',
        description: `长度前缀（驱动 body 动态长度）`,
        dependsOn: []
      })
      currentCursor += lenWidth
      // body 是动态的（长度由 len 驱动）—— 但 body 不是独立字段，是后续字段的容器
      // 这里不单独 emit body 字段，后续字段自动落在 dynamic 偏移
      // 标记：下一个字段开始受 len 影响（通过 dependencies 记录）
      break
    }
    case 'crc': {
      const w = staticFieldByteWidth(field)
      items.push({
        name: namePrefix,
        kind: 'crc',
        offsetMode: 'static',
        offsetBytes: currentCursor,
        widthBytes: w,
        parse: 'hex',
        endian: field.endian,
        description: `CRC 校验（${field.algorithm ?? 'CRC16'}）`,
        dependsOn: []
      })
      currentCursor += w
      break
    }
    case 'custom': {
      const w = staticFieldByteWidth(field)
      items.push(buildStaticField(field, namePrefix, currentCursor, w))
      currentCursor += w
      break
    }
    case 'tlv': {
      // 逐条目展开：type(1) + len(1) + value(动态)
      let entryCursor = currentCursor
      for (const entry of field.entries) {
        const valueBytes =
          entry.mode === 'text'
            ? new TextEncoder().encode(entry.value).length
            : Math.max(1, Math.ceil(entry.value.replace(/\s/g, '').length / 2))
        const typeHex = entry.type.toString(16).toUpperCase().padStart(2, '0')

        // type（静态，1 字节）
        items.push({
          name: `${namePrefix}.T${typeHex}.type`,
          kind: 'tlv-type',
          offsetMode: 'static',
          offsetBytes: entryCursor,
          widthBytes: 1,
          parse: 'uint',
          width: 1,
          endian: 'big',
          description: `TLV 条目 T${typeHex} 的 type`,
          dependsOn: []
        })
        entryCursor += 1

        // len（静态自身，1 字节；但驱动 value 长度）
        const lenFieldName = `${namePrefix}.T${typeHex}.len`
        items.push({
          name: lenFieldName,
          kind: 'tlv-len',
          offsetMode: 'static',
          offsetBytes: entryCursor,
          widthBytes: 1,
          parse: 'uint',
          width: 1,
          endian: 'big',
          description: `TLV 条目 T${typeHex} 的 len（驱动 value 长度）`,
          dependsOn: []
        })
        entryCursor += 1

        // value（动态长度，由 len 驱动）
        items.push({
          name: `${namePrefix}.T${typeHex}.value`,
          kind: 'tlv-value',
          offsetMode: 'dynamic',
          offsetBytes: entryCursor, // 初始猜测偏移
          widthBytes: valueBytes, // DSL 声明的初始宽度（实际运行时由 len 决定）
          parse: 'hex',
          dynamicLengthFrom: 'tlv-value',
          description: `TLV 条目 T${typeHex} 的 value（动态长度 ← ${lenFieldName}）`,
          dependsOn: [lenFieldName]
        })
        entryCursor += valueBytes // type(1) + len(1) 已在上面累加，这里只加 value
      }
      currentCursor = entryCursor
      break
    }
    case 'repeat-block': {
      // count（静态，1 字节）
      const countFieldName = `${namePrefix}.count`
      items.push({
        name: countFieldName,
        kind: 'repeat-count',
        offsetMode: 'static',
        offsetBytes: currentCursor,
        widthBytes: 1,
        parse: 'uint',
        width: 1,
        endian: 'big',
        description: `重复块数量（驱动 blocks 长度）`,
        dependsOn: []
      })
      currentCursor += 1

      // 每块的字段（静态展开 count 次）
      const count = field.count ?? 1
      const blockSize = field.blockFields.reduce((s, f) => s + staticFieldByteWidth(f), 0)
      for (let i = 0; i < count; i++) {
        for (const bf of field.blockFields) {
          const w = staticFieldByteWidth(bf)
          items.push({
            name: `${namePrefix}.块${i + 1}.${bf.name}`,
            kind: 'repeat-block-item',
            offsetMode: 'dynamic',
            offsetBytes: currentCursor,
            widthBytes: w,
            parse: parseModeFor(bf),
            endian: bf.kind === 'uint' ? bf.endian : undefined,
            description: `重复块 ${i + 1}.${bf.name}`,
            dependsOn: [countFieldName]
          })
          currentCursor += w
        }
      }
      // 整体记录 blocks 长度依赖（供 splitFrame 用）
      // blockSize 用于 dynamicLengthFrom='repeat-count' 的字段
      void blockSize // 单字段在 items 里逐个展开，不需要整体 blocks 字段
      break
    }
    case 'optional': {
      // flags 位检查（optional 的存在性由 flags 的 flagBit 决定）
      // 字段本身：组包恒置 flag=1，拆包按 flags 位检查
      // 这里把 optional 展开为「字段本身」（offsetMode='dynamic'，因 flags 位为 0 时不占位）
      const w = staticFieldByteWidth(field.field)
      items.push({
        name: namePrefix,
        kind: 'optional-field',
        offsetMode: 'dynamic',
        offsetBytes: currentCursor,
        widthBytes: w,
        parse: parseModeFor(field.field),
        endian: field.field.kind === 'uint' ? field.field.endian : undefined,
        description: `可选字段（flagBit=${field.flagBit}）`,
        dependsOn: ['flags']
      })
      currentCursor += w
      break
    }
    default: {
      const w = staticFieldByteWidth(field)
      items.push(buildStaticField(field, namePrefix, currentCursor, w))
      currentCursor += w
    }
  }

  return { items, nextCursor: currentCursor }
}

/** 构造静态字段 FieldDoc。 */
function buildStaticField(
  field: ProtocolField,
  name: string,
  offset: number,
  width: number
): FieldDoc {
  return {
    name,
    kind: field.kind as FieldKind,
    offsetMode: 'static',
    offsetBytes: offset,
    widthBytes: width,
    parse: parseModeFor(field),
    width: field.kind === 'uint' ? field.width : undefined,
    endian: field.kind === 'uint' ? field.endian : undefined,
    encoding: field.kind === 'text' ? field.encoding : undefined,
    bitFields: field.kind === 'bitfield' ? field.fields : undefined,
    description: `字段 ${name}`
  }
}

/** 从 ProtocolField 推导解析方式。 */
function parseModeFor(field: ProtocolField): 'hex' | 'uint' | 'text' | 'bits' {
  switch (field.kind) {
    case 'uint':
      return 'uint'
    case 'text':
      return 'text'
    case 'bitfield':
      return 'bits'
    default:
      return 'hex'
  }
}

/** 从消息文档提取依赖关系。 */
function extractDependencies(msg: MessageDoc): Dependency[] {
  const deps: Dependency[] = []
  for (const f of msg.fields) {
    if (f.dependsOn) {
      for (const dep of f.dependsOn) {
        deps.push({
          from: f.name,
          to: dep,
          kind: f.dynamicLengthFrom ? 'length' : 'offset'
        })
      }
    }
    if (f.kind === 'crc') {
      // CRC 依赖前序所有字节
      deps.push({ from: f.name, to: '<前序全部>', kind: 'verify' })
    }
  }
  return deps
}

/** 构建协议描述文本。 */
function buildDescription(dsl: ProtocolDsl): string {
  const parts: string[] = []
  if (dsl.messages && dsl.messages.length > 0) {
    parts.push(`多消息协议，含 ${dsl.messages.length} 种消息类型：${dsl.messages.map((m) => m.msgType).join('/')}`)
  } else {
    parts.push('单帧协议')
  }
  if (dsl.transport) {
    parts.push(`传输：${dsl.transport.mode} (${dsl.transport.host ?? '127.0.0.1'}:${dsl.transport.port})`)
  }
  if (dsl.loop) {
    parts.push(`循环 ${dsl.loop.count} 次（压测）`)
  }
  return parts.join('；')
}
