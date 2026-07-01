# Script Editor Panel-First Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a panel-first script node configuration model with typed input/output validation, a vertical component tree, calmer node selection styling, and continuous listening for real receive nodes.

**Architecture:** Add a focused `panelConfig.ts` module as the boundary for config refs, defaults, migration, validation, and display helpers. Keep legacy panel state as the Phase 1 source of truth, but extend its summary shape to include serial options. UI components consume typed helpers instead of spreading transport rules across React, graph state, and codegen.

**Tech Stack:** Electron + Vite, React 19, TypeScript, Rete graph state, Vitest, shadcn/ui-style local components (`Button`, `Badge`, `Collapsible`, `ScrollArea`, `Select`, `Tooltip`), legacy renderer bridge via `window.getSerialPanelSummaries()`.

---

## File Structure

- Create `src/features/script-editor/panelConfig.ts`
  - Owns `BASE_SERIAL_OPTIONS`, `PanelConfigRef`, node config defaults, legacy migration, validation, and readable summaries.
- Modify `shared/types.ts`
  - Exposes `PanelConfigRef`, `SerialPanelSummary.options`, and optional node config metadata fields used by graph exports.
- Modify `renderer.js`
  - Adds `options` to serial panel summaries without changing legacy panel open/close behavior.
- Modify `src/features/script-editor/rete/graphState.ts`
  - Uses `panelConfig.ts` for default node data, import migration, and validation.
- Modify `src/features/script-editor/viewModel.ts`
  - Builds panel-first select options and inherited-parameter descriptions.
- Modify `src/features/script-editor/nodes/definitions.ts`
  - Updates external-resource controls to use config refs while keeping node count and categories stable.
- Modify `src/features/script-editor/components/NodeConfigPanel.tsx`
  - Renders typed config sections, inherited serial options, and validation messages.
- Modify `src/features/script-editor/components/NodePalette.tsx`
  - Replaces horizontal Tabs with vertical `Collapsible` tree groups.
- Modify `src/features/script-editor/script-editor.css`
  - Removes the harsh blue selected outline and adds tree/config styling.
- Modify `src/features/script-editor/ScriptEditorDialog.tsx`
  - Passes panel summaries into add-node defaults and config panel helpers.
- Modify `src/features/script-editor/codegen/index.ts`
  - Emits continuous listeners for real receive inputs and ordinary one-shot code for local inputs.
- Modify `src/features/script-editor/codegen/emit/input.ts`
  - Emits receive source expressions used by continuous listeners.
- Modify `src/features/script-editor/codegen/emit/output.ts`
  - Emits output calls from panel-first config refs.
- Modify `src/features/script-editor/codegen/emit/shared.ts`
  - Adds branch helpers needed by continuous listeners.
- Modify `electron/main.ts`
  - Adds continuous wait helper APIs that do not treat timeout placeholders as payloads.
- Create `test/script-editor-panel-config.test.ts`
  - Covers defaults, migration, validation, option display, and typed config behavior.
- Modify `test/rete-codegen.test.ts`
  - Updates codegen expectations for config refs and continuous listeners.
- Modify `test/script-editor-graph-state.test.ts`
  - Updates default node data and validation expectations.
- Modify `test/script-editor-view-model.test.ts`
  - Updates option descriptions and inherited serial parameter tests.

## Task 1: Shared Types And Panel Config Module

**Files:**
- Modify: `shared/types.ts`
- Create: `src/features/script-editor/panelConfig.ts`
- Test: `test/script-editor-panel-config.test.ts`

- [ ] **Step 1: Write failing tests for defaults and legacy migration**

Add this test file:

```ts
import { describe, expect, it } from 'vitest'
import type { SerialPanelSummary } from '../shared/types'
import {
  BASE_SERIAL_OPTIONS,
  createDefaultNodeData,
  migrateNodeData,
  resolvePanelConfigRef
} from '../src/features/script-editor/panelConfig'

const panels: SerialPanelSummary[] = [
  {
    id: 'COM3',
    name: '主串口',
    type: 'serial',
    open: true,
    active: true,
    options: { baudRate: 9600, dataBits: 7, stopBits: 2, parity: 'even' }
  },
  {
    id: 'tcp://127.0.0.1:502',
    name: 'PLC',
    type: 'tcp',
    open: false,
    active: false
  }
]

describe('script editor panel config', () => {
  it('creates panel-first defaults for serial receive nodes', () => {
    expect(createDefaultNodeData('input-serial', panels)).toEqual({
      configRef: {
        kind: 'panel',
        panelId: 'COM3',
        serialOptions: { baudRate: 9600, dataBits: 7, stopBits: 2, parity: 'even' }
      }
    })
  })

  it('falls back to base serial options when no serial panel is active', () => {
    expect(createDefaultNodeData('input-serial', [])).toEqual({
      configRef: {
        kind: 'serial-port',
        serialOptions: BASE_SERIAL_OPTIONS,
        usesFallbackOptions: true
      }
    })
  })

  it('migrates legacy panel and port fields into config refs', () => {
    expect(migrateNodeData('input-panel', { panelId: 'COM3', timeout: 1200 })).toEqual({
      panelId: 'COM3',
      timeout: 1200,
      configRef: { kind: 'panel', panelId: 'COM3' }
    })

    expect(migrateNodeData('output-serial', { portPath: 'COM9', mode: 'hex' })).toEqual({
      portPath: 'COM9',
      mode: 'hex',
      configRef: {
        kind: 'serial-port',
        portPath: 'COM9',
        serialOptions: BASE_SERIAL_OPTIONS,
        usesFallbackOptions: true
      }
    })
  })

  it('resolves current panel refs against runtime panel summaries', () => {
    expect(resolvePanelConfigRef({ kind: 'current-panel' }, panels)).toEqual({
      kind: 'panel',
      panelId: 'COM3',
      serialOptions: { baudRate: 9600, dataBits: 7, stopBits: 2, parity: 'even' }
    })
  })
})
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npm test -- test/script-editor-panel-config.test.ts
```

Expected: FAIL because `src/features/script-editor/panelConfig.ts` does not exist.

- [ ] **Step 3: Add shared types**

In `shared/types.ts`, update `SerialPanelSummary` and add `PanelConfigRef`:

```ts
export type PanelConfigKind =
  | 'current-panel'
  | 'panel'
  | 'serial-port'
  | 'tcp-endpoint'
  | 'tcp-server'
  | 'file'
  | 'local'

export interface PanelConfigRef {
  kind: PanelConfigKind
  panelId?: string
  portPath?: string
  host?: string
  port?: number
  path?: string
  serialOptions?: SerialOpenOptions
  usesFallbackOptions?: boolean
}

export interface SerialPanelSummary {
  id: string
  name: string
  type: 'serial' | 'tcp'
  open: boolean
  active: boolean
  hidden?: boolean
  options?: SerialOpenOptions
}
```

- [ ] **Step 4: Create `panelConfig.ts`**

Create `src/features/script-editor/panelConfig.ts`:

```ts
import type { PanelConfigRef, SerialOpenOptions, SerialPanelSummary } from '@shared/types'

export const BASE_SERIAL_OPTIONS: Required<Pick<SerialOpenOptions, 'baudRate' | 'dataBits' | 'stopBits' | 'parity'>> = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none'
}

export function serialOptionsOrBase(options?: SerialOpenOptions): SerialOpenOptions {
  return {
    baudRate: Number(options?.baudRate || BASE_SERIAL_OPTIONS.baudRate),
    dataBits: Number(options?.dataBits || BASE_SERIAL_OPTIONS.dataBits),
    stopBits: Number(options?.stopBits || BASE_SERIAL_OPTIONS.stopBits),
    parity: String(options?.parity || BASE_SERIAL_OPTIONS.parity)
  }
}

export function activeSerialPanel(panels: SerialPanelSummary[]): SerialPanelSummary | null {
  return panels.find((panel) => panel.type === 'serial' && panel.active)
    || panels.find((panel) => panel.type === 'serial' && panel.open)
    || null
}

export function createPanelConfigRef(nodeKey: string, panels: SerialPanelSummary[] = []): PanelConfigRef {
  if (nodeKey.includes('serial')) {
    const panel = activeSerialPanel(panels)
    if (panel) {
      return {
        kind: 'panel',
        panelId: panel.id,
        serialOptions: serialOptionsOrBase(panel.options)
      }
    }
    return {
      kind: 'serial-port',
      serialOptions: BASE_SERIAL_OPTIONS,
      usesFallbackOptions: true
    }
  }

  if (nodeKey.includes('panel')) return { kind: 'current-panel' }
  if (nodeKey.includes('tcp-server')) return { kind: 'tcp-server', port: 9000 }
  if (nodeKey.includes('tcp')) return { kind: 'tcp-endpoint', host: '127.0.0.1', port: 8080 }
  if (nodeKey.includes('file')) return { kind: 'file' }
  return { kind: 'local' }
}

export function createDefaultNodeData(nodeKey: string, panels: SerialPanelSummary[] = []): Record<string, unknown> {
  const configRef = createPanelConfigRef(nodeKey, panels)
  if (nodeKey === 'input-manual') return { content: '', mode: 'text', configRef }
  if (nodeKey === 'input-file') return { path: '', encoding: 'utf8', configRef }
  if (nodeKey === 'input-timer') return { interval: 1000, repeat: '单次', configRef }
  if (nodeKey === 'output-file') return { path: '', mode: '追加', configRef }
  if (nodeKey === 'output-log') return { level: 'info', prefix: '', configRef }
  if (nodeKey === 'output-variable') return { name: 'result', configRef }
  if (nodeKey.startsWith('output-')) return { mode: 'text', append: '无', configRef }
  return { configRef }
}

export function migrateNodeData(nodeKey: string, data: Record<string, unknown> = {}): Record<string, unknown> {
  if (isPanelConfigRef(data.configRef)) return data

  if (typeof data.panelId === 'string' && data.panelId.trim()) {
    return { ...data, configRef: { kind: data.panelId === '__current__' ? 'current-panel' : 'panel', panelId: data.panelId } }
  }

  if (typeof data.portPath === 'string' && data.portPath.trim() && data.portPath !== '__current__') {
    return {
      ...data,
      configRef: {
        kind: 'serial-port',
        portPath: data.portPath,
        serialOptions: BASE_SERIAL_OPTIONS,
        usesFallbackOptions: true
      }
    }
  }

  return { ...data, configRef: createPanelConfigRef(nodeKey) }
}

export function resolvePanelConfigRef(ref: PanelConfigRef, panels: SerialPanelSummary[]): PanelConfigRef {
  if (ref.kind !== 'current-panel') return ref
  const active = panels.find((panel) => panel.active) || panels[0]
  if (!active) return ref
  return {
    kind: 'panel',
    panelId: active.id,
    serialOptions: active.type === 'serial' ? serialOptionsOrBase(active.options) : undefined
  }
}

export function isPanelConfigRef(value: unknown): value is PanelConfigRef {
  return !!value && typeof value === 'object' && typeof (value as PanelConfigRef).kind === 'string'
}
```

- [ ] **Step 5: Run the new test and verify it passes**

Run:

```bash
npm test -- test/script-editor-panel-config.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts src/features/script-editor/panelConfig.ts test/script-editor-panel-config.test.ts
git commit -m "feat(phase1): add panel config model"
```

## Task 2: Graph State Migration And Validation

**Files:**
- Modify: `src/features/script-editor/rete/graphState.ts`
- Modify: `test/script-editor-graph-state.test.ts`
- Modify: `test/script-editor-panel-config.test.ts`

- [ ] **Step 1: Add failing validation tests**

Append to `test/script-editor-panel-config.test.ts`:

```ts
import { validateNodeConfig } from '../src/features/script-editor/panelConfig'

it('validates typed input and output config requirements', () => {
  expect(validateNodeConfig('input-serial', { configRef: { kind: 'serial-port' } })).toEqual([
    '接收串口：未选择面板或串口'
  ])
  expect(validateNodeConfig('input-tcp', { configRef: { kind: 'tcp-endpoint', host: '', port: 502 } })).toEqual([
    '接收TCP：主机不能为空'
  ])
  expect(validateNodeConfig('output-file', { configRef: { kind: 'file' }, path: '' })).toEqual([
    '写入文件：文件路径不能为空'
  ])
  expect(validateNodeConfig('output-variable', { configRef: { kind: 'local' }, name: 'result' })).toEqual([])
})
```

Update the first test in `test/script-editor-graph-state.test.ts` to expect `configRef` on `input-tcp`:

```ts
expect(node.data).toMatchObject({
  configRef: { kind: 'tcp-endpoint', host: '127.0.0.1', port: 8080 }
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- test/script-editor-panel-config.test.ts test/script-editor-graph-state.test.ts
```

Expected: FAIL because `validateNodeConfig` is missing and graph defaults still come only from controls.

- [ ] **Step 3: Add validation helpers to `panelConfig.ts`**

Add:

```ts
export function validateNodeConfig(nodeKey: string, data: Record<string, unknown> = {}): string[] {
  const configRef = isPanelConfigRef(data.configRef)
    ? data.configRef
    : createPanelConfigRef(nodeKey)

  switch (nodeKey) {
    case 'input-panel':
    case 'output-panel':
      if (configRef.kind === 'current-panel') return []
      return configRef.panelId ? [] : [`${nodeLabel(nodeKey)}：未选择面板`]
    case 'input-serial':
    case 'output-serial':
      if (configRef.kind === 'current-panel') return []
      if (configRef.panelId || configRef.portPath) return []
      return [`${nodeLabel(nodeKey)}：未选择面板或串口`]
    case 'input-tcp':
    case 'output-tcp':
      if (!String(configRef.host || '').trim()) return [`${nodeLabel(nodeKey)}：主机不能为空`]
      if (!Number(configRef.port)) return [`${nodeLabel(nodeKey)}：端口不能为空`]
      return []
    case 'input-tcp-server':
    case 'output-tcp-server':
      return Number(configRef.port || data.port) ? [] : [`${nodeLabel(nodeKey)}：端口不能为空`]
    case 'input-manual':
      return String(data.content || '').trim() ? [] : ['手动输入：输入内容不能为空']
    case 'input-file':
    case 'output-file':
      return String(data.path || '').trim() ? [] : [`${nodeLabel(nodeKey)}：文件路径不能为空`]
    case 'output-variable':
      return String(data.name || '').trim() ? [] : ['变量存储：变量名不能为空']
    default:
      return []
  }
}

function nodeLabel(nodeKey: string): string {
  const labels: Record<string, string> = {
    'input-panel': '接收面板',
    'input-serial': '接收串口',
    'input-tcp': '接收TCP',
    'input-tcp-server': 'TCP服务器接收',
    'input-file': '读取文件',
    'output-panel': '发送面板',
    'output-serial': '发送串口',
    'output-tcp': '发送TCP',
    'output-tcp-server': 'TCP服务器发送',
    'output-file': '写入文件',
    'output-variable': '变量存储'
  }
  return labels[nodeKey] || nodeKey
}
```

- [ ] **Step 4: Use migration/default helpers in graph state**

In `src/features/script-editor/rete/graphState.ts`:

```ts
import { createDefaultNodeData, migrateNodeData, validateNodeConfig } from '../panelConfig'
```

Change `addGraphNode` data assignment:

```ts
data: { ...defaultNodeData(key), ...migrateNodeData(key, data) },
```

Change `importGraphState` data argument:

```ts
migrateNodeData(node.key, node.data || {}),
```

Change `validateGraphNode` to combine definition-required controls and typed config errors:

```ts
export function validateGraphNode(node: GraphEditorNode): string[] {
  const definition = getNodeDefinition(node.key)
  if (!definition) return [`未知节点: ${node.key}`]

  const controlErrors = definition.controls.flatMap((control) => {
    if (!control.required) return []
    const value = node.data[control.key]
    return value === undefined || value === null || String(value).trim() === ''
      ? [`${control.label}不能为空`]
      : []
  })

  return [...controlErrors, ...validateNodeConfig(node.key, node.data)]
}
```

Change `defaultNodeData`:

```ts
export function defaultNodeData(key: string): GraphNodeData {
  const definition = getNodeDefinition(key)
  if (!definition) return {}
  return {
    ...Object.fromEntries(definition.controls.map((control) => [control.key, control.default ?? ''])),
    ...createDefaultNodeData(key)
  }
}
```

- [ ] **Step 5: Run graph and panel config tests**

Run:

```bash
npm test -- test/script-editor-panel-config.test.ts test/script-editor-graph-state.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/script-editor/panelConfig.ts src/features/script-editor/rete/graphState.ts test/script-editor-panel-config.test.ts test/script-editor-graph-state.test.ts
git commit -m "feat(phase1): migrate graph nodes to panel config refs"
```

## Task 3: Legacy Panel Summary And View Model Options

**Files:**
- Modify: `renderer.js`
- Modify: `src/features/script-editor/viewModel.ts`
- Modify: `src/features/script-editor/ScriptEditorDialog.tsx`
- Modify: `test/script-editor-view-model.test.ts`

- [ ] **Step 1: Add failing view model tests**

In `test/script-editor-view-model.test.ts`, add:

```ts
it('describes inherited serial panel options', () => {
  const options = buildSerialPanelOptions([
    {
      id: 'COM3',
      name: '主串口',
      type: 'serial',
      open: true,
      active: true,
      options: { baudRate: 9600, dataBits: 7, stopBits: 2, parity: 'even' }
    }
  ])

  expect(options[0]).toEqual({
    value: '__current__',
    label: '当前面板：主串口',
    description: 'COM3 · 已打开 · 9600/7/2/even'
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npm test -- test/script-editor-view-model.test.ts
```

Expected: FAIL because descriptions do not include serial options.

- [ ] **Step 3: Extend legacy summary**

In `renderer.js`, change `getSerialPanelSummaries()` to include options for serial panes:

```js
function getSerialPanelSummaries() {
    return Array.from(state.panes.entries()).map(([id, pane]) => {
        const type = pane.type || (String(id).startsWith('tcp://') ? 'tcp' : 'serial');
        return {
            id,
            name: (pane.note && pane.note.trim()) ? pane.note : (pane.info?.name || id),
            type,
            open: !!pane.open,
            active: state.activeId === id,
            hidden: !!pane.el?.classList?.contains('hidden'),
            options: type === 'serial' ? {
                baudRate: parseInt(pane.options?.baudRate || 115200, 10),
                dataBits: parseInt(pane.options?.dataBits || 8, 10),
                stopBits: parseInt(pane.options?.stopBits || 1, 10),
                parity: pane.options?.parity || 'none'
            } : undefined
        };
    });
}
```

- [ ] **Step 4: Update view model descriptions**

In `src/features/script-editor/viewModel.ts`, add:

```ts
function serialOptionsDescription(panel: SerialPanelSummary): string | null {
  if (panel.type !== 'serial' || !panel.options) return null
  return [
    panel.options.baudRate,
    panel.options.dataBits ?? 8,
    panel.options.stopBits ?? 1,
    panel.options.parity ?? 'none'
  ].join('/')
}
```

Change `panelDescription`:

```ts
function panelDescription(panel: SerialPanelSummary): string {
  return [
    panel.id,
    panel.open ? '已打开' : '未打开',
    serialOptionsDescription(panel)
  ].filter(Boolean).join(' · ')
}
```

Change `controlSupportsRefresh`:

```ts
export function controlSupportsRefresh(source?: string): boolean {
  return source === 'serial-panels' || source === 'serial-ports'
}
```

- [ ] **Step 5: Pass panels into new node defaults**

In `ScriptEditorDialog.tsx`, modify `addNode` to pass `serialPanels` into `addGraphNode` data:

```ts
const next = addGraphNode(current, key, nodePosition, undefined, { __panels: serialPanels })
```

Then in `graphState.ts`, import the panel summary type and strip the temporary `__panels` value inside `addGraphNode` before node data is persisted:

```ts
import type {
  ReteGraphConnection,
  ReteGraphExport,
  ReteGraphNode,
  SerialPanelSummary,
  SocketKind,
  SocketSpec
} from '@shared/types'
```

Use this helper block at the top of `addGraphNode`, after the definition guard:

```ts
const panels = Array.isArray((data as { __panels?: unknown }).__panels)
  ? (data as { __panels: SerialPanelSummary[] }).__panels
  : []
const cleanData = { ...data }
delete cleanData.__panels
```

Use `createDefaultNodeData(key, panels)` in `defaultNodeData` through a new overload:

```ts
export function defaultNodeData(key: string, panels: SerialPanelSummary[] = []): GraphNodeData {
  const definition = getNodeDefinition(key)
  if (!definition) return {}
  return {
    ...Object.fromEntries(definition.controls.map((control) => [control.key, control.default ?? ''])),
    ...createDefaultNodeData(key, panels)
  }
}
```

And in `addGraphNode`:

```ts
data: { ...defaultNodeData(key, panels), ...migrateNodeData(key, cleanData) },
```

Update `duplicateGraphNode` and `importGraphState` calls without a panel context to keep using the optional default:

```ts
data: { ...defaultNodeData(key), ...migrateNodeData(key, cleanData) },
```

- [ ] **Step 6: Run view model and graph tests**

Run:

```bash
npm test -- test/script-editor-view-model.test.ts test/script-editor-graph-state.test.ts test/script-editor-panel-config.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add renderer.js src/features/script-editor/viewModel.ts src/features/script-editor/ScriptEditorDialog.tsx src/features/script-editor/rete/graphState.ts test/script-editor-view-model.test.ts
git commit -m "feat(phase1): expose inherited serial panel options"
```

## Task 4: Typed Node Config Panel UI

**Files:**
- Modify: `src/features/script-editor/components/NodeConfigPanel.tsx`
- Modify: `src/features/script-editor/script-editor.css`
- Test: `test/script-editor-panel-config.test.ts`

- [ ] **Step 1: Add display helper tests**

Append to `test/script-editor-panel-config.test.ts`:

```ts
import { inheritedSerialSummary, fallbackSerialSummary } from '../src/features/script-editor/panelConfig'

it('formats inherited and fallback serial summaries', () => {
  expect(inheritedSerialSummary({ baudRate: 9600, dataBits: 7, stopBits: 2, parity: 'even' })).toEqual([
    ['波特率', '9600'],
    ['数据位', '7'],
    ['停止位', '2'],
    ['校验位', 'even']
  ])
  expect(fallbackSerialSummary()).toEqual([
    ['波特率', '115200'],
    ['数据位', '8'],
    ['停止位', '1'],
    ['校验位', 'none']
  ])
})
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npm test -- test/script-editor-panel-config.test.ts
```

Expected: FAIL because formatting helpers are missing.

- [ ] **Step 3: Add formatting helpers**

In `panelConfig.ts` add:

```ts
export function inheritedSerialSummary(options?: SerialOpenOptions): Array<[string, string]> {
  const normalized = serialOptionsOrBase(options)
  return [
    ['波特率', String(normalized.baudRate)],
    ['数据位', String(normalized.dataBits)],
    ['停止位', String(normalized.stopBits)],
    ['校验位', String(normalized.parity)]
  ]
}

export function fallbackSerialSummary(): Array<[string, string]> {
  return inheritedSerialSummary(BASE_SERIAL_OPTIONS)
}
```

- [ ] **Step 4: Render typed config section**

In `NodeConfigPanel.tsx`, import helpers:

```ts
import {
  fallbackSerialSummary,
  inheritedSerialSummary,
  isPanelConfigRef
} from '../panelConfig'
```

Add after the inspector coordinates and before generic controls:

```tsx
<NodeConfigSummary node={selectedNode} />
```

Add component:

```tsx
function NodeConfigSummary({ node }: { node: GraphEditorState['nodes'][number] }) {
  const configRef = node.data.configRef
  if (!isPanelConfigRef(configRef)) return null

  if (configRef.kind === 'serial-port' || node.key.includes('serial')) {
    const rows = configRef.usesFallbackOptions
      ? fallbackSerialSummary()
      : inheritedSerialSummary(configRef.serialOptions)

    return (
      <section className="script-editor-inspector__section">
        <div className="script-editor-inspector__section-title">串口配置</div>
        <div className="script-editor-config-summary">
          <div className="script-editor-config-summary__target">
            {configRef.panelId ? `面板：${configRef.panelId}` : configRef.portPath ? `串口：${configRef.portPath}` : '未选择面板或串口'}
          </div>
          <dl>
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {configRef.usesFallbackOptions ? (
            <span className="script-editor-field__hint">当前使用默认基础参数</span>
          ) : null}
        </div>
      </section>
    )
  }

  if (configRef.kind === 'panel' || configRef.kind === 'current-panel') {
    return (
      <section className="script-editor-inspector__section">
        <div className="script-editor-inspector__section-title">面板配置</div>
        <div className="script-editor-config-summary__target">
          {configRef.kind === 'current-panel' ? '运行时使用当前面板' : `面板：${configRef.panelId || '未选择'}`}
        </div>
      </section>
    )
  }

  return null
}
```

Keep `NodeControls` validation as a single `validateGraphNode(node)` call. Task 2 already combines required control errors with typed config validation in graph state:

```ts
const errors = validateGraphNode(node)
```

- [ ] **Step 5: Add CSS for summaries**

In `script-editor.css`, add:

```css
.script-editor-config-summary {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  border: 1px solid hsl(var(--border));
  border-radius: 5px;
  background: hsl(var(--muted) / 0.32);
  padding: 8px;
}

.script-editor-config-summary__target {
  color: hsl(var(--foreground));
  font-size: 12px;
  font-weight: 700;
}

.script-editor-config-summary dl {
  display: grid;
  gap: 6px;
  grid-template-columns: 1fr 1fr;
  margin: 0;
}

.script-editor-config-summary dl > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.script-editor-config-summary dt {
  color: hsl(var(--muted-foreground));
  font-size: 11px;
}

.script-editor-config-summary dd {
  margin: 0;
  color: hsl(var(--foreground));
  font-size: 12px;
}
```

- [ ] **Step 6: Run relevant tests**

Run:

```bash
npm test -- test/script-editor-panel-config.test.ts test/script-editor-graph-state.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/script-editor/panelConfig.ts src/features/script-editor/components/NodeConfigPanel.tsx src/features/script-editor/script-editor.css test/script-editor-panel-config.test.ts
git commit -m "feat(phase1): show typed panel config in inspector"
```

## Task 5: Vertical Component Tree And Selection Styling

**Files:**
- Modify: `src/features/script-editor/components/NodePalette.tsx`
- Modify: `src/features/script-editor/script-editor.css`
- Modify: `test/script-editor-graph-state.test.ts`

- [ ] **Step 1: Update palette grouping test naming**

In `test/script-editor-graph-state.test.ts`, keep this existing assertion and rename the test to document tree intent:

```ts
it('keeps every node category available for the vertical component tree', () => {
  const groups = groupNodesForPalette()

  expect(groups).toHaveLength(9)
  expect(groups[0]?.key).toBe('input')
  expect(groups.every((group) => group.nodes.length > 0)).toBe(true)
  expect(groups.find((group) => group.key === 'string')?.nodes.map((node) => node.key)).toContain('string-concat')
})
```

- [ ] **Step 2: Run test before UI change**

Run:

```bash
npm test -- test/script-editor-graph-state.test.ts
```

Expected: PASS. This protects category grouping while UI changes.

- [ ] **Step 3: Replace Tabs with Collapsible tree**

In `NodePalette.tsx`, replace the component with:

```tsx
import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { PaletteGroup } from '../viewModel'

interface NodePaletteProps {
  activeGroupKey?: string
  groups: PaletteGroup[]
  onAddNode: (key: string) => void
  onSelectGroup?: (key: string) => void
}

export function NodePalette({ activeGroupKey, groups, onAddNode, onSelectGroup }: NodePaletteProps) {
  const defaultOpen = useMemo(() => new Set([activeGroupKey || groups[0]?.key || 'input']), [activeGroupKey, groups])
  const [openGroups, setOpenGroups] = useState(defaultOpen)

  function toggleGroup(key: string, open: boolean) {
    setOpenGroups((current) => {
      const next = new Set(current)
      if (open) next.add(key)
      else next.delete(key)
      return next
    })
    if (open) onSelectGroup?.(key)
  }

  return (
    <div className="script-editor-palette" aria-label="节点面板">
      <ScrollArea className="script-editor-palette__scroll">
        <div className="script-editor-palette__tree">
          {groups.map((group) => (
            <Collapsible
              key={group.key}
              open={openGroups.has(group.key)}
              onOpenChange={(open) => toggleGroup(group.key, open)}
            >
              <CollapsibleTrigger className="script-editor-palette__heading" type="button">
                <ChevronDown />
                <span className="script-editor-palette__swatch" style={{ background: group.color }} />
                <span>{group.name}</span>
                <Badge variant="secondary">{group.nodes.length}</Badge>
              </CollapsibleTrigger>
              <CollapsibleContent>
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
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
```

- [ ] **Step 4: Update palette CSS and remove selected blue outline**

In `script-editor.css`, remove or neutralize `.script-editor-palette__tabs` rules that assume horizontal tabs. Add:

```css
.script-editor-palette__scroll {
  min-height: 0;
  flex: 1;
}

.script-editor-palette__tree {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
}

.script-editor-palette__heading {
  min-height: 32px;
  justify-content: flex-start;
}

.script-editor-palette__heading[data-state="closed"] svg {
  transform: rotate(-90deg);
}

.script-editor-palette__heading .script-editor-palette__swatch {
  margin-inline: 2px;
}
```

Replace selected outline rule:

```css
.script-editor-canvas__surface [data-app-selected="true"] {
  outline: none;
}

.script-editor-canvas__surface .script-rete-node[data-selected="true"],
.script-editor-canvas__surface [data-testid="node"][data-selected="true"],
.script-editor-canvas__surface [data-app-selected="true"] {
  border-color: hsl(var(--foreground) / 0.34) !important;
  box-shadow: 0 0 0 1px hsl(var(--foreground) / 0.08), var(--script-editor-shadow) !important;
}
```

- [ ] **Step 5: Run graph test and typecheck**

Run:

```bash
npm test -- test/script-editor-graph-state.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/script-editor/components/NodePalette.tsx src/features/script-editor/script-editor.css test/script-editor-graph-state.test.ts
git commit -m "feat(phase1): switch component library to vertical tree"
```

## Task 6: Panel-First Output Codegen

**Files:**
- Modify: `src/features/script-editor/codegen/emit/output.ts`
- Modify: `src/features/script-editor/codegen/emit/shared.ts`
- Modify: `test/rete-codegen.test.ts`

- [ ] **Step 1: Add failing output codegen tests**

In `test/rete-codegen.test.ts`, replace the explicit serial output test with:

```ts
it('generates panel-first output calls from config refs', () => {
  const code = generateCodeFromRete(graph([
    { id: '1', key: 'input-manual', data: { content: 'payload' } },
    { id: '2', key: 'output-serial', data: { configRef: { kind: 'panel', panelId: 'COM3' }, mode: 'hex', append: 'CRLF' } },
    { id: '3', key: 'output-tcp', data: { configRef: { kind: 'tcp-endpoint', host: '127.0.0.1', port: 502 }, mode: 'text' } },
    { id: '4', key: 'output-file', data: { path: 'C:/tmp/out.log', mode: '覆盖' } }
  ], [
    { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' },
    { source: '1', sourceOutput: 'out', target: '3', targetInput: 'in' },
    { source: '1', sourceOutput: 'out', target: '4', targetInput: 'in' }
  ]))

  expect(code).toContain('await sendToPanel("COM3", _out_1, "hex", "crlf")')
  expect(code).toContain('await sendTCP("127.0.0.1", 502, _out_1, "text")')
  expect(code).toContain('await writeFile("C:/tmp/out.log", _out_1, "overwrite")')
})
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npm test -- test/rete-codegen.test.ts
```

Expected: FAIL where output generation still reads `portPath` / direct fields only.

- [ ] **Step 3: Add shared config ref reader**

In `emit/shared.ts`, add:

```ts
import type { PanelConfigRef } from '@shared/types'
import { isPanelConfigRef } from '../../panelConfig'

export function configRef(config: Record<string, unknown>): PanelConfigRef {
  return isPanelConfigRef(config.configRef) ? config.configRef : { kind: 'local' }
}
```

- [ ] **Step 4: Update output emitter**

In `emit/output.ts`, import `configRef`:

```ts
import { configRef, data, getInputVar, jsString, valueAsNumber, valueAsString } from './shared'
```

Update the switch cases:

```ts
const ref = configRef(config)

case 'output-serial':
  if (ref.kind === 'panel' && ref.panelId) {
    return `${indent}await sendToPanel(${jsString(ref.panelId)}, ${input}, ${jsString(valueAsString(config.mode, 'text'))}, ${jsString(appendMode(config.append))});\n`
  }
  if (ref.kind === 'serial-port' && ref.portPath) {
    return `${indent}await sendToSerial(${jsString(ref.portPath)}, ${input}, ${jsString(valueAsString(config.mode, 'text'))}, ${jsString(appendMode(config.append))});\n`
  }
  return `${indent}await send(${input}, ${jsString(valueAsString(config.mode, 'text'))}, ${jsString(appendMode(config.append))});\n`
case 'output-panel':
  if (ref.kind === 'panel' && ref.panelId) {
    return `${indent}await sendToPanel(${jsString(ref.panelId)}, ${input}, ${jsString(valueAsString(config.mode, 'text'))}, ${jsString(appendMode(config.append))});\n`
  }
  return `${indent}await send(${input}, ${jsString(valueAsString(config.mode, 'text'))}, ${jsString(appendMode(config.append))});\n`
case 'output-tcp': {
  const host = ref.kind === 'tcp-endpoint' ? ref.host : config.host
  const port = ref.kind === 'tcp-endpoint' ? ref.port : config.port
  return `${indent}await sendTCP(${jsString(valueAsString(host, '127.0.0.1'))}, ${valueAsNumber(port, 8080)}, ${input}, ${jsString(valueAsString(config.mode, 'text'))});\n`
}
case 'output-tcp-server': {
  const port = ref.kind === 'tcp-server' ? ref.port : config.port
  return `${indent}await broadcastTcpServer(${valueAsNumber(port, 9000)}, ${input}, ${jsString(valueAsString(config.mode, 'text'))});\n`
}
```

- [ ] **Step 5: Run codegen tests**

Run:

```bash
npm test -- test/rete-codegen.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/script-editor/codegen/emit/shared.ts src/features/script-editor/codegen/emit/output.ts test/rete-codegen.test.ts
git commit -m "feat(phase1): emit panel-first output calls"
```

## Task 7: Continuous Receive Codegen And Sandbox Helpers

**Files:**
- Modify: `src/features/script-editor/codegen/index.ts`
- Modify: `src/features/script-editor/codegen/emit/input.ts`
- Modify: `src/features/script-editor/codegen/emit/shared.ts`
- Modify: `electron/main.ts`
- Modify: `test/rete-codegen.test.ts`

- [ ] **Step 1: Add failing continuous listener codegen test**

In `test/rete-codegen.test.ts`, add:

```ts
it('wraps real receive inputs in continuous listeners', () => {
  const code = generateCodeFromRete(graph([
    { id: '1', key: 'input-panel', data: { configRef: { kind: 'panel', panelId: 'panel-a' } } },
    { id: '2', key: 'output-log', data: { prefix: 'RX' } }
  ], [
    { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' }
  ]))

  expect(code).toContain('await listenPanelPackets("panel-a")(async (_out_1) => {')
  expect(code).toContain('console.log("[RX] " + _out_1)')
  expect(code).not.toContain('await waitPanelPacket("panel-a"')
})
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npm test -- test/rete-codegen.test.ts
```

Expected: FAIL because codegen still emits one-shot waits.

- [ ] **Step 3: Add receive source emitter**

In `emit/input.ts`, add these helpers above or below `emitInput`. Keep the existing `emitInput` implementation for local one-shot input nodes:

```ts
import type { ReteGraphNode } from '@shared/types'
import { configRef, data, jsString, valueAsNumber, valueAsString } from './shared'

export function isContinuousInputNode(key: string): boolean {
  return key === 'input-panel' || key === 'input-serial' || key === 'input-tcp' || key === 'input-tcp-server'
}

export function continuousListenExpression(node: ReteGraphNode): string {
  const config = data(node)
  const ref = configRef(config)

  switch (node.key) {
    case 'input-panel':
      if (ref.kind === 'panel' && ref.panelId) return `listenPanelPackets(${jsString(ref.panelId)})`
      return 'listenCurrentPackets()'
    case 'input-serial':
      if (ref.kind === 'panel' && ref.panelId) return `listenPanelPackets(${jsString(ref.panelId)})`
      if (ref.kind === 'serial-port' && ref.portPath) return `listenSerialPackets(${jsString(ref.portPath)})`
      return 'listenCurrentPackets()'
    case 'input-tcp': {
      const host = ref.kind === 'tcp-endpoint' ? ref.host : config.host
      const port = ref.kind === 'tcp-endpoint' ? ref.port : config.port
      return `listenTcpPackets(${jsString(valueAsString(host, '127.0.0.1'))}, ${valueAsNumber(port, 8080)})`
    }
    case 'input-tcp-server': {
      const port = ref.kind === 'tcp-server' ? ref.port : config.port
      return `listenTcpServerPackets(${valueAsNumber(port, 9000)})`
    }
    default:
      return 'listenCurrentPackets()'
  }
}
```

- [ ] **Step 4: Update codegen to emit continuous listener roots**

In `codegen/index.ts`, import:

```ts
import { isContinuousInputNode, continuousListenExpression } from './emit/input'
import { emitBranch } from './emit/shared'
```

Inside `generateCodeFromRete`, before the topological loop, identify continuous roots:

```ts
const continuousRoots = graph.nodes.filter((node) => isContinuousInputNode(node.key))
```

Emit each continuous root before normal topo emission:

```ts
for (const node of continuousRoots) {
  const variable = `_out_${String(node.id).replace(/\W/g, '_')}`
  ctx.varMap.set(String(node.id), variable)
  ctx.processedNodes.add(String(node.id))
  const body = emitBranch(ctx, node, 'out', '    ')
  code += `  await ${continuousListenExpression(node)}(async (${variable}) => {\n`
  code += `    if (await checkStop()) return;\n`
  code += body
  code += `  });\n`
}
```

Then keep the existing topo loop for nodes not already marked in `ctx.processedNodes`.

- [ ] **Step 5: Add sandbox continuous helper shell**

In `electron/main.ts`, add these local helpers before `const sandbox: any = {`:

```ts
  const listenScriptPackets = (targetId: string, handler: (value: string) => Promise<void>) => new Promise<void>((resolve, reject) => {
    if (token.aborted) return reject(new Error('ABORTED'))
    if (!targetId) return reject(new Error('未选择串口面板'))

    if (ctx.id === 'test') {
      setTimeout(() => {
        void handler(updateLastRecv(sandboxState, `[测试模式: ${targetId} 持续监听]`))
          .then(resolve)
          .catch(reject)
      }, 100)
      return
    }

    const stopNow = () => {
      removeScriptWatcher(runId)
      resolve()
    }
    token.abortHandlers.add(stopNow)

    const onDataHandler = async (payload: any) => {
      try {
        const txt = updateLastRecv(sandboxState, typeof payload === 'string' ? payload : (payload.text ? payload.text : ''))
        await handler(txt)
      } catch (error) {
        token.abortHandlers.delete(stopNow)
        removeScriptWatcher(runId)
        reject(error)
      }
    }

    addScriptWatcher(targetId, runId, onDataHandler)
  })

  const waitTcpServerPacket = async (port: number, timeout: number = 2147483647): Promise<string> => {
    if (token.aborted) throw new Error('ABORTED')

    if (ctx.id === 'test') {
      await new Promise(r => setTimeout(r, 100))
      return updateLastRecv(sandboxState, `[测试模式: TCP服务器${port}收到数据]`)
    }

    const serverId = `tcpServer:${port}`
    if (!tcpServers.has(serverId)) {
      const result = await ensureTcpServer(port, serverId)
      if (!result.ok) throw new Error(result.error || 'TCP服务器启动失败')
    }

    return new Promise<string>((resolve, reject) => {
      let timer: any
      let timeoutTimer: any
      let settled = false
      const stopNow = () => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        if (timeoutTimer) clearTimeout(timeoutTimer)
        reject(new Error('ABORTED'))
      }
      token.abortHandlers.add(stopNow)

      const poll = () => {
        if (settled) return
        if (token.aborted) return stopNow()
        if (tcpServerDataBuffer.has(serverId)) {
          settled = true
          token.abortHandlers.delete(stopNow)
          if (timer) clearTimeout(timer)
          if (timeoutTimer) clearTimeout(timeoutTimer)
          const data = tcpServerDataBuffer.get(serverId) || ''
          tcpServerDataBuffer.delete(serverId)
          resolve(updateLastRecv(sandboxState, data))
          return
        }
        timer = setTimeout(poll, 50)
      }

      if (timeout > 0 && timeout < 2147483647) {
        timeoutTimer = setTimeout(() => {
          if (settled) return
          settled = true
          token.abortHandlers.delete(stopNow)
          if (timer) clearTimeout(timer)
          resolve(updateLastRecv(sandboxState, '[超时: 无数据]'))
        }, timeout)
      }

      poll()
    })
  }
```

Move the server creation logic currently inside `sandbox.waitTcpServer` into a local helper used by both one-shot and continuous APIs:

```ts
  const ensureTcpServer = async (port: number, serverId = `tcpServer:${port}`): Promise<{ ok: boolean; error?: string }> => {
    if (tcpServers.has(serverId)) return { ok: true }

    return new Promise<any>((resolve) => {
      const server = net.createServer()
      const clients = new Set<any>()

      server.on('connection', (sock) => {
        try { sock.setNoDelay(true) } catch { }
        clients.add(sock)

        sock.on('data', (buf) => {
          const data = buf.toString('utf8')
          tcpServerDataBuffer.set(serverId, data)
        })

        sock.on('close', () => clients.delete(sock))
        sock.on('error', () => { try { sock.destroy() } catch { } clients.delete(sock) })
      })

      server.listen(port, '0.0.0.0', () => {
        tcpServers.set(serverId, { server, port, clients })
        resolve({ ok: true })
      }).on('error', (err) => resolve({ ok: false, error: err.message }))
    })
  }
```

Inside `sandbox`, add continuous listener factories and change `waitTcpServer` to use `waitTcpServerPacket`:

```ts
    listenCurrentPackets: () => (handler: (value: string) => Promise<void>) => listenScriptPackets(ctx.id, handler),
    listenPanelPackets: (panelId: string) => (handler: (value: string) => Promise<void>) => listenScriptPackets(String(panelId || '').trim(), handler),
    listenSerialPackets: (portPath: string) => (handler: (value: string) => Promise<void>) => {
      const targetId = getPortId(String(portPath || '').trim())
      if (!targetId) throw new Error('未选择串口')
      return listenScriptPackets(targetId, handler)
    },
    listenTcpPackets: (host: string, port: number) => (handler: (value: string) => Promise<void>) => new Promise<void>((resolve, reject) => {
      if (token.aborted) return reject(new Error('ABORTED'))

      if (ctx.id === 'test') {
        setTimeout(() => {
          void handler(updateLastRecv(sandboxState, `[测试模式: TCP ${host}:${port} 持续监听]`))
            .then(resolve)
            .catch(reject)
        }, 100)
        return
      }

      const socket = net.createConnection({ host, port })
      const stopNow = () => {
        try { socket.destroy() } catch { }
        resolve()
      }
      token.abortHandlers.add(stopNow)

      socket.on('data', (buf) => {
        void handler(updateLastRecv(sandboxState, buf.toString('utf8'))).catch((error) => {
          token.abortHandlers.delete(stopNow)
          try { socket.destroy() } catch { }
          reject(error)
        })
      })
      socket.on('error', (error) => {
        token.abortHandlers.delete(stopNow)
        reject(error)
      })
      socket.on('close', () => {
        token.abortHandlers.delete(stopNow)
        resolve()
      })
    }),
    listenTcpServerPackets: (port: number) => async (handler: (value: string) => Promise<void>) => {
      while (!token.aborted) {
        const value = await waitTcpServerPacket(port, 2147483647)
        await handler(value)
      }
    },
    waitTcpServer: (port: number, timeout: number = 5000) => waitTcpServerPacket(port, timeout),
```

- [ ] **Step 6: Run codegen tests**

Run:

```bash
npm test -- test/rete-codegen.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/script-editor/codegen/index.ts src/features/script-editor/codegen/emit/input.ts src/features/script-editor/codegen/emit/shared.ts electron/main.ts test/rete-codegen.test.ts
git commit -m "feat(phase1): generate continuous receive listeners"
```

## Task 8: Full Regression And Manual Verification

**Files:**
- Verify only unless failures require targeted fixes.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run app for manual verification**

Run:

```bash
npm run dev
```

Expected: Electron/Vite dev workflow starts without TypeScript or Vite errors.

- [ ] **Step 4: Manual verification checklist**

In the running app:

```text
1. 打开脚本编辑器。
2. 点击左侧“组件”，确认组件库是纵向树，输入类默认展开。
3. 添加“接收串口”，确认配置面板显示面板/串口目标和继承串口参数。
4. 在没有活动串口面板时添加“接收串口”，确认显示默认基础参数提示。
5. 添加“发送面板”或“发送串口”，确认输出节点也显示配置引用。
6. 选中节点，确认没有突兀蓝色粗框。
7. 运行含接收面板 -> 日志输出的脚本，确认脚本保持运行直到点击停止。
8. 点击停止，确认输出面板出现结束状态，后续数据不再触发脚本。
```

- [ ] **Step 5: Record manual result in final implementation notes**

Do not create a new doc. Record the checklist result in the final response for the implementation task.

- [ ] **Step 6: Commit any final test-only or CSS fixes**

If Step 1-4 required fixes, commit them:

```bash
git add <changed-files>
git commit -m "fix(phase1): stabilize panel config regressions"
```

If no fixes were needed, skip this commit.
