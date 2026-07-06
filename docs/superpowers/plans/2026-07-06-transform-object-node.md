# transform-object 节点（对象类）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为脚本编辑器新增 `transform-object` 节点，让用户可视化组装一个 JS 对象——键名由用户自定义（支持任意字符），值来自动态增减的输入 socket。

**Architecture:** `node.data.keys: KeyEntry[]`（`{id, name}`）是单一事实来源，JSON 原生持久化。每个 `KeyEntry` 派生一个 `dataSocket` 输入端口（端口 key = `key_<id>`，按稳定 id 而非位置，删除任意键不破坏其余连接）。节点归入 `transform` 类别（codegen catch-all）。自定义 `KeyListControl`（继承 `ClassicPreset.Control`）+ 自包含 React 组件，通过 `customize.control` 钩子渲染。

**Tech Stack:** TypeScript / React / Rete 2（`rete` + `rete-react-plugin` + `rete-area-plugin`）/ Vitest / Playwright Electron。

**Spec:** `docs/superpowers/specs/2026-07-06-transform-object-node-design.md`

---

## 文件结构

| 文件 | 责任 |
|---|---|
| `src/features/script-editor/nodes/definitions/transform.ts` | 新增 `'transform-object'` NodeDef |
| `src/features/script-editor/codegen/emit/transform.ts` | `expressionFor` 加 `case 'transform-object'` |
| `src/features/script-editor/rete/KeyListControl.tsx`（**新文件**） | `KeyListControl` control 类 + `<KeyListControlView>` React 组件 + `KeyEntry` 类型 |
| `src/features/script-editor/rete/setup.ts` | 派生重建端口、注册 customize.control、放行 controls 过滤、接线端口增删+刷新 |
| `src/features/script-editor/rete/types.ts` | `ScriptNode.controls` 接受 `KeyListControl`（如类型需要） |
| `src/features/script-editor/panelConfig.ts` | `createDefaultNodeData` / `migrateNodeData` / `validateNodeConfig` 三处 transform-object 分支 |
| `test/rete-codegen.test.ts` | 节点计数 50→51 + transform-object codegen 用例 |
| `test/rete-setup.test.ts` | nodeCount 50→51 |
| `e2e/script-editor-object-node.spec.ts`（**新文件**） | 增删键/改名/连接/保存重载 E2E |

---

## Task 1：定义 `transform-object` 节点 + 更新计数测试

**Files:**
- Modify: `src/features/script-editor/nodes/definitions/transform.ts`
- Modify: `test/rete-codegen.test.ts:38`
- Modify: `test/rete-setup.test.ts:31`

- [ ] **Step 1: 写失败测试（计数 51）**

修改 `test/rete-codegen.test.ts` line 38：

```ts
    expect(Object.keys(NODE_DEFINITIONS)).toHaveLength(51)
```

修改 `test/rete-setup.test.ts` line 31（`expect(runtime.nodeCount).toBe(50)`）：

```ts
    expect(runtime.nodeCount).toBe(51)
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- rete-codegen rete-setup`
Expected: 两个文件各 1 个计数断言失败（实际 50 ≠ 期望 51）。

- [ ] **Step 3: 实现 NodeDef**

在 `src/features/script-editor/nodes/definitions/transform.ts` 的 `Record<string, NodeDef>` map 末尾（最后一个条目后）加一条：

```ts
  'transform-object': b.def('transform-object', 'transform', '对象', [], [b.dataOut()], []),
```

（`b` 是文件顶部已 import 的 `nodeBuilders`。`dataOut()` 默认 key=`'out'`、label=`'输出'`。`controls: []`——key-list 控件运行时单独挂载，不进 NodeDef.controls。）

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- rete-codegen rete-setup`
Expected: PASS（计数现为 51）。

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add src/features/script-editor/nodes/definitions/transform.ts test/rete-codegen.test.ts test/rete-setup.test.ts
git commit -m "feat(script-editor): define transform-object node skeleton"
```

---

## Task 2：codegen 生成对象字面量（TDD）

**Files:**
- Modify: `src/features/script-editor/codegen/emit/transform.ts`（`expressionFor` switch）
- Test: `test/rete-codegen.test.ts`

codegen 读 `data(node).keys`（`KeyEntry[]`），对每个非空名键生成 `"<name>": <value>`，无连接端口落 `null`。本任务**先 TDD 写测试**，KeyEntry 类型在本任务里先在测试里内联定义，Task 3 再迁到 KeyListControl.tsx 统一导出。

- [ ] **Step 1: 写失败测试**

在 `test/rete-codegen.test.ts` 的 `describe('Rete script editor codegen', ...)` 块内（找一个现有 codegen 用例后）追加：

```ts
  it('generates object literal from transform-object keys', () => {
    const nodes = [
      { id: 'src1', key: 'input-manual', data: { content: 'a', mode: 'text' } },
      { id: 'src2', key: 'input-manual', data: { content: 'b', mode: 'text' } },
      {
        id: 'obj',
        key: 'transform-object',
        data: {
          keys: [
            { id: 'k1', name: 'temperature' },
            { id: 'k2', name: '湿度' }
          ]
        }
      }
    ]
    const connections = [
      { source: 'src1', sourceOutput: 'out', target: 'obj', targetInput: 'key_k1' },
      { source: 'src2', sourceOutput: 'out', target: 'obj', targetInput: 'key_k2' }
    ]
    const code = generateCodeFromRete(graph(nodes, connections))
    expect(code).toContain('"temperature": _out_src1')
    expect(code).toContain('"湿度": _out_src2')
  })

  it('skips empty-named keys in transform-object', () => {
    const nodes = [
      { id: 'src1', key: 'input-manual', data: { content: 'a', mode: 'text' } },
      {
        id: 'obj',
        key: 'transform-object',
        data: { keys: [{ id: 'k1', name: '' }, { id: 'k2', name: 'ok' }] }
      }
    ]
    const connections = [
      { source: 'src1', sourceOutput: 'out', target: 'obj', targetInput: 'key_k1' },
      { source: 'src1', sourceOutput: 'out', target: 'obj', targetInput: 'key_k2' }
    ]
    const code = generateCodeFromRete(graph(nodes, connections))
    expect(code).toContain('"ok": _out_src1')
    expect(code).not.toContain('"": ')
  })

  it('uses null for unconnected transform-object ports', () => {
    const nodes = [
      {
        id: 'obj',
        key: 'transform-object',
        data: { keys: [{ id: 'k1', name: 'x' }] }
      }
    ]
    const code = generateCodeFromRete(graph(nodes, []))
    expect(code).toContain('"x": null')
  })

  it('generates empty object when transform-object has no keys', () => {
    const nodes = [{ id: 'obj', key: 'transform-object', data: { keys: [] } }]
    const code = generateCodeFromRete(graph(nodes, []))
    expect(code).toContain('var _out_obj = { };')
  })
```

> 注：`input-manual` 节点 codegen 会产出 `_out_src1` 变量（outVar 命名规则 `_out_<id>`）。断言里 `_out_src1` / `_out_src2` / `_out_obj` 来自这套命名。若 typecheck/codegen 报变量名不符，先跑一次看实际名再校正断言——但保持 Task 1 已通过的计数测试不变。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- rete-codegen`
Expected: 4 个新用例 FAIL（`transform-object` 走 `default` 分支返回 `input`，对象字面量未生成）。

- [ ] **Step 3: 实现 codegen**

在 `src/features/script-editor/codegen/emit/transform.ts` 的 `expressionFor` 函数 switch 内（`default:` 之前）加一个 case：

```ts
    case 'transform-object': {
      const rawKeys = config.keys
      const keys = Array.isArray(rawKeys) ? (rawKeys as Array<{ id: string; name: string }>) : []
      const pairs = keys
        .map((entry) => {
          const trimmed = String(entry?.name ?? '').trim()
          if (!trimmed) return null
          const val = getInputVar(ctx, node, `key_${entry.id}`, 'null')
          return `${jsString(trimmed)}: ${val}`
        })
        .filter((p): p is string => p !== null)
      return `{ ${pairs.join(', ')} }`
    }
```

（`config`、`getInputVar`、`jsString` 已在文件顶部 import / `expressionFor` 顶部取。无键时返回 `{ }`。空名键跳过。无连接端口 `getInputVar` fallback 为 `'null'`。）

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- rete-codegen`
Expected: 4 个新用例 PASS，原有用例不受影响。

> 若某个用例因 `_out_<id>` 命名不符而失败，读实际 codegen 输出调整断言里的变量名。这是预期的校准，不算破坏。

- [ ] **Step 5: Commit**

```bash
git add src/features/script-editor/codegen/emit/transform.ts test/rete-codegen.test.ts
git commit -m "feat(script-editor): codegen for transform-object node"
```

---

## Task 3：`KeyListControl` control 类 + React 组件

**Files:**
- Create: `src/features/script-editor/rete/KeyListControl.tsx`

定义 `KeyEntry` 类型、`KeyListControl`（继承 `ClassicPreset.Control`）和自包含 React 组件 `<KeyListControlView>`。组件接收 control 实例作为 `data` prop（Rete 渲染约定），内部 `useState` 管本地视图，按钮点击本地更新 + 通过 control 回写。

- [ ] **Step 1: 创建文件**

创建 `src/features/script-editor/rete/KeyListControl.tsx`：

```tsx
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
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 无错误（新文件仅定义类型/组件，尚未被引用）。

- [ ] **Step 3: Commit**

```bash
git add src/features/script-editor/rete/KeyListControl.tsx
git commit -m "feat(script-editor): add KeyListControl + KeyListControlView"
```

---

## Task 4：接线 setup.ts——派生端口、customize.control、增删+刷新

**Files:**
- Modify: `src/features/script-editor/rete/setup.ts`

本任务把 `transform-object` 接入 Rete 运行时：(1) 创建/加载节点时按 `node.data.keys` 派生输入端口并挂载 `KeyListControl`；(2) 注册 `customize.control` 渲染组件；(3) 控件回写时同步端口 + 调 `area.update('node', id)` 轻量刷新 + 重算高度。

`createClassicNodeFromDefinition` 现在不知道 `transform-object` 的动态端口/控件，需要通过新函数 `syncObjectNodePorts`（端口增删）+ 在 `createClassicNodeFromGraphNode`（加载路径）和 `syncReteEditorFromGraph`（建节点路径）里分别接线控件挂载来处理。

- [ ] **Step 1: 给 setup.ts 加 import 与派生函数**

在 `src/features/script-editor/rete/setup.ts` 顶部 import 区（line 1-23 附近）加：

```ts
import { KeyListControl, type KeyEntry } from '@/features/script-editor/rete/KeyListControl'
```

在 `calculateNodeHeight` 函数（约 line 330）下方新增两个辅助函数：

```ts
const OBJECT_NODE_KEY = 'transform-object'

function objectNodeKeys(data: Record<string, unknown> | undefined): KeyEntry[] {
  const raw = data?.keys
  return Array.isArray(raw)
    ? (raw as unknown[]).map((entry) => ({
        id: String((entry as KeyEntry)?.id ?? ''),
        name: String((entry as KeyEntry)?.name ?? '')
      })).filter((entry) => entry.id)
    : []
}

function objectNodeHeight(keyCount: number): number {
  const ports = Math.max(keyCount, 1) // 至少预留 1 个 out 输出端口的高度
  return Math.max(86, 58 + ports * 28 + 24) // 28/port + 24/key-list 控件区
}
```

- [ ] **Step 2: 新增端口同步辅助函数**

紧接上一步新增的辅助函数后，加 `syncObjectNodePorts`（只管端口增删，不管控件，可安全重复调用）：

```ts
/**
 * 同步 transform-object 节点的输入端口，使其与 keys 列表一致。
 * 可安全重复调用：补齐缺失端口、移除多余端口，不触碰控件。
 */
function syncObjectNodePorts(node: ScriptNode, keys: KeyEntry[]): void {
  const desired = new Set(keys.map((entry) => `key_${entry.id}`))
  Object.keys(node.inputs).forEach((portKey) => {
    if (portKey.startsWith('key_') && !desired.has(portKey)) {
      node.removeInput(portKey as keyof ScriptNode['inputs'])
    }
  })
  keys.forEach((entry) => {
    const portKey = `key_${entry.id}`
    if (!node.hasInput(portKey)) {
      node.addInput(
        portKey,
        new ClassicPreset.Input(socketInstances.dataSocket, entry.name || `key_${entry.id}`, false)
      )
    }
  })
}
```

- [ ] **Step 3: 在 `createClassicNodeFromGraphNode` 派生端口 + 挂载控件（创建期，无刷新）**

修改 `createClassicNodeFromGraphNode`（约 line 130-148），在函数末尾 `return node` 前插入：

```ts
  if (graphNode.key === OBJECT_NODE_KEY) {
    const keys = objectNodeKeys(graphNode.data as Record<string, unknown> | undefined)
    syncObjectNodePorts(node, keys)
    // 创建期挂一个占位控件，运行期会在 syncReteEditorFromGraph 里被替换为带刷新的版本
    if (!node.controls['keys']) {
      node.addControl('keys', new KeyListControl(keys, () => {}))
    }
    node.height = objectNodeHeight(keys.length)
  }

  return node
```

> 注：创建期不需要刷新视图（节点尚未挂载到 area），所以这里挂的 onChange 是空函数。运行期的端口同步+刷新在 Step 5 的 `syncReteEditorFromGraph` 里替换成带刷新的版本。

- [ ] **Step 4: 注册 `customize.control`**

修改 `createReteEditor` 里 `render.addPreset(ReactPresets.classic.setup(...))`（约 line 236-240），把 `customize` 改为：

```ts
  render.addPreset(ReactPresets.classic.setup({
    customize: {
      node: () => ScriptClassicNode,
      control: (context) => {
        if (context.data.payload instanceof KeyListControl) {
          return KeyListControlView as unknown as ComponentType<RefControlProps>
        }
        return undefined
      }
    }
  }))
```

并在顶部 import 区加：

```ts
import { KeyListControl, KeyListControlView, type KeyEntry } from '@/features/script-editor/rete/KeyListControl'
```

（合并 Step 1 的 import，避免重复——最终顶部只写一行 import，包含 `KeyListControl`、`KeyListControlView`、`KeyEntry`。）

- [ ] **Step 5: 放行 ScriptClassicNode 的 controls 过滤 + 在 `syncReteEditorFromGraph` 接线端口同步/刷新**

修改 `ScriptClassicNode`（约 line 358）的 controls 过滤行，让 `transform-object` 的 `keys` control 通过：

```ts
  const controls = sortEntries(data.controls).filter(([key]) => {
    if (key === 'keys' && data.key === OBJECT_NODE_KEY) return true
    return controlSpecs.get(key)?.type !== 'select'
  })
```

修改 `syncReteEditorFromGraph`（约 line 165-186）的节点创建循环，让 `transform-object` 在运行时获得带端口同步+刷新的 onChange。把该函数内创建节点后的 onDataChange 赋值替换为：

```ts
  for (const graphNode of graph.nodes) {
    const node = createClassicNodeFromGraphNode(graphNode)
    node.onDataChange = (key, value) => {
      node.data = { ...(node.data || {}), [key]: value }
      instance.options.onGraphChange?.({ type: 'node-data', id: node.id, key, value })
    }

    // transform-object：用带端口同步+视图刷新的 onChange 重挂 key-list 控件
    if (node.key === OBJECT_NODE_KEY) {
      const initialKeys = objectNodeKeys(graphNode.data as Record<string, unknown> | undefined)
      if (node.controls['keys']) node.removeControl('keys')
      const handleKeysChange = (next: KeyEntry[]): void => {
        // 1) 更新内存 data
        node.data = { ...(node.data || {}), keys: next }
        // 2) 同步端口（传入空 onChange 避免递归）
        syncObjectNodePorts(node, next)
        // 3) 重算高度
        node.height = objectNodeHeight(next.length)
        // 4) 轻量刷新节点视图（addInput 不发信号，需手动）
        void instance.area.update('node', String(node.id))
        // 5) 通知上层持久化
        instance.options.onGraphChange?.({ type: 'node-data', id: node.id, key: 'keys', value: next })
      }
      node.addControl('keys', new KeyListControl(initialKeys, handleKeysChange))
      syncObjectNodePorts(node, initialKeys)
      node.height = objectNodeHeight(initialKeys.length)
    }

    nodeMap.set(node.id, node)
    await instance.editor.addNode(node)
    await instance.area.translate(node.id, graphNode.position)
  }
```

> 说明：Step 3 创建期挂的 onChange 是空函数（节点未挂载、无需刷新），运行期这里先 `removeControl('keys')` 再重挂成带端口同步+视图刷新的版本。`syncObjectNodePorts` 可安全重复调用（仅做 diff 增删）。`area.update('node', id)` 是 rete-area-plugin 提供的轻量刷新 API（比节点重建影响小）。

- [ ] **Step 6: typecheck**

Run: `npm run typecheck`
Expected: 无错误。若 `area.update` 的类型签名要求 `GetRenderTypes<Area2D<Schemes>>` 字面量，用 `instance.area.update('node' as never, String(node.id))` 或查 rete-area-plugin 类型后调整——优先按实际类型签名写。

- [ ] **Step 7: 跑现有单元测试确保未回归**

Run: `npm test -- rete-setup rete-codegen`
Expected: PASS（计数 51 + codegen 用例）。

- [ ] **Step 8: Commit**

```bash
git add src/features/script-editor/rete/setup.ts
git commit -m "feat(script-editor): wire transform-object dynamic ports + key-list control"
```

---

## Task 5：panelConfig 默认值 / 迁移 / 校验

**Files:**
- Modify: `src/features/script-editor/panelConfig.ts`

`transform-object` 必须有自己的分支，**不能走默认 configRef 分支**（默认分支会给节点塞 `configRef`，但对象节点不需要 configRef）。

- [ ] **Step 1: 写失败测试**

新建 `test/panel-config-object.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { createDefaultNodeData, migrateNodeData, validateNodeConfig } from '../src/features/script-editor/panelConfig'

describe('transform-object panelConfig', () => {
  it('createDefaultNodeData returns empty keys array', () => {
    expect(createDefaultNodeData('transform-object')).toEqual({ keys: [] })
  })

  it('migrateNodeData preserves existing keys', () => {
    const data = { keys: [{ id: 'k1', name: 'temp' }] }
    expect(migrateNodeData('transform-object', data)).toEqual({ keys: [{ id: 'k1', name: 'temp' }] })
  })

  it('migrateNodeData coerces missing/invalid keys to empty array', () => {
    expect(migrateNodeData('transform-object', {})).toEqual({ keys: [] })
    expect(migrateNodeData('transform-object', { keys: 'not-an-array' })).toEqual({ keys: [] })
  })

  it('validateNodeConfig never blocks (empty/duplicate keys are valid JS)', () => {
    expect(validateNodeConfig('transform-object', { keys: [] })).toEqual([])
    expect(validateNodeConfig('transform-object', { keys: [{ id: 'k1', name: 'x' }, { id: 'k2', name: 'x' }] })).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- panel-config-object`
Expected: FAIL（`createDefaultNodeData('transform-object')` 走默认分支返回带 configRef 的对象，不等于 `{ keys: [] }`）。

- [ ] **Step 3: 实现三处分支**

在 `src/features/script-editor/panelConfig.ts`：

(a) `createDefaultNodeData`（约 line 112-131），在 `if (nodeKey === 'input-manual')` 之前加：

```ts
  if (nodeKey === 'transform-object') return { keys: [] }
```

(b) `migrateNodeData`（约 line 133-174），在函数最开头（`if (isSerialNode(nodeKey))` 之前）加：

```ts
  if (nodeKey === 'transform-object') {
    return { keys: Array.isArray(data.keys) ? data.keys : [] }
  }
```

(c) `validateNodeConfig`（约 line 247-275），在 `switch (nodeKey)` 内 `default` 之前加：

```ts
    case 'transform-object':
      return []
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- panel-config-object`
Expected: PASS。

- [ ] **Step 5: 全量测试 + typecheck**

Run: `npm test && npm run typecheck`
Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
git add src/features/script-editor/panelConfig.ts test/panel-config-object.test.ts
git commit -m "feat(script-editor): panelConfig defaults/migration/validation for transform-object"
```

---

## Task 6：CSS 样式（key-list 控件外观）

**Files:**
- Modify: `src/features/script-editor/script-editor.css`

为 `.script-key-list` 系列类加基础样式，让 repeater 在节点 body 里整齐排列。

- [ ] **Step 1: 追加样式**

在 `src/features/script-editor/script-editor.css` 末尾追加：

```css
.script-key-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
}
.script-key-list__row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.script-key-list__input {
  flex: 1;
  min-width: 0;
  padding: 2px 6px;
  font-size: 12px;
  border: 1px solid var(--border, #d0d5dd);
  border-radius: 4px;
  background: var(--background, #fff);
}
.script-key-list__remove {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--muted-foreground, #888);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.script-key-list__remove:hover {
  color: var(--destructive, #e11d48);
}
.script-key-list__add {
  align-self: flex-start;
  padding: 2px 10px;
  font-size: 12px;
  border: 1px dashed var(--border, #d0d5dd);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}
.script-key-list__add:hover {
  background: var(--muted, #f5f5f5);
}
```

- [ ] **Step 2: typecheck（CSS 不参与，但确保未误改 TS）**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add src/features/script-editor/script-editor.css
git commit -m "style(script-editor): key-list control styles"
```

---

## Task 7：E2E 测试（Playwright Electron）

**Files:**
- Create: `e2e/script-editor-object-node.spec.ts`

覆盖：打开脚本编辑器 → 添加对象节点 → 增删键 → 改名 → 连接上游 → 保存重载后键/端口/连接保留。**遵循 AGENTS.md：UI 特性必须有 E2E 覆盖，这是硬性门禁。**

- [ ] **Step 1: 先看 fixtures 约定**

Run: `cat e2e/fixtures.ts | head -60`
确认 `launchApp`、`userData`、多窗口 helper 的导出名。若 fixture 名不同，按实际调整 Step 2 的 import。

- [ ] **Step 2: 写 E2E spec**

创建 `e2e/script-editor-object-node.spec.ts`：

```ts
import { expect, test } from '@playwright/test'
import { launchApp } from './fixtures'

test.describe('transform-object node', () => {
  test('add keys, rename, remove, persist across reload', async () => {
    const { window, cleanup } = await launchApp()

    // 打开脚本编辑器（根据实际入口：点击导航按钮或快捷键）
    // 若入口选择器不同，按现有 e2e/script-editor.spec.ts 的方式打开
    await window.getByRole('button', { name: /脚本/ }).click()
    await expect(window.getByText('节点')).toBeVisible()

    // 从面板添加对象节点（拖拽或点击）
    await window.getByText('对象').click()

    // 节点出现在画布
    const node = window.locator('[data-node-key="transform-object"]').first()
    await expect(node).toBeVisible()

    // 添加两个键
    await node.getByTestId('key-add').click()
    await node.getByTestId('key-add').click()
    await expect(node.locator('.script-key-list__row')).toHaveCount(2)

    // 改名
    const firstInput = node.locator('.script-key-list__input').first()
    await firstInput.fill('temperature')
    const secondInput = node.locator('.script-key-list__input').nth(1)
    await secondInput.fill('湿度')

    // 删除第一个键
    const firstRemove = node.getByTestId(/key-remove-/).first()
    await firstRemove.click()
    await expect(node.locator('.script-key-list__row')).toHaveCount(1)

    // 保存脚本（根据实际保存 UI）
    await window.getByRole('button', { name: /保存/ }).click()

    // 重载窗口
    await window.reload()
    await window.getByRole('button', { name: /脚本/ }).click()

    // 键保留
    const reloadedNode = window.locator('[data-node-key="transform-object"]').first()
    await expect(reloadedNode.locator('.script-key-list__input').first()).toHaveValue('湿度')

    await cleanup()
  })
})
```

> **重要**：选择器（入口按钮文案、保存按钮、拖拽方式）需对照现有 `e2e/script-editor.spec.ts` 的实际做法校准。若现有 spec 用的是不同的打开方式（如快捷键、data-testid），按现有约定改写。若某些选择器不稳定，给对应组件加 `data-testid`。

- [ ] **Step 3: 构建 + 跑 E2E**

Run: `npm run test:e2e:build`
Expected: 所有 spec（含新 spec）PASS。

> 若新 spec 因选择器/入口不符失败：读失败截图+现有 `e2e/script-editor.spec.ts` 的打开方式，校正选择器后重跑。**这是必做门禁，不许跳过或标 xfail。** 若发现需要给某组件加 data-testid，加完后再跑。

- [ ] **Step 4: Commit**

```bash
git add e2e/script-editor-object-node.spec.ts
git commit -m "test(script-editor): e2e for transform-object node lifecycle"
```

---

## Task 8：全量验证 + 收尾

- [ ] **Step 1: 全量单元测试**

Run: `npm test`
Expected: 全绿。

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 3: typecheck e2e**

Run: `npm run typecheck:e2e`
Expected: 无错误。

- [ ] **Step 4: 全量 E2E**

Run: `npm run test:e2e:build`
Expected: 所有 spec PASS。如实报告输出。

- [ ] **Step 5: 手动验证清单（在 PR 描述里记录）**

启动 `npm run dev`，手动验证：
- [ ] 从节点面板拖入"对象"节点，节点出现在画布。
- [ ] 点"+ 添加键"两次，两个输入端口 + 两个名称框出现，节点长高。
- [ ] 名称框输入中文/空格（如"温度 值"），连接上游节点，codegen 预览显示 `{ "温度 值": _out_x }`。
- [ ] 删除中间一个键，其余键端口与连接保留。
- [ ] 保存脚本、关闭重开，键/端口/连接/名称全部保留。

---

## 风险与回退

1. **`area.update('node', id)` 类型签名**：若 TS 报类型不符，按 `rete-area-plugin/_types/index.d.ts:69` 的实际签名调整（可能是泛型字面量）。这是 Task 4 最可能卡住的点。
2. **Rete `addInput` 后 socket 不渲染**：`area.update` 应能触发重渲染；若实测 socket 圆点仍不出现，回退方案是移除节点 + 按相同 id/位置重建（在 setup.ts 加一个 `recreateNode` helper）。Task 4 Step 7 跑现有测试若发现回归，先定位是刷新问题还是端口同步问题。
3. **删除端口悬空连接**：`node.removeInput` 不自动清连接。若 E2E/手动验证发现悬空连接报错，在 `syncObjectNodePorts` 删除端口前遍历 `editor.getConnections()` 调 `editor.removeConnection`。在 Task 4 的运行时 `handleKeysChange` 里补（需要 `instance.editor` 引用——在 `syncReteEditorFromGraph` 的 onChange 闭包里可直接拿到 `instance.editor`）。
4. **E2E 选择器**：Task 7 的选择器是占位猜测，必须对照 `e2e/fixtures.ts` 和 `e2e/script-editor.spec.ts` 校准后再跑。这是 AGENTS.md 硬性门禁，失败必须修到通过。
