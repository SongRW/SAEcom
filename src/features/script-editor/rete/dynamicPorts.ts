import type { SocketSpec } from '@shared/types'
import { NODE_DEFINITIONS, getNodeDefinition } from '@/features/script-editor/nodes/definitions'
import { BITFIELD_MAX_TOTAL_BITS, clampBits, type BitfieldEntry } from '@/features/script-editor/rete/BitfieldControl'
import type { KeyEntry } from '@/features/script-editor/rete/KeyListControl'

export interface DerivedNodePorts {
  inputs: SocketSpec[]
  outputs: SocketSpec[]
}

/**
 * 拼接节点（protocol-concat / string-concat）的输入端口下限。
 * 保底 2 个，避免端口被移空变成无输入的死节点。
 */
export const MIN_CONCAT_PORTS = 2

/**
 * 拼接节点的输入端口 key：字母序 a..z，之后降级为 in_27, in_28...
 * 字母序保证与历史 protocol-concat 的固定 a~f 端口一致，
 * 超过 26 段（极少见）时数字序兜底，不与字母端口冲突。
 */
export function concatPortKey(index: number): string {
  if (index < 26) return String.fromCharCode(97 + index) // 'a' = 97
  return `in_${index + 1}`
}

/**
 * 从节点 data 读取拼接端口数，保底 MIN_CONCAT_PORTS。
 * NaN / 缺失 / 小于下限都收敛到下限。
 */
export function concatPortCount(data: Record<string, unknown> = {}): number {
  const raw = Number(data.ports)
  return Number.isFinite(raw) && raw >= MIN_CONCAT_PORTS ? Math.floor(raw) : MIN_CONCAT_PORTS
}

/**
 * 是否为「字母序动态输入端口」节点：protocol-concat（HEX拼接）/ string-concat（字符串拼接）/
 * script-expr（表达式）。这三类共享同一套动态端口机制：data.ports 驱动 a/b/c... 端口数。
 * 函数名保留 isConcatNode 以兼容历史调用点；语义已泛化为「字母序动态端口节点」。
 */
export function isConcatNode(nodeKey: string | undefined): boolean {
  return nodeKey === 'protocol-concat' || nodeKey === 'string-concat' || nodeKey === 'script-expr'
}

export function resolveNodePorts(nodeKey: string, data: Record<string, unknown> = {}): DerivedNodePorts {
  // 动态查找（含用户/插件组件）；回退到冻结内置表（兼容历史静态导入）。
  const definition = getNodeDefinition(nodeKey) ?? NODE_DEFINITIONS[nodeKey]
  if (!definition) return { inputs: [], outputs: [] }

  const inputs = [...definition.inputs]
  const outputs = [...definition.outputs]

  if (nodeKey === 'transform-object') {
    inputs.push(...parseKeyEntries(data).map((entry) => ({
      key: `key_${entry.id}`,
      socket: 'dataSocket' as const,
      label: entry.name || `key_${entry.id}`
    })))
  }

  if (nodeKey === 'protocol-bitfield') {
    const fields = parseBitfieldEntries(data)
    if (String(data.mode ?? '打包') === '解包') {
      inputs.push({ key: 'hex', socket: 'dataSocket', label: 'HEX' })
      outputs.push(...fields.map((field) => ({
        key: `field_${field.id}`,
        socket: 'dataSocket' as const,
        label: field.name || `${field.bits}bit`
      })))
    } else {
      inputs.push(...fields.map((field) => ({
        key: `field_${field.id}`,
        socket: 'dataSocket' as const,
        label: field.name || `${field.bits}bit`
      })))
    }
  }

  if (isConcatNode(nodeKey)) {
    const count = concatPortCount(data)
    for (let i = 0; i < count; i += 1) {
      const portKey = concatPortKey(i)
      inputs.push({ key: portKey, socket: 'dataSocket', label: portKey.toUpperCase() })
    }
  }

  return { inputs, outputs }
}

export function parseKeyEntries(data: Record<string, unknown> = {}): KeyEntry[] {
  const raw = data.keys
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.flatMap((value) => {
    const entry = value as Partial<KeyEntry>
    const id = String(entry?.id ?? '')
    if (!id || seen.has(id)) return []
    seen.add(id)
    return [{ id, name: String(entry?.name ?? '') }]
  })
}

export function parseBitfieldEntries(data: Record<string, unknown> = {}): BitfieldEntry[] {
  const raw = data.fields
  if (!Array.isArray(raw)) return []
  const entries: BitfieldEntry[] = []
  const seen = new Set<string>()
  let used = 0
  for (const value of raw) {
    const entry = value as Partial<BitfieldEntry>
    const id = String(entry?.id ?? '')
    if (!id || seen.has(id)) continue
    const available = BITFIELD_MAX_TOTAL_BITS - used
    if (available < 1) break
    seen.add(id)
    const bits = clampBits(entry?.bits, available)
    entries.push({ id, name: String(entry?.name ?? ''), bits })
    used += bits
  }
  return entries
}
