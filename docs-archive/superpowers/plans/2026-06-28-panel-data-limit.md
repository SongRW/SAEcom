# 面板「保留条数」限制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 legacy `toggleLimitView`/`showLimitDialog` 迁移到 React 版，让两个占位入口（底部配置区「设置数据显示条数」+ 工作区面板右键菜单「设置保留条数」）变成可用的 per-pane 保留条数限制。

**Architecture:** 在 `Panel` 数据模型上加 `limitView`/`limitCount` 两字段；`store.appendChunk` 的 trim 来源从硬编码 `CHUNK_LIMIT` 改为读 panel 字段；新增 `store.setLimit`（写字段 + 立即 trim + 持久化）；扩展现有 `PromptDialog` 支持左下角「关闭限制」副作用按钮，两个入口共用。

**Tech Stack:** React + Zustand + TypeScript + Radix UI（shadcn 风格组件）+ Vitest。路径别名 `@/` → `src/`，`@shared/` → `shared/`。

**Spec:** `docs/superpowers/specs/2026-06-28-panel-data-limit-design.md`

---

## File Structure

| 文件 | 责任 | 改动类型 |
|---|---|---|
| `src/features/serial-panel/types.ts` | `Panel` 类型加 `limitView`/`limitCount` | Modify |
| `src/features/serial-panel/store.ts` | 常量、`genPanel` 初始化、`appendChunk` trim 来源、`setLimit`、persist/load | Modify |
| `src/components/ui/prompt-dialog.tsx` | 加可选 `extraAction` prop + footer 左侧按钮 | Modify |
| `src/features/main-window/components/ActivePanelConfigPanel.tsx` | 入口 1：按钮态 + 弹窗 | Modify |
| `src/features/serial-panel/components/PaneContextMenu.tsx` | 入口 2：菜单项 + 弹窗 | Modify |
| `test/active-panel-config.test.ts` | 新增 6 个 store 级用例 | Modify |

**任务依赖顺序**：Task 1（types）→ Task 2（store）→ Task 3（PromptDialog）→ Task 4/5（两入口，可并行）→ Task 6（测试）。Task 6 的测试其实在 Task 2 时已可写（TDD），但合并到末尾统一跑全量。

---

## Task 1: 数据模型 — `Panel` 加 `limitView`/`limitCount`

**Files:**
- Modify: `src/features/serial-panel/types.ts:50-82`（`Panel` 接口）

- [ ] **Step 1: 给 `Panel` 接口加两个字段**

在 `src/features/serial-panel/types.ts` 的 `Panel` 接口里，紧挨 `logging` 字段后插入（保持与 legacy `pane.limitView`/`pane.limitCount` 同名）：

```ts
  /** 日志记录 */
  logging: { active: boolean; path: string | null }
  /** 是否启用「保留最新 N 条」限制（对应 legacy pane.limitView）。false 时仅按全局上限兜底 */
  limitView: boolean
  /** 保留条数（对应 legacy pane.limitCount，默认 LIMIT_VIEW_COUNT=1000） */
  limitCount: number
  /** z-order（普通面板 10+递增；pin 面板 100000+） */
  z: number
```

- [ ] **Step 2: 运行 typecheck 验证类型错误被触发（genPanel/load 还没补字段）**

Run: `npm run typecheck`
Expected: FAIL — `store.ts` 的 `genPanel` 返回对象缺少 `limitView`/`limitCount`（这正是下一步要修的）

- [ ] **Step 3: Commit**

```bash
git add src/features/serial-panel/types.ts
git commit -m "feat(serial-panel): add limitView/limitCount to Panel type"
```

---

## Task 2: store — 初始化 / trim 来源 / setLimit / 持久化

**Files:**
- Modify: `src/features/serial-panel/store.ts`（多处）
- Test: `test/active-panel-config.test.ts`（Task 6 统一加，本任务先靠 typecheck + 手测）

- [ ] **Step 1: 加常量 `LIMIT_VIEW_COUNT`**

在 `src/features/serial-panel/store.ts:7`（`CHUNK_LIMIT` 定义处）下方加：

```ts
/** chunk 数量软上限（对应 legacy LIMIT_VIEW_COUNT，避免无界增长） */
const CHUNK_LIMIT = 1000
/** 默认保留条数（对应 legacy renderer.js:1144 LIMIT_VIEW_COUNT，作为 limitView 开启时的初始值） */
const LIMIT_VIEW_COUNT = 1000
```

- [ ] **Step 2: `genPanel` 初始化 `limitView`/`limitCount`**

在 `genPanel` 返回对象里（`store.ts:41` 的 `logging` 后）加两行，对齐 legacy `renderer.js:2499-2500`：

```ts
    logging: { active: false, path: null },
    limitView: false,
    limitCount: LIMIT_VIEW_COUNT,
    z: NORMAL_Z_BASE
```

- [ ] **Step 3: `PanelsState` 接口加 `setLimit` action 签名**

在 `src/features/serial-panel/store.ts` 的 `PanelsState` 接口里，`setLogging` 之后加：

```ts
  /** 开启/关闭实时日志记录（指定文件路径） */
  setLogging: (id: string, active: boolean, path: string | null) => void
  /**
   * 设置面板「保留条数」限制（对应 legacy toggleLimitView）。
   * limitView=false 时关闭限制（仅全局上限兜底）；limitView=true 时用 limitCount。
   * 立即对现有 chunks 做一次 trim，并持久化。
   */
  setLimit: (id: string, limitView: boolean, limitCount: number) => void
```

- [ ] **Step 4: `appendChunk` 改 trim 来源**

把 `store.ts:324` 这一行：

```ts
        const trimmed = trimChunks([...p.chunks, chunk], p.textBuffer + chunk.text, p.hexBuffer + chunk.hex, CHUNK_LIMIT)
```

改为读 panel 字段：

```ts
        const limit = p.limitView ? p.limitCount : CHUNK_LIMIT
        const trimmed = trimChunks([...p.chunks, chunk], p.textBuffer + chunk.text, p.hexBuffer + chunk.hex, limit)
```

> 注：`restoreChunks`（store.ts:361）用的是硬编码 `1000`，保持不动（popout dock 回流场景，与 limitView 无关）。

- [ ] **Step 5: 实现 `setLimit` action**

在 `store.ts` 的 `setLogging` action 实现之后（约 store.ts:318 后），加 `setLimit`：

```ts
    setLogging(id, active, path) {
      set((s) => {
        if (!s.panels[id]) return s
        return { panels: { ...s.panels, [id]: { ...s.panels[id], logging: { active, path } } } }
      })
    },

    setLimit(id, limitView, limitCount) {
      set((s) => {
        const p = s.panels[id]
        if (!p) return s
        const limit = limitView ? limitCount : CHUNK_LIMIT
        const trimmed = trimChunks(p.chunks, p.textBuffer, p.hexBuffer, limit)
        return {
          panels: {
            ...s.panels,
            [id]: {
              ...p,
              limitView,
              limitCount,
              chunks: trimmed.chunks,
              textBuffer: trimmed.textBuffer,
              hexBuffer: trimmed.hexBuffer
            }
          }
        }
      })
      persist()
    },
```

- [ ] **Step 6: `persist()` 加 `limitView`/`limitCount` 字段**

在 `store.ts:106-128` 的 persist 内部 config 对象里（`note: p.note` 之前或之后均可，放 `viewMode` 附近语义更聚合），加：

```ts
          viewMode: p.viewMode,
          sendOptions: p.sendOptions,
          limitView: p.limitView,
          limitCount: p.limitCount,
```

- [ ] **Step 7: `load()` 向后兼容读取**

在 `store.ts:401-420` 的 `genPanel({ ... })` 调用里，`genPanel` 已经把字段初始化为默认值。需要在 `genPanel` 之后、`p.hidden = !!c.hidden` 附近补一行覆盖（读旧持久化数据里的字段，缺失时用默认）。

在 `store.ts` 的 `p.hidden = !!c.hidden` 之后加：

```ts
        p.hidden = !!c.hidden
        // 向后兼容：旧持久化数据无 limitView/limitCount，缺失时保持 genPanel 默认值
        if (typeof c.limitView === 'boolean') p.limitView = c.limitView
        if (typeof c.limitCount === 'number' && Number.isFinite(c.limitCount)) p.limitCount = c.limitCount
        if (c.viewMode) p.viewMode = c.viewMode as ViewMode
```

- [ ] **Step 8: 运行 typecheck 验证通过**

Run: `npm run typecheck`
Expected: PASS（所有类型错误已消除）

- [ ] **Step 9: 运行现有测试，确认无回归**

Run: `npm test`
Expected: PASS（现有用例不受影响，新用例在 Task 6 加）

- [ ] **Step 10: Commit**

```bash
git add src/features/serial-panel/store.ts
git commit -m "feat(serial-panel): add per-pane setLimit + limit-aware appendChunk trim"
```

---

## Task 3: PromptDialog — 加 `extraAction` 可选副作用按钮

**Files:**
- Modify: `src/components/ui/prompt-dialog.tsx`

- [ ] **Step 1: 给 `PromptDialogProps` 加 `extraAction` prop**

在 `src/components/ui/prompt-dialog.tsx` 的 `PromptDialogProps` 接口里（`onOpenChange` 之前）加：

```ts
  /**
   * 左下角副作用按钮（可选）。如「关闭限制」。不传则不渲染。
   * 点击后由调用方自行决定是否关闭弹窗（onAction 内可调 onOpenChange(false)）。
   */
  extraAction?: { text: string; onAction: () => void }
```

- [ ] **Step 2: 组件签名解构 `extraAction`**

把组件函数签名（约 prompt-dialog.tsx:38-49）改为：

```ts
export function PromptDialog({
  open,
  title,
  description,
  defaultValue = '',
  placeholder,
  maxLength,
  confirmText = '确定',
  cancelText = '取消',
  extraAction,
  onConfirm,
  onOpenChange
}: PromptDialogProps) {
```

- [ ] **Step 3: footer 加左侧按钮**

把 `DialogFooter`（约 prompt-dialog.tsx:98-103）改为：

```tsx
        <DialogFooter>
          {extraAction ? (
            <Button variant="outline" className="mr-auto" onClick={extraAction.onAction}>
              {extraAction.text}
            </Button>
          ) : null}
          <Button variant="outline" onClick={close}>
            {cancelText}
          </Button>
          <Button onClick={handleConfirm}>{confirmText}</Button>
        </DialogFooter>
```

`mr-auto` 让 extraAction 贴左、取消/确定贴右，对应 legacy `.btn-off` 的 `margin-right:auto`。

- [ ] **Step 4: 运行 typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/prompt-dialog.tsx
git commit -m "feat(ui): add optional extraAction button to PromptDialog footer"
```

---

## Task 4: 入口 1 — ActivePanelConfigPanel「设置数据显示条数」

**Files:**
- Modify: `src/features/main-window/components/ActivePanelConfigPanel.tsx`

- [ ] **Step 1: 加本地 state + store action**

在 `ActivePanelConfigPanel` 组件里（约 ActivePanelConfigPanel.tsx:58 的 `appendSysLine` 之后）加：

```ts
  const appendSysLine = usePanelsStore((s) => s.appendSysLine)
  const setLimit = usePanelsStore((s) => s.setLimit)
```

并在本地 state 区（约 ActivePanelConfigPanel.tsx:66 的 `noteOpen` 之后）加：

```ts
  const [noteOpen, setNoteOpen] = useState(false)
  const [limitOpen, setLimitOpen] = useState(false)
```

- [ ] **Step 2: 加数值归一化 helper（照搬 legacy showLimitDialog onConfirm）**

在文件顶部 `hexToBytes` 函数之后（约 ActivePanelConfigPanel.tsx:21 后）加：

```ts
/** 归一化保留条数输入（对齐 legacy renderer.js:196 showLimitDialog onConfirm）：<=0 → 1000，<10 → 10 */
function normalizeLimitCount(raw: string): number {
  let val = parseInt(raw, 10)
  if (isNaN(val) || val <= 0) val = 1000
  if (val < 10) val = 10
  return val
}
```

- [ ] **Step 3: 按钮态 + onClick 改造**

把「设置数据显示条数」按钮（ActivePanelConfigPanel.tsx:198）：

```tsx
        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => appendSysLine(pnl.id, '[系统] 设置数据显示条数暂未实现')}>设置数据显示条数</Button>
```

改为（`variant` 随 limitView 高亮，对齐 legacy updateLimitBtnUI）：

```tsx
        <Button
          variant={pnl.limitView ? 'default' : 'ghost'}
          size="sm"
          className="h-6 px-2"
          title={pnl.limitView ? `当前只保留最新 ${pnl.limitCount} 条数据，点击设置` : '点击开启数据条数限制，防止内存溢出'}
          onClick={() => setLimitOpen(true)}
        >
          设置数据显示条数
        </Button>
```

> 注意：`appendSysLine` 仍被其它按钮（导出/共享/文件发送）使用，不要从解构里删掉。

- [ ] **Step 4: 渲染弹窗**

在文件末尾的 `<>` 里（已有的备注 PromptDialog 之后，约 ActivePanelConfigPanel.tsx:344 的 `</PromptDialog>` 之后）加：

```tsx
    <PromptDialog
      open={noteOpen}
      onOpenChange={setNoteOpen}
      title="备注"
      description="输入备注名（留空清除，≤15字）"
      defaultValue={pnl.note || ''}
      maxLength={15}
      onConfirm={(v) => setNote(pnl.id, v)}
    />
    <PromptDialog
      open={limitOpen}
      onOpenChange={setLimitOpen}
      title="设置数据保留条数"
      description="请输入要保留的最新数据行数：(录制日志时，此设置优先级高于默认的100条限制)"
      defaultValue={String(pnl.limitCount)}
      onConfirm={(v) => setLimit(pnl.id, true, normalizeLimitCount(v))}
      {...(pnl.limitView
        ? {
            extraAction: {
              text: '关闭限制',
              onAction: () => {
                setLimitOpen(false)
                setLimit(pnl.id, false, pnl.limitCount)
              }
            }
          }
        : {})}
    />
    </>
```

> description 用单行文本（PromptDialog 的 DialogDescription 不渲染换行/HTML），把 legacy 的 `<br>` 后小字并入同一句。

- [ ] **Step 5: 运行 typecheck + 现有测试**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/main-window/components/ActivePanelConfigPanel.tsx
git commit -m "feat(serial-panel): wire 设置数据显示条数 button to limit dialog"
```

---

## Task 5: 入口 2 — PaneContextMenu「设置保留条数」

**Files:**
- Modify: `src/features/serial-panel/components/PaneContextMenu.tsx`

- [ ] **Step 1: 引入 setLimit + 加本地 state**

在 `PaneContextMenu` 组件里（约 PaneContextMenu.tsx:45 的 `appendSysLine` 之后）加：

```ts
  const appendSysLine = usePanelsStore((s) => s.appendSysLine)
  const setLimit = usePanelsStore((s) => s.setLimit)
```

并在本地 state 区（约 PaneContextMenu.tsx:50 的 `renameOpen` 之后）加：

```ts
  const [renameOpen, setRenameOpen] = useState(false)
  const [limitOpen, setLimitOpen] = useState(false)
```

- [ ] **Step 2: 加数值归一化 helper**

在 `PaneContextMenu.tsx` 文件顶部（`PaneContextMenuProps` 接口之前）加（与 Task 4 同款）：

```ts
/** 归一化保留条数输入（对齐 legacy renderer.js:196 showLimitDialog onConfirm）：<=0 → 1000，<10 → 10 */
function normalizeLimitCount(raw: string): number {
  let val = parseInt(raw, 10)
  if (isNaN(val) || val <= 0) val = 1000
  if (val < 10) val = 10
  return val
}
```

> 两处重复 ~5 行：spec 第 6 节明确「不抽 util，量太小」。若以后出现第三处再抽。

- [ ] **Step 3: 菜单项 onClick 改造**

把「设置保留条数」菜单项（PaneContextMenu.tsx:95-97）：

```tsx
          <ContextMenuItem onClick={() => appendSysLine(panel.id, '[系统] 设置保留条数暂未实现')}>
            设置保留条数
          </ContextMenuItem>
```

改为：

```tsx
          <ContextMenuItem onClick={() => setLimitOpen(true)}>
            设置保留条数
          </ContextMenuItem>
```

> `appendSysLine` 仍被「打开示波器」（PaneContextMenu.tsx:116）使用，不要删解构。

- [ ] **Step 4: 渲染弹窗**

在 `PaneContextMenu` 的 `<>` 里（已有的 rename PromptDialog 之后，约 PaneContextMenu.tsx:130 的 `</PromptDialog>` 之后）加：

```tsx
      <PromptDialog
        open={limitOpen}
        onOpenChange={setLimitOpen}
        title="设置数据保留条数"
        description="请输入要保留的最新数据行数：(录制日志时，此设置优先级高于默认的100条限制)"
        defaultValue={String(panel.limitCount)}
        onConfirm={(v) => setLimit(panel.id, true, normalizeLimitCount(v))}
        {...(panel.limitView
          ? {
              extraAction: {
                text: '关闭限制',
                onAction: () => {
                  setLimitOpen(false)
                  setLimit(panel.id, false, panel.limitCount)
                }
              }
            }
          : {})}
      />
```

- [ ] **Step 5: 运行 typecheck + 现有测试**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/serial-panel/components/PaneContextMenu.tsx
git commit -m "feat(serial-panel): wire 设置保留条数 menu item to limit dialog"
```

---

## Task 6: store 级测试

**Files:**
- Modify: `test/active-panel-config.test.ts`

- [ ] **Step 1: 在文件末尾新增 describe 块（6 个用例）**

在 `test/active-panel-config.test.ts` 末尾（最后一个 `describe` 之后）加新 describe：

```ts
describe('panels store limitView/limitCount', () => {
  beforeEach(() => {
    resetStore()
    savedConfigs.length = 0
    loadedConfigs = []
  })

  it('genPanel defaults: limitView=false, limitCount=1000', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    const p = usePanelsStore.getState().panels.COM1
    expect(p.limitView).toBe(false)
    expect(p.limitCount).toBe(1000)
  })

  it('setLimit(id, true, 50) writes fields and persists', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    savedConfigs.length = 0
    usePanelsStore.getState().setLimit('COM1', true, 50)
    const p = usePanelsStore.getState().panels.COM1
    expect(p.limitView).toBe(true)
    expect(p.limitCount).toBe(50)
    expect(mockConfig.save).toHaveBeenCalled()
    const last = savedConfigs[savedConfigs.length - 1] as Array<{ id: string; limitView?: boolean; limitCount?: number }>
    expect(last.find((c) => c.id === 'COM1')?.limitView).toBe(true)
    expect(last.find((c) => c.id === 'COM1')?.limitCount).toBe(50)
  })

  it('setLimit immediately trims existing chunks when enabling a smaller limit', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    // 灌入 20 个 chunk
    for (let i = 0; i < 20; i++) {
      usePanelsStore.getState().appendChunk('COM1', { text: `l${i}\n`, hex: `l${i}\n`, isEcho: false })
    }
    expect(usePanelsStore.getState().panels.COM1.chunks.length).toBe(20)
    // 开启 limit=5，应立即裁到 ≤5
    usePanelsStore.getState().setLimit('COM1', true, 5)
    expect(usePanelsStore.getState().panels.COM1.chunks.length).toBeLessThanOrEqual(5)
  })

  it('appendChunk honors limitCount when limitView=true (not global CHUNK_LIMIT)', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    usePanelsStore.getState().setLimit('COM1', true, 5)
    // setLimit 后 chunks 已空，追加 6 个
    for (let i = 0; i < 6; i++) {
      usePanelsStore.getState().appendChunk('COM1', { text: `l${i}\n`, hex: `l${i}\n`, isEcho: false })
    }
    // limitView=true 用 limitCount=5 裁剪，而不是全局 1000
    expect(usePanelsStore.getState().panels.COM1.chunks.length).toBe(5)
  })

  it('setLimit(id, false, ...) disables limit: append beyond limitCount but under CHUNK_LIMIT is NOT trimmed', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    usePanelsStore.getState().setLimit('COM1', true, 5)
    usePanelsStore.getState().setLimit('COM1', false, 5) // 关闭限制
    // 追加 10 个（>limitCount=5 但 <CHUNK_LIMIT=1000）
    for (let i = 0; i < 10; i++) {
      usePanelsStore.getState().appendChunk('COM1', { text: `l${i}\n`, hex: `l${i}\n`, isEcho: false })
    }
    expect(usePanelsStore.getState().panels.COM1.chunks.length).toBe(10)
  })

  it('load() backfills limitView/limitCount for legacy data without these fields', async () => {
    loadedConfigs = [{ id: 'COM1', name: 'COM1', type: 'serial', options: { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' } }]
    await usePanelsStore.getState().load()
    const p = usePanelsStore.getState().panels.COM1
    expect(p.limitView).toBe(false)
    expect(p.limitCount).toBe(1000)
  })

  it('load() reads persisted limitView/limitCount', async () => {
    loadedConfigs = [{ id: 'COM1', name: 'COM1', type: 'serial', limitView: true, limitCount: 42 }]
    await usePanelsStore.getState().load()
    const p = usePanelsStore.getState().panels.COM1
    expect(p.limitView).toBe(true)
    expect(p.limitCount).toBe(42)
  })
})
```

> 共 7 个用例（6 个核心 + 1 个持久化读取回归），比 spec 多一个「读持久化字段」回归用例，覆盖 Task 2 Step 7。

- [ ] **Step 2: 运行测试验证通过**

Run: `npm test`
Expected: PASS（新增 7 个用例全绿）

- [ ] **Step 3: Commit**

```bash
git add test/active-panel-config.test.ts
git commit -m "test(serial-panel): cover limitView/limitCount store behavior"
```

---

## Task 7: 全量验证 + 收尾

- [ ] **Step 1: 全量 typecheck + 测试**

Run: `npm run typecheck && npm test`
Expected: 全部 PASS，无回归

- [ ] **Step 2: 手动验证（Electron）**

Run: `npm run dev`

逐项验证：
1. 打开一个串口面板，接收一些数据
2. 点底部配置区「设置数据显示条数」→ 弹窗，输入 5 → 确定 → 旧数据立即裁到 ≤5 条
3. 按钮变为高亮（variant=default），hover 显示 title「当前只保留最新 5 条」
4. 继续接收数据，chunks 数稳定在 5
5. 再次点开 → 弹窗左下角出现「关闭限制」→ 点 → 按钮恢复 ghost，数据不再被裁到 5（回到 1000 兜底）
6. 右键面板 → 「设置保留条数」→ 同样的弹窗/行为
7. 重启 app → limitView/limitCount 持久化恢复

- [ ] **Step 3: 提交（若无遗留改动）**

若手测发现需微调，按需 amend 或新增 commit。否则无操作（前面各 Task 已分别 commit）。

---

## Self-Review

**1. Spec coverage:**
- §2 数据模型 → Task 1（types）+ Task 2（store 常量/genPanel/setLimit/persist/load/appendChunk）✓
- §3 PromptDialog extraAction → Task 3 ✓
- §3.3 数值归一化 → Task 4 Step 2 + Task 5 Step 2（两处 normalizeLimitCount）✓
- §4 入口 1 → Task 4 ✓
- §4 入口 2 → Task 5 ✓
- §5 测试 → Task 6 ✓
- §6 已知简化（logging 兜底不补）→ 不实现，符合 ✓

**2. Placeholder scan:** 无 TBD/TODO；每个 code step 都有完整代码；命令 + expected output 齐全 ✓

**3. Type consistency:**
- `setLimit(id, limitView: boolean, limitCount: number)` 签名在 Task 2 Step 3 定义、Step 5 实现、Task 4/5 调用一致 ✓
- `limitView`/`limitCount` 字段名在 types/store/UI/test 全程一致 ✓
- `extraAction: { text, onAction }` 在 Task 3 定义、Task 4/5 使用一致 ✓
- `normalizeLimitCount` 两处实现完全相同 ✓

无遗留问题。
