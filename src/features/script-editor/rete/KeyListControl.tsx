import { ClassicPreset } from 'rete'
import { useState, type FC } from 'react'

export interface KeyEntry {
  id: string
  name: string
}

let keyCounter = 0
export function newKeyId(): string {
  keyCounter += 1
  return `k${keyCounter}`
}

/**
 * 自定义 Rete control：管理对象节点的键列表。
 * keys 是单一事实来源（与 node.data.keys 同步），端口由 setup.ts 派生。
 * change 回调在每次增删/改名时触发，由调用方负责：更新 node.data + 同步端口 + 刷新视图。
 */
export class KeyListControl extends ClassicPreset.Control {
  keys: KeyEntry[]
  private change: (keys: KeyEntry[]) => void

  constructor(initial: KeyEntry[], change: (keys: KeyEntry[]) => void) {
    super()
    this.keys = initial
    this.change = change
  }

  getValue(): KeyEntry[] {
    return this.keys
  }

  setValue(keys: KeyEntry[]): void {
    this.keys = keys
    this.change(keys)
  }
}

interface KeyListControlViewProps {
  data: KeyListControl
}

export const KeyListControlView: FC<KeyListControlViewProps> = ({ data }) => {
  const [keys, setKeys] = useState<KeyEntry[]>(() => data.getValue())

  function commit(next: KeyEntry[]): void {
    setKeys(next)
    data.setValue(next)
  }

  function addKey(): void {
    commit([...keys, { id: newKeyId(), name: '' }])
  }

  function renameKey(id: string, name: string): void {
    commit(keys.map((entry) => (entry.id === id ? { ...entry, name } : entry)))
  }

  function removeKey(id: string): void {
    commit(keys.filter((entry) => entry.id !== id))
  }

  return (
    <div className="script-key-list" data-testid="key-list">
      {keys.map((entry) => (
        <div className="script-key-list__row" key={entry.id}>
          <input
            className="script-key-list__input"
            data-testid={`key-name-${entry.id}`}
            value={entry.name}
            placeholder="键名"
            onChange={(e) => renameKey(entry.id, e.target.value)}
          />
          <button
            type="button"
            className="script-key-list__remove"
            data-testid={`key-remove-${entry.id}`}
            onClick={() => removeKey(entry.id)}
            title="删除键"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="script-key-list__add"
        data-testid="key-add"
        onClick={addKey}
      >
        + 添加键
      </button>
    </div>
  )
}
