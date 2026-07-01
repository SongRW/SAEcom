# Phase 1 Script Editor Rete Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy Drawflow script editor path with a React + Rete editor, typed node registry, key-dispatched code generator, and complete script sandbox APIs while preserving the Phase 0 dual-track app.

**Architecture:** Phase 1 is implemented behind `useReactScriptEditor`. The first slices build a typed graph/codegen core that accepts a Rete-export-like JSON format and can be tested without UI. Later slices add the Rete canvas, script dialog, persistence, and runtime integration. Legacy Drawflow files stay in place until the React path passes acceptance.

**Tech Stack:** TypeScript, Vitest, React, Zustand, Rete v2 (`rete`, `rete-area-plugin`, `rete-connection-plugin`, `rete-react-plugin`, `rete-auto-arrange-plugin`, `rete-dock-plugin`), Tailwind/shadcn primitives already present in Phase 0.

**Spec:** `docs/superpowers/specs/2026-06-15-react-rete-migration-design.md` §4

---

## File Structure

Phase 1 adds these focused modules:

```
src/features/script-editor/
├─ ScriptEditorDialog.tsx          # React shell for the script editor dialog
├─ components/
│  ├─ NodePalette.tsx              # Category/node palette
│  ├─ ScriptList.tsx               # Saved script list
│  ├─ ScriptOutputPanel.tsx        # Console output panel
│  └─ Toolbar.tsx                  # Editor actions
├─ codegen/
│  ├─ index.ts                     # generateCode(graph)
│  ├─ graph.ts                     # Rete export normalization
│  ├─ topo.ts                      # dependency ordering
│  ├─ context.ts                   # variable/processed-node state
│  ├─ registry.ts                  # key -> emitter registry
│  └─ emit/
│     ├─ shared.ts
│     ├─ input.ts
│     ├─ transform.ts
│     ├─ control.ts
│     ├─ compare.ts
│     ├─ logical.ts
│     └─ output.ts
├─ nodes/
│  ├─ definitions.ts               # 50 typed node definitions
│  └─ sockets.ts                   # data/bool/flow/trigger socket metadata
├─ persistence.ts                  # VS_FLOW_START / VS_FLOW_END helpers
├─ rete/
│  ├─ setup.ts                     # Rete editor initialization
│  └─ types.ts                     # Rete scheme types
└─ store.ts                        # dialog/editor runtime state
```

The existing `src/code-generator.js`, `src/node-definitions.js`, `src/flow-editor.js`, and Drawflow HTML remain untouched until Phase 1 final switch-over.

## Task 1: Typed Node Registry + Rete Codegen Core

**Files:**
- Create: `src/features/script-editor/nodes/sockets.ts`
- Create: `src/features/script-editor/nodes/definitions.ts`
- Create: `src/features/script-editor/codegen/index.ts`
- Create: `src/features/script-editor/codegen/graph.ts`
- Create: `src/features/script-editor/codegen/topo.ts`
- Create: `src/features/script-editor/codegen/context.ts`
- Create: `src/features/script-editor/codegen/registry.ts`
- Create: `src/features/script-editor/codegen/emit/shared.ts`
- Create: `src/features/script-editor/codegen/emit/input.ts`
- Create: `src/features/script-editor/codegen/emit/transform.ts`
- Create: `src/features/script-editor/codegen/emit/control.ts`
- Create: `src/features/script-editor/codegen/emit/compare.ts`
- Create: `src/features/script-editor/codegen/emit/logical.ts`
- Create: `src/features/script-editor/codegen/emit/output.ts`
- Modify: `shared/types.ts`
- Test: `test/rete-codegen.test.ts`

- [ ] **Step 1: Add the failing registry/codegen tests**

Create `test/rete-codegen.test.ts` with tests that import `NODE_DEFINITIONS`, `NODE_CATEGORIES`, and `generateCodeFromRete`. Cover:
- Registry has exactly 50 definitions.
- Registry includes 9 categories and the new `compare`/`logical` categories.
- `control-if` condition input uses `boolSocket`.
- Compare/logical codegen is dispatched by node key, not display name.
- `control-wait` emits `await waitOnePacket(timeout)`.
- `control-timeout` emits `Promise.race`.
- An unknown display name with a known key still generates correct code.

Run:
```bash
npm test -- test/rete-codegen.test.ts
```

Expected: fail because the new modules do not exist.

- [ ] **Step 2: Add shared graph/node types**

Modify `shared/types.ts` to add `SocketKind`, `NodeCategory`, `SocketSpec`, `ControlSpec`, `NodeDef`, `ReteGraphNode`, `ReteGraphConnection`, and `ReteGraphExport`. These types must not change the existing `WindowAPI` contract.

- [ ] **Step 3: Implement socket metadata and 50 node definitions**

Create `src/features/script-editor/nodes/sockets.ts` and `definitions.ts`. Include all 37 existing keys plus 13 new compare/logical keys from the spec. Each definition must declare stable `key`, `category`, `name`, `inputs`, `outputs`, and `controls`. Use `boolSocket` for compare/logical outputs and for the `control-if` `condition` input.

- [ ] **Step 4: Implement graph normalization and topo sort**

Create `graph.ts` to accept a Rete-export-like shape:
```ts
{
  nodes: [{ id, key, label?, position?, data?, inputs?, outputs? }],
  connections: [{ id?, source, sourceOutput, target, targetInput }]
}
```

Also accept object maps for `nodes` and `connections` so future Rete plugin exports can be normalized without changing emitters. Create `topo.ts` with dependency ordering and cycle tolerance for control-flow loops.

- [ ] **Step 5: Implement emitter registry and emitters**

Implement `generateCodeFromRete(graph, registry?)` with the same safety wrapper as the legacy generator:
```js
try {
  if (await checkStop()) return;
  ...
} catch (e) {
  if (e.message !== 'ABORTED') console.log('Error: ' + e.message);
}
```

Dispatch emitters by `node.key`. Do not branch on Chinese display names.

- [ ] **Step 6: Run the new test and legacy suite**

Run:
```bash
npm test -- test/rete-codegen.test.ts
npm test
```

Expected: new tests pass and the existing 18 legacy codegen tests continue to pass.

- [ ] **Step 7: Run typecheck**

Run:
```bash
npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add shared/types.ts src/features/script-editor test/rete-codegen.test.ts docs/superpowers/plans/2026-06-16-phase1-script-editor-rete.md
git commit -m "feat(phase1): typed Rete node registry and codegen core"
```

## Task 2: Script Sandbox API Completion

**Files:**
- Modify: `electron/main.ts`
- Test: `test/script-sandbox-api.test.ts`

- [ ] **Step 1: Add failing sandbox API tests**

Create `test/script-sandbox-api.test.ts` around pure helper exports or extracted helper functions. Cover `convertEncoding`, `swapBytes`, `chunkString`, `bytesToNumber`, `crc8`, `crc16ccitt`, `crc32`, `checksum`, and `_last_recv` update semantics.

Run:
```bash
npm test -- test/script-sandbox-api.test.ts
```

Expected: fail until helpers are extracted/implemented.

- [ ] **Step 2: Extract sandbox helpers**

Create a small helper module if needed so tests do not boot Electron. Wire the helpers back into `electron/main.ts` sandbox construction.

- [ ] **Step 3: Add missing sandbox entries**

Add the missing APIs required by the spec:
`writeFile`, `globalVars`, `convertEncoding`, `swapBytes`, `chunkString`, `bytesToNumber`, `crc8`, `crc16ccitt`, `crc32`, `checksum`, and `_last_recv`.

- [ ] **Step 4: Verify**

Run:
```bash
npm test -- test/script-sandbox-api.test.ts
npm test
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts test/script-sandbox-api.test.ts src/features/script-editor
git commit -m "feat(phase1): complete script sandbox APIs"
```

## Task 3: Persistence Format Helpers

**Files:**
- Create: `src/features/script-editor/persistence.ts`
- Test: `test/rete-persistence.test.ts`

- [ ] **Step 1: Add failing persistence tests**

Cover `buildScriptFile(graph, code)`, `parseScriptFile(content)`, empty script behavior, invalid JSON, and exact `VS_FLOW_START` / `VS_FLOW_END` markers.

- [ ] **Step 2: Implement persistence helpers**

Write the Rete JSON into the marker block and append generated code under `// Generated code:`.

- [ ] **Step 3: Verify and commit**

Run:
```bash
npm test -- test/rete-persistence.test.ts
npm test
npm run typecheck
git add src/features/script-editor/persistence.ts test/rete-persistence.test.ts
git commit -m "feat(phase1): Rete script persistence format"
```

## Task 4: Rete Dependency Setup + Canvas Skeleton

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/features/script-editor/rete/types.ts`
- Create: `src/features/script-editor/rete/setup.ts`
- Create: `src/features/script-editor/store.ts`
- Test: `test/rete-setup.test.ts`

- [ ] **Step 1: Install Rete packages**

Run:
```bash
npm install rete rete-area-plugin rete-connection-plugin rete-react-plugin rete-auto-arrange-plugin rete-dock-plugin lucide-react
```

Use unscoped package names; the scoped `@retejs/*` names from the spec are not published in the npm registry used by this project.

- [ ] **Step 2: Add a minimal setup test**

Test that `createScriptEditorRuntime` or equivalent can register sockets/categories without touching the DOM.

- [ ] **Step 3: Implement Rete setup module**

Initialize `NodeEditor`, area, connection, React render, arrange, and dock/palette support. Keep DOM-specific initialization behind a function that receives the container element.

- [ ] **Step 4: Verify and commit**

Run:
```bash
npm test -- test/rete-setup.test.ts
npm run typecheck
git add package.json package-lock.json src/features/script-editor/rete src/features/script-editor/store.ts test/rete-setup.test.ts
git commit -m "feat(phase1): Rete canvas setup skeleton"
```

## Task 5: React Script Editor Dialog UI

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/index.html`
- Modify: `src/shared/store/flags.ts`
- Create: `src/features/script-editor/ScriptEditorDialog.tsx`
- Create: `src/features/script-editor/components/Toolbar.tsx`
- Create: `src/features/script-editor/components/NodePalette.tsx`
- Create: `src/features/script-editor/components/ScriptList.tsx`
- Create: `src/features/script-editor/components/ScriptOutputPanel.tsx`
- Modify/Create shadcn UI components as needed in `src/components/ui/`

- [ ] **Step 1: Add UI tests where practical**

Use Vitest component tests only for pure components/state reducers. Do not block on full browser automation in this slice.

- [ ] **Step 2: Enable React root visibility only for script editor**

Remove `#root { display: none; }` from `src/index.html` only when `useReactScriptEditor` is enabled via the React mount path. Keep legacy DOM visible until switch-over is complete.

- [ ] **Step 3: Implement dialog shell**

Build the Dify-like layout: toolbar, 9-category node palette, central canvas host, script list, and draggable output panel. Use icons inside action buttons and compact desktop-tool styling.

- [ ] **Step 4: Wire IPC for script list and output**

Use `window.api.scripts.list/read/write/delete/run/stop/onEnded` through `getIPC()` or `useIPC()`.

- [ ] **Step 5: Verify visually**

Run:
```bash
npm run dev
```

Open the script editor, verify no overlap at desktop and a narrow viewport, save/load a script, run in test mode, and stop.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(phase1): React script editor dialog shell"
```

## Task 6: Canvas Node Creation, Connections, and Configuration

**Files:**
- Modify: `src/features/script-editor/rete/setup.ts`
- Modify: `src/features/script-editor/ScriptEditorDialog.tsx`
- Modify: `src/features/script-editor/components/NodePalette.tsx`
- Create/Modify: node rendering components under `src/features/script-editor/components/`

- [ ] **Step 1: Add focused tests for config state**

Test definition defaults, control updates, and graph export normalization.

- [ ] **Step 2: Implement drag/drop node creation**

All 50 nodes must be addable from the palette. Connection sockets must enforce `control-if.condition` as bool-only and compare/logical bool sockets.

- [ ] **Step 3: Implement node configuration UI**

Simple controls render inline; complex controls use popovers/forms. Required missing values show an error state.

- [ ] **Step 4: Verify**

Run:
```bash
npm test
npm run typecheck
npm run dev
```

Manually verify add, connect, configure, delete, select, zoom, and save/load.

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat(phase1): Rete node creation and configuration"
```

## Task 7: Switch Script Editor from Legacy Drawflow to React/Rete

**Files:**
- Modify: `src/shared/store/flags.ts`
- Modify: `src/App.tsx`
- Modify: `renderer.js`
- Modify: `src/index.html`

- [ ] **Step 1: Add guard tests if helpers exist**

Test that the script editor feature flag defaults to true only after the React implementation is wired.

- [ ] **Step 2: Stop legacy script editor initialization when React flag is active**

Prevent duplicate IPC listeners and duplicate `scripts:ended` handlers. Keep legacy code in the repo for rollback.

- [ ] **Step 3: Enable `useReactScriptEditor` by default**

Show the React editor in place of the legacy dialog.

- [ ] **Step 4: Verify full acceptance**

Run:
```bash
npm test
npm run typecheck
npm run build
npm run dev
```

Manual checklist:
- 50 nodes addable
- Node config, connect, delete, select, zoom all work
- Save/load uses Rete marker format
- Run/stop works and output panel receives logs
- Legacy serial/TCP/panels/settings still behave
- Dark mode remains readable

- [ ] **Step 5: Commit**

```bash
git add src renderer.js
git commit -m "feat(phase1): switch script editor to React Rete path"
```

## Task 8: Final Phase 1 Verification

- [ ] **Step 1: Run full automated verification**

Run:
```bash
npm test
npm run typecheck
npm run build
```

- [ ] **Step 2: Run manual Electron verification**

Run:
```bash
npm run dev
```

Verify script editor acceptance plus core legacy flows.

- [ ] **Step 3: Optional package verification**

Run if time/environment allows:
```bash
npm run pack
```

- [ ] **Step 4: Commit final verification note if files changed**

```bash
git status --short
git commit -m "feat(phase1): Phase 1 verification complete"
```

---

## Phase 1 Acceptance Checklist

- [ ] Left palette can add 9 categories / 50 nodes.
- [ ] Nodes can be configured, connected with socket constraints, deleted, selected, and zoomed.
- [ ] Save/load uses Rete native graph JSON inside `VS_FLOW_START` markers.
- [ ] Running scripts writes output to the bottom panel and can be stopped.
- [ ] Existing 18 legacy codegen tests still pass.
- [ ] Compare/logical codegen tests pass.
- [ ] `control-timeout` and `control-wait` codegen tests pass.
- [ ] Sandbox APIs are complete for all generated code paths.
- [ ] UI reads as Dify-like, compact, and works in dark mode.
