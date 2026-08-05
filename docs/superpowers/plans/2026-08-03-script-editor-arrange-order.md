# Script Editor Arrange Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make automatic layout display the existing script-generation order from left to right and, within a layer, from top to bottom without changing generation or runtime behavior.

**Architecture:** Continue using Rete's AutoArrangePlugin and one ELK Layered layout component. Set `elk.separateConnectedComponents = false` so disconnected paths are laid together before semi-interactive Layered crossing minimization fixes same-layer order from node-level `elk.position` hints derived from the current graph's `nodes[]` indices. The arrange command remains a position-only write-back, so graph array order, persistence, generated code, and runtime semantics remain unchanged.

**Tech Stack:** TypeScript, React, Rete 2 AutoArrangePlugin, ELK Layered, Vitest, Playwright Electron.

## Global Constraints

- Dependencies determine horizontal layout: root nodes without incoming edges occupy the first column; downstream nodes must remain to the right of their prerequisites.
- Independent nodes in the same layer use the existing stable `graph.nodes[]` order and appear top-to-bottom in that order, even when retaining the order introduces edge crossings.
- `elk.separateConnectedComponents` must be `'false'` so disconnected paths are laid as one layered component; only then can strict same-layer `graph.nodes[]` order apply globally across the graph.
- ELK crossing minimization may preserve necessary crossings but must never exchange same-layer nodes to remove one.
- Automatic layout changes only node `position`; it must not reorder `nodes[]` or `connections[]`, add persisted execution metadata, or alter code generation or runtime behavior.
- Manual node movement after automatic layout does not recompute execution order or affect saved/running script behavior.
- Continuous input roots remain concurrently registered; their event processing must not become serial.
- Follow repository style: TypeScript, two-space indent, semicolon-free, `@/` and `@shared/` aliases.
- Before completion run `npm test`, `npm run typecheck`, and `npm run test:e2e:build`.
- Do not create a git commit unless the user explicitly requests one.

---

## File Structure

- Modify: `src/features/script-editor/rete/connectionPath.ts`
  - Owns shared automatic-layout ELK options. Enable semi-interactive strict same-layer ordering and lay disconnected paths together with the existing Layered settings.
- Modify: `src/features/script-editor/rete/setup.ts`
  - Wraps the classic Rete arrange preset and derives each child ELK `elk.position` vertical hint from a read-only current graph order callback.
- Modify: `src/features/script-editor/components/GraphCanvas.tsx`
  - Supplies the Rete factory's node-order callback from `graphRef.current.nodes` without changing layout write-back behavior.
- Modify: `test/script-editor-connection-path.test.ts`
  - Locks the public `ARRANGE_LAYOUT_OPTIONS` contract, including semi-interactive ordering.
- Modify: `test/rete-setup.test.ts`
  - Covers the node-level ELK position options supplied by the wrapped arrange preset.
- Modify: `e2e/script-editor-arrange.spec.ts`
  - Exercises the Electron layout command using an edge-crossing graph and verifies strict layer direction plus top-to-bottom `graph.nodes[]` ordering.
- Do not modify: `src/features/script-editor/codegen/topo.ts` or `src/features/script-editor/codegen/index.ts`
  - `graph.nodes[]` is already their stable traversal order for independent nodes; the feature must not change generation semantics.

### Task 1: Add Ordered Automatic-Layout Regression Coverage

**Files:**
- Modify: `test/script-editor-connection-path.test.ts:7-12`
- Modify: `e2e/script-editor-arrange.spec.ts:2-58`
- Modify: `src/features/script-editor/rete/connectionPath.ts:1-11`

**Interfaces:**
- Consumes: `ARRANGE_LAYOUT_OPTIONS: Record<string, string>` from `src/features/script-editor/rete/connectionPath.ts` and the existing `GraphCanvas.runArrangeLayout()` call at `src/features/script-editor/components/GraphCanvas.tsx:190-215`.
- Produces: `ARRANGE_LAYOUT_OPTIONS['elk.layered.considerModelOrder.strategy']` with exact value `'NODES_AND_EDGES'`, used by Rete AutoArrangePlugin; a Playwright Electron assertion for dependent-column and peer-row positions.

- [ ] **Step 1: Add the failing ELK option assertion**

  In `test/script-editor-connection-path.test.ts`, extend the existing `exposes layered arrange options that favor crossing minimization` test with:

  ```ts
  expect(ARRANGE_LAYOUT_OPTIONS['elk.layered.considerModelOrder.strategy']).toBe('NODES_AND_EDGES')
  ```

  Keep the existing assertions for `elk.algorithm`, `elk.direction`, crossing minimization, and `elk.edgeRouting`. This feature refines the current layout contract rather than replacing it.

- [ ] **Step 2: Run the focused unit test and confirm the new assertion fails**

  Run:

  ```bash
  npm test -- --run test/script-editor-connection-path.test.ts
  ```

  Expected: FAIL because `ARRANGE_LAYOUT_OPTIONS['elk.layered.considerModelOrder.strategy']` is `undefined`.

- [ ] **Step 3: Extend the Electron spec with an ordered, connected graph**

  In the existing `画布工具栏自动排版重排节点位置` test in `e2e/script-editor-arrange.spec.ts`:

  1. Open the component palette and add `input-manual` twice in that order. These are deterministic one-shot roots, and their `graph.nodes[]` insertion order is the existing code-generation tiebreaker.
  2. Expand `输出类` and add `output-log`.
  3. Wait for exactly three `[data-testid="node"]` elements.
  4. Preserve the identities of the roots and output before layout:

  ```ts
  const manualNodes = editor.locator('[data-testid="node"][data-node-key="input-manual"]')
  const firstManual = manualNodes.nth(0)
  const secondManual = manualNodes.nth(1)
  const outputLog = editor.locator('[data-testid="node"][data-node-key="output-log"]')
  const firstManualId = await firstManual.getAttribute('data-node-id')
  const secondManualId = await secondManual.getAttribute('data-node-id')
  const outputLogId = await outputLog.getAttribute('data-node-id')
  expect(firstManualId).toBeTruthy()
  expect(secondManualId).toBeTruthy()
  expect(outputLogId).toBeTruthy()
  ```

  5. Connect the first manual root to the log output by dragging the actual Rete port markup rendered by `ScriptClassicNode`:

  ```ts
  const sourceSocket = firstManual.getByTestId('output-out').locator('.output-socket')
  const targetSocket = outputLog.getByTestId('input-in').locator('.input-socket')
  const sourceBox = await sourceSocket.boundingBox()
  const targetBox = await targetSocket.boundingBox()
  expect(sourceBox).toBeTruthy()
  expect(targetBox).toBeTruthy()
  if (!sourceBox || !targetBox) return

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 6 })
  await page.mouse.up()
  ```

  `ScriptClassicNode` supplies port-container test IDs such as `output-out` / `input-in` and inner `.output-socket` / `.input-socket` elements in `src/features/script-editor/rete/setup.ts:739-776`; do not use nonexistent `data-socket-*` attributes.

  6. Before automatic layout, verify the connection appeared using the existing production-render spec's visible SVG-path criterion:

  ```ts
  await expect.poll(async () => {
    const widths = await editor.locator('path').evaluateAll((paths) => paths
      .filter((path) => {
        const style = getComputedStyle(path)
        return style.fill === 'none' && style.stroke !== 'none'
      })
      .map((path) => path.getBoundingClientRect().width)
      .filter((width) => width > 1)
    )
    return widths.length
  }, { timeout: 10000 }).toBeGreaterThan(0)
  ```

  This prevents a false pass caused by testing three independent nodes.

- [ ] **Step 4: Add post-layout identity and geometry assertions**

  Retain the existing before/after ID/key preservation checks and moved-position assertion, updated for three nodes. After clicking `editor.getByTestId('auto-arrange')`, query using the saved IDs rather than DOM order:

  ```ts
  const firstManualAfter = editor.locator(`[data-testid="node"][data-node-id="${firstManualId}"]`)
  const secondManualAfter = editor.locator(`[data-testid="node"][data-node-id="${secondManualId}"]`)
  const outputLogAfter = editor.locator(`[data-testid="node"][data-node-id="${outputLogId}"]`)
  const firstManualBox = await firstManualAfter.boundingBox()
  const secondManualBox = await secondManualAfter.boundingBox()
  const outputLogBox = await outputLogAfter.boundingBox()
  expect(firstManualBox).toBeTruthy()
  expect(secondManualBox).toBeTruthy()
  expect(outputLogBox).toBeTruthy()
  if (!firstManualBox || !secondManualBox || !outputLogBox) return

  expect(firstManualBox.y).toBeLessThan(secondManualBox.y)
  expect(outputLogBox.x).toBeGreaterThan(firstManualBox.x + 20)
  ```

  The first assertion verifies that the insertion/read order of same-layer root nodes maps to a top-to-bottom layout. The second verifies that the direct dependent occupies a later, right-hand layer. The `+ 20` tolerance requires a distinct layer instead of accepting a rounding-pixel difference.

- [ ] **Step 5: Add the minimal ELK model-order option**

  In `src/features/script-editor/rete/connectionPath.ts`, insert this property immediately after the crossing-minimization option:

  ```ts
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  ```

  The relevant option sequence becomes:

  ```ts
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  ```

  Do not add application-level coordinate sorting. Rete supplies ELK the existing model in `nodes[]` / `connections[]` order, and `NODES_AND_EDGES` preserves that order only where graph dependencies do not constrain sibling placement.

- [ ] **Step 6: Run focused regression coverage**

  Run the option contract first:

  ```bash
  npm test -- --run test/script-editor-connection-path.test.ts
  ```

  Expected: PASS, including existing orthogonal-path tests.

  Then build and run the focused Electron spec because it targets production bundles:

  ```bash
  npm run build
  npx playwright test e2e/script-editor-arrange.spec.ts
  ```

  Expected: PASS. All three nodes retain identity/type; the first manual root is above the second, the connected output is to the right of its prerequisite, and at least one node position changes.

### Task 2: Verify No Script-Behavior Regression

**Files:**
- Modify: none

**Interfaces:**
- Consumes: the ELK layout option and regression coverage added in Task 1.
- Produces: verification evidence that layout preserves TypeScript contracts, generated code behavior, concurrent continuous-listener semantics, and the Electron workflow suite.

- [ ] **Step 1: Run all Vitest tests**

  Run:

  ```bash
  npm test
  ```

  Expected: PASS. `test/rete-codegen.test.ts` must remain passing without modification, particularly its independent one-shot-root and multiple-continuous-root cases; this proves the model-order setting did not alter code-generation traversal or continuous-listener concurrency.

- [ ] **Step 2: Run TypeScript checks**

  Run:

  ```bash
  npm run typecheck
  ```

  Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run the full build-backed Electron E2E suite**

  Run:

  ```bash
  npm run test:e2e:build
  ```

  Expected: PASS, including `e2e/script-editor-arrange.spec.ts`. If any test fails, report the exact failing spec and assertion, diagnose before changing code, and do not claim completion until this command passes.

- [ ] **Step 4: Inspect the final working tree**

  Run:

  ```bash
  git status --short
  git diff --check
  ```

  Expected: no whitespace errors. The intentional implementation changes are `src/features/script-editor/rete/connectionPath.ts`, `test/script-editor-connection-path.test.ts`, and `e2e/script-editor-arrange.spec.ts`; the approved design and this plan are documentation additions.

### Final Review Addendum: Lay Disconnected Paths Together for Global Strict Order

**Reason for correction:** ELK 0.8.2 defaults `elk.separateConnectedComponents` to `true`, independently laying out and packing disconnected paths. The adversarial graph `a → c`, `b → d` therefore cannot rely on a global same-layer `graph.nodes[]` order or the required cross-component crossing unless its components are laid together.

**Files:**
- Modify: `src/features/script-editor/rete/connectionPath.ts:2-5`
- Modify: `test/script-editor-connection-path.test.ts:8-15`

**Interfaces:**
- Produces: `ARRANGE_LAYOUT_OPTIONS['elk.separateConnectedComponents']` with exact value `'false'`, passed unchanged by `GraphCanvas.runArrangeLayout()` into the production AutoArrangePlugin invocation.

- [ ] **Step 1: Add the failing disconnected-components contract assertion**

  In `test/script-editor-connection-path.test.ts`, add:

  ```ts
  expect(ARRANGE_LAYOUT_OPTIONS['elk.separateConnectedComponents']).toBe('false')
  ```

- [ ] **Step 2: Run the focused unit test and confirm RED**

  Run:

  ```bash
  npm test -- --run test/script-editor-connection-path.test.ts
  ```

  Expected: FAIL with `expected undefined to be 'false'` because the root option is absent.

- [ ] **Step 3: Add the minimal root layout option**

  In `src/features/script-editor/rete/connectionPath.ts`, place this directly after the layered direction configuration:

  ```ts
  'elk.separateConnectedComponents': 'false',
  ```

  This forces all disconnected paths into one layered layout component. It is necessary for the strict global same-layer `graph.nodes[]` order: `a → c` and `b → d` must be laid together so ELK retains their required root/output row order and necessary cross-component crossing.

- [ ] **Step 4: Run focused production-equivalent coverage**

  Run:

  ```bash
  npm test -- --run test/script-editor-connection-path.test.ts
  npm run typecheck
  npm run build
  npx playwright test e2e/script-editor-arrange.spec.ts
  ```

  Expected: the option contract and adversarial E2E pass under the final production-equivalent options.


### Task 3: Enforce Strict Order When Paths Cross

**Reason for correction:** Final review established that `elk.layered.considerModelOrder.strategy = NODES_AND_EDGES` is only a crossing-minimization preference. It permits a same-layer permutation when that removes crossings, which violates the approved strict reading-order rule. ELK 0.8.2's documented `semiInteractive` mode instead fixes the order in each layer from node-level `elk.position` hints while retaining ELK's final coordinates and node packing.

**Files:**
- Modify: `src/features/script-editor/rete/connectionPath.ts:1-12`
- Modify: `src/features/script-editor/rete/setup.ts:91-93, 369-428`
- Modify: `src/features/script-editor/components/GraphCanvas.tsx:276-297`
- Modify: `test/script-editor-connection-path.test.ts:7-13`
- Modify: `test/rete-setup.test.ts:1-18, 19-149`
- Modify: `e2e/script-editor-arrange.spec.ts:2-123`

**Interfaces:**
- Add to `CreateReteEditorOptions`:

  ```ts
  getArrangeOrderIndex?: (id: string) => number
  ```

  `GraphCanvas` supplies an index from the current `graphRef.current.nodes`; the callback must return the zero-based `nodes[]` index and throw when the Rete node ID is absent from the current graph.

- Export from `rete/setup.ts`:

  ```ts
  export function createOrderedArrangePreset(
    getArrangeOrderIndex: (id: string) => number
  ): Preset
  ```

  It wraps `ArrangePresets.classic.setup()` and, for every matching Rete node, preserves the classic port function while merging a node-specific `'elk.position': `(0, ${getArrangeOrderIndex(id)})`` option.

- Add the root option:

  ```ts
  'elk.layered.crossingMinimization.semiInteractive': 'true'
  ```

  Keep `'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP'`; semi-interactive crossing minimization requires it. Keep `NODES_AND_EDGES` only as a model-order preference, not as the strict-order guarantee. Do not add `forceNodeModelOrder`.

- [ ] **Step 1: Write failing contract and preset tests**

  In `test/script-editor-connection-path.test.ts`, add this assertion to the existing arrange-options test:

  ```ts
  expect(ARRANGE_LAYOUT_OPTIONS['elk.layered.crossingMinimization.semiInteractive']).toBe('true')
  ```

  In `test/rete-setup.test.ts`, import `createOrderedArrangePreset` and add a test that invokes the returned preset for a node ID with an injected order index:

  ```ts
  it('adds graph order as an ELK vertical position hint', () => {
    const preset = createOrderedArrangePreset((id) => id === 'later' ? 3 : 0)
    const layout = preset('later')

    expect(layout).toBeTruthy()
    expect(layout?.options?.('later')).toMatchObject({
      'elk.position': '(0, 3)'
    })
    expect(layout?.port({
      nodeId: 'later',
      side: 'input',
      key: 'in',
      index: 0,
      ports: 1,
      width: 216,
      height: 120
    })).toMatchObject({ side: 'WEST' })
  })
  ```

  The port assertion proves the wrapper retains the classic preset rather than replacing port placement.

- [ ] **Step 2: Extend the E2E test to the adversarial crossing graph**

  Replace the existing three-node setup in `e2e/script-editor-arrange.spec.ts` with this exact insertion order:

  ```text
  a = input-manual
  b = input-manual
  d = output-log
  c = output-log
  ```

  Save the four IDs immediately after node creation. Add two real socket drags using the established port selectors:

  ```ts
  a.output-out -> c.input-in
  b.output-out -> d.input-in
  ```

  Keep the visible-connection `expect.poll`, changing the expected count to two paths. Keep the saved-ID coordinate-change polling barrier after automatic layout.

  After that barrier, assert these exact relationships from the saved-ID bounding boxes:

  ```ts
  expect(Math.abs(aBox.x - bBox.x)).toBeLessThan(6)
  expect(Math.abs(dBox.x - cBox.x)).toBeLessThan(6)
  expect(dBox.x).toBeGreaterThan(aBox.x + 20)
  expect(cBox.x).toBeGreaterThan(bBox.x + 20)
  expect(aBox.y).toBeLessThan(bBox.y)
  expect(dBox.y).toBeLessThan(cBox.y)
  ```

  Preserve the existing node count, ID/type preservation, and layout-movement checks. The connections necessarily cross if every layer follows the requested global array order, so the final `dBox.y < cBox.y` assertion must fail under the current preference-only implementation.

- [ ] **Step 3: Run the new tests and confirm RED**

  Run the focused Vitest files:

  ```bash
  npm test -- --run test/script-editor-connection-path.test.ts test/rete-setup.test.ts
  ```

  Expected: FAIL because `semiInteractive` and `createOrderedArrangePreset` are not implemented.

  Then build and run the focused E2E:

  ```bash
  npm run build
  npx playwright test e2e/script-editor-arrange.spec.ts
  ```

  Expected: FAIL on the output-layer order `dBox.y < cBox.y` under the current model-order-only configuration. If the test fails earlier, fix the test setup until it reaches this intended behavioral failure.

- [ ] **Step 4: Implement the smallest strict-order adapter**

  In `connectionPath.ts`, add the semi-interactive root option immediately after `LAYER_SWEEP`:

  ```ts
  'elk.layered.crossingMinimization.semiInteractive': 'true',
  ```

  In `rete/setup.ts`:

  1. Import `Preset` from `rete-auto-arrange-plugin`.
  2. Add `getArrangeOrderIndex?: (id: string) => number` to `CreateReteEditorOptions`.
  3. Export `createOrderedArrangePreset(getArrangeOrderIndex)`. It must create one `const classic = ArrangePresets.classic.setup()` closure, delegate `classic(nodeId)`, return `null` when classic returns `null`, retain all classic preset fields, and override only `options` by merging `classic.options?.(id)` with `'elk.position': `(0, ${getArrangeOrderIndex(id)})``.
  4. Replace the single `arrange.addPreset(ArrangePresets.classic.setup())` registration with `arrange.addPreset(createOrderedArrangePreset((id) => options.getArrangeOrderIndex?.(id) ?? 0))`. Do not register a second preset; Rete chooses the first matching preset.

  In `GraphCanvas.tsx`, pass this callback to `createReteEditor`:

  ```ts
  getArrangeOrderIndex: (id) => {
    const index = graphRef.current.nodes.findIndex((node) => node.id === id)
    if (index < 0) throw new Error(`未找到自动排版节点：${id}`)
    return index
  }
  ```

  This callback reads only the current canonical graph order. It must not inspect position, DOM order, persistence fields, or code-generation results.

- [ ] **Step 5: Run GREEN focused coverage**

  Run:

  ```bash
  npm test -- --run test/script-editor-connection-path.test.ts test/rete-setup.test.ts
  npm run typecheck
  npm run build
  npx playwright test e2e/script-editor-arrange.spec.ts
  git diff --check
  ```

  Expected: both focused Vitest files pass; TypeScript and production build pass; the adversarial Electron E2E passes with both layers in graph insertion order despite the necessary crossing; no whitespace errors.

- [ ] **Step 6: Re-run complete required verification**

  Run:

  ```bash
  npm test
  npm run typecheck
  npm run test:e2e:build
  ```

  Expected: all commands pass. `test/rete-codegen.test.ts` remains unchanged and passing, proving this strict layout hint has not changed code-generation or continuous-listener semantics. Do not create a git commit unless the user explicitly requests one.

### Task 4: Stabilize New-Panel E2E Readiness

**Reason for correction:** The final independent `npm run test:e2e:build` verification failed with `63/65` passing. The Modbus CSV and TCP panel workflows occasionally continued while `NewPanelDialog` was closing but still mounted. Radix applies `aria-hidden` to the workspace until `DialogContent` and `DialogOverlay` unmount; the old fixture treated `data-state !== 'open'` as completed too early. This is an E2E synchronization fault, not a TCP, Modbus, or script-editor behavior change.

**Files:**
- Modify: `e2e/fixtures.ts:81-111, 145-171`
- Modify: `e2e/tcp-panel.spec.ts:27-43`

**Interfaces:**
- `expectDialogClosed(page, name?)` resolves only after matching dialog content and all dialog overlays are detached from the DOM.
- `confirmNewPanelDialog(page, dialog)` retains its native submit click and sidebar-row confirmation, then benefits from the stronger dialog-detachment barrier.
- TCP panel E2E uses its accessible `发送` button as the FloatingPane/SendBar readiness boundary: visible while closed, enabled after connection.

- [ ] **Step 1: Preserve the existing full-suite failure as RED evidence**

  The pre-fix completion run is the regression reproduction:

  ```bash
  npm run test:e2e:build
  ```

  Expected before the fix: intermittent failures may leave `新建面板` in the accessibility tree while a newly created TCP/Modbus workspace control cannot be found. Record the exact failing spec and snapshot. Confirm the failure is absent-element/accessibility timing, not a disabled send button or failed TCP connection.

- [ ] **Step 2: Strengthen the dialog-detachment fixture**

  In `e2e/fixtures.ts`, replace the two `data-state !== 'open'` polling blocks inside `expectDialogClosed()` with actual DOM-detachment assertions:

  ```ts
  await expect(dialog).toHaveCount(0, { timeout: 10000 })
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0, { timeout: 5000 })
  ```

  `DialogContent` and `DialogOverlay` use exit animations and remain mounted with `data-state="closed"` before Radix releases the workspace from its modal `aria-hidden` handling. Do not accept `closed` as ready. Keep the optional `name` scoping for dialog content and wait for all overlays because any remaining modal overlay still suppresses the page.

- [ ] **Step 3: Use workspace readiness in the TCP E2E**

  In the first `TCP 面板收发` test, immediately after `confirmNewPanelDialog(page, dialog)`, create the send-button locator and wait for it to be accessible and visible before clicking the sidebar connect control:

  ```ts
  const sendBtn = page.getByRole('button', { name: '发送', exact: true })
  await expect(sendBtn).toBeVisible({ timeout: 10000 })
  await expect(sendBtn).toBeDisabled()
  ```

  Keep the existing connect click and `点击断开` visibility assertion. Reuse the same `sendBtn` afterward and wait for `toBeEnabled()` before sending. Do not change `SendBar`, panel store, TCP IPC, or Electron runtime settings.

- [ ] **Step 4: Run focused repetitions for GREEN evidence**

  Run:

  ```bash
  npx playwright test e2e/modbus-panel-csv.spec.ts e2e/tcp-panel.spec.ts --repeat-each=4
  ```

  Expected: all 12 executions pass. This command exercises the shared new-panel fixture with both Modbus and TCP workflows repeatedly and verifies that the accessible workspace is ready after dialog closure.

- [ ] **Step 5: Run final complete verification**

  Run:

  ```bash
  npm test
  npm run typecheck
  npm run test:e2e:build
  git diff --check
  ```

  Expected: all commands pass, including the strict automatic-layout crossing E2E and the previously flaky Modbus/TCP panel flows. Do not create a commit unless the user explicitly requests one.
