import { ClassicPreset } from 'rete'
import { useState, type FC } from 'react'

export interface KeyEntry {
  id: string
  name: string
}

/**
 * 从一组现有 KeyEntry 中解析出最大的数字后缀，用于给本节点的新键生成不冲突的 id。
 * 解决模块级全局计数器在「保存→重载→新增键」时复用已持久化 id 的问题：
 * 重载后计数器归零，若直接从 k1 开始会与磁盘上已存的 k1 冲突，
 * 导致两个键绑定同一端口 key_k1、对象字面量后值覆盖前者。
 */
function nextKeyIdSeed(existing: KeyEntry[]): number {
  let max = 0
  for (const entry of existing) {
    const match = /^k(\d+)$/.exec(entry.id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return max
}

/**
 * 自定义 Rete control：管理对象节点的键列表。
 * keys 是单一事实来源（与 node.data.keys 同步），端口由 setup.ts 派生。
 * change 回调在每次增删/改名时触发，由调用方负责：更新 node.data + 同步端口 + 刷新视图。
 *
 * id 生成是 per-instance 的：从本节点已存在的键里取最大数字后缀 +1，
 * 因此保存→重载→新增键不会复用磁盘上已存在的 id（避免端口/键冲突）。
 */
export class KeyListControl extends ClassicPreset.Control {
  keys: KeyEntry[]
  private change: (keys: KeyEntry[]) => void
  private idCounter: number

  constructor(initial: KeyEntry[], change: (keys: KeyEntry[]) => void) {
    super()
    this.keys = initial
    this.change = change
    this.idCounter = nextKeyIdSeed(initial)
  }

  getValue(): KeyEntry[] {
    return this.keys
  }

  newKeyId(): string {
    this.idCounter += 1
    return `k${this.idCounter}`
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
    commit([...keys, { id: data.newKeyId(), name: '' }])
  }

  function renameKey(id: string, name: string): void {
    commit(keys.map((entry) => (entry.id === id ? { ...entry, name } : entry)))
  }

  function removeKey(id: string): void {
    commit(keys.filter((entry) => entry.id !== id))
  }

  return (
    <div
      className="script-key-list"
      data-testid="key-list"
      // 阻止 pointerdown 冒泡到 Rete 节点的拖拽处理器：否则点击按钮/输入框会
      // 触发节点拖动，浏览器因 down/up 目标不一致而不再合成 click 事件，
      // 导致按钮的 onClick 不触发（鼠标点不动）。输入框同理会被拖动抢走焦点。
      onPointerDown={(e) => e.stopPropagation()}
    >
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
