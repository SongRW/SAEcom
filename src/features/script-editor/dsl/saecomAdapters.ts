/**
 * SAEcom 默认节点适配器 —— 把 DSL 字段映射到 SAEcom 内置节点。
 *
 * 在 registerDefaultAdapters 中注册到 AdapterRegistry，dslToGraph 默认使用这些适配器。
 * 插件可覆盖：先调 registerDefaultAdapters，再 register 自己的适配器（覆盖同 kind）。
 */

import type { ProtocolField } from '@shared/protocol-dsl'
import { AdapterRegistry, type NodeSpecWithOutput, type AdapterContext } from './adapters'

type AdaptedSpec = NodeSpecWithOutput | null

/** const 字段 → protocol-const */
function adaptConst(field: Extract<ProtocolField, { kind: 'const' }>, ctx: AdapterContext): AdaptedSpec {
  return {
    key: 'protocol-const',
    data: {
      mode: field.mode ?? 'hex',
      content: field.value,
      width: field.width ?? 2,
      encoding: 'utf8'
    },
    label: `${ctx.namePrefix}.${field.name}`,
    outputPort: 'out'
  }
}

/** uint 字段 → protocol-const(decimal) */
function adaptUint(field: Extract<ProtocolField, { kind: 'uint' }>, ctx: AdapterContext): AdaptedSpec {
  return {
    key: 'protocol-const',
    data: {
      mode: 'decimal',
      content: field.value != null ? String(field.value) : '0',
      width: field.width,
      encoding: 'utf8'
    },
    label: `${ctx.namePrefix}.${field.name}`,
    outputPort: 'out'
  }
}

/** text 字段 → protocol-const(text) */
function adaptText(field: Extract<ProtocolField, { kind: 'text' }>, ctx: AdapterContext): AdaptedSpec {
  return {
    key: 'protocol-const',
    data: {
      mode: 'text',
      content: field.value,
      width: 2,
      encoding: field.encoding ?? 'utf8'
    },
    label: `${ctx.namePrefix}.${field.name}`,
    outputPort: 'out'
  }
}

/** bitfield 字段 → protocol-bitfield（打包模式）+ 每个子字段的 input-manual */
function adaptBitfield(field: Extract<ProtocolField, { kind: 'bitfield' }>, ctx: AdapterContext): AdaptedSpec {
  const fields = field.fields.map((f, i) => ({ id: `f${i}`, name: f.name, bits: f.bits }))
  const label = `${ctx.namePrefix}.${field.name}`
  return {
    key: 'protocol-bitfield',
    data: { mode: '打包', fields },
    label,
    outputPort: 'out',
    preNodes: fields.map(f => ({
      key: 'input-manual',
      data: { content: '0', mode: 'text' },
      label: `${label}.${f.name}`,
      toInput: `field_${f.id}`
    }))
  }
}

/** crc 字段 → protocol-crc（在 concat 后由转换器单独处理 body 连线） */
function adaptCrc(field: Extract<ProtocolField, { kind: 'crc' }>, ctx: AdapterContext): AdaptedSpec {
  return {
    key: 'protocol-crc',
    data: {
      algorithm: field.algorithm ?? 'CRC16',
      endian: field.endian === 'big' ? '大端' : '小端',
      append: field.append === false ? '否' : '是'
    },
    label: `${ctx.namePrefix}.${field.name}`,
    outputPort: 'out'
  }
}

/** length-prefix 字段 → protocol-len-prefix */
function adaptLengthPrefix(field: Extract<ProtocolField, { kind: 'length-prefix' }>, ctx: AdapterContext): AdaptedSpec {
  return {
    key: 'protocol-len-prefix',
    data: { width: field.width ?? 'u8' },
    label: `${ctx.namePrefix}.${field.name}`,
    outputPort: 'out'
  }
}

/** custom 字段 → custom-* 节点（透传 componentKey + config） */
function adaptCustom(field: Extract<ProtocolField, { kind: 'custom' }>, ctx: AdapterContext): AdaptedSpec {
  return {
    key: field.componentKey,
    data: field.config ?? {},
    label: `${ctx.namePrefix}.${field.name}`,
    outputPort: 'out'
  }
}

/**
 * 注册 SAEcom 默认适配器到注册表。
 * 覆盖策略：清空后重新注册（确保调用幂等）。
 */
export function registerDefaultAdapters(registry: AdapterRegistry): void {
  registry.register('const', adaptConst as any)
  registry.register('uint', adaptUint as any)
  registry.register('text', adaptText as any)
  registry.register('bitfield', adaptBitfield as any)
  registry.register('crc', adaptCrc as any)
  registry.register('length-prefix', adaptLengthPrefix as any)
  registry.register('custom', adaptCustom as any)
}

/** 创建一个带默认 SAEcom 适配器的注册表（便捷工厂）。 */
export function createDefaultRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry()
  registerDefaultAdapters(registry)
  return registry
}
