# 选中节点连线高亮与方向动画 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当用户选中一个节点时，高亮该节点的所有入边和出边，并用方向流动动画表示数据流向：出边动画从源到目标，入边动画从目标到源。

**Architecture:** 在 `GraphCanvas` 的选择→DOM effect 中，同步为 `connectionViews` 设置 `data-app-selected-endpoint` 属性（镜像现有的 `data-app-selected` 节点模式）。CSS 通过 `[data-app-selected-endpoint]` 选择器为连线 path 添加高亮样式和 `stroke-dashoffset` 动画。方向通过 `data-app-selected-direction` 区分出/入/双向。此方案零 React 重渲染开销，完全基于属性 + CSS。

**Tech Stack:** TypeScript, React, Rete, CSS animations, Vitest, Playwright Electron.

## Global Constraints

- 高亮/动画是纯瞬态视觉表现，不进入 `GraphEditorState`、不影响持久化、代码生成或执行。
- 使用 app 自己的 `selectedNodeIds` 作为选择真实源（不是 Rete 内置的 `AreaExtensions.selector()`）。
- `connectionViews` 的 DOM 操作镜像现有 `nodeViews` 的 `data-app-selected` 模式。
- 必须支持 `prefers-reduced-motion`：动画关闭时保留静态高亮。
- 连线路径始终从 source（`start`）到 target（`end`）；`stroke-dashoffset` 负向递减 = source→target 方向流动。
- 两端同时选中时使用确定性单一方向（出边方向），不叠加两种动画。
- 遵守 `CONV-GRAPH-CANONICAL-STATE`。
- 运行 `npm test`、`npm run typecheck`、`npm run test:e2e:build` 后才算完成。

---

## File Structure

- Modify: `src/features/script-editor/components/GraphCanvas.tsx:248-260`（选择 effect 扩展到 connectionViews）
- Modify: `src/features/script-editor/rete/setup.ts:92-95`（`CreateReteEditorOptions` 新增 `getSelectedNodeIds` 回调）
- Modify: `src/features/script-editor/script-editor.css:501` 附近（连线样式区域，新增高亮 + 动画规则）
- Test: `test/script-editor-connection-highlight.test.ts`（新建，验证属性设置逻辑）
- Create: `e2e/script-editor-connection-highlight.spec.ts`

## Shared interfaces

```ts
// setup.ts
export interface CreateReteEditorOptions {
  onGraphChange?: (change: ReteGraphChange) => void
  getArrangeOrderIndex?: (id: string) => number
  getSelectedNodeIds?: () => Set<string>  // 新增
}

// GraphCanvas.tsx — 在选择 effect 中调用
// 为每个 connectionView 设置 data-app-selected-endpoint 和 data-app-selected-direction
```

### Task 1: 在选择 effect 中为 connectionViews 设置高亮属性

**Files:**
- Modify: `src/features/script-editor/components/GraphCanvas.tsx:248-260`
- Modify: `src/features/script-editor/rete/setup.ts:92-95`
- Test: `test/script-editor-connection-highlight.test.ts`（新建）

**Interfaces:**
- Consumes: `selectedNodeIds`（来自 props），`instance.area.connectionViews`
- Produces: connection SVG 元素上的 `data-app-selected-endpoint` 和 `data-app-selected-direction` 属性

- [ ] **Step 1: Add `getSelectedNodeIds` to CreateReteEditorOptions**

在 `setup.ts` 中：

```ts
export interface CreateReteEditorOptions {
  onGraphChange?: (change: ReteGraphChange) => void
  getArrangeOrderIndex?: (id: string) => number
  getSelectedNodeIds?: () => Set<string>
}
```

- [ ] **Step 2: Extend the selection effect in GraphCanvas**

在 `GraphCanvas.tsx` 的选择→DOM effect（第 248-260 行附近），在现有节点 `data-app-selected` 循环之后，新增 connection 属性设置：

```ts
// 在现有 node data-app-selected 循环之后添加：

// Highlight connections incident to selected nodes
const selectedSet = new Set(selectedNodeIds)
for (const [connId, connView] of instance.area.connectionViews) {
  const conn = instance.connections.get(connId)
  if (!conn) continue
  const sourceSelected = selectedSet.has(conn.source)
  const targetSelected = selectedSet.has(conn.target)
  const pathEl = connView.element.querySelector('path')
  if (!pathEl) continue

  if (sourceSelected && targetSelected) {
    connView.element.setAttribute('data-app-selected-endpoint', 'true')
    connView.element.setAttribute('data-app-selected-direction', 'both')
  } else if (sourceSelected) {
    connView.element.setAttribute('data-app-selected-endpoint', 'true')
    connView.element.setAttribute('data-app-selected-direction', 'out')
  } else if (targetSelected) {
    connView.element.setAttribute('data-app-selected-endpoint', 'true')
    connView.element.setAttribute('data-app-selected-direction', 'in')
  } else {
    connView.element.removeAttribute('data-app-selected-endpoint')
    connView.element.removeAttribute('data-app-selected-direction')
  }
}
```

- [ ] **Step 3: Wire `getSelectedNodeIds` ref in GraphCanvas**

在 `GraphCanvas.tsx` 中，仿照 `selectedNodeIdsRef`（第 96 行附近），确保 ref 在选择变化时更新。然后在 `createReteEditor` 调用时传入：

```ts
const selectedNodeIdsRef = useRef(selectedNodeIds)
selectedNodeIdsRef.current = selectedNodeIds

// 在 createReteEditor 调用的 options 中：
getSelectedNodeIds: () => new Set(selectedNodeIdsRef.current)
```

- [ ] **Step 4: Write test for attribute logic**

创建 `test/script-editor-connection-highlight.test.ts`，使用 mock 验证选择 effect 的属性设置逻辑。由于此逻辑内嵌在 React effect 中，测试策略为：提取一个纯函数 `computeConnectionHighlight` 并测试它：

```ts
import { describe, expect, it } from 'vitest'

// 提取的纯函数（在 GraphCanvas.tsx 中 export）
export function computeConnectionHighlight(
  conn: { source: string; target: string },
  selectedNodeIds: Set<string>
): { endpoint: boolean; direction: 'out' | 'in' | 'both' | null } {
  const sourceSelected = selectedNodeIds.has(conn.source)
  const targetSelected = selectedNodeIds.has(conn.target)
  if (sourceSelected && targetSelected) return { endpoint: true, direction: 'both' }
  if (sourceSelected) return { endpoint: true, direction: 'out' }
  if (targetSelected) return { endpoint: true, direction: 'in' }
  return { endpoint: false, direction: null }
}

describe('computeConnectionHighlight', () => {
  const selected = new Set(['node-a'])

  it('marks outgoing connection as out', () => {
    expect(computeConnectionHighlight({ source: 'node-a', target: 'node-b' }, selected))
      .toEqual({ endpoint: true, direction: 'out' })
  })

  it('marks incoming connection as in', () => {
    expect(computeConnectionHighlight({ source: 'node-b', target: 'node-a' }, selected))
      .toEqual({ endpoint: true, direction: 'in' })
  })

  it('marks both-endpoints connection as both', () => {
    const both = new Set(['node-a', 'node-b'])
    expect(computeConnectionHighlight({ source: 'node-a', target: 'node-b' }, both))
      .toEqual({ endpoint: true, direction: 'both' })
  })

  it('does not highlight unrelated connection', () => {
    expect(computeConnectionHighlight({ source: 'node-c', target: 'node-d' }, selected))
      .toEqual({ endpoint: false, direction: null })
  })
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- test/script-editor-connection-highlight.test.ts`
Expected: 4 passing tests.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/features/script-editor/components/GraphCanvas.tsx \
        src/features/script-editor/rete/setup.ts \
        test/script-editor-connection-highlight.test.ts
git commit -m "feat(script-editor): set connection highlight attributes on node selection"
```

### Task 2: CSS 高亮样式与方向动画

**Files:**
- Modify: `src/features/script-editor/script-editor.css:501` 附近

**Interfaces:**
- Consumes: `data-app-selected-endpoint` 和 `data-app-selected-direction` 属性（来自 Task 1）
- Produces: 视觉高亮 + 流动动画

- [ ] **Step 1: Add highlight and animation CSS**

在 `script-editor.css` 的连线样式区域（现有 `.connection-path` 或 `[data-testid="connection"]` 附近）添加：

```css
/* ====== 选中节点连线高亮与方向动画 ====== */

/* 默认（未高亮）连线：降低不透明度，让高亮连线更突出 */
.script-editor-canvas__surface [data-testid="connection"]:not([data-app-selected-endpoint]) path {
  opacity: 0.35;
}

/* 高亮连线：恢复完全不透明，加粗描边 */
.script-editor-canvas__surface [data-app-selected-endpoint="true"] path {
  opacity: 1;
  stroke-width: 3;
  stroke-dasharray: 8 6;
}

/* 出边动画：source → target 方向流动（绿色） */
.script-editor-canvas__surface [data-app-selected-direction="out"] path {
  stroke: var(--success, oklch(0.62 0.17 145));
  animation: connection-flow-forward 0.7s linear infinite;
}

/* 入边动画：target → source 方向流动（橙色） */
.script-editor-canvas__surface [data-app-selected-direction="in"] path {
  stroke: var(--primary);
  animation: connection-flow-backward 0.7s linear infinite;
}

/* 双端选中：使用出边方向（确定性单一方向） */
.script-editor-canvas__surface [data-app-selected-direction="both"] path {
  stroke: var(--primary);
  animation: connection-flow-forward 0.7s linear infinite;
}

@keyframes connection-flow-forward {
  to { stroke-dashoffset: -14; }
}
@keyframes connection-flow-backward {
  to { stroke-dashoffset: 14; }
}

/* prefers-reduced-motion：关闭动画，保留静态高亮 */
@media (prefers-reduced-motion: reduce) {
  .script-editor-canvas__surface [data-app-selected-direction] path {
    animation: none;
    stroke-dasharray: none;
  }
}
```

- [ ] **Step 2: Manual verification**

在开发环境中手动测试：
1. 选中一个有出边的节点 → 出边绿色 + 前向流动动画，其他连线变暗
2. 选中一个有入边的节点 → 入边橙色 + 后向流动动画
3. 选中两个相连的节点 → 连线高亮为出边方向
4. 取消选择 → 所有连线恢复默认样式
5. 开启系统「减少动态效果」→ 动画停止，高亮颜色保留

- [ ] **Step 3: Commit**

```bash
git add src/features/script-editor/script-editor.css
git commit -m "feat(script-editor): connection highlight and directional flow animation CSS"
```

### Task 3: E2E 测试 — 选中节点连线高亮与动画

**Files:**
- Create: `e2e/script-editor-connection-highlight.spec.ts`

**Interfaces:**
- Consumes: all functionality from Tasks 1-2.
- Produces: E2E proof that selection drives connection highlight attributes.

- [ ] **Step 1: Write the E2E spec**

```ts
import { expect, test } from '@playwright/test'
import { openNavPage, clickReady, NAV } from './fixtures'

test.describe('选中节点连线高亮与方向动画', () => {
  test('选中输入节点后出边高亮并有方向属性', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 创建至少两个相连的节点（使用快速添加或现有示例脚本）
    // 选中源节点
    const sourceNode = editor.locator('[data-testid="node"]').first()
    await sourceNode.click()

    // 验证存在带 data-app-selected-endpoint 和 direction="out" 的连线
    const highlightedOut = editor.locator('[data-app-selected-direction="out"]')
    await expect(highlightedOut.first()).toBeVisible()

    // 验证高亮连线有 CSS 动画
    const pathEl = highlightedOut.first().locator('path')
    const animationName = await pathEl.evaluate(
      (el) => getComputedStyle(el).animationName
    )
    expect(animationName).toContain('flow')
  })

  test('选中目标节点后入边高亮 direction=in', async ({ page }) => {
    // ... 选中下游节点，验证 direction="in"
  })

  test('取消选择后所有连线恢复默认', async ({ page }) => {
    // ... 选中后取消，验证无 data-app-selected-endpoint 属性
  })
})
```

- [ ] **Step 2: Run E2E**

Run: `npm run build && npx playwright test e2e/script-editor-connection-highlight.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/script-editor-connection-highlight.spec.ts
git commit -m "test(script-editor): E2E for connection highlight and directional animation"
```

### Task 4: 完整回归验证

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
Expected: all specs pass.

- [ ] **Step 4: Report results**

Report pass/fail honestly.
