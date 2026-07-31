# 默认关闭自动检查更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make startup update checks explicit opt-in while preserving existing users who have already enabled them, then produce Windows NSIS installers.

**Architecture:** Keep the behavior entirely in the existing Zustand settings store. `DEFAULTS.autoCheckUpdate` controls new installations and storage parse logic recognizes only boolean `true` as enabled, so the main-window startup effect remains untouched and manual update IPC remains available. Tests instantiate a fresh store module after changing the localStorage shim to validate persisted compatibility states.

**Tech Stack:** TypeScript, React, Zustand, Vitest, Electron Vite, electron-builder, NSIS.

## Global Constraints

- New installations and stored configurations missing `autoCheckUpdate` must resolve to `false`.
- Existing stored `autoCheckUpdate: true` must continue to enable startup checks.
- Manual update checks, updater IPC, server interaction, installer handling, and UI copy remain unchanged.
- Do not introduce dependencies or alter the Windows packaging configuration.
- Run `npm test`, `npm run typecheck`, and `npm run dist:win` before reporting completion.

---

## File Structure

- Modify: `src/shared/store/settings.ts` - Defines defaults and normalizes `appSettings` from localStorage.
- Modify: `test/settings-store.test.ts` - Verifies default, reset, persisted false, missing field, and persisted true behavior.
- Create: `docs/superpowers/plans/2026-07-30-default-disable-auto-update.md` - This implementation record.
- Generated: `dist/串口助手-0.6.0-win-x64.exe` and `dist/串口助手-0.6.0-win-ia32.exe` - Windows NSIS installer artifacts from the existing builder configuration; do not commit generated output.

### Task 1: Update Auto-Check Settings Compatibility

**Files:**
- Modify: `test/settings-store.test.ts:21-93`
- Modify: `src/shared/store/settings.ts:39-90`

**Interfaces:**
- Consumes: `useSettingsStore` exported by `@/shared/store/settings`, with `getState(): SettingsState`, `setField(key, value)`, and `reset()`.
- Produces: `useSettingsStore.getState().autoCheckUpdate: boolean` resolving false for absent or false persisted values and true only for explicit true.

- [ ] **Step 1: Add a fresh-module default test**

In `test/settings-store.test.ts`, add a helper that clears the localStorage shim, resets Vitest's module cache, and dynamically imports a new settings-store instance:

```ts
async function loadFreshSettings(stored: Record<string, unknown> = {}) {
  localStorage.clear()
  localStorage.setItem('appSettings', JSON.stringify(stored))
  vi.resetModules()
  return import('@/shared/store/settings')
}
```

Use it to verify a new installation resolves to `false`:

```ts
it('新安装默认关闭 autoCheckUpdate', async () => {
  const { useSettingsStore: fresh } = await loadFreshSettings()
  expect(fresh.getState().autoCheckUpdate).toBe(false)
})
```

Change the `beforeEach` state to set `autoCheckUpdate: false`, so the remaining existing-store tests use the new expected baseline.

- [ ] **Step 2: Add compatibility tests for persisted values**

Add dynamic-import tests that use the helper and cover every persisted compatibility state:

```ts
it('loadFromStorage 在缺少字段时保持关闭', async () => {
  const { useSettingsStore: fresh } = await loadFreshSettings({ dark: true })
  expect(fresh.getState().autoCheckUpdate).toBe(false)
})

it('loadFromStorage 保留显式 false', async () => {
  const { useSettingsStore: fresh } = await loadFreshSettings({ autoCheckUpdate: false })
  expect(fresh.getState().autoCheckUpdate).toBe(false)
})

it('loadFromStorage 保留显式 true', async () => {
  const { useSettingsStore: fresh } = await loadFreshSettings({ autoCheckUpdate: true })
  expect(fresh.getState().autoCheckUpdate).toBe(true)
})
```

Keep the existing `setField` persistence assertion, and change the reset assertion to expect `false`.

- [ ] **Step 3: Run the focused test to demonstrate current incompatibility**

Run:

```bash
npm test -- test/settings-store.test.ts
```

Expected: the fresh-module default and missing-field tests fail because the store default and missing-field normalization currently evaluate to `true`.

- [ ] **Step 4: Change the settings default and loader normalization**

In `src/shared/store/settings.ts`, make automatic checks explicit opt-in:

```ts
/** 启动时自动检查更新（关于分区，默认关闭）。 */
autoCheckUpdate: boolean

// Within DEFAULTS
autoCheckUpdate: false

// Within loadFromStorage return value
autoCheckUpdate: s.autoCheckUpdate === true
```

Do not change the `MainWindow` startup effect, persistence merge, updater IPC, or manual-check UI.

- [ ] **Step 5: Run the focused test to demonstrate the compatibility contract passes**

Run:

```bash
npm test -- test/settings-store.test.ts
```

Expected: all tests in `settings-store.test.ts` pass, including default false, reset false, persisted false, missing field false, and explicit true preservation.

- [ ] **Step 6: Inspect the diff for scope**

Run:

```bash
git diff --check
git diff -- src/shared/store/settings.ts test/settings-store.test.ts
```

Expected: only the default/comment, strict boolean normalization, and auto-update test cases differ.

### Task 2: Verify the Application and Build Windows Installers

**Files:**
- Modify: none
- Generated: `dist/串口助手-0.6.0-win-x64.exe`
- Generated: `dist/串口助手-0.6.0-win-ia32.exe`

**Interfaces:**
- Consumes: Task 1's `useSettingsStore` compatibility behavior and `package.json` script `dist:win`.
- Produces: passing test/typecheck results and NSIS installer artifacts named by `${productName}-${version}-win-${arch}.${ext}`.

- [ ] **Step 1: Run the full unit test suite**

Run:

```bash
npm test
```

Expected: Vitest exits 0 with all repository tests passing.

- [ ] **Step 2: Run TypeScript validation**

Run:

```bash
npm run typecheck
```

Expected: both `tsconfig.json` and `tsconfig.node.json` checks exit 0.

- [ ] **Step 3: Build Windows NSIS installers**

Run:

```bash
npm run dist:win
```

Expected: Electron Vite builds main, preload, and renderer bundles, then electron-builder creates x64 and ia32 NSIS `.exe` files under `dist/`.

- [ ] **Step 4: Verify generated installer paths**

Run:

```bash
rg --files dist | rg '串口助手-0\.6\.0-win-(x64|ia32)\.exe$'
```

Expected: one x64 and one ia32 installer path are printed. Do not add generated `dist/` artifacts to git.

- [ ] **Step 5: Record the final repository status**

Run:

```bash
git status --short
git diff --check
```

Expected: source, test, and design/plan documentation changes are visible; generated installers remain untracked or ignored according to repository configuration; diff validation reports no whitespace errors.

- [ ] **Step 6: Commit source and documentation changes after user approval**

Do not commit without a separate explicit user request. When authorized, run:

```bash
git add src/shared/store/settings.ts test/settings-store.test.ts docs/superpowers/specs/2026-07-30-default-disable-auto-update-design.md docs/superpowers/plans/2026-07-30-default-disable-auto-update.md
git commit -m "fix(settings): disable automatic update checks by default"
```

Expected: one focused commit contains only source, tests, and documentation; generated installers stay out of the commit.
