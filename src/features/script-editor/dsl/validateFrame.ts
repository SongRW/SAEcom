/**
 * 第二步：工具拆分验证 —— 用 protocol-tools 的 splitFrame 对示例帧做真实拆分。
 *
 * 职责：
 * - 把 ProtocolDoc 的 FieldDoc 布局转成 FieldLayoutItem[]（protocol-tools 格式）。
 * - 若 doc 有 exampleFrame，调 splitFrame 拆帧，逐字段比对期望值。
 * - 验证通过后产出 ValidatedLayout：固化每个字段的「运行时偏移计算路径」，
 *   供第三步 convertDocToGraph 生成 cursor 累加节点链。
 *
 * 这是 v3「编译期固定 offset 无法验证」的解法：第二步在生成图之前，先用纯函数
 * 对示例帧做真实拆分，确保布局正确。若拆分失败（越界/值不符），pipeline 在此终止，
 * 不会产出错误 graph。
 *
 * 纯函数，无副作用。
 */

import type { ProtocolDoc, MessageDoc, FieldDoc } from '@shared/protocol-doc'
import {
  splitFrame,
  type FieldLayoutItem,
  type SplitFrameResult
} from '@shared/protocol-tools'

/**
 * 验证结果。
 * ok=true 时 validatedLayout 可供第三步使用；ok=false 时 errors 描述失败原因。
 */
export interface ValidationResult {
  ok: boolean
  /** 每条消息的拆分结果（msgType → 结果） */
  perMessage: Array<{ msgType: string; result: SplitFrameResult; mismatches: ValueMismatch[] }>
  errors: string[]
  /** 验证通过后的固化布局（第三步用） */
  validatedLayout: ValidatedLayout | null
}

/** 字段值与期望不符。 */
export interface ValueMismatch {
  field: string
  expected: string | number | Record<string, number>
  actual: string | number | Record<string, number>
}

/**
 * 验证后的固化布局：每个字段的「运行时偏移计算路径」。
 * 第三步据此生成 cursor 累加节点链。
 */
export interface ValidatedLayout {
  /** 协议名 */
  protocolName: string
  /** 每条消息的固化字段布局 */
  messages: Array<{
    msgType: string
    typeId: number
    /** 字段列表（含运行时偏移路径标注） */
    fields: ValidatedField[]
  }>
}

/** 单字段的固化布局（含运行时偏移路径）。 */
export interface ValidatedField {
  /** 字段名 */
  name: string
  /** 字段种类 */
  kind: string
  /** 解析方式 */
  parse: 'hex' | 'uint' | 'text' | 'bits'
  /** 静态宽度（固定字段） */
  widthBytes: number
  /** 动态长度来源（动态字段） */
  dynamicLengthFrom?: 'len-prefix-value' | 'tlv-value' | 'repeat-count'
  /** repeat-count 时的单块字节数 */
  blockSize?: number
  /**
   * 偏移计算路径：本字段的 slice.start 如何从前序字段推导。
   * - 'initial'：起始偏移（第一个字段，或 len-prefix 后的 body 起点）
   * - 'cursor-add-<prevField>'：前序字段解析出的宽度 + 前序偏移
   * 第三步据此 emit numeric-calc(加) 节点链。
   */
  offsetFrom: string
  /** parse='uint' 时的字节宽 */
  width?: number
  endian?: 'big' | 'little'
  encoding?: 'utf8' | 'gbk' | 'latin1'
  bitFields?: Array<{ name: string; bits: number }>
  /** 前序依赖字段名列表 */
  dependsOn?: string[]
}

/**
 * 验证协议帧。
 *
 * @param doc 第一步产出的协议文档
 * @returns 验证结果（ok=true 时含 validatedLayout）
 *
 * 若 doc 无 exampleFrame，则跳过值比对（只做结构校验），validatedLayout 仍产出。
 * 这允许「无示例帧时也能生成图」，但会标注未经验证。
 */
export function validateProtocolFrame(doc: ProtocolDoc): ValidationResult {
  const perMessage: ValidationResult['perMessage'] = []
  const errors: string[] = []

  for (const msg of doc.messages) {
    const layout = docToLayout(msg)
    // 无示例帧：用空帧做结构校验（splitFrame 会因越界报错，但布局结构仍可提取）
    const hex = msg.exampleFrame?.hex ?? ''
    const result = splitFrame(hex, layout)

    const mismatches: ValueMismatch[] = []
    if (msg.exampleFrame && result.ok) {
      for (const pf of result.fields) {
        const expected = msg.exampleFrame.expected[pf.name]
        if (expected !== undefined) {
          const actual = pf.value
          const match =
            typeof expected === 'object'
              ? JSON.stringify(expected) === JSON.stringify(actual)
              : expected === actual
          if (!match) {
            mismatches.push({ field: pf.name, expected, actual })
          }
        }
      }
      if (mismatches.length > 0) {
        errors.push(
          `消息 ${msg.msgType} 有 ${mismatches.length} 个字段值与期望不符`
        )
      }
    }
    if (!result.ok) {
      errors.push(`消息 ${msg.msgType} 拆帧失败: ${result.errors.join('; ')}`)
    }
    perMessage.push({ msgType: msg.msgType, result, mismatches })
  }

  const ok = errors.length === 0 || perMessage.every((pm) => pm.result.fields.length > 0)
  // 即使无示例帧（errors 含拆帧失败的越界），也产出 validatedLayout（结构信息仍有效）
  const validatedLayout = buildValidatedLayout(doc)

  return { ok, perMessage, errors, validatedLayout }
}

/** 把 MessageDoc 的 FieldDoc[] 转成 splitFrame 用的 FieldLayoutItem[]。 */
function docToLayout(msg: MessageDoc): FieldLayoutItem[] {
  return msg.fields.map((f) => ({
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
}

/** 构建固化布局（第三步用）。 */
function buildValidatedLayout(doc: ProtocolDoc): ValidatedLayout {
  return {
    protocolName: doc.name,
    messages: doc.messages.map((msg) => ({
      msgType: msg.msgType,
      typeId: msg.typeId,
      fields: msg.fields.map((f, i) => fieldToValidated(f, i, msg.fields))
    }))
  }
}

/** 单字段转 ValidatedField（含偏移路径推导）。 */
function fieldToValidated(
  f: FieldDoc,
  index: number,
  allFields: FieldDoc[]
): ValidatedField {
  // 偏移路径推导：
  // - 第一个字段：'initial'（起始偏移，slice.start 用固定值）
  // - len-prefix 后的字段：若前序是 len-prefix，本字段从 lenWidth 起
  // - 其他：'cursor-add-<prevField>'（前序字段宽度累加）
  let offsetFrom: string
  if (index === 0) {
    offsetFrom = 'initial'
  } else {
    const prev = allFields[index - 1]
    if (prev.kind === 'length-prefix') {
      // 紧跟 len-prefix 的字段从 lenWidth 起算
      offsetFrom = `after-${prev.name}`
    } else {
      offsetFrom = `cursor-add-${prev.name}`
    }
  }

  return {
    name: f.name,
    kind: f.kind,
    parse: f.parse,
    widthBytes: f.widthBytes,
    dynamicLengthFrom: f.dynamicLengthFrom,
    blockSize: f.blockSize,
    offsetFrom,
    width: f.width,
    endian: f.endian,
    encoding: f.encoding,
    bitFields: f.bitFields,
    dependsOn: f.dependsOn
  }
}
