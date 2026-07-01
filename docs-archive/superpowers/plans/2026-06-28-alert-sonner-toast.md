# 提示系统（sonner toast）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 sonner toast 替换零散的被动提示实现，并提供全局触发能力（含 legacy `window.alert` 兜底）。

**Architecture:** 安装 sonner，在 `MainWindow` 根挂载唯一 `<Toaster />`。所有调用点直接 `import { toast } from 'sonner'` 调用（全局函数，任意代码可触发，无需自建 store）。legacy `window.alert` 重定向到 `toast.warning`。`CommandsPage.flash()` 迁移为 `toast.*`。

**Tech Stack:** sonner（toast 库）、shadcn/ui（radix base + tailwind v4）、phosphor 图标、React、Vitest。

**Spec:** `docs/superpowers/specs/2026-06-28-alert-bus-design.md`

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/components/ui/sonner.tsx` | shadcn 生成 + 修订 | `<Toaster />` 包装，接入主题 |
| `src/features/main-window/MainWindow.tsx` | 修改 | 挂载唯一 `<Toaster />` |
| `src/shared/alert/installAlertShim.ts` | 新建 | legacy `window.alert` → toast 兜底 |
| `src/main.tsx` | 修改 | 调用 `installAlertShim()` |
| `src/features/commands/CommandsPage.tsx` | 修改 | `flash()` → `toast.*`，移除 `notice` state/JSX |
| `test/alert-shim.test.ts` | 新建 | 断言 shim 安装后 `window.alert` 被重写且不抛错 |
| `package.json` / `package-lock.json` | 修改 | 新增 `sonner` 依赖 |

不改动：`renderer.js`（靠 shim 兜底）、`PromptDialog`、`appendSysLine`。

---

## Task 1: 安装 sonner 并修订生成的组件

**Files:**
- Create: `src/components/ui/sonner.tsx`（shadcn 生成）
- Modify: `package.json` / `package-lock.json`

- [ ] **Step 1: 用 shadcn CLI 安装 sonner**

Run:
```bash
npx shadcn@latest add sonner
```

预期：安装 `sonner` 依赖，生成 `src/components/ui/sonner.tsx`。

- [ ] **Step 2: 读取生成的 `src/components/ui/sonner.tsx`，检查图标库**

Read: `src/components/ui/sonner.tsx`

检查点：项目 `iconLibrary: phosphor`。若生成文件 import 了 `lucide-react`，需要替换为 phosphor（项目用的是 `@phosphor-icons/react`）。若未引入图标（仅 `import { Toaster as Sonner } from "sonner"`），则无需改动。

- [ ] **Step 3: 若存在 lucide 图标，替换为 phosphor**

例如生成文件含：
```tsx
import { XIcon } from "lucide-react"
```
替换为 phosphor 等价图标（如 `X` from `@phosphor-icons/react`），并保持用法一致（`<X size={...} />`）。

> shadcn 生成的 sonner 包装通常不直接引图标（closeButton 等由 sonner 内部渲染），多数情况 Step 3 无需执行。若有，按本步替换。

- [ ] **Step 4: typecheck**

Run:
```bash
npm run typecheck
```

预期：PASS（无类型错误）。

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/sonner.tsx package.json package-lock.json
git commit -m "feat(alert): add sonner toast component via shadcn"
```

---

## Task 2: 挂载 `<Toaster />` 到 MainWindow

**Files:**
- Modify: `src/features/main-window/MainWindow.tsx`

- [ ] **Step 1: 在 `MainWindow.tsx` 引入 Toaster 并挂载**

在 import 区（约 line 12 `import './main-window.css'` 之后）加：

```tsx
import { Toaster } from '@/components/ui/sonner'
```

在 `return` 的 JSX 里，把 `</TooltipProvider>` 之前追加 `<Toaster />`。修改后 return 块尾部为：

```tsx
        </SidebarProvider>
      </div>
      <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  )
}
```

> 放在 `TooltipProvider` 内、布局 div 外：Toaster 渲染 portal，位置无关键依赖，但放在 provider 内部保证不丢主题上下文。`position="bottom-right"` 不挡标题栏/侧栏/面板；`richColors` 让 success/warning/error 各带配色；`closeButton` 每条可手动关。

- [ ] **Step 2: typecheck**

Run:
```bash
npm run typecheck
```

预期：PASS。

- [ ] **Step 3: 手动验证（dev 启动）**

Run:
```bash
npm run dev
```

在应用中临时验证 toast 渲染：可在浏览器控制台执行（dev 下渲染进程有 sonner 上下文，但更稳妥是下一步 shim 后验证）。本步先确认应用能正常启动、无 Toaster 相关报错。

- [ ] **Step 4: Commit**

```bash
git add src/features/main-window/MainWindow.tsx
git commit -m "feat(alert): mount Toaster in MainWindow root"
```

---

## Task 3: legacy `window.alert` 兜底（installAlertShim + 测试）

**Files:**
- Create: `src/shared/alert/installAlertShim.ts`
- Create: `test/alert-shim.test.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: 写失败测试**

Create `test/alert-shim.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

// window.alert 在 node 环境无定义；installAlertShim 前后断言其行为。
// sonner 在 node 环境下 toast.* 调用会进入其内部队列，不抛错即可（不验证 DOM 渲染）。

describe('installAlertShim', () => {
  // 每个用例独立 import 模块，避免缓存污染；用动态 import + vi.resetModules
  afterEach(() => {
    vi.resetModules()
  })

  it('安装后 window.alert 被重写为函数', async () => {
    // 安装前确认原生状态（node 下可能 undefined 或 noop）
    const before = (globalThis as { alert?: unknown }).alert
    const { installAlertShim } = await import('@/shared/alert/installAlertShim')
    installAlertShim()

    expect(typeof (globalThis as { alert: unknown }).alert).toBe('function')
    // 确实被重写（与安装前不同）
    expect((globalThis as { alert: unknown }).alert).not.toBe(before)
  })

  it('调用重写后的 window.alert 不抛错', async () => {
    const { installAlertShim } = await import('@/shared/alert/installAlertShim')
    installAlertShim()

    expect(() => {
      ;(globalThis as { alert: (m: unknown) => void }).alert('测试消息')
    }).not.toThrow()
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run:
```bash
npx vitest run test/alert-shim.test.ts
```

预期：FAIL，错误为「Cannot find module '@/shared/alert/installAlertShim'」。

- [ ] **Step 3: 写最小实现**

Create `src/shared/alert/installAlertShim.ts`：

```ts
import { toast } from 'sonner'

/**
 * 安装 legacy window.alert 兜底：Electron 渲染进程里原生 alert 被静默禁用，
 * 重定向到 sonner toast（warning 级别，与"原生 alert 多用于提醒/错误"语义一致）。
 *
 * 在 React 渲染前调用一次（见 src/main.tsx）。legacy renderer.js 源码不改，
 * 其几十处 alert() 由本 shim 自动兜底。
 */
export function installAlertShim(): void {
  window.alert = (message: unknown) => {
    toast.warning(String(message))
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run:
```bash
npx vitest run test/alert-shim.test.ts
```

预期：PASS（2 个用例）。

- [ ] **Step 5: 在 src/main.tsx 调用 installAlertShim()**

Modify `src/main.tsx`，在 `ReactDOM.createRoot(...)` 之前调用 shim。修改后文件为：

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installAlertShim } from '@/shared/alert/installAlertShim'
import './styles/globals.css'

// legacy window.alert 在 Electron 渲染进程被静默禁用，重定向到 sonner toast。
// 必须在 React 渲染前安装，确保 legacy renderer.js 任意 alert() 都走 toast。
installAlertShim()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 6: typecheck**

Run:
```bash
npm run typecheck
```

预期：PASS。

- [ ] **Step 7: Commit**

```bash
git add src/shared/alert/installAlertShim.ts src/main.tsx test/alert-shim.test.ts
git commit -m "feat(alert): shim legacy window.alert to sonner toast"
```

---

## Task 4: 迁移 CommandsPage.flash() 到 toast

**Files:**
- Modify: `src/features/commands/CommandsPage.tsx`

- [ ] **Step 1: 移除 notice state 与 flash 函数，改为直接调用 sonner**

Modify `src/features/commands/CommandsPage.tsx`：

**1a.** 在 import 区（约 line 12-13 附近，`Button`/`Input` 导入处）加：

```tsx
import { toast } from 'sonner'
```

**1b.** 删除 `notice` state（line 29）：

删除这行：
```tsx
  const [notice, setNotice] = useState<string | null>(null)
```

**1c.** 删除 `flash` 函数（line 44-47）：

删除整段：
```tsx
  function flash(msg: string) {
    setNotice(msg)
    window.setTimeout(() => setNotice(null), 2500)
  }
```

**1d.** 替换 3 处 `flash(...)` 调用（line 65、70、75）：

- line 65 `flash('请先选择一个面板')` → `toast.warning('请先选择一个面板')`
- line 70 `flash('面板不存在')` → `toast.warning('面板不存在')`
- line 75 `flash('发送失败：' + (res.error || ''))` → `toast.error('发送失败：' + (res.error || ''))`

（`useState` 仍被 `editorOpen`/`repeat`/`repeatMs`/`repeatTick` 使用，import 不删；仅删 `notice` 用法。）

- [ ] **Step 2: 移除渲染 notice 的 JSX（line 132-136）**

删除整段：
```tsx
      {notice && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg">
          {notice}
        </div>
      )}
```

- [ ] **Step 3: 确认无残留 notice 引用**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i notice || echo "no notice refs"
```

预期：输出 `no notice refs`（无残留）。

- [ ] **Step 4: typecheck + test**

Run:
```bash
npm run typecheck && npm test
```

预期：typecheck PASS；现有测试全过（本任务未改 store 逻辑，settings-store 等不受影响）。

- [ ] **Step 5: Commit**

```bash
git add src/features/commands/CommandsPage.tsx
git commit -m "refactor(commands): replace flash() with sonner toast"
```

---

## Task 5: 全量验证与收尾

**Files:** 无新增/修改（仅验证）

- [ ] **Step 1: 全量 typecheck + test**

Run:
```bash
npm run typecheck && npm test
```

预期：全 PASS。

- [ ] **Step 2: 手动验证（dev）**

Run:
```bash
npm run dev
```

逐项验证并记录（供 PR）：

1. **toast 渲染**：命令页未选面板时点发送 → 右下角弹出 warning toast「请先选择一个面板」，约 4 秒自动消失。
2. **error 配色**：选一个未打开的串口面板发送 → error toast「发送失败：…」（红色，richColors 生效）。
3. **legacy 兜底**：触发任一走 `renderer.js` `alert()` 的入口（如保存面板数据成功）→ toast 弹出（warning），不再静默无反馈。
4. **多条堆叠**：连续触发多条 → 正常堆叠，不重叠错乱。
5. **手动关闭**：点 toast 上的 close 按钮 → 立即消失。
6. **深浅色**：切换深浅色 → toast 配色正常可读。
7. **closeButton**：每条 toast 右上角有 × 关闭按钮。

- [ ] **Step 3: 确认最终提交树干净**

Run:
```bash
git status
```

预期：working tree clean（所有改动已提交）。

- [ ] **Step 4: 总结改动**

改动文件清单（供 PR summary）：
- 新增：`src/components/ui/sonner.tsx`、`src/shared/alert/installAlertShim.ts`、`test/alert-shim.test.ts`
- 修改：`src/features/main-window/MainWindow.tsx`、`src/main.tsx`、`src/features/commands/CommandsPage.tsx`、`package.json`、`package-lock.json`
- 不动：`renderer.js`（shim 兜底）、`PromptDialog`、`appendSysLine`

---

## Self-Review

**Spec 覆盖检查（对照 spec 各节）：**

- §3 架构（sonner toast 单一方案）→ Task 1-4 全覆盖 ✅
- §4 安装（shadcn add sonner + 检查 lucide→phosphor）→ Task 1 ✅
- §5.1 挂载 Toaster（bottom-right / richColors / closeButton）→ Task 2 ✅
- §5.2 legacy alert 兜底 installAlertShim → Task 3 ✅
- §5.3 迁移 flash() → Task 4 ✅
- §5.4 后续可选扩展点（store/IPC 层渐进采用）→ spec 明确标"不在本次"，计划不纳入，正确 ✅
- §5.5 不改动项（appendSysLine / PromptDialog / renderer.js 源码）→ 全程未动 ✅
- §7 测试（installAlertShim 轻量断言 + 其余手动验证）→ Task 3 单测 + Task 5 手动 ✅

**Placeholder 扫描：** 无 TBD/TODO；每步含具体代码或确切命令；Task 1 Step 2/3 对"可能无 lucide"做了条件化说明（基于核实：shadcn sonner 包装通常不引图标），有明确判断标准 ✅

**类型一致性：** `installAlertShim()` 签名在 Task 3 Step 3/5 一致；`toast.warning/error` 为 sonner 官方 API（已核 doc）；`Toaster` props 来自 sonner ✅

**无遗漏。** 计划完整。
