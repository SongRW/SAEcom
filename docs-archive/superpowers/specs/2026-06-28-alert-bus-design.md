# 提示系统（sonner toast）设计

> 日期：2026-06-28
> 状态：待实现
> 范围：被动通知 / 告警类提示的统一管理。**不含**确认/输入类弹窗（沿用 `PromptDialog` / `AlertDialog` 组件模式）。

## 1. 背景与动机

当前 React 侧的「被动提示」实现零散：

- `src/features/commands/CommandsPage.tsx:44` 的 `flash()` —— 每个组件各自 `useState` + `setTimeout` 清理，重复样板。
- store / IPC 回调层（`serial-panel/store.ts`、`dataBus.ts`）的瞬时错误，目前只能绕路 `appendSysLine('[错误] …')` 塞进面板，没有统一的瞬时弹层出口。
- legacy `renderer.js` 中几十处 `window.alert(...)` 在 Electron 渲染进程里被静默禁用，无任何用户可见反馈。

痛点：

1. **非组件代码无法触发提示** —— 组件内 `useState` 够不着 store action、IPC 回调、定时器、legacy `window.alert`。
2. **重复样板** —— 每处 `flash()` 自己管超时/清理。
3. **外观/层级不统一** —— 无单一真相源。

## 2. 方案选择：sonner（为什么不自建）

这是一个 shadcn/ui（radix base + tailwind v4）项目。shadcn 官方明确建议：

- **Toast via `sonner`** —— 用 sonner，不要自建 toast。
- callout（横幅）用 `Alert`。

对本场景的判据是 **触发点是否在非组件代码**（store / IPC / legacy alert）。这些都在组件树外，需要一个**全局可调**的触发函数。

- **sonner `toast()`** 是全局函数，任意位置可调，自带 `toast.success/warning/info/error/promise`、堆叠、动画、超时、a11y、并发管理 —— 完全覆盖需求。
- **`Alert` callout** 是在组件树里渲染的横幅组件，**不能**从非组件代码全局触发，与本场景「从任意位置触发」的需求不匹配。它属于另一用途（某组件内的持久横幅），**YAGNI，本设计不纳入**。（且项目 UI 目录尚未安装 `alert.tsx`，进一步印证跳过。）

因此方案为：**sonner toast 单一方案**。不自建 store、不自建 AlertHost、不引入 banner——避免重新发明 sonner 已做好的轮子。

## 3. 架构

```
任意调用点（组件 / store / IPC / 定时器 / legacy alert）
        │  toast.success/warning/info/error(msg)
        ▼
   sonner 内部状态（第三方库，已封装队列/超时/动画）
        │
        ▼
   <Toaster />（挂在 MainWindow 根，唯一实例）
   右下角堆叠 toast，自动消失
```

- **全局触发**：`import { toast } from 'sonner'`，直接 `toast.error('发送失败')`，任何代码均可。
- **唯一挂载**：`<Toaster />` 在 `MainWindow` 根渲染一次。
- **legacy 兜底**：应用启动 `window.alert = (m) => toast.warning(String(m))`。

> 与「自建 zustand 总线」相比：sonner 自身就是那个「总线」，无需再建 store。调用点从 `useAlertStore.getState().notify(...)` 进一步简化为 `toast.error(...)`。

## 4. 安装

项目 base=radix、iconLibrary=phosphor、tailwind v4。按 shadcn 标准流程：

```bash
npx shadcn@latest add sonner
```

该命令会：
- 安装 `sonner` 依赖到 `package.json`
- 生成 `src/components/ui/sonner.tsx`（shadcn 的 `<Toaster />` 包装，已接入 `@/lib/utils` 的 `cn` 与主题 token）

**安装后必须检查**（shadcn 技能 Critical Rules：第三方注册组件可能用 lucide 图标）：
- `sonner.tsx` 内若 import `lucide-react`，**替换为 phosphor**（项目 `iconLibrary: phosphor`）。
- 确认 `<Toaster />` 的 `richColors` / `theme` 行为，与项目深浅色一致（见 §6）。

## 5. 集成点

### 5.1 挂载（`src/features/main-window/MainWindow.tsx`）

在 `TooltipProvider` 内、布局根处加一个 `<Toaster />`：

```tsx
import { Toaster } from '@/components/ui/sonner'
// …
return (
  <TooltipProvider>
    <div className="flex h-screen flex-col">
      <TitleBarChrome status={<ConnectionBadge />} />
      {/* …原有布局… */}
    </div>
    <Toaster position="bottom-right" richColors closeButton />
  </TooltipProvider>
)
```

- `position="bottom-right"`：不挡标题栏/侧栏/面板数据区。
- `richColors`：让 success/warning/error 各用对应配色（success 绿 / warning 琥珀 / error 红），与 severity 语义对齐。
- `closeButton`：每条 toast 带手动关闭。

### 5.2 legacy `window.alert` 兜底（新增 `src/shared/alert/installAlertShim.ts`）

```ts
import { toast } from 'sonner'

/** 安装 legacy window.alert 兜底：Electron 渲染进程里原生 alert 被静默禁用，重定向到 toast。 */
export function installAlertShim() {
  window.alert = (m: unknown) => {
    toast.warning(String(m))
  }
}
```

在 `src/main.tsx`（React 根，渲染前）调用一次：

```ts
import { installAlertShim } from '@/shared/alert/installAlertShim'
installAlertShim()
ReactDOM.createRoot(…)
```

> legacy `renderer.js` 源码**不改**——靠 shim 自动兜底其几十处 `alert()`。

### 5.3 迁移 `CommandsPage.flash()`

```ts
// 删除：
// const [notice, setNotice] = useState<string | null>(null)
// function flash(msg: string) { setNotice(msg); window.setTimeout(() => setNotice(null), 2500) }

// 改为直接调 sonner（无需 hook）：
import { toast } from 'sonner'
// 原 flash('请先选择一个面板') → toast.warning('请先选择一个面板')
// 原 flash('发送失败：…')       → toast.error('发送失败：' + (res.error || ''))
```

同步移除 `CommandsPage` 里渲染 `notice` 的 JSX（如有）。

### 5.4 后续可选扩展点（不在本次实现）

store / IPC 层若想让瞬时错误**也弹 toast**（而非只 `appendSysLine`），可直接：

```ts
// serial-panel/store.ts / dataBus.ts 等
import { toast } from 'sonner'
toast.error(res.error || '打开失败')
```

本次仅迁移 `flash()` + legacy 兜底；其余调用点按需渐进采用，不强求一次替换。

### 5.5 不改动项

- `appendSysLine('[错误] …')` 写面板系统行的行为**保持不变**（面板内通知，职责不同；toast 是瞬时弹层，二者互补）。
- `PromptDialog`、交互式 `AlertDialog` 用法**不变**。
- legacy `renderer.js` 内的 `alert()` 调用**不改源码**——靠 shim 自动兜底。

## 6. 行为与外观

- **severity 配色**：sonner 内置 `toast.success/warning/info/error`，配合 `richColors` 各自带色（success 绿 / warning 琥珀 / error 红 / info 中性）。**无需新增 CSS token**（与之前自建方案需补 `--warning` 不同，sonner 自带配色）。
- **自动消失**：sonner 默认按 duration 自动消失（可 `toast(msg, { duration })` 覆盖）。无需手写 `setTimeout`。
- **堆叠**：sonner 自带堆叠/动画/并发管理，无需手写 FIFO。
- **a11y**：sonner 自带 aria 处理。
- **深浅色**：shadcn 的 `sonner.tsx` 包装默认接入主题；若项目无 `next-themes` 之类，验证 `Toaster` 在深浅色下表现一致，必要时显式传 `theme`。

## 7. 测试

sonner 为第三方库，其队列/动画/超时已被上游测试覆盖，**不重复测试**。本设计的逻辑面极薄：

- `installAlertShim`：安装后 `window.alert('x')` 不抛错（调用已被重定向）——可加一个轻量单测断言「重写后 `window.alert` 为 function 且调用不抛异常」。
- 其余（toast 实际渲染、消失）走**手动验证**，记录于 PR：
  - 触发 `flash` 路径（命令页未选面板发送）→ toast 弹出。
  - legacy 路径（任一 `renderer.js` 触发 alert 的入口）→ toast 弹出。
  - 多条并发 → 正常堆叠。
  - 深浅色切换 → 配色正常。

## 8. 影响面

| 文件 | 改动 |
|------|------|
| `package.json` / lock | 新增 `sonner` 依赖 |
| `src/components/ui/sonner.tsx` | shadcn 生成（检查并替换 lucide→phosphor） |
| `src/features/main-window/MainWindow.tsx` | 挂载 `<Toaster />` |
| `src/shared/alert/installAlertShim.ts` | 新增 |
| `src/main.tsx` | 调用 `installAlertShim()` |
| `src/features/commands/CommandsPage.tsx` | `flash()` → `toast.*`，移除 `notice` state |
| `renderer.js`（legacy） | **不改**；靠 shim 兜底 |
| `test/alert-shim.test.ts`（可选） | 新增（轻量断言） |

不涉及 native / serialport / IPC 契约变更，无打包/重建影响。仅渲染层 + 一个前端依赖。

## 9. 开放问题

- **OQ-1**：toast 位置右下角（默认）。实现后实测，若与浮层面板遮挡再调整（如改 `bottom-right` → `top-right`）。
- **OQ-2**：`richColors` 配色是否与项目整体观感协调（success/warning 用 sonner 默认色而非 `--success` token）。若需严格对齐 token，可在 `sonner.tsx` 包装里覆写样式——但通常 sonner 默认色已足够，YAGNI。
