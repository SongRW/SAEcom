import { ClassicPreset } from 'rete'
import { useState, type FC } from 'react'

/** 位段条目：name 仅作显示/端口标签，bits 决定位宽（1-32）。id 是端口 key 后缀。 */
export interface BitfieldEntry {
  id: string
  name: string
  bits: number
}

/** 位域总位宽上限。convertBase 底层 parseInt 受 32bit 精度限制（见 electron/main.ts convertBase）。 */
export const BITFIELD_MAX_TOTAL_BITS = 32

/**
 * 从一组已有条目里取最大数字后缀，用于给本节点新字段生成不冲突的 id。
 * 复用 KeyListControl 的同款策略：保存→重载→新增不会复用磁盘上已存 id。
 */
function nextFieldIdSeed(existing: BitfieldEntry[]): number {
  let max = 0
  for (const entry of existing) {
    const match = /^f(\d+)$/.exec(entry.id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return max
}

/** 规范化位宽：非有限数/小于 1 → 1；大于剩余可用位宽 → 截到剩余。调用方传入当前总宽上下文。 */
export function clampBits(value: unknown, available: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(Math.floor(n), Math.max(1, available))
}

/**
 * 自定义 Rete control：位域节点的字段表。
 * fields 是单一事实来源（与 node.data.fields 同步），端口由 setup.ts 派生。
 * 总位宽 ≤ 32 是硬约束：增删/改位宽时由 change 回调守门，change 内部决定是否接受。
 */
export class BitfieldControl extends ClassicPreset.Control {
  fields: BitfieldEntry[]
  private change: (fields: BitfieldEntry[]) => void
  private idCounter: number

  constructor(initial: BitfieldEntry[], change: (fields: BitfieldEntry[]) => void) {
    super()
    this.fields = initial
    this.change = change
    this.idCounter = nextFieldIdSeed(initial)
  }

  getValue(): BitfieldEntry[] {
    return this.fields
  }

  newFieldId(): string {
    this.idCounter += 1
    return `f${this.idCounter}`
  }

  setValue(fields: BitfieldEntry[]): void {
    this.fields = fields
    this.change(fields)
  }
}

interface BitfieldControlViewProps {
  data: BitfieldControl
}

export const BitfieldControlView: FC<BitfieldControlViewProps> = ({ data }) => {
  const [fields, setFields] = useState<BitfieldEntry[]>(() => data.getValue())
  // 总位宽（不含正在编辑的那个条目，用于「可用位宽」提示）
  const totalBitsExcluding = (excludeId: string): number =>
    fields.filter((entry) => entry.id !== excludeId).reduce((sum, entry) => sum + (Number(entry.bits) || 0), 0)
  const totalBits = fields.reduce((sum, entry) => sum + (Number(entry.bits) || 0), 0)
  const overLimit = totalBits > BITFIELD_MAX_TOTAL_BITS

  function commit(next: BitfieldEntry[]): void {
    setFields(next)
    data.setValue(next)
  }

  function addField(): void {
    const used = fields.reduce((sum, entry) => sum + (Number(entry.bits) || 0), 0)
    const remaining = BITFIELD_MAX_TOTAL_BITS - used
    if (remaining < 1) return // 已达上限，不允许新增
    commit([...fields, { id: data.newFieldId(), name: '', bits: Math.min(8, remaining) }])
  }

  function renameField(id: string, name: string): void {
    commit(fields.map((entry) => (entry.id === id ? { ...entry, name } : entry)))
  }

  function changeBits(id: string, bitsRaw: number): void {
    const available = BITFIELD_MAX_TOTAL_BITS - totalBitsExcluding(id)
    const bits = clampBits(bitsRaw, available)
    commit(fields.map((entry) => (entry.id === id ? { ...entry, bits } : entry)))
  }

  function removeField(id: string): void {
    commit(fields.filter((entry) => entry.id !== id))
  }

  return (
    <div
      className="script-key-list"
      data-testid="bitfield-list"
      // 阻止 pointerdown 冒泡到 Rete 节点拖拽处理器（同 KeyListControlView 的处理理由）。
      onPointerDown={(e) => e.stopPropagation()}
    >
      {fields.map((entry) => {
        const available = BITFIELD_MAX_TOTAL_BITS - totalBitsExcluding(entry.id)
        return (
          <div className="script-key-list__row" key={entry.id}>
            <input
              className="script-key-list__input"
              data-testid={`bitfield-name-${entry.id}`}
              value={entry.name}
              placeholder="字段名"
              onChange={(e) => renameField(entry.id, e.target.value)}
            />
            <input
              className="script-key-list__input script-key-list__input--narrow"
              data-testid={`bitfield-bits-${entry.id}`}
              type="number"
              min={1}
              max={Math.max(1, available)}
              value={entry.bits}
              onChange={(e) => changeBits(entry.id, Number(e.target.value))}
            />
            <span className="script-key-list__hint">bit</span>
            <button
              type="button"
              className="script-key-list__remove"
              data-testid={`bitfield-remove-${entry.id}`}
              onClick={() => removeField(entry.id)}
              title="删除字段"
            >
              ×
            </button>
          </div>
        )
      })}
      <div className="script-key-list__footer">
        <span className={overLimit ? 'script-key-list__error' : 'script-key-list__hint'}>
          {totalBits}/{BITFIELD_MAX_TOTAL_BITS} bit
        </span>
        <button
          type="button"
          className="script-key-list__add"
          data-testid="bitfield-add"
          onClick={addField}
          disabled={overLimit}
        >
          + 添加字段
        </button>
      </div>
    </div>
  )
}
