# Script Editor Canvas-First UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Phase 1 React/Rete script editor so the canvas is the primary workspace, with a slim left rail, temporary right drawers, double-click node configuration, collapsible output, and shadcn-style light/dark visuals.

**Architecture:** Keep `GraphEditorState`, Rete setup, persistence, codegen, and script IPC unchanged. Move persistent side panels out of `GraphCanvas`, introduce a small pure UI-state reducer, and render scripts, palette, node config, and output as overlays around a single large canvas area.

**Tech Stack:** React 19, TypeScript, Rete v2, Vitest, shadcn Button, lucide-react icons, scoped CSS using existing shadcn CSS variables.

---

## File Structure

- Create `src/features/script-editor/uiState.ts`
  - Pure UI-state transitions for drawer and output behavior.
  - No React dependency; used by tests and `ScriptEditorDialog`.
- Create `test/script-editor-ui-state.test.ts`
  - TDD coverage for rail drawer toggles, node double-click config drawer, output expansion on run, and selected-node deletion cleanup.
- Create `src/features/script-editor/components/ScriptEditorRail.tsx`
  - Slim left icon rail for components, scripts, output, and reserved extension entry.
- Create `src/features/script-editor/components/ScriptEditorDrawer.tsx`
  - Generic right-side drawer shell with title, subtitle, close button, and body.
- Create `src/features/script-editor/components/NodeConfigPanel.tsx`
  - Extracts existing node control and connection editing UI from `GraphCanvas`.
- Create `src/features/script-editor/components/CanvasQuickAdd.tsx`
  - Top floating category shortcuts and add button for quick node creation.
- Modify `src/features/script-editor/components/GraphCanvas.tsx`
  - Remove persistent node strip and inspector.
  - Add node double-click callback.
  - Keep Rete sync, drop handling, direct connection handling, and position updates intact.
- Modify `src/features/script-editor/ScriptEditorDialog.tsx`
  - Own UI state, render rail, drawers, quick add, large canvas, and collapsible output.
  - Keep script CRUD, graph state, codegen, run/stop behavior unchanged.
- Modify `src/features/script-editor/components/NodePalette.tsx`
  - Render inside drawer, support active category filtering, keep click and drag behavior.
- Modify `src/features/script-editor/components/ScriptList.tsx`
  - Render inside drawer without hard-coded side-panel assumptions.
- Modify `src/features/script-editor/components/ScriptOutputPanel.tsx`
  - Add collapsed/expanded state and compact output affordance.
- Modify `src/features/script-editor/components/Toolbar.tsx`
  - Keep existing actions, add current script button hook for opening scripts drawer, tighten icon/button sizing if needed.
- Modify `src/features/script-editor/script-editor.css`
  - Replace nested panel grid with rail + canvas shell + drawer overlay.
  - Add light/dark token-based canvas, node, drawer, rail, output, and button polish.

---

### Task 1: Add Pure UI State Transitions

**Files:**
- Create: `src/features/script-editor/uiState.ts`
- Create: `test/script-editor-ui-state.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/script-editor-ui-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  closeScriptEditorDrawer,
  createScriptEditorUiState,
  onNodeDeleted,
  onNodeDoubleClick,
  onScriptRunStarted,
  toggleScriptEditorDrawer,
  toggleScriptOutput
} from '../src/features/script-editor/uiState'

describe('script editor UI state', () => {
  it('toggles temporary drawers from the rail', () => {
    let state = createScriptEditorUiState()

    state = toggleScriptEditorDrawer(state, 'nodes')
    expect(state.drawer).toBe('nodes')

    state = toggleScriptEditorDrawer(state, 'nodes')
    expect(state.drawer).toBeNull()

    state = toggleScriptEditorDrawer(state, 'scripts')
    expect(state.drawer).toBe('scripts')
  })

  it('opens the config drawer when a node is double-clicked', () => {
    const state = onNodeDoubleClick(createScriptEditorUiState())

    expect(state.drawer).toBe('config')
  })

  it('expands output when a script starts running', () => {
    const state = onScriptRunStarted({
      drawer: null,
      outputExpanded: false
    })

    expect(state.outputExpanded).toBe(true)
  })

  it('toggles and closes output independently of drawers', () => {
    let state = toggleScriptOutput({
      drawer: 'nodes',
      outputExpanded: false
    })

    expect(state).toEqual({
      drawer: 'nodes',
      outputExpanded: true
    })

    state = toggleScriptOutput(state)
    expect(state.outputExpanded).toBe(false)
  })

  it('closes the config drawer when the selected node is deleted', () => {
    expect(onNodeDeleted({
      drawer: 'config',
      outputExpanded: true
    })).toEqual({
      drawer: null,
      outputExpanded: true
    })

    expect(onNodeDeleted({
      drawer: 'scripts',
      outputExpanded: false
    }).drawer).toBe('scripts')
  })

  it('closes any open drawer on request', () => {
    expect(closeScriptEditorDrawer({
      drawer: 'scripts',
      outputExpanded: false
    })).toEqual({
      drawer: null,
      outputExpanded: false
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/script-editor-ui-state.test.ts
```

Expected: FAIL because `src/features/script-editor/uiState.ts` does not exist.

- [ ] **Step 3: Implement minimal UI state module**

Create `src/features/script-editor/uiState.ts`:

```ts
export type ScriptEditorDrawer = 'nodes' | 'scripts' | 'config' | null

export interface ScriptEditorUiState {
  drawer: ScriptEditorDrawer
  outputExpanded: boolean
}

export function createScriptEditorUiState(): ScriptEditorUiState {
  return {
    drawer: null,
    outputExpanded: false
  }
}

export function toggleScriptEditorDrawer(
  state: ScriptEditorUiState,
  drawer: Exclude<ScriptEditorDrawer, null>
): ScriptEditorUiState {
  return {
    ...state,
    drawer: state.drawer === drawer ? null : drawer
  }
}

export function closeScriptEditorDrawer(state: ScriptEditorUiState): ScriptEditorUiState {
  return {
    ...state,
    drawer: null
  }
}

export function onNodeDoubleClick(state: ScriptEditorUiState): ScriptEditorUiState {
  return {
    ...state,
    drawer: 'config'
  }
}

export function onNodeDeleted(state: ScriptEditorUiState): ScriptEditorUiState {
  return {
    ...state,
    drawer: state.drawer === 'config' ? null : state.drawer
  }
}

export function onScriptRunStarted(state: ScriptEditorUiState): ScriptEditorUiState {
  return {
    ...state,
    outputExpanded: true
  }
}

export function toggleScriptOutput(state: ScriptEditorUiState): ScriptEditorUiState {
  return {
    ...state,
    outputExpanded: !state.outputExpanded
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/script-editor-ui-state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add -- src/features/script-editor/uiState.ts test/script-editor-ui-state.test.ts
git commit -m "test(phase1): cover script editor UI state"
```

---

### Task 2: Extract Node Config Panel From GraphCanvas

**Files:**
- Create: `src/features/script-editor/components/NodeConfigPanel.tsx`
- Modify: `src/features/script-editor/components/GraphCanvas.tsx`

- [ ] **Step 1: Move config UI into `NodeConfigPanel.tsx`**

Create `src/features/script-editor/components/NodeConfigPanel.tsx`:

```tsx
import type { ReteGraphConnection } from '@shared/types'
import type { GraphEditorState } from '../rete/graphState'
import {
  connectGraphNodes,
  getCompatibleSources,
  removeGraphConnection,
  removeGraphNode,
  updateGraphNodeData,
  validateGraphNode
} from '../rete/graphState'
import { getNodeDefinition } from '../nodes/definitions'

interface NodeConfigPanelProps {
  graph: GraphEditorState
  selectedNodeId: string | null
  onGraphChange: (graph: GraphEditorState) => void
  onDeleted: () => void
}

export function NodeConfigPanel({
  graph,
  selectedNodeId,
  onGraphChange,
  onDeleted
}: NodeConfigPanelProps) {
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) || null

  function updateControl(nodeId: string, key: string, value: string) {
    onGraphChange(updateGraphNodeData(graph, nodeId, key, value))
  }

  function connect(targetId: string, targetInput: string, value: string) {
    if (!value) return
    const [source, sourceOutput] = value.split('::')
    onGraphChange(connectGraphNodes(graph, { source, sourceOutput, target: targetId, targetInput }))
  }

  if (!selectedNode) {
    return <div className="script-editor-inspector__empty">选择节点后配置参数与连线</div>
  }

  return (
    <div className="script-editor-inspector__content">
      <div className="script-editor-inspector__header">
        <div>
          <div className="script-editor-inspector__title">{selectedNode.label}</div>
          <div className="script-editor-inspector__key">{selectedNode.key}</div>
        </div>
        <button
          className="script-editor-link-button"
          onClick={() => {
            onGraphChange(removeGraphNode(graph, selectedNode.id))
            onDeleted()
          }}
          type="button"
        >
          删除
        </button>
      </div>

      <NodeControls node={selectedNode} onChange={updateControl} />
      <NodeConnections graph={graph} nodeId={selectedNode.id} onConnect={connect} onGraphChange={onGraphChange} />
    </div>
  )
}

function NodeControls({
  node,
  onChange
}: {
  node: GraphEditorState['nodes'][number]
  onChange: (nodeId: string, key: string, value: string) => void
}) {
  const definition = getNodeDefinition(node.key)
  const errors = validateGraphNode(node)

  if (!definition || definition.controls.length === 0) {
    return <div className="script-editor-inspector__empty">此节点无参数</div>
  }

  return (
    <section className="script-editor-inspector__section">
      <div className="script-editor-inspector__section-title">参数</div>
      {definition.controls.map((control) => {
        const invalid = errors.some((error) => error.startsWith(control.label))
        return (
          <label className="script-editor-field" data-invalid={invalid || undefined} key={control.key}>
            <span>{control.label}</span>
            {control.type === 'select' ? (
              <select
                aria-invalid={invalid || undefined}
                value={String(node.data[control.key] ?? '')}
                onChange={(event) => onChange(node.id, control.key, event.target.value)}
              >
                {(control.options || []).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                aria-invalid={invalid || undefined}
                type={control.type === 'number' ? 'number' : 'text'}
                value={String(node.data[control.key] ?? '')}
                onChange={(event) => onChange(node.id, control.key, event.target.value)}
              />
            )}
            {invalid && <span className="script-editor-field__error">{control.label}不能为空</span>}
          </label>
        )
      })}
    </section>
  )
}

function NodeConnections({
  graph,
  nodeId,
  onConnect,
  onGraphChange
}: {
  graph: GraphEditorState
  nodeId: string
  onConnect: (targetId: string, targetInput: string, value: string) => void
  onGraphChange: (graph: GraphEditorState) => void
}) {
  const node = graph.nodes.find((item) => item.id === nodeId)
  if (!node || Object.keys(node.inputs).length === 0) {
    return <div className="script-editor-inspector__empty">此节点无输入连线</div>
  }

  return (
    <section className="script-editor-inspector__section">
      <div className="script-editor-inspector__section-title">输入连线</div>
      {Object.values(node.inputs).map((input) => {
        const current = graph.connections.find((connection) => (
          connection.target === node.id && connection.targetInput === input.key
        ))
        const options = getCompatibleSources(graph, node.id, input.key)
        return (
          <label className="script-editor-field" key={input.key}>
            <span>{input.label}</span>
            <select
              value={current ? `${current.source}::${current.sourceOutput}` : ''}
              onChange={(event) => onConnect(node.id, input.key, event.target.value)}
            >
              <option value="">未连接</option>
              {options.map((option) => (
                <option key={`${option.nodeId}-${option.outputKey}`} value={`${option.nodeId}::${option.outputKey}`}>
                  {option.label}
                </option>
              ))}
            </select>
            {current && (
              <button
                className="script-editor-link-button"
                onClick={() => onGraphChange(removeGraphConnection(graph, connectionKey(current)))}
                type="button"
              >
                断开
              </button>
            )}
          </label>
        )
      })}
    </section>
  )
}

function connectionKey(connection: ReteGraphConnection): string {
  return String(connection.id || `${connection.source}:${connection.sourceOutput}->${connection.target}:${connection.targetInput}`)
}
```

- [ ] **Step 2: Simplify `GraphCanvas.tsx`**

Modify `src/features/script-editor/components/GraphCanvas.tsx`:

- Remove imports of `ReteGraphConnection`, `getCompatibleSources`, `removeGraphNode`, `updateGraphNodeData`, `validateGraphNode`, and `getNodeDefinition`.
- Remove `selectedNode` local variable.
- Remove `connect`, `updateControl`, `NodeControls`, `NodeConnections`, and `connectionKey`.
- Remove the `script-editor-node-strip` and `script-editor-inspector` JSX blocks.
- Add a new prop:

```ts
onNodeDoubleClick: (id: string) => void
```

- On the canvas surface, add an event handler that detects double clicks on Rete nodes:

```tsx
onDoubleClick={(event) => {
  const element = (event.target as HTMLElement).closest('[data-testid^="node-"]') as HTMLElement | null
  const nodeId = element?.dataset.testid?.replace('node-', '')
  if (nodeId) onNodeDoubleClick(nodeId)
}}
```

If Rete does not expose `data-testid` in the rendered DOM, use the actual Rete node wrapper attribute found during implementation and keep the behavior: double-click a rendered node calls `onNodeDoubleClick(id)`.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS. If it fails because the exact Rete DOM selector is unknown, inspect rendered DOM after Task 4 and adjust the selector before final verification.

- [ ] **Step 4: Commit**

Run:

```bash
git add -- src/features/script-editor/components/GraphCanvas.tsx src/features/script-editor/components/NodeConfigPanel.tsx
git commit -m "refactor(phase1): extract script node config panel"
```

---

### Task 3: Add Rail, Drawer, and Quick Add Components

**Files:**
- Create: `src/features/script-editor/components/ScriptEditorRail.tsx`
- Create: `src/features/script-editor/components/ScriptEditorDrawer.tsx`
- Create: `src/features/script-editor/components/CanvasQuickAdd.tsx`
- Modify: `src/features/script-editor/components/NodePalette.tsx`
- Modify: `src/features/script-editor/components/ScriptList.tsx`

- [ ] **Step 1: Create `ScriptEditorRail.tsx`**

Create `src/features/script-editor/components/ScriptEditorRail.tsx`:

```tsx
import { Blocks, FileText, MoreHorizontal, TerminalSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ScriptEditorDrawer } from '../uiState'

interface ScriptEditorRailProps {
  activeDrawer: ScriptEditorDrawer
  outputExpanded: boolean
  onToggleDrawer: (drawer: Exclude<ScriptEditorDrawer, null>) => void
  onToggleOutput: () => void
}

export function ScriptEditorRail({
  activeDrawer,
  outputExpanded,
  onToggleDrawer,
  onToggleOutput
}: ScriptEditorRailProps) {
  return (
    <nav className="script-editor-rail" aria-label="脚本编辑器工具">
      <Button
        aria-pressed={activeDrawer === 'nodes'}
        className={activeDrawer === 'nodes' ? 'is-active' : ''}
        size="icon"
        title="组件"
        variant="ghost"
        onClick={() => onToggleDrawer('nodes')}
      >
        <Blocks />
      </Button>
      <Button
        aria-pressed={activeDrawer === 'scripts'}
        className={activeDrawer === 'scripts' ? 'is-active' : ''}
        size="icon"
        title="脚本"
        variant="ghost"
        onClick={() => onToggleDrawer('scripts')}
      >
        <FileText />
      </Button>
      <Button
        aria-pressed={outputExpanded}
        className={outputExpanded ? 'is-active' : ''}
        size="icon"
        title="输出"
        variant="ghost"
        onClick={onToggleOutput}
      >
        <TerminalSquare />
      </Button>
      <Button disabled size="icon" title="预留扩展" variant="ghost">
        <MoreHorizontal />
      </Button>
    </nav>
  )
}
```

- [ ] **Step 2: Create `ScriptEditorDrawer.tsx`**

Create `src/features/script-editor/components/ScriptEditorDrawer.tsx`:

```tsx
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ScriptEditorDrawerProps {
  children: React.ReactNode
  open: boolean
  subtitle?: string
  title: string
  onClose: () => void
}

export function ScriptEditorDrawer({
  children,
  open,
  subtitle,
  title,
  onClose
}: ScriptEditorDrawerProps) {
  if (!open) return null

  return (
    <aside className="script-editor-drawer" aria-label={title}>
      <div className="script-editor-drawer__header">
        <div>
          <div className="script-editor-drawer__title">{title}</div>
          {subtitle && <div className="script-editor-drawer__subtitle">{subtitle}</div>}
        </div>
        <Button size="icon" title="关闭" variant="ghost" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="script-editor-drawer__body">{children}</div>
    </aside>
  )
}
```

- [ ] **Step 3: Create `CanvasQuickAdd.tsx`**

Create `src/features/script-editor/components/CanvasQuickAdd.tsx`:

```tsx
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PaletteGroup } from '../viewModel'

interface CanvasQuickAddProps {
  activeGroupKey: string
  groups: PaletteGroup[]
  onAddNode: (key: string) => void
  onOpenPalette: () => void
  onSelectGroup: (key: string) => void
}

export function CanvasQuickAdd({
  activeGroupKey,
  groups,
  onAddNode,
  onOpenPalette,
  onSelectGroup
}: CanvasQuickAddProps) {
  const activeGroup = groups.find((group) => group.key === activeGroupKey) || groups[0]
  const firstNode = activeGroup?.nodes[0]

  return (
    <div className="script-editor-quick-add" aria-label="快速添加组件">
      <div className="script-editor-quick-add__groups">
        {groups.slice(0, 5).map((group) => (
          <button
            className={group.key === activeGroup?.key ? 'is-active' : ''}
            key={group.key}
            onClick={() => onSelectGroup(group.key)}
            type="button"
          >
            {group.name}
          </button>
        ))}
      </div>
      <Button
        size="sm"
        title={firstNode ? `添加${firstNode.name}` : '打开组件'}
        onClick={() => {
          if (firstNode) onAddNode(firstNode.key)
          else onOpenPalette()
        }}
      >
        <Plus data-icon="inline-start" />
        添加到画布
      </Button>
      <Button size="sm" variant="outline" onClick={onOpenPalette}>
        全部组件
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Update `NodePalette.tsx` for drawer usage**

Modify `src/features/script-editor/components/NodePalette.tsx`:

```tsx
import type { PaletteGroup } from '../viewModel'

interface NodePaletteProps {
  activeGroupKey?: string
  groups: PaletteGroup[]
  onAddNode: (key: string) => void
  onSelectGroup?: (key: string) => void
}

export function NodePalette({ activeGroupKey, groups, onAddNode, onSelectGroup }: NodePaletteProps) {
  const visibleGroups = activeGroupKey ? groups.filter((group) => group.key === activeGroupKey) : groups

  return (
    <div className="script-editor-palette" aria-label="节点面板">
      <div className="script-editor-palette__tabs" role="tablist" aria-label="节点分类">
        {groups.map((group) => (
          <button
            aria-selected={group.key === activeGroupKey}
            className={group.key === activeGroupKey ? 'is-active' : ''}
            key={group.key}
            onClick={() => onSelectGroup?.(group.key)}
            role="tab"
            type="button"
          >
            <span className="script-editor-palette__swatch" style={{ backgroundColor: group.color }} />
            {group.name}
          </button>
        ))}
      </div>
      {visibleGroups.map((group) => (
        <section className="script-editor-palette__group" key={group.key}>
          <div className="script-editor-palette__heading">
            <span className="script-editor-palette__swatch" style={{ backgroundColor: group.color }} />
            <span>{group.name}</span>
          </div>
          <div className="script-editor-palette__nodes">
            {group.nodes.map((node) => (
              <button
                className="script-editor-node-template"
                data-node-key={node.key}
                draggable
                key={node.key}
                onClick={() => onAddNode(node.key)}
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-saecom-node', node.key)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
                style={{ borderLeftColor: node.color || group.color }}
                type="button"
              >
                <span className="script-editor-node-template__name">{node.name}</span>
                <span className="script-editor-node-template__ports">
                  {node.inputs.length}/{node.outputs.length}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Update `ScriptList.tsx` root element**

Modify only the root element in `src/features/script-editor/components/ScriptList.tsx` from:

```tsx
<aside className="script-editor-list" aria-label="脚本列表">
```

to:

```tsx
<div className="script-editor-list" aria-label="脚本列表">
```

and update the closing tag accordingly.

- [ ] **Step 6: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add -- src/features/script-editor/components/ScriptEditorRail.tsx src/features/script-editor/components/ScriptEditorDrawer.tsx src/features/script-editor/components/CanvasQuickAdd.tsx src/features/script-editor/components/NodePalette.tsx src/features/script-editor/components/ScriptList.tsx
git commit -m "feat(phase1): add script editor rail and drawers"
```

---

### Task 4: Wire Canvas-First Layout in ScriptEditorDialog

**Files:**
- Modify: `src/features/script-editor/ScriptEditorDialog.tsx`
- Modify: `src/features/script-editor/components/Toolbar.tsx`
- Modify: `src/features/script-editor/components/ScriptOutputPanel.tsx`

- [ ] **Step 1: Update `Toolbar.tsx` to open script drawer from current script**

Add prop:

```ts
onOpenScripts: () => void
```

Replace the title block with a button:

```tsx
<button className="script-editor-toolbar__title" onClick={onOpenScripts} type="button">
  <span className="script-editor-title">脚本页</span>
  <span className="script-editor-current">{activeScriptName || '未选中'}</span>
</button>
```

Keep all existing action buttons unchanged.

- [ ] **Step 2: Update `ScriptOutputPanel.tsx` with collapsed state**

Add props:

```ts
expanded: boolean
onToggle: () => void
```

Render:

```tsx
<section className={expanded ? 'script-editor-output is-expanded' : 'script-editor-output'} aria-label="脚本输出">
  <button className="script-editor-output__handle" onClick={onToggle} type="button" />
  <div className="script-editor-output__header">
    <span>输出</span>
    <div className="script-editor-output__actions">
      <Button size="icon" variant="ghost" title={expanded ? '收起' : '展开'} onClick={onToggle}>
        {expanded ? <ChevronDown /> : <ChevronUp />}
      </Button>
      <Button size="icon" variant="ghost" title="清空" onClick={onClear}>
        <Trash2 />
      </Button>
    </div>
  </div>
  {expanded && (
    <div className="script-editor-output__body">
      ...
    </div>
  )}
</section>
```

Import `ChevronDown` and `ChevronUp` from `lucide-react`.

- [ ] **Step 3: Wire UI state and layout in `ScriptEditorDialog.tsx`**

Add imports:

```ts
import {
  closeScriptEditorDrawer,
  createScriptEditorUiState,
  onNodeDeleted,
  onNodeDoubleClick,
  onScriptRunStarted,
  toggleScriptEditorDrawer,
  toggleScriptOutput
} from './uiState'
import { CanvasQuickAdd } from './components/CanvasQuickAdd'
import { NodeConfigPanel } from './components/NodeConfigPanel'
import { ScriptEditorDrawer } from './components/ScriptEditorDrawer'
import { ScriptEditorRail } from './components/ScriptEditorRail'
```

Add state:

```ts
const [uiState, setUiState] = useState(() => createScriptEditorUiState())
const [activeGroupKey, setActiveGroupKey] = useState(groups[0]?.key || 'input')
```

When selecting, creating, or deleting scripts, close config state as appropriate:

```ts
setUiState(closeScriptEditorDrawer)
```

In `runScript`, after `appendOutputLine('[开始运行...]')`, add:

```ts
setUiState(onScriptRunStarted)
```

Replace the workspace JSX with:

```tsx
<div className="script-editor-workspace">
  <ScriptEditorRail
    activeDrawer={uiState.drawer}
    outputExpanded={uiState.outputExpanded}
    onToggleDrawer={(drawer) => setUiState((current) => toggleScriptEditorDrawer(current, drawer))}
    onToggleOutput={() => setUiState(toggleScriptOutput)}
  />
  <div className="script-editor-canvas-shell">
    <CanvasQuickAdd
      activeGroupKey={activeGroupKey}
      groups={groups}
      onAddNode={(key) => addNode(key)}
      onOpenPalette={() => setUiState((current) => toggleScriptEditorDrawer(current, 'nodes'))}
      onSelectGroup={setActiveGroupKey}
    />
    <GraphCanvas
      graph={graph}
      selectedNodeId={selectedNodeId}
      zoom={zoom}
      onDropNode={addNode}
      onGraphChange={setGraph}
      onNodeDoubleClick={(id) => {
        setSelectedNodeId(id)
        setUiState(onNodeDoubleClick)
      }}
      onSelectNode={setSelectedNodeId}
    />
    <ScriptEditorDrawer
      open={uiState.drawer === 'nodes'}
      subtitle="选择或拖拽组件到画布"
      title="组件"
      onClose={() => setUiState(closeScriptEditorDrawer)}
    >
      <NodePalette
        activeGroupKey={activeGroupKey}
        groups={groups}
        onAddNode={(key) => addNode(key)}
        onSelectGroup={setActiveGroupKey}
      />
    </ScriptEditorDrawer>
    <ScriptEditorDrawer
      open={uiState.drawer === 'scripts'}
      subtitle="选择已保存脚本"
      title="脚本列表"
      onClose={() => setUiState(closeScriptEditorDrawer)}
    >
      <ScriptList
        activeScriptName={activeScriptName}
        error={scriptError}
        loading={loadingScripts}
        scripts={scripts}
        onSelect={async (name) => {
          await selectScript(name)
          setUiState(closeScriptEditorDrawer)
        }}
      />
    </ScriptEditorDrawer>
    <ScriptEditorDrawer
      open={uiState.drawer === 'config'}
      subtitle="参数与输入连线"
      title="节点配置"
      onClose={() => setUiState(closeScriptEditorDrawer)}
    >
      <NodeConfigPanel
        graph={graph}
        selectedNodeId={selectedNodeId}
        onDeleted={() => {
          setSelectedNodeId(null)
          setUiState(onNodeDeleted)
        }}
        onGraphChange={setGraph}
      />
    </ScriptEditorDrawer>
  </div>
</div>
<ScriptOutputPanel
  expanded={uiState.outputExpanded}
  lines={outputLines}
  onClear={clearOutput}
  onToggle={() => setUiState(toggleScriptOutput)}
/>
```

Pass `onOpenScripts` to `Toolbar`:

```tsx
onOpenScripts={() => setUiState((current) => toggleScriptEditorDrawer(current, 'scripts'))}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add -- src/features/script-editor/ScriptEditorDialog.tsx src/features/script-editor/components/Toolbar.tsx src/features/script-editor/components/ScriptOutputPanel.tsx
git commit -m "feat(phase1): wire canvas-first script editor layout"
```

---

### Task 5: Restyle Canvas-First UI

**Files:**
- Modify: `src/features/script-editor/script-editor.css`

- [ ] **Step 1: Replace workspace layout CSS**

In `src/features/script-editor/script-editor.css`, update layout rules so:

```css
.script-editor-workspace {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: 48px minmax(0, 1fr);
  background: hsl(var(--muted) / 0.35);
}

.script-editor-rail {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
  border-right: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  padding: 8px 6px;
}

.script-editor-rail .is-active {
  border-color: hsl(var(--primary) / 0.45);
  background: hsl(var(--primary) / 0.12);
  color: hsl(var(--primary));
}

.script-editor-canvas-shell {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.script-editor-canvas {
  position: absolute;
  inset: 0;
  display: block;
  min-width: 0;
  min-height: 0;
  padding: 0;
}

.script-editor-canvas__surface {
  border: 0;
  border-radius: 0;
}
```

- [ ] **Step 2: Add quick-add, drawer, and output CSS**

Add:

```css
.script-editor-quick-add {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--card) / 0.94);
  box-shadow: 0 10px 24px rgb(15 23 42 / 10%);
  padding: 6px;
}

.script-editor-quick-add__groups {
  display: flex;
  align-items: center;
  gap: 4px;
}

.script-editor-quick-add__groups button,
.script-editor-palette__tabs button {
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 6px 8px;
}

.script-editor-quick-add__groups button.is-active,
.script-editor-palette__tabs button.is-active {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}

.script-editor-drawer {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 4;
  display: flex;
  width: min(320px, calc(100% - 80px));
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--card));
  color: hsl(var(--card-foreground));
  box-shadow: 0 18px 46px rgb(15 23 42 / 18%);
}

.script-editor-drawer__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid hsl(var(--border));
  padding: 10px 12px;
}

.script-editor-drawer__title {
  font-size: 14px;
  font-weight: 700;
}

.script-editor-drawer__subtitle {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}

.script-editor-drawer__body {
  min-height: 0;
  overflow: auto;
}

.script-editor-output {
  height: 42px;
}

.script-editor-output.is-expanded {
  height: 150px;
}

.script-editor-output__handle {
  display: block;
  width: 100%;
  height: 5px;
  border: 0;
  background: hsl(var(--muted));
  cursor: ns-resize;
  padding: 0;
}

.script-editor-output__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
```

- [ ] **Step 3: Remove obsolete side-panel layout constraints**

Remove or neutralize CSS for:

- `.script-editor-node-strip`
- `.script-editor-graph-node`
- persistent `.script-editor-inspector` panel sizing
- old `.script-editor-workspace` three-column grid
- old `.script-editor-canvas` three-column grid
- old mobile rules that hide `.script-editor-list`

Keep `.script-editor-inspector__*`, `.script-editor-field`, `.script-editor-link-button`, `.script-editor-palette__*`, and `.script-editor-list__*` styles because the drawer content still uses them.

- [ ] **Step 4: Run build verification**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both PASS. Known legacy non-module build warnings may still appear, but the commands must exit 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add -- src/features/script-editor/script-editor.css
git commit -m "style(phase1): polish canvas-first script editor"
```

---

### Task 6: Full Verification and Browser Smoke

**Files:**
- No planned source edits unless verification finds defects.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected:

- `npm test`: all Vitest tests pass, including new `script-editor-ui-state.test.ts`
- `npm run typecheck`: exits 0
- `npm run build`: exits 0; known legacy script warnings are acceptable

- [ ] **Step 2: Start or reuse Electron dev app**

If no dev process is running, run:

```powershell
npm run dev
```

Expected:

- Vite renderer available at `http://localhost:5173/`
- Electron app starts without stderr

- [ ] **Step 3: Smoke check in Electron/browser**

Use the app window or in-app browser:

- Open `http://localhost:5173/` if checking browser shell
- In real Electron UI, click “编辑脚本”
- Confirm default editor shows slim left rail and large canvas
- Click component rail icon: component drawer opens
- Click it again or close: drawer closes
- Click scripts rail icon or toolbar script title: scripts drawer opens
- Add a node from quick add or palette
- Single-click node: node selects and config drawer does not open
- Double-click node: config drawer opens
- Change a node field
- Run script: output panel expands

- [ ] **Step 4: Commit smoke fixes if needed**

If verification required source fixes, commit them:

```bash
git add -- <fixed files>
git commit -m "fix(phase1): address canvas-first editor smoke issues"
```

If no source fixes were needed, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage:
  - Canvas-first default: Tasks 4 and 5.
  - Hidden scripts and components: Tasks 3, 4, and 5.
  - Double-click config drawer: Tasks 1, 2, and 4.
  - Light/dark shadcn style: Task 5.
  - Preserve data flow, codegen, IPC: Tasks 2 and 4 keep graph/code paths unchanged.
  - Verification: Task 6.
- Placeholder scan:
  - No TBD/TODO/fill-later instructions.
- Type consistency:
  - `ScriptEditorDrawer` and `ScriptEditorUiState` are defined in Task 1 and reused by later tasks.
  - `onNodeDoubleClick`, `onDeleted`, `expanded`, and `onToggle` props are introduced before use.
