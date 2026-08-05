# 节点名称编辑、备注与 Ctrl+F 搜索定位 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户在 NodeConfigPanel 中编辑节点名称、添加备注，并通过 Ctrl/Cmd+F 按名称或备注搜索节点并居中定位。

**Architecture:** 节点名称（`label`）是 `GraphEditorNode` 的顶层字段，新增 `updateGraphNodeLabel` 更新器镜像 `updateGraphNodePosition` 的简单形态。备注存入 `node.data.note`，自动随持久化和迁移存活。搜索是渲染层只读图数据；定位通过新增 `GraphCanvasHandle.focusNode(id)` 复用已有的 `applyFitTransform` 视口控制。

**Tech Stack:** TypeScript, React, Rete, Vitest, Playwright Electron.

## Global Constraints

- 节点名称编辑写入 `node.label`（`GraphEditorState` 的顶层字段），不写入 `node.data`；通过 `onGraphChange` transient 流入历史，与现有控件编辑一致。
- 备注写入 `node.data.note`；它不是节点类型参数，不加入 `ControlSpec`，是通用字段。
- 搜索/定位/选中/相机均为瞬态，不进入 `GraphEditorState`、不影响代码生成或执行。
- `Ctrl/Cmd+F` 必须在画布有焦点时打开搜索；当焦点在 `INPUT`/`TEXTAREA` 时不劫持原生查找。
- label 编辑后必须强制画布节点重渲染（`area.update('node', id)` 或 `graphRevision` bump），因为画布标题从 `data.label` 渲染且无实时数据同步路径。
- `migrateNodeData` 各分支通过 `...data` 展开自动保留 `note`；serial 迁移路径最激进，需显式测试。
- 遵守 `CONV-GRAPH-CANONICAL-STATE`：React 图状态为权威源，Rete 仅为物化视图。
- 运行 `npm test`、`npm run typecheck`、`npm run test:e2e:build` 后才算完成。

---

## File Structure

- Modify: `src/features/script-editor/rete/graphState.ts` — 新增 `updateGraphNodeLabel`；确保 `exportGraphState` 已序列化 label（已有）。
- Modify: `src/features/script-editor/panelConfig.ts` — `migrateNodeData` 显式保留 `note`；`createDefaultNodeData` 可选初始化 `note: ''`。
- Modify: `src/features/script-editor/components/NodeConfigPanel.tsx` — header 的 label 从纯文本改为 Input；新增备注 Textarea；新增 `onLabelChange`/`onNoteChange` 回调。
- Modify: `src/features/script-editor/ScriptEditorDialog.tsx` — Ctrl/Cmd+F 快捷键处理；搜索状态；`focusNode` 调用；新增 `<NodeSearchBox>` 组件渲染。
- Create: `src/features/script-editor/components/NodeSearchBox.tsx` — 搜索输入框 + 结果列表组件。
- Modify: `src/features/script-editor/components/GraphCanvas.tsx` — `GraphCanvasHandle` 新增 `focusNode(id)`；useImperativeHandle 导出。
- Modify: `src/features/script-editor/script-editor.css` — 搜索框、label 输入、备注输入的样式。
- Test: `test/script-editor-graph-state.test.ts` — `updateGraphNodeLabel` 单元测试。
- Test: `test/script-editor-migrate-note.test.ts` — 备注跨迁移保留测试。
- Test: `test/node-config-panel.test.ts` — 扩展，覆盖 label/备注编辑。
- Modify: `e2e/script-editor-node-notes.spec.ts` — 新增 E2E：编辑名称、编辑备注、Ctrl+F 搜索定位。

## Shared interfaces

```ts
// graphState.ts
export function updateGraphNodeLabel(
  state: GraphEditorState,
  nodeId: string,
  label: string
): GraphEditorState

// GraphCanvas.tsx
export interface GraphCanvasHandle {
  fitView(): void
  arrangeLayout(): void
  getZoomMin(): number
  focusNode(nodeId: string): void  // 新增
}

// NodeConfigPanel.tsx — 新增 props
interface NodeConfigPanelProps {
  // ...existing props...
  onLabelChange: (nodeId: string, label: string) => void
  onNoteChange: (nodeId: string, note: string) => void
}
```

### Task 1: 实现 `updateGraphNodeLabel` 并测试

**Files:**
- Modify: `src/features/script-editor/rete/graphState.ts:169` 附近（`updateGraphNodePosition` 之后）
- Test: `test/script-editor-graph-state.test.ts`

**Interfaces:**
- Produces: `updateGraphNodeLabel(state, nodeId, label): GraphEditorState`
- Consumes: `GraphEditorState`, `GraphEditorNode`

- [ ] **Step 1: Write the failing test**

在 `test/script-editor-graph-state.test.ts` 末尾添加：

```ts
import { updateGraphNodeLabel } from '../src/features/script-editor/rete/graphState'

describe('updateGraphNodeLabel', () => {
  it('updates the label of the specified node', () => {
    const graph = createTestGraphWithNode('input-manual', '串口输入')
    const updated = updateGraphNodeLabel(graph, graph.nodes[0].id, '我的数据源')
    expect(updated.nodes[0].label).toBe('我的数据源')
  })

  it('preserves all other nodes and connections unchanged', () => {
    const graph = createTestGraphWithTwoNodes()
    const originalSecond = graph.nodes[1]
    const updated = updateGraphNodeLabel(graph, graph.nodes[0].id, '改名')
    expect(updated.nodes[1]).toEqual(originalSecond)
    expect(updated.connections).toEqual(graph.connections)
  })

  it('trims whitespace and rejects empty label by keeping the previous label', () => {
    const graph = createTestGraphWithNode('input-manual', '串口输入')
    const updated = updateGraphNodeLabel(graph, graph.nodes[0].id, '   ')
    expect(updated.nodes[0].label).toBe('串口输入')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/script-editor-graph-state.test.ts`
Expected: FAIL — `updateGraphNodeLabel` is not exported.

- [ ] **Step 3: Implement `updateGraphNodeLabel`**

在 `graphState.ts` 中 `updateGraphNodePosition` 之后添加：

```ts
export function updateGraphNodeLabel(
  state: GraphEditorState,
  nodeId: string,
  label: string
): GraphEditorState {
  const trimmed = label.trim()
  return {
    ...state,
    nodes: state.nodes.map((node) =>
      node.id === nodeId && trimmed.length > 0
        ? { ...node, label: trimmed }
        : node
    )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/script-editor-graph-state.test.ts`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/script-editor/rete/graphState.ts test/script-editor-graph-state.test.ts
git commit -m "feat(script-editor): add updateGraphNodeLabel for node name editing"
```

### Task 2: 确保 `node.data.note` 跨迁移保留并测试

**Files:**
- Modify: `src/features/script-editor/panelConfig.ts:136-194`（`migrateNodeData`）
- Test: `test/script-editor-migrate-note.test.ts`（新建）

**Interfaces:**
- Produces: `migrateNodeData` preserves `note` across all node-type migrations.
- Consumes: `migrateNodeData`, `createDefaultNodeData`

- [ ] **Step 1: Write the failing test**

创建 `test/script-editor-migrate-note.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { migrateNodeData } from '../src/features/script-editor/panelConfig'

describe('migrateNodeData preserves note', () => {
  it('preserves note for transform-object node', () => {
    const data = { note: '提取年份', fields: [{ key: 'year', path: 'year' }] }
    const result = migrateNodeData('transform-object', data)
    expect(result.note).toBe('提取年份')
  })

  it('preserves note for protocol-bitfield node', () => {
    const data = { note: '协议位域', fields: [{ key: 'flag', bits: 1 }] }
    const result = migrateNodeData('protocol-bitfield', data)
    expect(result.note).toBe('协议位域')
  })

  it('preserves note for input-serial node', () => {
    const data = { note: '主串口', configRef: 'panel-1', portPath: 'COM1' }
    const result = migrateNodeData('input-serial', data)
    expect(result.note).toBe('主串口')
  })

  it('preserves note for a generic node with no special migration', () => {
    const data = { note: '通用备注', value: '42' }
    const result = migrateNodeData('compare-equal', data)
    expect(result.note).toBe('通用备注')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/script-editor-migrate-note.test.ts`
Expected: FAIL — either because `note` is dropped by a migration branch, or because the test imports are wrong. Investigate which branches drop it.

- [ ] **Step 3: Ensure note survives in every migration branch**

检查 `panelConfig.ts` 的 `migrateNodeData`。当前每个分支都以 `{ ...data, ... }` 返回，`note` 理论上会存活。但 `transform-object` 和 `protocol-bitfield` 分支重建了 data 对象，可能只挑选了已知键。如果测试失败，在对应分支显式携带 `note`：

```ts
// 在每个重建 data 对象的分支，确保展开原始 data 的 note
const note = typeof data.note === 'string' ? data.note : data.note
return { ...reconstructedData, ...(note !== undefined ? { note } : {}) }
```

如果测试已经通过（`...data` 已保留），则无需修改，直接在 Step 4 确认。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/script-editor-migrate-note.test.ts`
Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/script-editor/panelConfig.ts test/script-editor-migrate-note.test.ts
git commit -m "feat(script-editor): preserve node note across data migrations"
```

### Task 3: NodeConfigPanel 支持名称编辑和备注输入

**Files:**
- Modify: `src/features/script-editor/components/NodeConfigPanel.tsx:76-113`
- Test: `test/node-config-panel.test.ts`

**Interfaces:**
- Consumes: `updateGraphNodeLabel` from Task 1; `updateGraphNodeData` (existing) for note.
- Produces: NodeConfigPanel renders label Input and note Textarea; calls `onLabelChange`/`onNoteChange`.

- [ ] **Step 1: Write the failing test**

在 `test/node-config-panel.test.ts` 中添加测试，渲染 NodeConfigPanel 时验证：
- label 区域是一个可编辑 Input（不是纯文本），初始值等于 `selectedNode.label`
- 存在一个备注 Textarea，初始值等于 `selectedNode.data.note`
- 修改 label Input 触发 `onLabelChange` 回调
- 修改备注 Textarea 触发 `onNoteChange` 回调

```ts
it('renders an editable label input initialized from the node label', async () => {
  const graph = makeGraphWithSelectedNode('n1', '串口输入', { note: '入口节点' })
  const { onLabelChange, onNoteChange } = makeCallbacks()
  renderPanel(graph, 'n1', { onLabelChange, onNoteChange })

  const labelInput = screen.getByDisplayValue('串口输入')
  expect(labelInput.tagName).toBe('INPUT')

  await user.type(labelInput, 'X')
  expect(onLabelChange).toHaveBeenCalledWith('n1', '串口输入X')
})

it('renders a note textarea initialized from node data note', async () => {
  const graph = makeGraphWithSelectedNode('n1', '串口输入', { note: '入口节点' })
  const { onNoteChange } = makeCallbacks()
  renderPanel(graph, 'n1', { onNoteChange })

  const noteArea = screen.getByDisplayValue('入口节点')
  expect(noteArea.tagName).toBe('TEXTAREA')

  await user.type(noteArea, '!')
  expect(onNoteChange).toHaveBeenCalledWith('n1', '入口节点!')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/node-config-panel.test.ts`
Expected: FAIL — label renders as text, not Input; no note Textarea exists.

- [ ] **Step 3: Modify NodeConfigPanel**

在 `NodeConfigPanel.tsx` 中：

1. 新增 props `onLabelChange` 和 `onNoteChange` 到 `NodeConfigPanelProps`。
2. 在 header 区域（第 79-82 行），将 `{selectedNode.label}` 替换为：

```tsx
<Input
  className="script-editor-inspector__title-input"
  value={selectedNode.label}
  onChange={(e) => onLabelChange(selectedNode.id, e.target.value)}
  aria-label="节点名称"
/>
```

3. 在坐标行之后、`<Separator />` 之前，新增备注区域：

```tsx
<div className="script-editor-inspector__note-field">
  <Label>备注</Label>
  <textarea
    className="script-editor-inspector__note-input"
    value={(selectedNode.data.note as string) || ''}
    onChange={(e) => onNoteChange(selectedNode.id, e.target.value)}
    placeholder="为这个节点添加说明…"
    aria-label="节点备注"
    rows={2}
  />
</div>
```

4. 在 `ScriptEditorDialog.tsx` 中，为 `<NodeConfigPanel>` 新增回调：

```tsx
onLabelChange={(nodeId, label) => onGraphChange(updateGraphNodeLabel(graph, nodeId, label))}
onNoteChange={(nodeId, note) => onGraphChange(updateGraphNodeData(graph, nodeId, 'note', note))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/node-config-panel.test.ts`
Expected: PASS — label Input 和 note Textarea 均可编辑并触发回调。

- [ ] **Step 5: Add CSS**

在 `script-editor.css` 中添加：

```css
.script-editor-inspector__title-input {
  width: 100%;
  font-size: 14px;
  font-weight: 700;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 2px 4px;
  background: transparent;
  color: var(--foreground);
}
.script-editor-inspector__title-input:focus {
  outline: none;
  border-color: var(--primary);
  background: var(--background);
}
.script-editor-inspector__note-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 8px 0;
}
.script-editor-inspector__note-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  color: var(--foreground);
  background: var(--background);
  resize: vertical;
  min-height: 40px;
}
.script-editor-inspector__note-input:focus {
  outline: none;
  border-color: var(--primary);
}
```

- [ ] **Step 6: Run focused checks**

Run: `npm test -- test/node-config-panel.test.ts && npm run typecheck`
Expected: tests pass, typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/features/script-editor/components/NodeConfigPanel.tsx \
        src/features/script-editor/ScriptEditorDialog.tsx \
        src/features/script-editor/script-editor.css \
        test/node-config-panel.test.ts
git commit -m "feat(script-editor): editable node label and note in NodeConfigPanel"
```

### Task 4: label 编辑后强制画布节点重渲染

**Files:**
- Modify: `src/features/script-editor/components/GraphCanvas.tsx`（选择→DOM effect 附近）

**Interfaces:**
- Consumes: `graphRevision` bump 机制（`ScriptEditorDialog.tsx:329-332`）或 `area.update('node', id)`。
- Produces: 画布节点标题在 label 编辑后即时更新。

- [ ] **Step 1: Verify the problem**

手动测试或确认：编辑 label 后，NodeConfigPanel 内 Input 更新了，但画布上节点标题（`.script-rete-node__name`）是否也更新？如果没有，说明需要强制重渲染。

- [ ] **Step 2: Implement forced re-render on label change**

在 `ScriptEditorDialog.tsx` 的 `onLabelChange` 回调中，在调用 `onGraphChange` 后，通过 `graphCanvasRef` 或 `graphRevision` bump 触发结构同步：

```ts
const onLabelChange = useCallback((nodeId: string, label: string) => {
  onGraphChange(updateGraphNodeLabel(graph, nodeId, label))
  // Force canvas node re-render because the node title reads from data.label
  setGraphRevision((r) => r + 1)
}, [graph, onGraphChange])
```

如果 `graphRevision` bump 会触发完整结构同步（`{kind:'structure'}`），开销较大。更轻量的替代是在 GraphCanvas 内监听 label 变化后调用 `instance.area.update('node', id)`。选择更轻量的方案。

- [ ] **Step 3: Verify canvas updates**

手动验证：编辑 label → 画布节点标题同步更新。

- [ ] **Step 4: Commit**

```bash
git add src/features/script-editor/ScriptEditorDialog.tsx src/features/script-editor/components/GraphCanvas.tsx
git commit -m "fix(script-editor): force canvas node re-render on label change"
```

### Task 5: 实现 `GraphCanvasHandle.focusNode` 并测试

**Files:**
- Modify: `src/features/script-editor/components/GraphCanvas.tsx:47-57`（interface），`122-133`（applyFitTransform 附近），`217-221`（useImperativeHandle）

**Interfaces:**
- Produces: `focusNode(nodeId: string): void` on `GraphCanvasHandle`
- Consumes: `instance.area.nodeViews.get(id)` for node bounds; `applyFitTransform` for camera

- [ ] **Step 1: Add `focusNode` to GraphCanvasHandle interface**

```ts
export interface GraphCanvasHandle {
  fitView(): void
  arrangeLayout(): void
  getZoomMin(): number
  focusNode(nodeId: string): void
}
```

- [ ] **Step 2: Implement focusNode in useImperativeHandle**

在 `useImperativeHandle(ref, () => ({ ... }), [])` 中添加：

```ts
focusNode(nodeId: string) {
  const instance = reteInstanceRef.current
  if (!instance) return
  const view = instance.area.nodeViews.get(nodeId)
  if (!view) return
  const rect = {
    left: view.position.x,
    top: view.position.y,
    width: view.element.offsetWidth,
    height: view.element.offsetHeight,
  }
  // Compute a zoom that fits the single node with padding, clamped to zoom bounds
  const padding = 80
  const containerW = containerRef.current?.clientWidth ?? window.innerWidth
  const containerH = containerRef.current?.clientHeight ?? window.innerHeight
  const zoomX = (containerW - padding * 2) / Math.max(rect.width, 1)
  const zoomY = (containerH - padding * 2) / Math.max(rect.height, 1)
  const zoom = Math.min(Math.max(Math.min(zoomX, zoomY), getZoomMin()), 1)
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  applyFitTransform({ zoom, x: containerW / 2 - cx * zoom, y: containerH / 2 - cy * zoom })
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/features/script-editor/components/GraphCanvas.tsx
git commit -m "feat(script-editor): add focusNode to GraphCanvasHandle for search locate"
```

### Task 6: Ctrl/Cmd+F 搜索与定位 UI

**Files:**
- Create: `src/features/script-editor/components/NodeSearchBox.tsx`
- Modify: `src/features/script-editor/ScriptEditorDialog.tsx:179-198`（keyboard handler 附近），组件渲染位置
- Modify: `src/features/script-editor/script-editor.css`

**Interfaces:**
- Consumes: `graph.nodes`（搜索源），`graphCanvasRef.current?.focusNode`，`setSelectedNodeIds`
- Produces: NodeSearchBox component; Ctrl/Cmd+F toggle state

- [ ] **Step 1: Create NodeSearchBox component**

```tsx
// src/features/script-editor/components/NodeSearchBox.tsx
import { useEffect, useRef, useState } from 'react'
import type { GraphEditorState } from '../rete/graphState'

interface NodeSearchBoxProps {
  graph: GraphEditorState
  onSelect: (nodeId: string) => void
  onClose: () => void
}

export function NodeSearchBox({ graph, onSelect, onClose }: NodeSearchBoxProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = query.trim()
    ? graph.nodes.filter((n) => {
        const q = query.toLowerCase()
        return (
          n.label.toLowerCase().includes(q) ||
          (typeof n.data.note === 'string' && n.data.note.toLowerCase().includes(q))
        )
      })
    : []

  return (
    <div className="script-editor-search-box" role="search">
      <div className="script-editor-search-box__bar">
        <input
          ref={inputRef}
          className="script-editor-search-box__input"
          type="text"
          placeholder="搜索节点名称或备注…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose() }
          }}
          aria-label="搜索节点"
        />
        <span className="script-editor-search-box__count">
          {results.length > 0 ? `${results.length} 个匹配` : ''}
        </span>
      </div>
      {results.length > 0 && (
        <div className="script-editor-search-box__results">
          {results.map((node) => (
            <button
              key={node.id}
              className="script-editor-search-box__result"
              onClick={() => onSelect(node.id)}
            >
              <span className="script-editor-search-box__result-name">{node.label}</span>
              {typeof node.data.note === 'string' && node.data.note && (
                <span className="script-editor-search-box__result-note">{node.data.note}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {query.trim() && results.length === 0 && (
        <div className="script-editor-search-box__empty">无匹配节点</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add Ctrl/Cmd+F handler in ScriptEditorDialog**

在 `ScriptEditorDialog.tsx` 的 keyboard handler effect 中（第 179 行附近），在 undo/redo 块之前或之后添加：

```ts
// Ctrl/Cmd+F: open node search (only when not in an editable element)
if ((ctrlKey || metaKey) && key === 'f') {
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
  e.preventDefault()
  setSearchOpen(true)
  return
}
```

新增状态：`const [searchOpen, setSearchOpen] = useState(false)`

- [ ] **Step 3: Render NodeSearchBox and wire onSelect**

在 JSX 中（画布上方，HUD 层级）条件渲染：

```tsx
{searchOpen && (
  <NodeSearchBox
    graph={graph}
    onSelect={(nodeId) => {
      setSelectedNodeIds([nodeId])
      graphCanvasRef.current?.focusNode(nodeId)
      setSearchOpen(false)
    }}
    onClose={() => setSearchOpen(false)}
  />
)}
```

- [ ] **Step 4: Add CSS for search box**

```css
.script-editor-search-box {
  position: absolute;
  top: 48px;
  right: 16px;
  width: 300px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 16px oklch(0 0 0 / 12%);
  z-index: 3100;
}
.script-editor-search-box__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.script-editor-search-box__input {
  flex: 1;
  border: none;
  font-size: 13px;
  background: transparent;
  color: var(--foreground);
}
.script-editor-search-box__input:focus { outline: none; }
.script-editor-search-box__count {
  font-size: 11px;
  color: var(--muted-foreground);
  white-space: nowrap;
}
.script-editor-search-box__results {
  max-height: 240px;
  overflow-y: auto;
}
.script-editor-search-box__result {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.script-editor-search-box__result:hover {
  background: color-mix(in oklab, var(--primary) 6%, transparent);
}
.script-editor-search-box__result-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--foreground);
}
.script-editor-search-box__result-note {
  font-size: 11px;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.script-editor-search-box__empty {
  padding: 16px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--muted-foreground);
}
```

- [ ] **Step 5: Run typecheck and focused tests**

Run: `npm run typecheck && npm test -- test/node-config-panel.test.ts`
Expected: exit 0 and tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/script-editor/components/NodeSearchBox.tsx \
        src/features/script-editor/ScriptEditorDialog.tsx \
        src/features/script-editor/script-editor.css
git commit -m "feat(script-editor): Ctrl+F node search by name or note with viewport locate"
```

### Task 7: E2E 测试 — 编辑名称、编辑备注、Ctrl+F 搜索定位

**Files:**
- Create: `e2e/script-editor-node-notes.spec.ts`

**Interfaces:**
- Consumes: all functionality from Tasks 1-6.
- Produces: E2E proof that name editing, note editing, search, and locate work end-to-end.

- [ ] **Step 1: Write the E2E spec**

```ts
import { expect, test } from '@playwright/test'
import { openNavPage, clickReady, NAV } from './fixtures'

test.describe('节点名称编辑、备注与搜索定位', () => {
  test('编辑节点名称并验证画布同步更新', async ({ page, electronApp }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // Select a node
    const node = editor.locator('[data-testid="node"]').first()
    await node.click()
    await expect(editor.locator('.script-editor-inspector__title-input')).toBeVisible()

    // Edit label
    const labelInput = editor.locator('.script-editor-inspector__title-input')
    await labelInput.fill('我的测试节点')
    await expect(node.locator('.script-rete-node__name')).toHaveText('我的测试节点')
  })

  test('添加备注并在画布上显示 badge', async ({ page }) => {
    // ... open editor, select node, fill note textarea, verify badge
  })

  test('Ctrl+F 搜索备注并定位到节点', async ({ page }) => {
    // ... open editor, add note "年月日测试" to a node,
    // press Ctrl+F, type "年月日", click result, verify node is selected and centered
  })

  test('Ctrl+F 在文本输入框中不劫持原生查找', async ({ page }) => {
    // ... focus the note textarea, press Ctrl+F, verify search box does NOT open
  })
})
```

- [ ] **Step 2: Run E2E to verify it fails**

Run: `npm run build && npx playwright test e2e/script-editor-node-notes.spec.ts`
Expected: FAIL — search box or inspector inputs don't exist yet (if Tasks 1-6 haven't been committed) or pass (if they have).

- [ ] **Step 3: Complete E2E implementation and run**

Fill in all test bodies fully, run:
Run: `npm run build && npx playwright test e2e/script-editor-node-notes.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/script-editor-node-notes.spec.ts
git commit -m "test(script-editor): E2E for node name editing, notes, and Ctrl+F search locate"
```

### Task 8: 完整回归验证

**Files:**
- Modify: none

- [ ] **Step 1: Run full unit suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Run full E2E**

Run: `npm run test:e2e:build`
Expected: all specs pass including the new `script-editor-node-notes.spec.ts`.

- [ ] **Step 4: Report results**

Report pass/fail honestly. If any test fails, investigate and fix before declaring done.
