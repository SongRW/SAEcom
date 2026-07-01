# Script Editor Canvas Tools Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the Phase 1 React/Rete script editor with serial-panel binding, a draggable component tree, top-left canvas tools, Delete removal, smarter node placement, and cleaner shadcn-like node visuals.

**Architecture:** Keep graph and UI behavior in small pure helpers first, then wire React components around those helpers. Legacy renderer exposes read-only serial panel summaries to React without moving serial ownership out of legacy. Rete setup remains the rendering engine, with styling and keyboard behavior layered in the React canvas wrapper.

**Tech Stack:** Electron, Vite, React 19, TypeScript, Rete 2, Vitest, shadcn/Radix UI components, shadcn CSS tokens.

---

## File Structure

- Modify `shared/types.ts`: add panel summary and `serialPanel` control metadata.
- Modify `renderer.js`: expose read-only serial panel summaries and dispatch update events.
- Modify `src/features/script-editor/nodes/definitions.ts`: change serial node controls from free-text `port` to select-like `panelId`.
- Modify `src/features/script-editor/viewModel.ts`: add serial panel option builder and smart node placement helper.
- Modify `src/features/script-editor/uiState.ts`: add canvas tool mode and selection-delete transition.
- Modify `src/features/script-editor/rete/graphState.ts`: reuse existing remove logic for keyboard delete.
- Modify `src/features/script-editor/rete/setup.ts`: avoid rendering select controls as text inputs where possible and shrink node size.
- Modify `src/features/script-editor/components/NodePalette.tsx`: tree-style draggable component library.
- Create `src/features/script-editor/components/CanvasToolBar.tsx`: top-left mouse operation toolbar.
- Modify `src/features/script-editor/components/GraphCanvas.tsx`: focusable canvas, Delete handling, selected/mode classes.
- Modify `src/features/script-editor/components/NodeConfigPanel.tsx`: serial binding select and coordinate display.
- Modify `src/features/script-editor/ScriptEditorDialog.tsx`: serial panel bridge, tool mode, smarter add-node placement.
- Modify `src/features/script-editor/script-editor.css`: micro-radius shadcn styling, tree palette, toolbar, node polish, `.theme-dark` support.
- Create via shadcn CLI: `src/components/ui/select.tsx`, `toggle-group.tsx`, `tooltip.tsx`, `collapsible.tsx`, `scroll-area.tsx`, `separator.tsx`.
- Modify/add tests under `test/`: pure helper and UI-state coverage.

## Tasks

### Task 1: Specs And Plan

**Files:**
- Create: `docs/superpowers/specs/2026-06-16-script-editor-canvas-tools-feedback-design.md`
- Create: `docs/superpowers/plans/2026-06-16-script-editor-canvas-tools-feedback.md`

- [ ] Write the design spec and this implementation plan.
- [ ] Self-review for ambiguity and placeholders.
- [ ] Commit:

```bash
git add -- docs/superpowers/specs/2026-06-16-script-editor-canvas-tools-feedback-design.md docs/superpowers/plans/2026-06-16-script-editor-canvas-tools-feedback.md
git commit -m "docs(phase1): script editor canvas tools feedback design"
```

### Task 2: Install shadcn UI Components

**Files:**
- Create: `src/components/ui/select.tsx`
- Create: `src/components/ui/toggle-group.tsx`
- Create: `src/components/ui/tooltip.tsx`
- Create: `src/components/ui/collapsible.tsx`
- Create: `src/components/ui/scroll-area.tsx`
- Create: `src/components/ui/separator.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Install official components:

```bash
npx shadcn@latest add select toggle-group tooltip collapsible scroll-area separator
```

- [ ] Read generated component files and confirm imports use `@/lib/utils` and local Button conventions.
- [ ] Commit:

```bash
git add -- package.json package-lock.json src/components/ui/select.tsx src/components/ui/toggle-group.tsx src/components/ui/tooltip.tsx src/components/ui/collapsible.tsx src/components/ui/scroll-area.tsx src/components/ui/separator.tsx
git commit -m "feat(phase1): add shadcn controls for script editor"
```

### Task 3: Pure Logic Tests

**Files:**
- Modify: `test/script-editor-ui-state.test.ts`
- Modify: `test/script-editor-graph-state.test.ts`
- Modify: `test/rete-codegen.test.ts`
- Modify: `src/features/script-editor/viewModel.ts`
- Modify: `src/features/script-editor/uiState.ts`

- [ ] Add failing tests for tool mode defaults/switching.
- [ ] Add failing tests for selection delete transition.
- [ ] Add failing tests for `getNextCanvasNodePosition`.
- [ ] Add failing tests for serial panel options.
- [ ] Run targeted tests and verify they fail for missing exports/behavior:

```bash
npm test -- test/script-editor-ui-state.test.ts test/script-editor-graph-state.test.ts test/rete-codegen.test.ts
```

### Task 4: Logic Implementation

**Files:**
- Modify: `shared/types.ts`
- Modify: `src/features/script-editor/viewModel.ts`
- Modify: `src/features/script-editor/uiState.ts`
- Modify: `src/features/script-editor/nodes/definitions.ts`

- [ ] Add `SerialPanelSummary` and `ControlSpec.source`.
- [ ] Implement `setCanvasTool`, `onSelectedNodeDeleted`.
- [ ] Implement `getNextCanvasNodePosition` and `buildSerialPanelOptions`.
- [ ] Change `input-serial` and `output-serial` controls to `panelId` select source.
- [ ] Run targeted tests and verify they pass.
- [ ] Commit:

```bash
git add -- shared/types.ts src/features/script-editor/viewModel.ts src/features/script-editor/uiState.ts src/features/script-editor/nodes/definitions.ts test/script-editor-ui-state.test.ts test/script-editor-graph-state.test.ts test/rete-codegen.test.ts
git commit -m "feat(phase1): add script editor canvas logic helpers"
```

### Task 5: UI Wiring

**Files:**
- Modify: `renderer.js`
- Modify: `src/features/script-editor/ScriptEditorDialog.tsx`
- Modify: `src/features/script-editor/components/GraphCanvas.tsx`
- Modify: `src/features/script-editor/components/NodeConfigPanel.tsx`
- Modify: `src/features/script-editor/components/NodePalette.tsx`
- Create: `src/features/script-editor/components/CanvasToolBar.tsx`

- [ ] Expose `window.getSerialPanelSummaries()` in `renderer.js`.
- [ ] Dispatch `saecom:serial-panels-changed` after active/panel/open state changes.
- [ ] Add `CanvasToolBar` with shadcn `ToggleGroup` and `Tooltip` pointer/select/pan icon buttons.
- [ ] Wire tool mode and serial panel summaries in `ScriptEditorDialog`.
- [ ] Use smart placement for click-add, keep pointer-based placement for drag-drop.
- [ ] Make `GraphCanvas` focusable and handle `Delete` for the selected node.
- [ ] Render serial panel binding through shadcn `Select` and read-only coordinates in `NodeConfigPanel`.
- [ ] Convert `NodePalette` to shadcn `Collapsible` tree rows inside `ScrollArea`.
- [ ] Run `npm run typecheck`.
- [ ] Commit:

```bash
git add -- renderer.js src/features/script-editor/ScriptEditorDialog.tsx src/features/script-editor/components/GraphCanvas.tsx src/features/script-editor/components/NodeConfigPanel.tsx src/features/script-editor/components/NodePalette.tsx src/features/script-editor/components/CanvasToolBar.tsx
git commit -m "feat(phase1): wire script editor canvas tools"
```

### Task 6: Visual Polish And Verification

**Files:**
- Modify: `src/features/script-editor/rete/setup.ts`
- Modify: `src/features/script-editor/script-editor.css`

- [ ] Tune Rete node dimensions and render select controls as non-text where feasible.
- [ ] Add tree palette, toolbar, node selected state, socket/input spacing, and `.theme-dark` CSS.
- [ ] Run:

```bash
npm test
npm run typecheck
npm run build
```

- [ ] Restart or reuse `npm run dev`, open `http://localhost:5173/src/index.html`, and smoke-test the script editor.
- [ ] Commit:

```bash
git add -- src/features/script-editor/rete/setup.ts src/features/script-editor/script-editor.css
git commit -m "style(phase1): polish script editor canvas tools"
```
