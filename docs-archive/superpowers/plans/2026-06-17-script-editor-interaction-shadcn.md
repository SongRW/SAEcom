# 脚本编辑器交互修复 + shadcn 改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让脚本编辑器三种鼠标工具真正生效、双击节点稳定打开配置、并把 7 处仍手写的界面改造为 shadcn 组件。

**Architecture:** 把画布交互拆成可单测的纯函数模块 `canvasInteraction.ts`（工具能力映射、框选数学、双击手势），在 `GraphCanvas`/`rete/setup.ts` 用 Rete 支持的源头机制绑定（`area.area.setDragHandler` 守卫平移、自绘覆盖层做框选、单一双击路径），选择状态升级为多选；shadcn 改造通过官方 CLI 引入新基元后逐组件替换，两处高风险项仅做 CSS 视觉对齐。

**Tech Stack:** TypeScript/TSX、React、Rete.js v2（`rete`, `rete-area-plugin`）、shadcn/ui + Tailwind、Vitest（Node 环境）。

**Spec:** `docs/superpowers/specs/2026-06-17-script-editor-interaction-shadcn-design.md`

**约定提醒：** 新文件 2 空格缩进、不写分号；Conventional Commits 带 phase scope（如 `feat(phase1): …`）；提交前 `npm run typecheck` + `npm test`；`npm run dev` 必须经 `scripts/dev.js`。

**与 spec 的细化说明（执行者须知）：**
- 平移门控改用 `area.area.setDragHandler` 的 `Drag` 守卫（可靠），不再用信号 pipe 拦 `translate`（拦不住已发生的平移）。节点是否可拖/可点继续由「工具 class + `pointer-events`」与既有 `nodepicked` pipe 守卫控制。
- 多选：实现「框选 → 多选高亮 + 整组删除 + 整组拖动」。整组拖动为最高风险项，单列一个任务并要求 dev 手测。
- 两处 ⚠（对话框外壳、Rete 节点本体）只做 CSS 视觉统一，不动结构。

---

## File Structure

**Phase 1 纯逻辑**
- Create `src/features/script-editor/canvasInteraction.ts` — 工具能力映射、框选矩形/命中、双击手势（纯函数）。
- Create `test/script-editor-canvas-interaction.test.ts`。

**Phase 2 交互绑定**
- Modify `src/features/script-editor/rete/setup.ts` — 暴露 `Drag`/`selector` 钩子、双击单一路径。
- Modify `src/features/script-editor/components/GraphCanvas.tsx` — 平移守卫、框选覆盖层、多选、整组删除/拖动、ContextMenu。
- Modify `src/features/script-editor/nodeInteraction.ts` — 精简调试脚手架、收敛手势导出。
- Modify `src/features/script-editor/ScriptEditorDialog.tsx` — `selectedNodeId` → `selectedNodeIds`。
- Modify `src/features/script-editor/uiState.ts` — 无结构变化（仅确认多选语义）。
- Modify `src/features/script-editor/script-editor.css` — 工具 class、框选层、多选高亮、视觉对齐。

**Phase 3 shadcn 基元 + 改造**
- Create `src/components/ui/{input,label,tabs,context-menu,badge}.tsx`（CLI 生成）。
- Modify `components/ScriptList.tsx`、`NodePalette.tsx`、`ScriptOutputPanel.tsx`、`NodeConfigPanel.tsx`、`GraphCanvas.tsx`（右键菜单换 ContextMenu）。

**测试**
- Update `test/script-editor-node-interaction.test.ts`、`test/script-editor-ui-state.test.ts`。

---

## Phase 1 — 画布交互纯逻辑（TDD）

### Task 1: 工具能力映射 `getToolCapabilities`

**Files:**
- Create: `src/features/script-editor/canvasInteraction.ts`
- Test: `test/script-editor-canvas-interaction.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { getToolCapabilities } from '../src/features/script-editor/canvasInteraction'

describe('canvas tool capabilities', () => {
  it('maps each tool to concrete capabilities', () => {
    expect(getToolCapabilities('pointer')).toEqual({
      nodeDrag: true,
      areaPan: true,
      nodeInteractive: true,
      marquee: false
    })
    expect(getToolCapabilities('pan')).toEqual({
      nodeDrag: false,
      areaPan: true,
      nodeInteractive: false,
      marquee: false
    })
    expect(getToolCapabilities('select')).toEqual({
      nodeDrag: true,
      areaPan: false,
      nodeInteractive: true,
      marquee: true
    })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/script-editor-canvas-interaction.test.ts -t "maps each tool"`
Expected: FAIL（`getToolCapabilities` 未定义）。

- [ ] **Step 3: 写最小实现**

```ts
import type { CanvasTool } from './uiState'

export interface ToolCapabilities {
  nodeDrag: boolean
  areaPan: boolean
  nodeInteractive: boolean
  marquee: boolean
}

export function getToolCapabilities(tool: CanvasTool): ToolCapabilities {
  if (tool === 'pan') {
    return { nodeDrag: false, areaPan: true, nodeInteractive: false, marquee: false }
  }
  if (tool === 'select') {
    return { nodeDrag: true, areaPan: false, nodeInteractive: true, marquee: true }
  }
  return { nodeDrag: true, areaPan: true, nodeInteractive: true, marquee: false }
}
```

> 说明：`pan` 下 `nodeInteractive:false`（CSS `pointer-events:none` 让节点既不可点也不可拖）；`select` 下 `areaPan:false`（空白拖拽用于框选而非平移），节点仍可点选/拖动。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/script-editor-canvas-interaction.test.ts -t "maps each tool"`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/features/script-editor/canvasInteraction.ts test/script-editor-canvas-interaction.test.ts
git commit -m "feat(phase1): add canvas tool capability mapping"
```

---

### Task 2: 框选矩形与命中（纯函数）

**Files:**
- Modify: `src/features/script-editor/canvasInteraction.ts`
- Test: `test/script-editor-canvas-interaction.test.ts`

- [ ] **Step 1: 写失败测试（追加到现有 describe 同文件）**

```ts
import { computeMarqueeRect, nodesInMarquee } from '../src/features/script-editor/canvasInteraction'

describe('marquee selection geometry', () => {
  it('normalizes a drag rect regardless of direction', () => {
    expect(computeMarqueeRect({ x: 100, y: 80 }, { x: 40, y: 200 })).toEqual({
      left: 40, top: 80, right: 100, bottom: 200
    })
  })

  it('selects nodes whose rect intersects the marquee', () => {
    const rects = [
      { id: 'a', rect: { left: 0, top: 0, right: 50, bottom: 50 } },
      { id: 'b', rect: { left: 200, top: 200, right: 260, bottom: 260 } },
      { id: 'c', rect: { left: 30, top: 30, right: 90, bottom: 90 } }
    ]
    const marquee = { left: 20, top: 20, right: 100, bottom: 100 }
    expect(nodesInMarquee(rects, marquee)).toEqual(['a', 'c'])
  })

  it('returns empty when nothing intersects', () => {
    const rects = [{ id: 'a', rect: { left: 0, top: 0, right: 10, bottom: 10 } }]
    expect(nodesInMarquee(rects, { left: 50, top: 50, right: 60, bottom: 60 })).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/script-editor-canvas-interaction.test.ts -t "marquee"`
Expected: FAIL（`computeMarqueeRect`/`nodesInMarquee` 未定义）。

- [ ] **Step 3: 写实现（追加到 `canvasInteraction.ts`）**

```ts
export interface Point {
  x: number
  y: number
}

export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

export interface NodeRect {
  id: string
  rect: Bounds
}

export function computeMarqueeRect(start: Point, current: Point): Bounds {
  return {
    left: Math.min(start.x, current.x),
    top: Math.min(start.y, current.y),
    right: Math.max(start.x, current.x),
    bottom: Math.max(start.y, current.y)
  }
}

function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

export function nodesInMarquee(nodeRects: NodeRect[], marquee: Bounds): string[] {
  return nodeRects.filter((node) => boundsIntersect(node.rect, marquee)).map((node) => node.id)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/script-editor-canvas-interaction.test.ts -t "marquee"`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/features/script-editor/canvasInteraction.ts test/script-editor-canvas-interaction.test.ts
git commit -m "feat(phase1): add marquee rect + hit-test helpers"
```

---

### Task 3: 收敛双击手势到单一入口

**Files:**
- Modify: `src/features/script-editor/canvasInteraction.ts`
- Modify: `src/features/script-editor/nodeInteraction.ts`
- Test: `test/script-editor-canvas-interaction.test.ts`、`test/script-editor-node-interaction.test.ts`

- [ ] **Step 1: 写失败测试（追加到 canvas-interaction 测试文件）**

```ts
import { shouldOpenNodeConfig } from '../src/features/script-editor/canvasInteraction'

describe('open-config gesture', () => {
  it('opens on native dblclick', () => {
    expect(shouldOpenNodeConfig('dblclick', 0)).toBe(true)
  })
  it('opens on the second click of a sequence', () => {
    expect(shouldOpenNodeConfig('click', 1)).toBe(false)
    expect(shouldOpenNodeConfig('click', 2)).toBe(true)
  })
  it('ignores other event types', () => {
    expect(shouldOpenNodeConfig('pointerdown', 2)).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/script-editor-canvas-interaction.test.ts -t "open-config"`
Expected: FAIL（`shouldOpenNodeConfig` 未定义）。

- [ ] **Step 3: 写实现（追加到 `canvasInteraction.ts`）**

```ts
export function shouldOpenNodeConfig(eventType: string, detail: number): boolean {
  if (eventType === 'dblclick') return true
  if (eventType === 'click') return detail >= 2
  return false
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/script-editor-canvas-interaction.test.ts -t "open-config"`
Expected: PASS

- [ ] **Step 5: 精简 `nodeInteraction.ts` 旧手势导出**

把 `nodeInteraction.ts` 中的 `shouldOpenConfigFromClickDetail` / `shouldOpenConfigFromCanvasGesture` 删除（手势统一走 `canvasInteraction.shouldOpenNodeConfig`），保留 `SCRIPT_NODE_OPEN_CONFIG_EVENT`、`debugScriptNodeInteraction`、`describeInteractionTarget`、`describePointerInteractionEvent`、调试桥与 `isScriptNodeInteractionDebugEnabled`。

- [ ] **Step 6: 更新 `test/script-editor-node-interaction.test.ts`**

把该文件改为只验证仍保留的导出：

```ts
import { describe, expect, it } from 'vitest'
import { SCRIPT_NODE_OPEN_CONFIG_EVENT } from '../src/features/script-editor/nodeInteraction'

describe('script editor node interaction', () => {
  it('uses a stable custom event for node config opening', () => {
    expect(SCRIPT_NODE_OPEN_CONFIG_EVENT).toBe('saecom:script-node-open-config')
  })
})
```

- [ ] **Step 7: 运行受影响测试**

Run: `npx vitest run test/script-editor-canvas-interaction.test.ts test/script-editor-node-interaction.test.ts`
Expected: PASS（全部）。

- [ ] **Step 8: 提交**

```bash
git add src/features/script-editor/canvasInteraction.ts src/features/script-editor/nodeInteraction.ts test/script-editor-canvas-interaction.test.ts test/script-editor-node-interaction.test.ts
git commit -m "feat(phase1): consolidate node config open gesture"
```

---

## Phase 2 — 交互绑定到 Rete / 画布

### Task 4: 用 `setDragHandler` 守卫平移，去掉信号 pipe 拦截

**Files:**
- Modify: `src/features/script-editor/rete/setup.ts`
- Modify: `src/features/script-editor/components/GraphCanvas.tsx`

- [ ] **Step 1: `setup.ts` 暴露能力守卫钩子**

在 `setup.ts` 顶部 import 增加 `Drag`：

```ts
import { AreaExtensions, AreaPlugin, Drag } from 'rete-area-plugin'
```

在 `createReteEditor` 内、`editor.use(area)` 等装配之后、`return` 之前，安装一个读取「当前能力」的平移守卫，并把更新函数挂到实例上：

```ts
  let areaPanAllowed = true
  area.area.setDragHandler(new Drag({
    down: () => areaPanAllowed,
    move: () => true
  }))
```

在 `ReteEditorInstance` 接口里加：

```ts
  setAreaPanEnabled: (enabled: boolean) => void
```

并在 `return { … }` 对象里加：

```ts
    setAreaPanEnabled: (enabled: boolean) => { areaPanAllowed = enabled },
```

- [ ] **Step 2: `GraphCanvas.tsx` 改用能力，删除平移信号拦截**

引入能力：

```ts
import { getToolCapabilities, type ToolCapabilities } from '../canvasInteraction'
```

把 `behaviorRef` 替换为能力 ref：

```ts
  const capabilitiesRef = useRef<ToolCapabilities>(getToolCapabilities(tool))
```

更新 `tool` 的 effect：

```ts
  useEffect(() => {
    capabilitiesRef.current = getToolCapabilities(tool)
    reteRef.current?.setAreaPanEnabled(capabilitiesRef.current.areaPan)
  }, [tool])
```

在创建编辑器的 effect 里（拿到 `instance` 后）立即同步一次：

```ts
    instance.setAreaPanEnabled(capabilitiesRef.current.areaPan)
```

在 `instance.area.addPipe(...)` 中**删除** `translate`/`translated` 两个 `return undefined` 分支（平移已由 setDragHandler 守卫）。`nodepicked`/`nodetranslate` 分支改用能力字段：`allowNodePick` → `capabilitiesRef.current.nodeInteractive`，`allowNodeDrag` → `capabilitiesRef.current.nodeDrag`。

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 通过（无未用变量、无类型错误）。

- [ ] **Step 4: dev 手测平移门控**

Run: `npm run dev`，打开脚本编辑器，添加 2 个节点：
- 「拖动画布」工具：空白拖动可平移，节点不可拖。
- 「选择」工具：空白拖动**不**平移（为下个任务的框选留出手势）。
- 「指针」工具：空白拖动可平移、节点可拖。

Expected: 三者表现如上（框选尚未实现，select 下空白拖动暂无可视反馈是正常的）。

- [ ] **Step 5: 提交**

```bash
git add src/features/script-editor/rete/setup.ts src/features/script-editor/components/GraphCanvas.tsx
git commit -m "fix(phase1): gate canvas panning via drag handler per tool"
```

---

### Task 5: 双击节点 → 单一可靠路径打开配置

**Files:**
- Modify: `src/features/script-editor/rete/setup.ts`
- Modify: `src/features/script-editor/components/GraphCanvas.tsx`

- [ ] **Step 1: `setup.ts` 节点只保留一条派发路径**

在 `ScriptClassicNode` 的根 div 上，把 `onClick`(detail) 与 `onDoubleClick` 两个处理合并为**仅** `onDoubleClick` 派发自定义事件（删除 onClick 里的 `emitOpenConfigEvent` 调用，onClick 仅保留调试日志或一并删除）：

```ts
      onDoubleClick: (event) => {
        emitOpenConfigEvent(event.currentTarget, data.id, 'dblclick')
      },
```

`emitOpenConfigEvent` 保留不变（派发 `SCRIPT_NODE_OPEN_CONFIG_EVENT`，bubbles）。删除 `setup.ts` 中对 `shouldOpenConfigFromClickDetail` 的 import（Task 3 已移除该导出）。

- [ ] **Step 2: `GraphCanvas.tsx` 删除重复的 capture 指针手势监听**

在监听 effect 中，**删除** `container.addEventListener('click'/'dblclick', openNodeConfigFromPointerGesture, true)` 这两条与 `openNodeConfigFromPointerGesture` 函数，只保留对自定义事件的监听：

```ts
  useEffect(() => {
    const container = canvasRef.current
    if (!container) return
    const openNodeConfigFromCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: string }>
      const nodeId = customEvent.detail?.id || getNodeIdFromEventTarget(reteRef.current, event.target)
      if (!nodeId) return
      onNodeDoubleClickRef.current(nodeId)
    }
    container.addEventListener(SCRIPT_NODE_OPEN_CONFIG_EVENT, openNodeConfigFromCustomEvent)
    return () => container.removeEventListener(SCRIPT_NODE_OPEN_CONFIG_EVENT, openNodeConfigFromCustomEvent)
  }, [])
```

清理因此不再使用的 import（`shouldOpenConfigFromCanvasGesture`、`getNodeIdFromPointerEvent` 若仅此处用到则保留给右键命中——见 Task 9，不要误删）。

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 4: dev 手测双击**

Run: `npm run dev`，双击任一节点。
Expected: 右侧「节点配置」抽屉打开并显示该节点参数；单击只选中、不打开。

- [ ] **Step 5: 提交**

```bash
git add src/features/script-editor/rete/setup.ts src/features/script-editor/components/GraphCanvas.tsx
git commit -m "fix(phase1): open node config via single dblclick path"
```

---

### Task 6: 选择状态升级为多选（`selectedNodeIds`）

**Files:**
- Modify: `src/features/script-editor/ScriptEditorDialog.tsx`
- Modify: `src/features/script-editor/components/GraphCanvas.tsx`
- Modify: `src/features/script-editor/components/NodeConfigPanel.tsx`

- [ ] **Step 1: Dialog 状态由单选改多选**

在 `ScriptEditorDialog.tsx`：

```ts
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
```

新增派生单选 id 与多选辅助：

```ts
  const singleSelectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null
```

把原先所有 `setSelectedNodeId(x)` 调用改为：
- 选中单个：`setSelectedNodeIds(x ? [x] : [])`
- `addNode` 内 `setSelectedNodeId(next.nodes[...].id || null)` → `setSelectedNodeIds(id ? [id] : [])`
- `duplicateNode` 同理。
- 各处 `setSelectedNodeId(null)`（select/create/delete/save 流程）→ `setSelectedNodeIds([])`。

- [ ] **Step 2: 传给 GraphCanvas / NodeConfigPanel 的 props 调整**

`GraphCanvas` props：把 `selectedNodeId` 换成 `selectedNodeIds: string[]` 与 `onSelectNodes: (ids: string[]) => void`；`onSelectNode` 回调改为 `onSelectNodes`。Dialog 传：

```tsx
            <GraphCanvas
              graph={graph}
              selectedNodeIds={selectedNodeIds}
              tool={uiState.canvasTool}
              zoom={zoom}
              onDeleteSelectedNodes={() => {
                setSelectedNodeIds([])
                setUiState(onSelectedNodeDeleted)
              }}
              onDropNode={addNode}
              onDuplicateNode={duplicateNode}
              onGraphChange={setGraph}
              onOpenNodes={() => setUiState((current) => current.paletteExpanded ? current : toggleScriptPalette(current))}
              onResetView={() => setZoom(1)}
              onNodeDoubleClick={(id) => {
                setSelectedNodeIds([id])
                setUiState(onNodeDoubleClick)
              }}
              onSelectNodes={setSelectedNodeIds}
            />
```

`NodeConfigPanel` 仍单选：传 `selectedNodeId={singleSelectedNodeId}`，并新增多选计数提示 prop：

```tsx
              <NodeConfigPanel
                graph={graph}
                selectedNodeId={singleSelectedNodeId}
                selectedCount={selectedNodeIds.length}
                refreshingPanels={refreshingPanels}
                refreshingPorts={refreshingPorts}
                serialPanelOptions={serialPanelOptions}
                serialPortOptions={serialPortOptions}
                onDeleted={() => {
                  setSelectedNodeIds([])
                  setUiState(onNodeDeleted)
                }}
                onGraphChange={setGraph}
                onRefreshPanels={refreshSerialPanels}
                onRefreshPorts={refreshSerialPorts}
              />
```

- [ ] **Step 3: GraphCanvas 内部消费多选**

在 `GraphCanvas.tsx`：
- 新增 `const selectedIdsRef = useRef<string[]>(selectedNodeIds)` 并用 effect 同步：`useEffect(() => { selectedIdsRef.current = selectedNodeIds }, [selectedNodeIds])`。
- `area.addPipe` 中 `nodepicked` 分支：`onSelectNodes([context.data.id])`（单击替换选择为该节点）。
- 多选高亮反映到 DOM：新增 effect 在 `selectedNodeIds`/`graph` 变化后给节点元素打标记：

```ts
  useEffect(() => {
    const instance = reteRef.current
    if (!instance) return
    const selected = new Set(selectedNodeIds)
    for (const [id, view] of instance.area.nodeViews) {
      view.element.toggleAttribute('data-app-selected', selected.has(id))
    }
  }, [selectedNodeIds, graph])
```

- 删除：把 `onKeyDown` 的 Delete 分支改为删除全部选中：

```ts
      onKeyDown={(event) => {
        if ((event.key !== 'Delete' && event.key !== 'Backspace') || selectedNodeIds.length === 0) return
        event.preventDefault()
        let next = graphRef.current
        for (const id of selectedNodeIds) next = removeGraphNode(next, id)
        onGraphChange(next)
        onDeleteSelectedNodes()
      }}
```

把原 `deleteNode` 单节点逻辑保留给右键菜单单节点删除（Task 9 使用），但其调用的 `onDeleteSelectedNode()` 改名为 `onDeleteSelectedNodes()`。

- [ ] **Step 4: NodeConfigPanel 显示多选提示**

在 `NodeConfigPanel` 增加 `selectedCount?: number` prop；当 `!selectedNode` 且 `selectedCount && selectedCount > 1` 时显示：

```tsx
  if (!selectedNode) {
    if (selectedCount && selectedCount > 1) {
      return <div className="script-editor-inspector__empty">已选 {selectedCount} 个节点（单选 1 个可编辑参数）</div>
    }
    return <div className="script-editor-inspector__empty">选择节点后配置参数与连线</div>
  }
```

- [ ] **Step 5: typecheck + 测试**

Run: `npm run typecheck && npm test`
Expected: 通过（`ui-state` 测试不受影响；如有引用 `selectedNodeId` 的旧 prop 名编译错，按上面改名修正）。

- [ ] **Step 6: dev 手测**

Run: `npm run dev`。单击节点 → 仅该节点高亮；双击 → 配置打开；选中 2 个（先做完 Task 7 框选后回归）。当前可先验证单选 + 单选删除。

- [ ] **Step 7: 提交**

```bash
git add src/features/script-editor/ScriptEditorDialog.tsx src/features/script-editor/components/GraphCanvas.tsx src/features/script-editor/components/NodeConfigPanel.tsx
git commit -m "feat(phase1): upgrade canvas selection to multi-select"
```

---

### Task 7: 框选覆盖层（select 模式）

**Files:**
- Modify: `src/features/script-editor/components/GraphCanvas.tsx`
- Modify: `src/features/script-editor/script-editor.css`

- [ ] **Step 1: 在画布上加框选状态与覆盖层**

在 `GraphCanvas` 组件内新增：

```ts
  const [marquee, setMarquee] = useState<Bounds | null>(null)
  const marqueeStartRef = useRef<Point | null>(null)
```

（`Bounds`/`Point` 从 `../canvasInteraction` import；同时 import `computeMarqueeRect`、`nodesInMarquee`。）

在 `<main>` 上增加指针处理（只在 `capabilitiesRef.current.marquee` 时启动，且按下点不在节点上）：

```tsx
      onPointerDown={(event) => {
        if (!capabilitiesRef.current.marquee || event.button !== 0) return
        if (getNodeIdFromEventTarget(reteRef.current, event.target)) return
        marqueeStartRef.current = { x: event.clientX, y: event.clientY }
        setMarquee({ left: event.clientX, top: event.clientY, right: event.clientX, bottom: event.clientY })
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const start = marqueeStartRef.current
        if (!start) return
        setMarquee(computeMarqueeRect(start, { x: event.clientX, y: event.clientY }))
      }}
      onPointerUp={() => {
        const rect = marquee
        marqueeStartRef.current = null
        setMarquee(null)
        if (!rect || !reteRef.current) return
        const nodeRects = [...reteRef.current.area.nodeViews].map(([id, view]) => {
          const r = view.element.getBoundingClientRect()
          return { id, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
        })
        onSelectNodes(nodesInMarquee(nodeRects, rect))
      }}
```

在 `<div className="script-editor-canvas__surface">` 同级渲染覆盖层（client 坐标转为相对画布）：

```tsx
      {marquee ? (
        <div
          className="script-editor-marquee"
          style={getMarqueeStyle(marquee, canvasRef.current)}
        />
      ) : null}
```

并加辅助函数（放在文件底部其它 helper 旁）：

```ts
function getMarqueeStyle(marquee: Bounds, canvas: HTMLElement | null): { left: number; top: number; width: number; height: number } {
  const rect = canvas?.getBoundingClientRect()
  const offsetX = rect?.left ?? 0
  const offsetY = rect?.top ?? 0
  return {
    left: marquee.left - offsetX,
    top: marquee.top - offsetY,
    width: marquee.right - marquee.left,
    height: marquee.bottom - marquee.top
  }
}
```

- [ ] **Step 2: 框选层样式**

在 `script-editor.css` 追加：

```css
.script-editor-marquee {
  position: absolute;
  z-index: 4;
  border: 1px solid hsl(var(--primary));
  background: hsl(var(--primary) / 0.12);
  pointer-events: none;
}

.script-editor-canvas__surface [data-app-selected="true"] {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 1px;
}
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 4: dev 手测框选**

Run: `npm run dev`。切到「选择」工具，在空白处拖出选框覆盖多个节点 → 松开后这些节点高亮（`data-app-selected`）；按 Del 整组删除。

Expected: 框选可视、命中正确、整组删除生效。

- [ ] **Step 5: 提交**

```bash
git add src/features/script-editor/components/GraphCanvas.tsx src/features/script-editor/script-editor.css
git commit -m "feat(phase1): add marquee box-selection in select tool"
```

---

### Task 8: 整组拖动（高风险，需手测）

**Files:**
- Modify: `src/features/script-editor/components/GraphCanvas.tsx`

- [ ] **Step 1: 拖动被选中节点时同步平移其余选中节点**

在 `area.addPipe` 中：
- `nodepicked`：记录拖动起始时所有选中节点的位置快照：

```ts
      if (context.type === 'nodepicked') {
        onSelectNodes(
          selectedIdsRef.current.includes(context.data.id) ? selectedIdsRef.current : [context.data.id]
        )
        dragStartPositionsRef.current = new Map(
          graphRef.current.nodes
            .filter((node) => selectedIdsRef.current.includes(node.id))
            .map((node) => [node.id, { ...node.position }])
        )
      }
```

- `nodetranslated`：以被拖动节点的位移为 delta，应用到其余选中节点，并同步它们的 Rete 视图：

```ts
      if (context.type === 'nodetranslated') {
        const dragged = context.data.id
        const startMap = dragStartPositionsRef.current
        const start = startMap.get(dragged)
        let nextGraph = updateGraphNodePosition(graphRef.current, dragged, context.data.position)
        if (start && selectedIdsRef.current.length > 1) {
          const dx = context.data.position.x - start.x
          const dy = context.data.position.y - start.y
          for (const id of selectedIdsRef.current) {
            if (id === dragged) continue
            const s = startMap.get(id)
            if (!s) continue
            const moved = { x: s.x + dx, y: s.y + dy }
            nextGraph = updateGraphNodePosition(nextGraph, id, moved)
            void reteRef.current?.area.translate(id, moved)
          }
        }
        onGraphChange(nextGraph)
      }
```

新增 ref：`const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())`。

> 风险点：`area.translate` 在 `nodetranslated` 处理中调用可能触发再入；`syncingRef` 已在 pipe 开头 `if (syncingRef.current) return context` 拦截 sync 期间事件，但程序化 translate 不经过该守卫。若出现抖动，改为仅更新图状态、在 `pointerUp` 后一次性 `syncReteEditorFromGraph` 重排。

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 3: dev 手测整组拖动**

Run: `npm run dev`。框选 2-3 个节点 → 拖动其中一个 → 其余选中节点同步移动且无抖动/错位；保存后重开脚本位置正确。

Expected: 整组移动正确。若抖动，按 Step 1 风险点的兜底方案改实现并重测。

- [ ] **Step 4: 提交**

```bash
git add src/features/script-editor/components/GraphCanvas.tsx
git commit -m "feat(phase1): move whole selection when dragging a selected node"
```

---

### Task 9: 右键菜单换 shadcn ContextMenu

**Files:**
- Modify: `src/features/script-editor/components/GraphCanvas.tsx`
- Create: `src/components/ui/context-menu.tsx`（见 Task 10 一并安装）

> 依赖 Task 10 已安装 `context-menu`；若按顺序执行，可把本任务排在 Task 10 之后。这里集中描述替换逻辑。

- [ ] **Step 1: 用命中判断决定菜单内容**

保留现有 `getNodeIdFromPointerEvent`。新增状态记录右键命中的节点：

```ts
  const [contextNodeId, setContextNodeId] = useState<string | null>(null)
```

- [ ] **Step 2: 用 ContextMenu 包裹画布触发区，替换手写菜单**

import：

```ts
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
```

把 `<main>` 整体包进 `<ContextMenu>`，`<ContextMenuTrigger asChild>` 包 `<main>`；在 `<main>` 的 `onContextMenu`（capture）里只负责判定命中并选中：

```tsx
      onContextMenuCapture={(event) => {
        const nodeId = getNodeIdFromPointerEvent(reteRef.current, event)
        setContextNodeId(nodeId)
        if (nodeId) onSelectNodes([nodeId])
      }}
```

（移除原 `onContextMenu` 里 `event.preventDefault()` 与 `setContextMenu(...)`；Radix ContextMenu 自行接管右键与定位。）删除原 `contextMenu` 状态、`contextMenuRef`、其 dismiss effect、`CONTEXT_MENU_POINTER_DISMISS_OPTIONS` 用法、`shouldDismissContextMenuForPointerTarget` 用法，以及自写的 `.script-editor-context-menu` JSX 与 `ContextMenuButton` 组件、`getContextDropPosition`。

菜单内容按 `contextNodeId` 渲染：

```tsx
      <ContextMenuContent className="script-editor-context-menu">
        {contextNodeId ? (
          <>
            <ContextMenuItem onSelect={() => onNodeDoubleClick(contextNodeId)}>
              配置节点 <ContextMenuShortcut>双击</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onDuplicateNode(contextNodeId)}>复制节点</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onSelect={() => {
                onGraphChange(removeGraphNode(graphRef.current, contextNodeId))
                onDeleteSelectedNodes()
              }}
            >
              删除节点 <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem onSelect={onOpenNodes}>打开组件树</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onDropNode('input-serial', getNextCanvasNodePosition)}>添加接收串口</ContextMenuItem>
            <ContextMenuItem onSelect={() => onDropNode('transform-hex', getNextCanvasNodePosition)}>添加 HEX 转换</ContextMenuItem>
            <ContextMenuItem onSelect={() => onDropNode('output-serial', getNextCanvasNodePosition)}>添加发送串口</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onResetView}>重置视图</ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
```

> 注：空白处「添加节点」改用 `getNextCanvasNodePosition`（已从 `../viewModel` 引入；`onDropNode` 接受 `position | (graph)=>position`），不再依赖右键坐标，省掉手写定位。`onDropNode` 的函数签名已支持传入 `getNextCanvasNodePosition`。需 import：`import { getNextCanvasNodePosition } from '../viewModel'`。

- [ ] **Step 3: typecheck + 测试**

Run: `npm run typecheck && npm test`
Expected: 通过。`ui-state` 测试中关于 `CONTEXT_MENU_POINTER_DISMISS_OPTIONS`/`shouldDismissContextMenuForPointerTarget` 的用例：这两个导出若不再被组件使用，可保留导出与用例不动（纯函数无害）；若一并删除导出，则同步删除对应用例。**本计划选择保留**这两个 uiState 导出与其单测，避免牵连。

- [ ] **Step 4: dev 手测右键**

Run: `npm run dev`。在节点上右键 → 出现「配置/复制/删除」；空白处右键 → 出现「打开组件树/添加.../重置视图」；Esc 关闭；点菜单项执行正确。

- [ ] **Step 5: 提交**

```bash
git add src/features/script-editor/components/GraphCanvas.tsx
git commit -m "feat(phase1): replace canvas context menu with shadcn ContextMenu"
```

---

## Phase 3 — shadcn 基元与组件改造

### Task 10: 安装新 shadcn 基元

**Files:**
- Create: `src/components/ui/{input,label,tabs,context-menu,badge}.tsx`

- [ ] **Step 1: 用 shadcn CLI 安装**

Run:
```bash
npx shadcn@latest add input label tabs context-menu badge
```
Expected: 在 `src/components/ui/` 生成 `input.tsx`、`label.tsx`、`tabs.tsx`、`context-menu.tsx`、`badge.tsx`，并按需安装 `@radix-ui/*` 依赖。若 CLI 因网络不可用，则从 https://ui.shadcn.com/docs/components 对应组件页复制「default」风格源码到同名文件（项目 `cn` 在 `@/lib/utils`，别名 `@/components/ui`）。

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 通过（新文件可被 `@/components/ui/*` 解析）。

- [ ] **Step 3: 提交**

```bash
git add src/components/ui package.json package-lock.json
git commit -m "feat(phase1): add input/label/tabs/context-menu/badge primitives"
```

---

### Task 11: ScriptList 改造为统一列表

**Files:**
- Modify: `src/features/script-editor/components/ScriptList.tsx`

- [ ] **Step 1: 用 Button 重写列表项**

```tsx
import { Button } from '@/components/ui/button'

interface ScriptListProps {
  scripts: string[]
  activeScriptName: string | null
  loading: boolean
  error: string | null
  onSelect: (name: string) => void
}

export function ScriptList({ scripts, activeScriptName, loading, error, onSelect }: ScriptListProps) {
  return (
    <div className="script-editor-list" aria-label="脚本列表">
      <div className="script-editor-list__heading">脚本列表</div>
      {loading && <div className="script-editor-list__meta">加载中...</div>}
      {error && <div className="script-editor-list__error">{error}</div>}
      {!loading && !error && scripts.length === 0 && (
        <div className="script-editor-list__meta">暂无脚本</div>
      )}
      <div className="script-editor-list__items">
        {scripts.map((name) => (
          <Button
            key={name}
            variant={name === activeScriptName ? 'secondary' : 'ghost'}
            className="script-editor-list__item justify-start"
            onClick={() => onSelect(name)}
          >
            {name}
          </Button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: typecheck + dev 目检**

Run: `npm run typecheck`，并 `npm run dev` 打开脚本抽屉确认列表项激活态/hover 正常。
Expected: 通过、视觉正常。

- [ ] **Step 3: 提交**

```bash
git add src/features/script-editor/components/ScriptList.tsx
git commit -m "feat(phase1): rebuild script list with shadcn Button items"
```

---

### Task 12: NodePalette 分类切换换 Tabs

**Files:**
- Modify: `src/features/script-editor/components/NodePalette.tsx`

- [ ] **Step 1: 用 Tabs 承载分类、内容区列出该组节点**

把现有「逐组 Collapsible」改为 `Tabs`：`TabsList` 列出分类，`TabsContent` 列出该组节点（拖拽/点击添加逻辑保持不变）。

```tsx
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { PaletteGroup } from '../viewModel'

interface NodePaletteProps {
  activeGroupKey?: string
  groups: PaletteGroup[]
  onAddNode: (key: string) => void
  onSelectGroup?: (key: string) => void
}

export function NodePalette({ activeGroupKey, groups, onAddNode, onSelectGroup }: NodePaletteProps) {
  return (
    <div className="script-editor-palette" aria-label="节点面板">
      <Tabs value={activeGroupKey} onValueChange={onSelectGroup} className="script-editor-palette__tabs-root">
        <TabsList className="script-editor-palette__tabs">
          {groups.map((group) => (
            <TabsTrigger key={group.key} value={group.key}>{group.name}</TabsTrigger>
          ))}
        </TabsList>
        {groups.map((group) => (
          <TabsContent key={group.key} value={group.key} className="script-editor-palette__tab-content">
            <ScrollArea className="script-editor-palette__scroll">
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
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
```

> `activeGroupKey` 已由 Dialog 维护并传入；`Tabs` 受控用 `value`/`onValueChange`。`ChevronDown`/`Collapsible` import 删除。

- [ ] **Step 2: typecheck + dev 目检**

Run: `npm run typecheck`，`npm run dev` 确认分类切换、拖拽/点击添加节点仍工作。
Expected: 通过、功能正常。

- [ ] **Step 3: 提交**

```bash
git add src/features/script-editor/components/NodePalette.tsx
git commit -m "feat(phase1): switch node palette categories to shadcn Tabs"
```

---

### Task 13: ScriptOutputPanel 状态用 Badge

**Files:**
- Modify: `src/features/script-editor/components/ScriptOutputPanel.tsx`

- [ ] **Step 1: 输出行识别状态并用 Badge 标注**

在渲染每行时，对以 `[完成]` / `[错误]` 开头的行用 `Badge`：

```tsx
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ...组件内 body 部分：
            lines.map((line, index) => {
              const isError = line.startsWith('[错误]')
              const isDone = line.startsWith('[完成]')
              return (
                <div className="script-editor-output__line" key={`${index}-${line}`}>
                  {isError ? <Badge variant="destructive">错误</Badge> : null}
                  {isDone ? <Badge variant="secondary">完成</Badge> : null}
                  <span>{line}</span>
                </div>
              )
            })
```

- [ ] **Step 2: typecheck + dev 目检**

Run: `npm run typecheck`，运行一个脚本看 `[完成]`/`[错误]` 行带 Badge。
Expected: 通过、Badge 正确。

- [ ] **Step 3: 提交**

```bash
git add src/features/script-editor/components/ScriptOutputPanel.tsx
git commit -m "feat(phase1): badge run status lines in script output"
```

---

### Task 14: NodeConfigPanel 表单换 Input/Label，连线下拉换 Select

**Files:**
- Modify: `src/features/script-editor/components/NodeConfigPanel.tsx`

- [ ] **Step 1: 参数输入 `<input>` 换 shadcn `Input`，标签用 `Label`**

import：

```ts
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
```

`NodeControls` 内非 select 分支：

```tsx
            ) : (
              <Input
                aria-invalid={invalid || undefined}
                type={control.type === 'number' ? 'number' : 'text'}
                value={String(node.data[control.key] ?? '')}
                onChange={(event) => onChange(node.id, control.key, event.target.value)}
              />
            )}
```

把字段外层 `<label className="script-editor-field">` 内的 `<span>{control.label}</span>` 换成 `<Label>{control.label}</Label>`（保留 `script-editor-field` 容器类）。

- [ ] **Step 2: 连线选择 `<select>` 换 shadcn `Select`，删除按钮换 `Button`**

`NodeConnections` 内：

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'

// 每个 input 的渲染：
          <div className="script-editor-field" key={input.key}>
            <Label>{input.label}</Label>
            <Select
              value={current ? `${current.source}::${current.sourceOutput}` : ''}
              onValueChange={(value) => onConnect(node.id, input.key, value)}
            >
              <SelectTrigger><SelectValue placeholder="未连接" /></SelectTrigger>
              <SelectContent className="script-editor-select-content">
                {options.map((option) => (
                  <SelectItem key={`${option.nodeId}-${option.outputKey}`} value={`${option.nodeId}::${option.outputKey}`}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {current && (
              <Button
                variant="link"
                className="h-auto p-0 text-destructive"
                onClick={() => onGraphChange(removeGraphConnection(graph, connectionKey(current)))}
              >
                断开
              </Button>
            )}
          </div>
```

> 注意 shadcn `Select` 不支持空字符串作为 item 值，但这里空值仅作为「未连接」占位（不作为可选项），由 `placeholder` 表达，安全。顶部「删除」链接按钮（`script-editor-link-button`）同样可换成 `<Button variant="link">`，保持行为不变。

- [ ] **Step 3: typecheck + dev 目检**

Run: `npm run typecheck`，`npm run dev` 双击节点确认参数输入、连线选择、断开/删除均正常。
Expected: 通过、功能正常。

- [ ] **Step 4: 提交**

```bash
git add src/features/script-editor/components/NodeConfigPanel.tsx
git commit -m "feat(phase1): use shadcn Input/Label/Select in node config"
```

---

## Phase 4 — ⚠ 视觉对齐（仅 CSS，不动结构）

### Task 15: 对话框外壳 + 顶栏 与 Rete 节点本体 视觉统一

**Files:**
- Modify: `src/features/script-editor/script-editor.css`

- [ ] **Step 1: 仅调整 CSS token/间距，使外壳、顶栏、节点与 shadcn 观感一致**

在 `script-editor.css` 中，对 `.script-editor-dialog` / `.script-editor-toolbar` / `.script-rete-node` 等：统一圆角到 `var(--radius)`、边框 `hsl(var(--border))`、背景 `hsl(var(--card))`、阴影 `var(--script-editor-shadow-soft)`，间距对齐 8px 栅格。**不改任何 TSX 结构、不改 `rete/setup.ts` 的 `createElement` 节点结构、不动 socket/命中区。**

- [ ] **Step 2: dev 目检**

Run: `npm run dev`，整体观感与项目其余 shadcn 界面一致；节点拖拽、socket 连线、双击命中**全部不受影响**。
Expected: 仅视觉变化，交互无回归。

- [ ] **Step 3: 提交**

```bash
git add src/features/script-editor/script-editor.css
git commit -m "style(phase1): align dialog shell and rete nodes with shadcn theme"
```

---

## Phase 5 — 收尾验证

### Task 16: 全量校验

- [ ] **Step 1: typecheck**

Run: `npm run typecheck`
Expected: 两个 tsconfig 均通过。

- [ ] **Step 2: 单测**

Run: `npm test`
Expected: 全绿（含新增 `script-editor-canvas-interaction` 与更新后的 `node-interaction`/`ui-state`）。

- [ ] **Step 3: dev 端到端回归（`?scriptDebug=1`）**

Run: `npm run dev`，URL 末尾加 `?scriptDebug=1`，逐项确认：
1. 双击节点 → 配置抽屉打开并显示参数。
2. 指针：拖节点/连线、空白平移、滚轮缩放。
3. 拖动画布：仅平移、节点不可拖/点。
4. 选择：空白拖出选框 → 多选高亮；整组拖动同步；Del 整组删除；配置抽屉显示「已选 N 个」。
5. 右键：节点上/空白处菜单内容正确、Esc 关闭。
6. shadcn 改造各处（列表/标签页/输出 Badge/配置表单）观感与功能正常。

Expected: 全部通过；如有问题回到对应 Task 修复。

- [ ] **Step 4: 最终提交（如有零散修订）**

```bash
git add -A
git commit -m "test(phase1): verify script editor interaction + shadcn pass"
```

---

## Self-Review（计划作者已核对）

- **Spec 覆盖**：#3 工具→Task 4/7（平移守卫+框选）；#2 双击→Task 5；多选→Task 6/7/8；ContextMenu→Task 9/10；shadcn 7 处→Task 9(右键)/11(列表)/12(标签页)/13(输出)/14(配置表单)/15(两 ⚠ 仅 CSS)；新基元→Task 10；测试→Task 1-3、16。
- **与 spec 的明确细化**：平移门控机制（setDragHandler vs 信号 pipe）、`ToolCapabilities` 字段名 `nodeInteractive`（替代 spec 的 `nodeClickSelect`，含义更准）、select 保留 `nodeDrag:true`（可靠且 UX 更佳）——均已在抬头说明，执行者据此实现。
- **类型一致**：`getToolCapabilities`/`ToolCapabilities`/`computeMarqueeRect`/`Bounds`/`Point`/`NodeRect`/`nodesInMarquee`/`shouldOpenNodeConfig`/`setAreaPanEnabled`/`selectedNodeIds`/`onSelectNodes`/`onDeleteSelectedNodes` 全程一致。
- **无占位符**：每个代码步骤含真实代码或确定命令。
