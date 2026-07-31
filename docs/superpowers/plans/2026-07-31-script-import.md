# 脚本导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users import one `.js` script into the script editor without overwriting existing local scripts.

**Architecture:** Extract naming and disk-write behavior into a Node-only helper so the main-process IPC handler owns the native dialog and remains thin. The renderer receives only a typed import result, refreshes the script list, and loads the returned name through its existing `selectScript` flow. The import command is a toolbar-wide action, while collision resolution and file paths stay in the main process.

**Tech Stack:** TypeScript, Electron IPC/dialog, React, Phosphor icons, Vitest, Playwright Electron.

## Global Constraints

- The native selector accepts exactly one existing `.js` file.
- Import writes UTF-8 text into userData `scripts/`; it never executes, parses, migrates, or rewrites the selected content.
- Existing scripts must never be overwritten: collisions use `名称 (1).js`, `名称 (2).js`, and the first available integer.
- The renderer must not receive the selected file path or acquire arbitrary local-file read capability.
- A canceled dialog is silent; read/write errors are returned for the UI to display.
- Do not add batch import, drag-and-drop, `.txt` support, an import rename dialog, or changes to command/panel/log workflows.
- Run `npm test`, `npm run typecheck`, and `npm run test:e2e:build`; separately report the existing Rete registry-count failure instead of changing its expected value.

---

## File Structure

- Create: `electron/scriptImport.ts` - Node-only pure naming and script-directory import helpers, independent from Electron `dialog`.
- Create: `test/script-import.test.ts` - Vitest coverage for naming collisions, content copying, and file-system errors using temporary directories.
- Modify: `electron/main.ts` - Register the `scripts:import` handler, open the restricted dialog, and delegate imported file copying to `scriptImport.ts`.
- Modify: `electron/preload.ts` - Expose `scripts.importScript()` as an invoke-only bridge.
- Modify: `shared/types.ts` - Define the typed script import result and add `ScriptsAPI.importScript()`.
- Modify: `src/shared/dev/mock-api.ts` - Provide a preview-safe successful `importScript` stub.
- Modify: `src/features/script-editor/components/Toolbar.tsx` - Add the import icon/button and required callback prop.
- Modify: `src/features/script-editor/ScriptEditorDialog.tsx` - Call the import IPC, refresh and select the returned script, and present result feedback.
- Modify: `e2e/script-list-actions.spec.ts` - Add a real Electron IPC import test with mocked `showOpenDialog`, then repeat it to prove automatic copy naming.

### Task 1: Implement and Test Main-Process Import Behavior

**Files:**
- Create: `electron/scriptImport.ts`
- Create: `test/script-import.test.ts`
- Modify: `electron/main.ts:1-10, 105-110, 1262-1302`
- Modify: `electron/preload.ts:195-214`
- Modify: `shared/types.ts:445-457`
- Modify: `src/shared/dev/mock-api.ts:131-143`

**Interfaces:**
- Produces `findAvailableImportedScriptName(sourceName: string, existingNames: Iterable<string>): string`.
- Produces `importScriptFile(sourcePath: string, scriptsDir: string): { ok: true; name: string } | { ok: false; error: string }`.
- Produces `ScriptsAPI.importScript(): Promise<ScriptImportResult>` where `ScriptImportResult` is `{ ok: true; name: string } | { ok: false; canceled?: boolean; error?: string }`.
- Consumes Node `fs`/`path` and the main-process-owned `scriptsDir`; it does not expose the selected path outside main.

- [ ] **Step 1: Write failing naming and copy tests**

Create `test/script-import.test.ts` using a temporary directory per test, with cleanup in `afterEach`. Cover clean naming, multiple collisions, content preservation, and a missing-source error:

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findAvailableImportedScriptName, importScriptFile } from '../electron/scriptImport'

const tempDirs: string[] = []

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saecom-script-import-'))
  tempDirs.push(root)
  const scriptsDir = path.join(root, 'scripts')
  const sourcePath = path.join(root, '外部脚本.js')
  fs.writeFileSync(sourcePath, 'const imported = true\n', 'utf8')
  return { root, scriptsDir, sourcePath }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('script import', () => {
  it('uses the source .js file name when available', () => {
    expect(findAvailableImportedScriptName('外部脚本.js', [])).toBe('外部脚本.js')
  })

  it('creates the first unused numbered copy name', () => {
    expect(findAvailableImportedScriptName('外部脚本.js', [
      '外部脚本.js',
      '外部脚本 (1).js',
      '外部脚本 (2).js'
    ])).toBe('外部脚本 (3).js')
  })

  it('normalizes an uppercase extension to .js', () => {
    expect(findAvailableImportedScriptName('外部脚本.JS', [])).toBe('外部脚本.js')
  })

  it('adds .js when the source name has no extension', () => {
    expect(findAvailableImportedScriptName('外部脚本', [])).toBe('外部脚本.js')
  })

  it('copies UTF-8 source text to the first available script name', () => {
    const { scriptsDir, sourcePath } = makeFixture()
    fs.mkdirSync(scriptsDir)
    fs.writeFileSync(path.join(scriptsDir, '外部脚本.js'), 'existing\n', 'utf8')

    expect(importScriptFile(sourcePath, scriptsDir)).toEqual({ ok: true, name: '外部脚本 (1).js' })
    expect(fs.readFileSync(path.join(scriptsDir, '外部脚本 (1).js'), 'utf8')).toBe('const imported = true\n')
    expect(fs.readFileSync(path.join(scriptsDir, '外部脚本.js'), 'utf8')).toBe('existing\n')
  })

  it('returns a read error without creating a destination', () => {
    const { scriptsDir, root } = makeFixture()
    expect(importScriptFile(path.join(root, 'missing.js'), scriptsDir).ok).toBe(false)
    expect(fs.existsSync(scriptsDir)).toBe(true)
    expect(fs.readdirSync(scriptsDir)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- test/script-import.test.ts
```

Expected: FAIL because `electron/scriptImport.ts` and its exported functions do not exist.

- [ ] **Step 3: Implement the Node-only helper**

Create `electron/scriptImport.ts`. Normalize only the basename by removing path separators and appending `.js` when absent. Split on the final case-insensitive `.js` suffix, compare existing target names case-insensitively to match Windows/macOS behavior, and choose the first unused numbered copy. Read source and write destination as UTF-8 synchronously:

```ts
import fs from 'node:fs'
import path from 'node:path'

function normalizeImportedScriptName(sourceName: string): string {
  const name = path.basename(String(sourceName || '')).trim().replace(/[/\\]/g, '')
  const base = name.replace(/\.js$/i, '')
  return `${base}.js`
}

export function findAvailableImportedScriptName(sourceName: string, existingNames: Iterable<string>): string {
  const normalized = normalizeImportedScriptName(sourceName)
  const base = normalized.replace(/\.js$/i, '')
  const taken = new Set(Array.from(existingNames, (name) => name.toLowerCase()))
  if (!taken.has(normalized.toLowerCase())) return normalized

  let index = 1
  while (taken.has(`${base} (${index}).js`.toLowerCase())) index++
  return `${base} (${index}).js`
}

export function importScriptFile(sourcePath: string, scriptsDir: string): { ok: true; name: string } | { ok: false; error: string } {
  try {
    fs.mkdirSync(scriptsDir, { recursive: true })
    const name = findAvailableImportedScriptName(path.basename(sourcePath), fs.readdirSync(scriptsDir))
    const content = fs.readFileSync(sourcePath, 'utf8')
    fs.writeFileSync(path.join(scriptsDir, name), content, { encoding: 'utf8', flag: 'wx' })
    return { ok: true, name }
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message || error) }
  }
}
```

- [ ] **Step 4: Run the focused helper tests**

Run:

```bash
npm test -- test/script-import.test.ts
```

Expected: 6 passing tests, proving unoccupied and collision naming, extension normalization, content preservation, and source-read failure behavior.

- [ ] **Step 5: Add the typed IPC contract and handler**

In `shared/types.ts`, add the discriminated result above `ScriptsAPI` and add this member:

```ts
export type ScriptImportResult =
  | { ok: true; name: string }
  | { ok: false; canceled?: boolean; error?: string }

export interface ScriptsAPI {
  // existing members
  importScript: () => Promise<ScriptImportResult>
}
```

In `electron/preload.ts`, add:

```ts
importScript: () => ipcRenderer.invoke('scripts:import'),
```

In `src/shared/dev/mock-api.ts`, add:

```ts
importScript: async () => ({ ok: true, name: 'Imported.js' }),
```

In `electron/main.ts`, import `importScriptFile` and register the handler immediately after `scripts:export`:

```ts
ipcMain.handle('scripts:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '导入脚本',
    properties: ['openFile'],
    filters: [{ name: 'JavaScript', extensions: ['js'] }]
  })
  if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
  return importScriptFile(filePaths[0], scriptsDir)
})
```

Keep the selected file path inside the main process. Do not add a generic file-read method to preload or renderer APIs.

- [ ] **Step 6: Run type and focused regression checks**

Run:

```bash
npm test -- test/script-import.test.ts
npm run typecheck
```

Expected: import helper tests pass and both TypeScript project checks exit 0.

- [ ] **Step 7: Inspect Task 1 scope**

Run:

```bash
git diff --check
git diff -- electron/scriptImport.ts test/script-import.test.ts electron/main.ts electron/preload.ts shared/types.ts src/shared/dev/mock-api.ts
```

Expected: only the import helper, typed invoke boundary, main handler, preview stub, and focused tests changed.

### Task 2: Connect Script Editor UI and Add E2E Coverage

**Files:**
- Modify: `src/features/script-editor/components/Toolbar.tsx:1-100`
- Modify: `src/features/script-editor/ScriptEditorDialog.tsx:271-340, 450-464, 760-800`
- Modify: `e2e/script-list-actions.spec.ts:1-151`

**Interfaces:**
- Consumes: `getIPC().scripts.importScript(): Promise<ScriptImportResult>` from Task 1.
- Consumes: `selectScript(name: string): Promise<void>` and `refreshScripts(): Promise<void>` in `ScriptEditorDialog`.
- Produces: an enabled `button` named `导入` in the script editor toolbar that works without an active script.

- [ ] **Step 1: Extend the script-list E2E with failing import scenarios**

Add Node imports for `writeFileSync` and `rmSync` to `e2e/script-list-actions.spec.ts`. Add one test that writes a pure-code source file, mocks `dialog.showOpenDialog`, imports it twice through the toolbar, and checks both names and source content:

```ts
test('工具栏导入脚本并保留同名副本', async ({ page, electronApp }) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'saecom-import-'))
  const sourcePath = join(tempDir, '导入脚本.js')
  writeFileSync(sourcePath, 'const importedFromE2E = true\n', 'utf8')

  try {
    await electronApp.evaluate(async ({ dialog }, filePath) => {
      ;(dialog as unknown as {
        showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>
      }).showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
    }, sourcePath)

    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    await clickReady(page, editor.getByRole('button', { name: '导入', exact: true }))
    await expect(editor.locator('.script-editor-current')).toHaveText('导入脚本.js')
    await expect(editor.getByTestId('script-code-editor')).toHaveValue('const importedFromE2E = true\n')

    await clickReady(page, editor.getByRole('button', { name: '导入', exact: true }))
    await clickReady(page, editor.getByRole('button', { name: '脚本页' }))
    const list = editor.locator('.script-editor-list__items')
    await expect(list.getByRole('button', { name: '导入脚本.js', exact: true })).toBeVisible()
    await expect(list.getByRole('button', { name: '导入脚本 (1).js', exact: true })).toBeVisible()
    await expect(editor.locator('.script-editor-current')).toHaveText('导入脚本 (1).js')
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})
```

Add a second test for cancellation. Mock `showOpenDialog` as canceled, click the enabled import button with no active script, and assert no error toast appears and `.script-editor-current` remains `未选中`:

```ts
test('取消导入时保持当前状态且不报错', async ({ page, electronApp }) => {
  await electronApp.evaluate(async ({ dialog }) => {
    ;(dialog as unknown as {
      showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>
    }).showOpenDialog = async () => ({ canceled: true, filePaths: [] })
  })

  await openNavPage(page, NAV.pageScript)
  await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
  const editor = page.getByRole('dialog', { name: '脚本编辑器' })
  await editor.waitFor()
  await clickReady(page, editor.getByRole('button', { name: '导入', exact: true }))

  await expect(editor.locator('.script-editor-current')).toHaveText('未选中')
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: '导入失败' })).toHaveCount(0)
})
```

- [ ] **Step 2: Run the new E2E to demonstrate the absent UI/IPC route**

Run:

```bash
npm run build && npx playwright test e2e/script-list-actions.spec.ts --grep "工具栏导入脚本并保留同名副本|取消导入时保持当前状态且不报错"
```

Expected: FAIL because the toolbar has no `导入` button and `scripts:import` is unavailable.

- [ ] **Step 3: Add the toolbar import command**

In `Toolbar.tsx`, import `UploadSimple`, add `onImport: () => void` to `ToolbarProps`, destructure it, and add the action immediately before the export button. It must not be disabled when `activeScriptName` is empty:

```tsx
<Button size="sm" variant="outline" title="导入" onClick={onImport}>
  <UploadSimple data-icon="inline-start" />
  导入
</Button>
```

- [ ] **Step 4: Implement renderer import orchestration**

In `ScriptEditorDialog.tsx`, add this adjacent to `exportScript`:

```ts
async function importScript() {
  const result = await getIPC().scripts.importScript()
  if (!result.ok) {
    if (!result.canceled) toast.error(`导入失败：${result.error || '未知错误'}`)
    return
  }

  await refreshScripts()
  await selectScript(result.name)
  toast.success(`已导入：${result.name}`)
}
```

Pass it to the toolbar:

```tsx
onImport={importScript}
```

Retain the script list context menu unchanged. Do not open the scripts side panel automatically; the imported script becomes active through `selectScript`, which already resets graph/source view state, loads raw script text, and handles graph or pure-code formats.

- [ ] **Step 5: Run the targeted E2E**

Run:

```bash
npm run build && npx playwright test e2e/script-list-actions.spec.ts --grep "工具栏导入脚本并保留同名副本|取消导入时保持当前状态且不报错"
```

Expected: PASS. The UI opens the imported pure-code file and the repeated import creates and activates `导入脚本 (1).js` without removing the original.

- [ ] **Step 6: Run Task 2 focused checks**

Run:

```bash
npm test -- test/script-import.test.ts
npm run typecheck
npm run typecheck:e2e
```

Expected: all commands exit 0.

- [ ] **Step 7: Inspect UI and E2E scope**

Run:

```bash
git diff --check
git diff -- src/features/script-editor/components/Toolbar.tsx src/features/script-editor/ScriptEditorDialog.tsx e2e/script-list-actions.spec.ts
```

Expected: the diff is limited to the import command, its existing-load-flow orchestration, and the successful-copy/cancellation E2E scenarios.

### Task 3: Run Full Regression and Document Results

**Files:**
- Modify: none

**Interfaces:**
- Consumes: all import behavior from Tasks 1-2.
- Produces: recorded validation status for unit tests, TypeScript, and full Electron E2E.

- [ ] **Step 1: Run the full unit suite**

Run:

```bash
npm test
```

Expected: all import tests pass. If the existing registry-count assertion in `test/rete-codegen.test.ts` still reports 51 expected and 64 received, record it as unrelated; do not alter that test during this work.

- [ ] **Step 2: Run final TypeScript checks**

Run:

```bash
npm run typecheck
npm run typecheck:e2e
```

Expected: both app/node and E2E type checks exit 0.

- [ ] **Step 3: Run the required complete Electron E2E suite**

Run:

```bash
npm run test:e2e:build
```

Expected: build succeeds and Playwright reports every E2E spec passing, including the new import scenario. If an unrelated test fails, retain its exact output and distinguish it from the import E2E result.

- [ ] **Step 4: Verify no accidental external-file capability was added**

Run:

```bash
git diff -- electron/preload.ts shared/types.ts electron/main.ts
```

Expected: renderer exposure contains only the zero-argument `scripts.importScript()` invoke; it receives no source path and no generic text-file read method is added.

- [ ] **Step 5: Record the final change set**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: import source/tests/E2E and the approved specification/plan are present; no build artifacts are tracked.

- [ ] **Step 6: Commit after explicit user authorization**

Do not commit without a separate explicit user request. Once authorized, run:

```bash
git add electron/scriptImport.ts test/script-import.test.ts electron/main.ts electron/preload.ts shared/types.ts src/shared/dev/mock-api.ts src/features/script-editor/components/Toolbar.tsx src/features/script-editor/ScriptEditorDialog.tsx e2e/script-list-actions.spec.ts docs/superpowers/specs/2026-07-31-script-import-design.md docs/superpowers/plans/2026-07-31-script-import.md
git commit -m "feat(scripts): import JavaScript files"
```

Expected: the commit contains only script import implementation, tests, E2E coverage, and approved documentation.
