import type { SocketSpec } from '@shared/types'
import { NODE_DEFINITIONS } from '@/features/script-editor/nodes/definitions'
import { BITFIELD_MAX_TOTAL_BITS, clampBits, type BitfieldEntry } from '@/features/script-editor/rete/BitfieldControl'
import type { KeyEntry } from '@/features/script-editor/rete/KeyListControl'

export interface DerivedNodePorts {
  inputs: SocketSpec[]
  outputs: SocketSpec[]
}

export function resolveNodePorts(nodeKey: string, data: Record<string, unknown> = {}): DerivedNodePorts {
  const definition = NODE_DEFINITIONS[nodeKey]
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
