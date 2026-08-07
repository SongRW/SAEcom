/**
 * 节点适配器 —— 让 DSL→graph 转换器支持不同节点系统。
 *
 * 设计：
 * - NodeAdapter 把一种 DSL 字段类型（kind）映射到具体节点系统的一个或多个节点
 * - 适配器注册表：kind → adapter，转换器查表派发
 * - 默认注册 SAEcom 内置适配器（protocol-* + custom-*）
 * - 插件/其他节点系统可注册自己的适配器，覆盖或扩展默认映射
 *
 * 例：默认 const → protocol-const；某插件可注册 const → plugin-my-const
 *      某项目无 protocol-crc，可注册 crc → numeric-crc 作为替代
 */

import type { ProtocolField } from '@shared/protocol-dsl'

/** 适配器产出的节点规格（转换器据此创建节点 + 连线）。 */
export interface NodeSpec {
  /** 节点 key（须在目标节点系统中存在，否则 importGraphState 会丢弃） */
  key: string
  /** 节点 data（控件值） */
  data: Record<string, unknown>
  /** 显示名 */
  label: string
  /**
   * 前置节点（本节点之前需要创建的辅助节点 + 连线）。
   * 例如 bitfield 的打包模式需要为每个子字段创建 input-manual 喂值。
   * 转换器会先创建这些前置节点并连线，再创建本节点。
   */
  preNodes?: Array<{
    key: string
    data: Record<string, unknown>
    label: string
    /** 连到本节点的哪个输入端口 */
    toInput: string
  }>
}

/**
 * 字段适配器：把一个 ProtocolField 转成 NodeSpec。
 *
 * @param field DSL 字段
 * @param context 适配器上下文（提供 namePrefix 等信息）
 * @returns 节点规格（含 key/data/label/preNodes），或 null 表示该适配器不支持此字段
 */
export type FieldAdapter = (
  field: ProtocolField,
  context: AdapterContext
) => NodeSpec | null

/** 适配器上下文（传给适配器函数的辅助信息）。 */
export interface AdapterContext {
  /** 协议名（用于 label 前缀） */
  namePrefix: string
  /** 当前字段在 fields 数组中的索引 */
  fieldIndex: number
}

/** 默认输出端口名（大多数节点是 'out'；适配器可覆盖）。 */
export interface NodeSpecWithOutput extends NodeSpec {
  /** 本节点的输出端口名（供下游 concat 连线） */
  outputPort: string
}

/**
 * 适配器注册表：DSL 字段 kind → 适配器函数。
 *
 * 注册优先级：后注册的覆盖先注册的（插件可覆盖默认）。
 * 默认注册 SAEcom 内置适配器（在 registerDefaultAdapters 中）。
 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, FieldAdapter>()

  /** 注册一个字段类型的适配器。重复注册覆盖旧的。 */
  register(kind: string, adapter: FieldAdapter): void {
    this.adapters.set(kind, adapter)
  }

  /** 查询一个字段类型的适配器。无则返回 null。 */
  resolve(field: ProtocolField): FieldAdapter | null {
    return this.adapters.get(field.kind) ?? null
  }

  /** 列出已注册的所有 kind（诊断/文档用）。 */
  registeredKinds(): string[] {
    return Array.from(this.adapters.keys())
  }
}
