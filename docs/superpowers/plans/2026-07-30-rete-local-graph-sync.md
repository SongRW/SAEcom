# Rete Local Graph Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the large-graph typing delay by synchronizing scalar script-node configuration edits into only the edited Rete node rather than clearing and recreating the whole graph.

**Architecture:** A pure classifier compares the graph last materialized in Rete with the current authoritative graph. It classifies a graph change as unchanged, data-only, or structural using resolved port maps and connections. `GraphCanvas` invokes a focused setup helper for data-only changes and retains the existing full Rete rebuild for topology changes, script replacement, and initialization.

**Tech Stack:** TypeScript, React, Rete 2.0.6, Rete Area/React plugins, Vitest, Playwright Electron.

## Global Constraints

- Preserve graph serialization, generated-code behavior, and 300 ms undo-history grouping.
- Use `GraphEditorState` and `resolveNodePorts` as the authoritative topology source.
- Do not invoke `ClassicPreset.InputControl.setValue()` while mirroring a React-originated update; it calls the Rete change callback.
- Keep full `syncReteEditorFromGraph()` for node/connection/port-shape changes.
- Add a Playwright Electron E2E regression for the user-visible editor behavior before considering the UI work complete.
- Do not modify unrelated dirty-worktree files or commit generated build output.

---

### Task 1: Classify Graph Synchronization Scope

**Files:**
- Create: `src/features/script-editor/rete/graphSync.ts`
- Create: `test/script-editor-graph-sync.test.ts`

**Interfaces:**
- Consumes: `GraphEditorState` from `rete/graphState.ts`.
- Produces:
  ```ts
  export type GraphSyncKind = 'none' | 'node-data' | 'structure'

  export interface GraphSyncPlan {
    kind: GraphSyncKind
    changedNodeIds: string[]
  }

  export function classifyGraphSync(
    previous: GraphEditorState | null,
    next: GraphEditorState
  ): GraphSyncPlan
  ```
- The later GraphCanvas task uses `kind === 'node-data'` to choose targeted Rete refresh and passes `changedNodeIds` to the Rete helper.

- [ ] **Step 1: Write failing pure classifier tests**

  Create `test/script-editor-graph-sync.test.ts` using graph-state helpers. Cover data-only change, connection change, dynamic-port change, and no-op:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { addGraphNode, connectGraphNodes, createEmptyGraphState, updateGraphNodeData } from '../src/features/script-editor/rete/graphState'
  import { classifyGraphSync } from '../src/features/script-editor/rete/graphSync'

  describe('graph synchronization classifier', () => {
    it('classifies a scalar node configuration edit as node-data', () => {
      let graph = addGraphNode(createEmptyGraphState(), 'output-log', { x: 0, y: 0 }, 'log')
      const next = updateGraphNodeData(graph, 'log', 'prefix', '[status]')

      expect(classifyGraphSync(graph, next)).toEqual({ kind: 'node-data', changedNodeIds: ['log'] })
    })

    it('classifies a connection change as structure', () => {
      let graph = addGraphNode(createEmptyGraphState(), 'input-manual', { x: 0, y: 0 }, 'source')
      graph = addGraphNode(graph, 'output-log', { x: 240, y: 0 }, 'log')
      const next = connectGraphNodes(graph, {
        source: 'source', sourceOutput: 'out', target: 'log', targetInput: 'in'
      })

      expect(classifyGraphSync(graph, next)).toEqual({ kind: 'structure', changedNodeIds: [] })
    })

    it('classifies a dynamic port change as structure', () => {
      let graph = addGraphNode(createEmptyGraphState(), 'protocol-bitfield', { x: 0, y: 0 }, 'bitfield', {
        mode: '打包', fields: [{ id: 'f1', name: '状态', bits: 8 }]
      })
      const next = updateGraphNodeData(graph, 'bitfield', 'mode', '解包')

      expect(classifyGraphSync(graph, next)).toEqual({ kind: 'structure', changedNodeIds: [] })
    })

    it('returns none for identical graph state', () => {
      const graph = addGraphNode(createEmptyGraphState(), 'input-manual', { x: 0, y: 0 }, 'input')

      expect(classifyGraphSync(graph, graph)).toEqual({ kind: 'none', changedNodeIds: [] })
    })
  })
  ```

- [ ] **Step 2: Run the new test to verify it fails**

  Run:

  ```bash
  npx vitest run test/script-editor-graph-sync.test.ts
  ```

  Expected: FAIL because `rete/graphSync.ts` does not exist.

- [ ] **Step 3: Implement structural and material comparison**

  Create `src/features/script-editor/rete/graphSync.ts`:

  ```ts
  import type { GraphEditorState } from '@/features/script-editor/rete/graphState'

  export type GraphSyncKind = 'none' | 'node-data' | 'structure'

  export interface GraphSyncPlan {
    kind: GraphSyncKind
    changedNodeIds: string[]
  }

  export function classifyGraphSync(
    previous: GraphEditorState | null,
    next: GraphEditorState
  ): GraphSyncPlan {
    if (!previous) return { kind: 'structure', changedNodeIds: [] }
    if (JSON.stringify(graphTopology(previous)) !== JSON.stringify(graphTopology(next))) {
      return { kind: 'structure', changedNodeIds: [] }
    }

    const previousData = new Map(previous.nodes.map((node) => [node.id, JSON.stringify(node.data)]))
    const changedNodeIds = next.nodes
      .filter((node) => previousData.get(node.id) !== JSON.stringify(node.data))
      .map((node) => node.id)

    return changedNodeIds.length > 0
      ? { kind: 'node-data', changedNodeIds }
      : { kind: 'none', changedNodeIds: [] }
  }

  function graphTopology(graph: GraphEditorState) {
    return {
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        key: node.key,
        label: node.label,
        inputs: node.inputs,
        outputs: node.outputs
      })),
      connections: graph.connections
    }
  }
  ```

  `inputs` and `outputs` were already normalized by `resolveNodePorts` in graph state. Therefore dynamic key/field additions, removals, label changes, and bitfield mode changes enter the structural path without hard-coding node keys in this classifier.

- [ ] **Step 4: Run focused tests and typecheck**

  Run:

  ```bash
  npx vitest run test/script-editor-graph-sync.test.ts test/script-editor-graph-state.test.ts
  npm run typecheck
  ```

  Expected: both commands pass.

- [ ] **Step 5: Commit the classifier task**

  Do not commit automatically in this workspace. When a commit is explicitly requested, stage only:

  ```bash
  git add src/features/script-editor/rete/graphSync.ts test/script-editor-graph-sync.test.ts
  git commit -m "fix(script-editor): classify local graph updates"
  ```

### Task 2: Synchronize Scalar Data Into Existing Rete Nodes

**Files:**
- Modify: `src/features/script-editor/rete/setup.ts:149-302`
- Modify: `test/rete-setup.test.ts:1-110`

**Interfaces:**
- Consumes: `ReteEditorInstance`, current `GraphEditorState`, and `changedNodeIds` from `classifyGraphSync()`.
- Produces:
  ```ts
  export async function syncReteNodeDataFromGraph(
    instance: Pick<ReteEditorInstance, 'editor' | 'area'>,
    graph: GraphEditorState,
    nodeIds: string[]
  ): Promise<void>
  ```
- The helper mutates only already-existing Rete nodes and makes no `NodeEditor.clear`, `NodeEditor.addNode`, `NodeEditor.removeNode`, `NodeEditor.addConnection`, or `NodeEditor.removeConnection` calls.

- [ ] **Step 1: Write a failing local-update test**

  Add this test to `test/rete-setup.test.ts` after the existing control bridge test:

  ```ts
  it('refreshes only changed node data without clearing the editor', async () => {
    let graph = addGraphNode(createEmptyGraphState(), 'output-log', { x: 0, y: 0 }, 'log', { prefix: 'before' })
    const node = createClassicNodeFromGraphNode(graph.nodes[0])
    const areaUpdates: Array<[string, string]> = []
    const instance = {
      editor: {
        getNode: (id: string) => (id === 'log' ? node : undefined),
        clear: async () => { throw new Error('full graph clear must not run') }
      },
      area: {
        update: async (type: string, id: string) => { areaUpdates.push([type, id]) }
      }
    }

    graph = updateGraphNodeData(graph, 'log', 'prefix', 'after')
    await syncReteNodeDataFromGraph(instance as never, graph, ['log'])

    expect(node.data?.prefix).toBe('after')
    expect(areaUpdates).toEqual([['node', 'log']])
  })
  ```

  Add imports for `syncReteNodeDataFromGraph` and `updateGraphNodeData`.

- [ ] **Step 2: Run the test to verify it fails**

  Run:

  ```bash
  npx vitest run test/rete-setup.test.ts
  ```

  Expected: FAIL because `syncReteNodeDataFromGraph` is not exported.

- [ ] **Step 3: Implement the targeted synchronizer**

  Add this helper in `rete/setup.ts` near `syncReteEditorFromGraph()`:

  ```ts
  export async function syncReteNodeDataFromGraph(
    instance: Pick<ReteEditorInstance, 'editor' | 'area'>,
    graph: GraphEditorState,
    nodeIds: string[]
  ): Promise<void> {
    const graphNodes = new Map(graph.nodes.map((node) => [node.id, node]))

    for (const id of nodeIds) {
      const graphNode = graphNodes.get(id)
      const reteNode = instance.editor.getNode(id)
      if (!graphNode || !reteNode) continue

      reteNode.data = { ...graphNode.data }
      const definition = NODE_DEFINITIONS[graphNode.key]
      for (const control of definition.controls) {
        const inputControl = reteNode.controls[control.key]
        if (!(inputControl instanceof ClassicPreset.InputControl)) continue
        const value = graphNode.data[control.key]
        inputControl.value = control.type === 'number'
          ? Number(value ?? control.default ?? 0)
          : String(value ?? control.default ?? '')
      }
      await instance.area.update('node', id)
    }
  }
  ```

  Direct assignment to `inputControl.value` is required: `InputControl.setValue()` calls `options.change`, which would emit a second Rete-to-React update. Reassign the entire `reteNode.data` first so non-control derived data, including `configRef`, stays current.

- [ ] **Step 4: Run focused tests and typecheck**

  Run:

  ```bash
  npx vitest run test/rete-setup.test.ts test/script-editor-graph-sync.test.ts
  npm run typecheck
  ```

  Expected: both commands pass.

- [ ] **Step 5: Commit the targeted Rete synchronizer task**

  Do not commit automatically in this workspace. When a commit is explicitly requested, stage only:

  ```bash
  git add src/features/script-editor/rete/setup.ts test/rete-setup.test.ts
  git commit -m "fix(script-editor): refresh edited Rete nodes locally"
  ```

### Task 3: Route GraphCanvas Through the Classifier

**Files:**
- Modify: `src/features/script-editor/components/GraphCanvas.tsx:17-18, 72-100, 155-167, 223-225, 373-400, 584-594`
- Test: `test/script-editor-graph-sync.test.ts`
- Test: `test/rete-setup.test.ts`

**Interfaces:**
- Consumes: `classifyGraphSync(previous, next)` from `rete/graphSync.ts` and `syncReteNodeDataFromGraph(instance, graph, ids)` from `rete/setup.ts`.
- Produces: React-driven scalar graph updates redraw only their changed Rete nodes; structural updates preserve the existing full-sync behavior.

- [ ] **Step 1: Add the sync-state test case**

  Add this test to `test/script-editor-graph-sync.test.ts` to protect comparison against the graph actually materialized by Rete:

  ```ts
  it('uses the most recently materialized data graph as the next comparison base', () => {
    let graph = addGraphNode(createEmptyGraphState(), 'input-manual', { x: 0, y: 0 }, 'input', { content: 'A' })
    const first = updateGraphNodeData(graph, 'input', 'content', 'AB')
    const second = updateGraphNodeData(first, 'input', 'content', 'ABC')

    expect(classifyGraphSync(graph, first)).toEqual({ kind: 'node-data', changedNodeIds: ['input'] })
    expect(classifyGraphSync(first, second)).toEqual({ kind: 'node-data', changedNodeIds: ['input'] })
  })
  ```

- [ ] **Step 2: Run the focused classifier test**

  Run:

  ```bash
  npx vitest run test/script-editor-graph-sync.test.ts
  ```

  Expected: PASS; this establishes the state sequence needed by `GraphCanvas`.

- [ ] **Step 3: Replace signature-only synchronization in GraphCanvas**

  Make these changes:

  1. Import `classifyGraphSync` and `syncReteNodeDataFromGraph`.
  2. Replace `lastSyncedSignatureRef` with `lastSyncedGraphRef = useRef<GraphEditorState | null>(null)`.
  3. In `runFit()`, treat a graph as pending when `classifyGraphSync(lastSyncedGraphRef.current, graphRef.current).kind !== 'none'`.
  4. In the Rete `node-data` callback, update `graphRef.current`, set `lastSyncedGraphRef.current = nextGraph`, then call `onGraphChangeRef.current(nextGraph)`. The Rete node already contains the data, so the later prop render must classify as `none`.
  5. In the graph synchronization effect:

  ```ts
  const plan = classifyGraphSync(lastSyncedGraphRef.current, graph)
  if (plan.kind === 'none') return

  syncingRef.current = true
  const sync = plan.kind === 'node-data'
    ? syncReteNodeDataFromGraph(instance, graph, plan.changedNodeIds)
    : syncReteEditorFromGraph(instance, graph)

  void sync.then(() => {
    lastSyncedGraphRef.current = graph
    if (plan.kind === 'structure' && lastAppliedZoomRef.current !== zoom) {
      lastAppliedZoomRef.current = zoom
      applyingZoomRef.current = true
      void instance.area.area.zoom(zoom).finally(() => {
        applyingZoomRef.current = false
      })
    }
  }).finally(() => {
    syncingRef.current = false
    if (pendingFitRef.current) {
      pendingFitRef.current = false
      const result = computeFit()
      if (result) applyFitTransform(result)
    }
  })
  ```

  Preserve the existing full-sync zoom behavior only for `structure`. A data-only redraw must not reset or animate the camera.

- [ ] **Step 4: Run focused test and static verification**

  Run:

  ```bash
  npx vitest run test/script-editor-graph-sync.test.ts test/rete-setup.test.ts test/script-editor-graph-state.test.ts
  npm run typecheck
  ```

  Expected: both commands pass.

- [ ] **Step 5: Commit the GraphCanvas routing task**

  Do not commit automatically in this workspace. When a commit is explicitly requested, stage only:

  ```bash
  git add src/features/script-editor/components/GraphCanvas.tsx src/features/script-editor/rete/graphSync.ts test/script-editor-graph-sync.test.ts
  git commit -m "fix(script-editor): avoid rebuilding graph for field edits"
  ```

### Task 4: Protect Dynamic Connection Pruning in Authoritative Graph State

**Files:**
- Modify: `test/script-editor-graph-state.test.ts:206-226`

**Interfaces:**
- Consumes: existing `updateGraphNodeData()` port recomputation and connection pruning.
- Produces: regressions ensuring structural fallbacks receive a valid graph after dynamic key/field removals and bitfield mode changes.

- [ ] **Step 1: Add a failing object-port pruning test**

  Add an import-state graph containing two manual sources, a `transform-object` node with `k1`/`k2`, and two connections. Update the object node `keys` to preserve only `k2`, then assert:

  ```ts
  expect(next.nodes.find((node) => node.id === 'object')?.inputs).not.toHaveProperty('key_k1')
  expect(next.nodes.find((node) => node.id === 'object')?.inputs).toHaveProperty('key_k2')
  expect(next.connections).toEqual([
    expect.objectContaining({ source: 'right', target: 'object', targetInput: 'key_k2' })
  ])
  ```

- [ ] **Step 2: Add a failing bitfield-mode pruning test**

  Import a bitfield node in unpack mode with two `field_*` outputs connected to two logs, then call:

  ```ts
  const next = updateGraphNodeData(graph, 'bitfield', 'mode', '打包')
  ```

  Assert that `field_f1` and `field_f2` are inputs, no longer outputs, and all former `field_*` output connections were removed while unrelated static connections remain.

- [ ] **Step 3: Run tests to verify the assertions**

  Run:

  ```bash
  npx vitest run test/script-editor-graph-state.test.ts
  ```

  Expected: PASS with the current graph-state dynamic-port implementation. If an assertion fails, correct the test fixture to contain valid socket-compatible connections before considering graph-state code changes.

- [ ] **Step 4: Commit the dynamic-port regression coverage**

  Do not commit automatically in this workspace. When a commit is explicitly requested, stage only:

  ```bash
  git add test/script-editor-graph-state.test.ts
  git commit -m "test(script-editor): cover dynamic connection pruning"
  ```

### Task 5: Add an Electron Typing Regression

**Files:**
- Modify: `e2e/script-editor-object-node.spec.ts:32-128`

**Interfaces:**
- Consumes: existing Electron fixtures, script editor selectors, `data-node-id`, dynamic port test ids, and Rete-rendered connection paths.
- Produces: a visible user-workflow regression test that fails when the drawer input causes all Rete nodes to remount.

- [ ] **Step 1: Write a failing E2E test for uninterrupted drawer typing**

  Add this case under the `transform-object 节点` describe block:

  ```ts
  test('右侧参数编辑不重建整个画布', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.getByText('输入类', { exact: true }))
    await editor.locator('[data-node-key="input-manual"]').click()
    await clickReady(page, editor.getByText('转换类', { exact: true }))
    await editor.locator('[data-node-key="transform-object"]').click()

    const source = editor.locator('[data-testid="node"][data-node-key="input-manual"]')
    const object = editor.locator('[data-testid="node"][data-node-key="transform-object"]')
    await object.locator('[data-testid="key-add"]').click()
    await expect(object.locator('[data-testid="input-key_k1"]')).toBeVisible()

    // Create one real edge with the production Rete socket drag helper pattern.
    const output = source.locator('[data-testid="output-out"]')
    const input = object.locator('[data-testid="input-key_k1"]')
    const outputBox = await output.boundingBox()
    const inputBox = await input.boundingBox()
    expect(outputBox).toBeTruthy()
    expect(inputBox).toBeTruthy()
    if (!outputBox || !inputBox) return
    await page.mouse.move(outputBox.x + outputBox.width / 2, outputBox.y + outputBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(inputBox.x + inputBox.width / 2, inputBox.y + inputBox.height / 2, { steps: 10 })
    await page.mouse.up()

    await source.dblclick()
    const drawer = editor.getByRole('dialog', { name: '节点配置' })
    const content = drawer.getByRole('textbox').first()
    await content.focus()
    await content.pressSequentially('ABC')

    await expect(content).toHaveValue(/ABC$/)
    await expect(content).toBeFocused()
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(2)
    await expect(object.locator('[data-testid="input-key_k1"]')).toBeVisible()
    await expect(editor.locator('svg path').filter({ has: editor.locator('[data-testid="connection"]') })).toHaveCount(1)
  })
  ```

  Before implementation, refine the connection-path locator against the actual `script-editor-prod-render.spec.ts` selector. Preserve the important assertions: sequential input remains focused, text is cumulative, both nodes stay mounted, dynamic port remains present, and the connection remains present.

- [ ] **Step 2: Build and run this one E2E test to verify the pre-fix regression**

  Run:

  ```bash
  npm run build
  npx playwright test e2e/script-editor-object-node.spec.ts --grep "右侧参数编辑不重建整个画布"
  ```

  Expected before Task 3: it may lose focus, lose cumulative characters, or visibly remount the graph. Do not make an absolute millisecond duration the correctness criterion.

- [ ] **Step 3: Adjust only selectors required for stable production coverage**

  Use existing `data-node-key`, `data-node-id`, `input-key_k1`, and connection test selectors. Do not add production counters or timing hooks solely for this test unless no DOM-level stable signal exists.

- [ ] **Step 4: Run the affected editor E2E specs**

  Run:

  ```bash
  npx playwright test e2e/script-editor-object-node.spec.ts e2e/script-protocol-visual.spec.ts
  ```

  Expected: all selected tests pass after a production build.

- [ ] **Step 5: Commit the E2E regression coverage**

  Do not commit automatically in this workspace. When a commit is explicitly requested, stage only:

  ```bash
  git add e2e/script-editor-object-node.spec.ts
  git commit -m "test(script-editor): cover uninterrupted node parameter typing"
  ```

### Task 6: Verify the Complete Change

**Files:**
- Verify only; do not create generated artifacts.

**Interfaces:**
- Consumes all prior tasks.
- Produces: evidence that the new incremental data path, graph correctness, type safety, unit suite, and Electron E2E suite pass together.

- [ ] **Step 1: Run targeted unit tests**

  Run:

  ```bash
  npx vitest run test/script-editor-graph-sync.test.ts test/rete-setup.test.ts test/script-editor-graph-state.test.ts
  ```

  Expected: PASS.

- [ ] **Step 2: Run static and full unit verification**

  Run:

  ```bash
  npm run typecheck
  npm test
  ```

  Expected: PASS. Record any unrelated pre-existing failure with its exact command output rather than masking it.

- [ ] **Step 3: Run the required Electron UI gate**

  Run:

  ```bash
  npm run test:e2e:build
  ```

  Expected: all specs pass. Report the exact passed/failed count and any retained unrelated failure.

- [ ] **Step 4: Review the final diff**

  Run:

  ```bash
  git diff --check
  git diff -- src/features/script-editor/components/GraphCanvas.tsx src/features/script-editor/rete/graphSync.ts src/features/script-editor/rete/setup.ts test/script-editor-graph-sync.test.ts test/rete-setup.test.ts test/script-editor-graph-state.test.ts e2e/script-editor-object-node.spec.ts
  ```

  Expected: no whitespace errors; changes are limited to local Rete synchronization and its tests.

- [ ] **Step 5: Commit when explicitly requested**

  Do not commit automatically. When requested, create one narrow conventional commit:

  ```bash
  git add src/features/script-editor/components/GraphCanvas.tsx src/features/script-editor/rete/graphSync.ts src/features/script-editor/rete/setup.ts test/script-editor-graph-sync.test.ts test/rete-setup.test.ts test/script-editor-graph-state.test.ts e2e/script-editor-object-node.spec.ts
  git commit -m "fix(script-editor): update configured nodes without graph rebuild"
  ```
