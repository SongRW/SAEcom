# Script Editor: Custom Naming + Save/Delete Confirmations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the script editor's New/Save/Delete actions safer and more flexible — New prompts for a custom name, Save warns before overwriting an existing file, Delete asks for confirmation.

**Architecture:** All changes live in `ScriptEditorDialog.tsx` plus one tiny pure helper in `viewModel.ts`. Reuse the existing `PromptDialog` (for New naming) and `AlertDialog` (for overwrite + delete confirmation), exactly mirroring the pattern already established in `PaneContextMenu.tsx:162-177`. Add a small pure helper `nextDefaultScriptName()` so the name-clash/overwite detection logic is unit-testable.

**Tech Stack:** React (function components, `useState`), TypeScript/TSX, Radix-based `@/components/ui/alert-dialog` + `prompt-dialog`, Vitest for the pure-helper test.

**Spec:** `docs/superpowers/specs/2026-06-28-script-editor-naming-and-confirmations-design.md`

---

## File Structure

- **Modify:** `src/features/script-editor/viewModel.ts` — add one pure helper `nextDefaultScriptName(existing: string[]): string` (extracts the existing `Script_N` increment logic so it can be tested and reused).
- **Modify:** `src/features/script-editor/ScriptEditorDialog.tsx` — add 3 state vars, refactor `createScript`/`saveScript`/`writeScriptAs`/`deleteScript`, add 2 dialogs (PromptDialog for new-script naming; AlertDialog shared for overwrite + delete).
- **Test:** `test/script-editor-view-model.test.ts` — add cases for `nextDefaultScriptName`.

No new files. `Toolbar.tsx` interface is unchanged. No IPC contract changes. No settings-store changes.

---

## Task 1: Extract `nextDefaultScriptName` pure helper (TDD)

**Files:**
- Modify: `src/features/script-editor/viewModel.ts`
- Test: `test/script-editor-view-model.test.ts`

This extracts the existing `Script_N.js` increment logic (currently inline in `createScript`) into a named, testable function, and adds the variant we need (default name that already includes `.js`, with collision avoidance). The current inline logic at `ScriptEditorDialog.tsx:217-220` is:

```ts
let index = 1
while (scripts.includes(`Script_${index}.js`)) index++
const name = normalizeScriptName(`Script_${index}`)
```

We extract this verbatim into a helper.

- [ ] **Step 1: Write the failing test**

Add to `test/script-editor-view-model.test.ts`. First add `nextDefaultScriptName` to the import at the top of the file:

```ts
import {
  buildSerialPanelOptions,
  buildSerialPortOptions,
  clampCanvasZoom,
  createDefaultReteGraph,
  fitGraphToView,
  groupNodesForPalette,
  nextDefaultScriptName,
  normalizeScriptName
} from '../src/features/script-editor/viewModel'
```

Then add this `describe` block at the end of the file (after the existing closing `})` of the top-level `describe`, or as a new `describe` inside it — match whatever keeps the file's existing structure; the safest is a new top-level `describe`):

```ts
describe('nextDefaultScriptName', () => {
  it('returns Script_1.js when no scripts exist', () => {
    expect(nextDefaultScriptName([])).toBe('Script_1.js')
  })

  it('skips names already taken', () => {
    expect(nextDefaultScriptName(['Script_1.js', 'Script_2.js'])).toBe('Script_3.js')
  })

  it('fills the first gap', () => {
    expect(nextDefaultScriptName(['Script_1.js', 'Script_3.js'])).toBe('Script_2.js')
  })

  it('ignores unrelated files', () => {
    expect(nextDefaultScriptName(['notes.js', 'Script_1.js'])).toBe('Script_2.js')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/script-editor-view-model.test.ts`
Expected: FAIL — `nextDefaultScriptName is not exported` / module has no exported member.

- [ ] **Step 3: Write minimal implementation**

In `src/features/script-editor/viewModel.ts`, add this function immediately after `normalizeScriptName` (after line 31):

```ts
/** 生成下一个默认脚本名：Script_1.js、Script_2.js……跳过已占用的编号，回填空缺。 */
export function nextDefaultScriptName(existing: string[]): string {
  const taken = new Set(existing)
  let index = 1
  while (taken.has(`Script_${index}.js`)) index++
  return `Script_${index}.js`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/script-editor-view-model.test.ts`
Expected: PASS — all 4 new cases pass.

- [ ] **Step 5: Run full typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/script-editor/viewModel.ts test/script-editor-view-model.test.ts
git commit -m "feat(script-editor): extract nextDefaultScriptName helper

把 createScript 里的 Script_N 自增逻辑抽成纯函数，便于复用与单测。"
```

---

## Task 2: Add state + refactor New/Save/Delete handlers in `ScriptEditorDialog`

**Files:**
- Modify: `src/features/script-editor/ScriptEditorDialog.tsx`

This is the core change. It:
1. Adds the 3 new state vars.
2. Imports `nextDefaultScriptName` and the `AlertDialog` family.
3. Changes `createScript` to `onNew` → opens naming dialog; the dialog confirm creates with collision/overwrite handling.
4. Refactors `writeScriptAs` to check name collision and route through an overwrite confirmation.
5. Adds a shared `AlertDialog` for overwrite + a separate one for delete confirmation.
6. Changes `deleteScript` to open confirmation first.

- [ ] **Step 1: Update imports**

In `ScriptEditorDialog.tsx`, the import block from `./viewModel` (lines 28-37) currently ends with `normalizeScriptName`. Add `nextDefaultScriptName`:

```ts
import {
  buildSerialPanelOptions,
  buildSerialPortOptions,
  AUTO_SERIAL_PORT_REFRESH_INTERVAL_MS,
  clampCanvasZoom,
  getNextCanvasNodePosition,
  getNextPaletteNodePosition,
  groupNodesForPalette,
  nextDefaultScriptName,
  normalizeScriptName
} from './viewModel'
```

Then add an import for the `AlertDialog` family right after the existing `PromptDialog` import (line 57). Replace:

```ts
import { PromptDialog } from '@/components/ui/prompt-dialog'
```

with:

```ts
import { PromptDialog } from '@/components/ui/prompt-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
```

- [ ] **Step 2: Add the 3 new state variables**

In `ScriptEditorDialog`, find the existing `saveAsOpen` state (line 95):

```ts
  const [saveAsOpen, setSaveAsOpen] = useState(false)
```

Replace it with:

```ts
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [createNameOpen, setCreateNameOpen] = useState(false)
  const [confirmOverwrite, setConfirmOverwrite] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
```

(`confirmOverwrite` stores the target name that needs overwrite confirmation; `null` = dialog closed.)

- [ ] **Step 3: Refactor the create/save/delete handlers**

Find the three functions `createScript` (lines 217-230), `writeScriptAs` (lines 232-239), `saveScript` (lines 241-248), and `deleteScript` (lines 250-259). Replace all four with the following block. Note the new shared helper `resolveWrite(name)` that centralizes the collision check:

```ts
  async function createScript() {
    // 新建：弹出命名对话框，默认值沿用 Script_N 自增逻辑
    setCreateNameOpen(true)
  }

  /**
   * 解析待写入的脚本名并执行（处理覆盖确认）。
   * - 目标名 == 当前活动脚本：直接写入（正常迭代保存）。
   * - 目标名在列表中已存在：先弹覆盖确认。
   * - 否则：直接写入。
   */
  async function resolveWrite(name: string) {
    if (name !== activeScriptName && scripts.includes(name)) {
      setConfirmOverwrite(name)
      return
    }
    await writeScriptAs(name)
  }

  async function writeScriptAs(name: string) {
    const graphExport = exportGraphState(graph)
    const generatedCode = graph.nodes.length > 0 ? generateCodeFromRete(graphExport) : legacyCode || generateCodeFromRete(graphExport)
    await getIPC().scripts.write(name, buildScriptFile(graphExport, generatedCode))
    setActiveScriptName(name)
    setLegacyCode(generatedCode)
    await refreshScripts()
  }

  async function saveScript() {
    // 无活动脚本名时弹「另存为」输入框（替代 Electron 渲染进程被禁用的 window.prompt）
    if (!activeScriptName) {
      setSaveAsOpen(true)
      return
    }
    await resolveWrite(activeScriptName)
  }

  async function deleteScript() {
    // 删除前先确认（对齐 PaneContextMenu 的删除确认）
    if (!activeScriptName) return
    setDeleteConfirmOpen(true)
  }

  async function execDelete() {
    if (!activeScriptName) return
    await getIPC().scripts.delete(activeScriptName)
    setActiveScriptName(null)
    setGraph(createEmptyGraphState())
    setLegacyCode('')
    setSelectedNodeIds([])
    setUiState(closeConfig)
    await refreshScripts()
  }
```

> Note: `saveScript` no longer needs the separate `writeScriptAs(activeScriptName)` inline call because `resolveWrite` handles the same-name case (writes directly). The original `writeScriptAs` body is preserved unchanged.

- [ ] **Step 4: Add the new-script naming dialog + overwrite & delete confirmation dialogs**

In the JSX, find the existing `PromptDialog` for "另存为" (lines 362-373):

```tsx
    <PromptDialog
      open={saveAsOpen}
      onOpenChange={setSaveAsOpen}
      title="另存为脚本"
      description="请输入脚本名称"
      defaultValue={activeScriptName || ''}
      onConfirm={async (v) => {
        const name = normalizeScriptName(v)
        if (!name) return
        await writeScriptAs(name)
      }}
    />
```

Replace it with the following block — the existing 另存为 dialog now routes through `resolveWrite`, plus a new 新建 naming dialog, plus two `AlertDialog`s:

```tsx
    <PromptDialog
      open={saveAsOpen}
      onOpenChange={setSaveAsOpen}
      title="另存为脚本"
      description="请输入脚本名称"
      defaultValue={activeScriptName || ''}
      onConfirm={async (v) => {
        const name = normalizeScriptName(v)
        if (!name) return
        await resolveWrite(name)
      }}
    />

    <PromptDialog
      open={createNameOpen}
      onOpenChange={setCreateNameOpen}
      title="新建脚本"
      description="请输入脚本名称"
      defaultValue={nextDefaultScriptName(scripts)}
      onConfirm={async (v) => {
        const name = normalizeScriptName(v)
        if (!name) return
        if (scripts.includes(name)) {
          // 名称已存在 → 走覆盖确认；确认后在 execOverwrite 里建空脚本
          setConfirmOverwrite(name)
          return
        }
        await createScriptNamed(name)
      }}
    />

    <AlertDialog open={!!confirmOverwrite} onOpenChange={(open) => !open && setConfirmOverwrite(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>覆盖脚本</AlertDialogTitle>
          <AlertDialogDescription>
            脚本「{confirmOverwrite}」已存在，确定覆盖吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={execOverwrite}>覆盖</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除脚本</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除脚本「{activeScriptName}」吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={execDelete}>删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
```

- [ ] **Step 5: Add the two helper functions referenced by the dialogs**

These two functions are referenced in Step 4 but not yet defined. Add them right after `execDelete` (the function added in Step 3):

```ts
  /** 覆盖确认通过后：根据是「新建命名」还是「另存为/保存」决定建空脚本或写入当前内容。 */
  async function execOverwrite() {
    const name = confirmOverwrite
    setConfirmOverwrite(null)
    if (!name) return
    // createNameOpen 仍开着 → 来自「新建命名」分支，建空脚本
    if (createNameOpen) {
      setCreateNameOpen(false)
      await createScriptNamed(name)
      return
    }
    // 否则来自「保存/另存为」，写入当前内容
    await writeScriptAs(name)
  }

  /** 用给定名称创建一个空脚本并切换到它（沿用原 createScript 的写入/重置逻辑）。 */
  async function createScriptNamed(name: string) {
    const emptyGraph = createEmptyGraphState()
    await getIPC().scripts.write(name, buildScriptFile(exportGraphState(emptyGraph), generateCodeFromRete(exportGraphState(emptyGraph))))
    setActiveScriptName(name)
    setGraph(emptyGraph)
    setLegacyCode('')
    setSelectedNodeIds([])
    setUiState(closeConfig)
    await refreshScripts()
  }
```

> Rationale for `execOverwrite` branching on `createNameOpen`: the overwrite dialog is shared between the New-naming path (should create an **empty** script) and the Save/Save-As path (should write **current** graph). Checking whether the new-script dialog is still open disambiguates the source. We close `createNameOpen` after creating so it reflects reality.

- [ ] **Step 6: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors. (Watch for: unused `createScriptNamed` if mis-ordered, `confirmOverwrite` type mismatches, missing AlertDialog imports.)

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests pass (no existing test should break — these changes are additive to the dialog).

- [ ] **Step 8: Manual verification (document in PR)**

Launch `npm run dev`, open the script editor, and verify all paths:
1. **New (fresh name):** click 新建 → dialog with `Script_N.js` default → type a new name → confirm → empty script created & selected.
2. **New (duplicate name):** click 新建 → type an existing name → confirm → overwrite dialog → cancel (nothing happens) / 覆盖 (empty script replaces it).
3. **Save same-name (iterate):** with an active script, edit, click 保存 → writes directly, no dialog.
4. **Save overwrite via 另存为:** click 保存 with no active name → type an existing name → overwrite dialog → confirm/cancel.
5. **Delete:** click 删除 → delete dialog → 取消 (nothing) / 删除 (script removed, editor reset).

Record these in the PR description.

- [ ] **Step 9: Commit**

```bash
git add src/features/script-editor/ScriptEditorDialog.tsx
git commit -m "feat(script-editor): custom name on new + overwrite/delete confirmations

新建脚本时弹出命名对话框（默认 Script_N.js，可自定义）；保存覆盖已有文件
或另存为同名时弹覆盖确认；删除前弹确认。复用 PromptDialog 与 AlertDialog。"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ 新建自定义名称 → Task 2 Step 3 (`createScript` → dialog) + Step 4 (新建 PromptDialog) + Step 5 (`createScriptNamed`).
- ✅ 保存覆盖确认 → Task 2 Step 3 (`resolveWrite`) + Step 4 (overwrite AlertDialog) + Step 5 (`execOverwrite` save-as branch).
- ✅ 删除确认 → Task 2 Step 3 (`deleteScript` → open) + Step 4 (delete AlertDialog) + Step 5 (`execDelete`).
- ✅ 复用现有组件 → Step 1 imports; no new abstraction.
- ✅ Toolbar 接口不变 → `onNew`/`onSave`/`onDelete` wiring untouched in `Toolbar.tsx`.
- ✅ 无设置开关 → no settings-store changes.

**2. Placeholder scan:** No TBD/TODO. All code blocks are complete and copy-pasteable. The shared-`AlertDialog` ambiguity is resolved explicitly in Step 5's rationale (branch on `createNameOpen`).

**3. Type consistency:**
- `nextDefaultScriptName(existing: string[]): string` — defined Task 1, used Task 2 Step 4. ✓
- `confirmOverwrite: string | null` — declared Step 2, checked `!!confirmOverwrite` and read `confirmOverwrite` in Step 4/5. ✓
- `createScriptNamed(name: string)`, `execDelete()`, `execOverwrite()` — signatures match across Step 3/4/5. ✓
- `resolveWrite(name: string)` — defined Step 3, called Step 3 (saveScript) and Step 4 (save-as onConfirm). ✓

**4. Edge case — flow concern:** When a user clicks 新建, types a duplicate name, confirms, then **cancels** the overwrite dialog: `confirmOverwrite` is set to `null` by the `onOpenChange` handler, but `createNameOpen` remains `true`. This is correct — the naming dialog stays open so the user can pick a different name. ✓ (The overwrite dialog's own 取消 button also triggers `onOpenChange(false)`, same effect.)

No issues found. Plan is complete.
