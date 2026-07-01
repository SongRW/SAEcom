# 侧边栏面板名溢出 & 新建面板 Select 下拉被遮 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复侧边栏面板名过长撑出操作按钮、以及新建面板弹窗内 Select 下拉被对话框面板盖住两个 UI 缺陷。

**Architecture:** 两处独立的纯 CSS / Tailwind 类名单点修复，不动组件逻辑。Bug 1 给 `PaneList` 行容器加 flex 宽度钳制；Bug 2 把 `SelectContent` 的 z-index 提到高于 Dialog content 的 3201。

**Tech Stack:** React + Tailwind v4 + shadcn/ui (Radix) + Electron。

**Spec:** `docs/superpowers/specs/2026-06-30-sidebar-panel-name-overflow-and-select-zindex-design.md`

---

## 关于测试策略的说明

这两个 bug 的根因都在 **CSS 层**（flex 宽度钳制是否生效、z-index 数值高低决定 portal 层叠顺序），而非可在 Node 环境下单元测试的 JS 逻辑。Vitest 无法断言真实浏览器的 stacking context 行为；写"断言 className 字符串包含 `min-w-0`"这类伪单测只会锁死实现细节、不验证真实行为，违背 TDD 初衷。

因此本计划采用 **手动可视化验证 + 自动化 typecheck/test 全量回归门禁** 的验证方式（符合 AGENTS.md「记录 PR 中任何手动 Electron 验证」的要求）。每个修复任务结束都跑 `npm run typecheck` + `npm test` 作回归门禁。

---

## Task 1: Bug 1 — 侧边栏面板名过长撑出操作按钮

**Files:**
- Modify: `src/features/serial-panel/components/PaneList.tsx:152`

**根因回顾：** 行容器 `div`（`:152`）只有 `flex items-center gap-1`，无 `min-w-0`/`overflow-hidden`，flex 容器整体未被侧边栏宽度钳制。右侧操作按钮簇（`:179`）是 `shrink-0 w-[80px]` 固定不收缩。名字按钮（`:162`）虽有 `min-w-0 flex-1` + `truncate`（`:169`），但行不被钳制时名字会把整行撑开，按钮被推到 `SidebarContent` 的水平滚动区外。参照 `SidebarMenuButton`（`sidebar.tsx:471`）已用 `overflow-hidden` 的先例。

- [ ] **Step 1: 给行容器追加宽度钳制类**

修改 `src/features/serial-panel/components/PaneList.tsx:152`。

把：
```tsx
              className={`group flex items-center gap-1 rounded px-1.5 py-1 text-sm hover:bg-accent ${p.hidden ? 'opacity-50' : ''} ${overIndex === idx && dragIndex !== null && dragIndex !== idx ? 'border-t-2 border-primary' : ''} ${dragIndex === idx ? 'opacity-40' : ''}`}
```

改为（在 `flex` 后追加 `min-w-0 overflow-hidden`）：
```tsx
              className={`group flex min-w-0 items-center gap-1 overflow-hidden rounded px-1.5 py-1 text-sm hover:bg-accent ${p.hidden ? 'opacity-50' : ''} ${overIndex === idx && dragIndex !== null && dragIndex !== idx ? 'border-t-2 border-primary' : ''} ${dragIndex === idx ? 'opacity-40' : ''}`}
```

> 只动这一行，不改按钮簇宽度、不改 hover 交互、不改名字渲染逻辑。

- [ ] **Step 2: 跑 typecheck 回归门禁**

Run: `npm run typecheck`
Expected: 通过，无错误。

- [ ] **Step 3: 跑单测回归门禁**

Run: `npm test`
Expected: 全部通过（无既有测试受影响）。

- [ ] **Step 4: 手动可视化验证 Bug 1**

`npm run dev` 启动应用，在侧边栏：

1. 找一个面板，双击它的名字（或 hover 点「添加备注」铅笔按钮）重命名为一个 **50+ 字的长字符串**，确认。
2. 确认该面板行内：
   - 名字以省略号 `…` 截断，不再把内容撑出侧边栏。
   - 右侧操作按钮簇完整在视口内：默认显示淡色 `⋮`；鼠标 hover 到该行时显示「添加备注 / 清空数据 / 删除面板」3 个按钮，3 个都完整可见、可点击。
   - 鼠标悬停到名字上，`title` tooltip 显示完整名字 + 「（双击重命名）」。
3. 多个面板都有长名字时，逐行确认每行的按钮簇都在视口内。

> 预期通过判据：无论名字多长，操作按钮簇始终完整可见、不被挤出侧边栏右边。

- [ ] **Step 5: 提交**

```bash
git add src/features/serial-panel/components/PaneList.tsx
git commit -m "fix(panel): 侧边栏面板名过长不再撑出操作按钮簇

行容器加 min-w-0 overflow-hidden，让名字 truncate 生效，shrink-0 的
操作按钮簇留在侧边栏视口内。"
```

---

## Task 2: Bug 2 — 新建面板 Select 下拉被对话框面板盖住

**Files:**
- Modify: `src/components/ui/select.tsx:70`

**根因回顾：** `SelectContent`（`:70`）类名是 `z-50`。而 `script-editor.css` 有一条**全局 `!important`** 把 `[data-slot="dialog-content"]` 提到 `z-3201`，且该 CSS 在主窗口也加载（`mainwindow.tsx:5`）。两者都 portal 到 body，于是下拉(50) 被对话框面板(3201) 盖住。改 `dialog.tsx` 无效（已被 `!important` 接管且运行时本就是 3201）。正确做法是把 Select 提到高于 3201。

- [ ] **Step 1: 把 SelectContent 的 z-50 改为 z-[3250]**

修改 `src/components/ui/select.tsx:70`。

在 `SelectPrimitive.Content` 的 `className` 里，找到开头的 `z-50`，改为 `z-[3250]`。

具体地，把这段（行首部分）：
```tsx
        className={cn("z-50 max-h-(--radix-select-content-available-height) origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:min-w-36 ...
```

改为：
```tsx
        className={cn("z-[3250] max-h-(--radix-select-content-available-height) origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:min-w-36 ...
```

> 只把行首的 `z-50` 换成 `z-[3250]`，其余超长类名一字不动。`3250 > 3201`（dialog content），下拉即可浮在对话框面板之上。脚本编辑器用的是自己的 `.script-editor-select-content`（z-3100），非此组件，不受影响。

- [ ] **Step 2: 跑 typecheck 回归门禁**

Run: `npm run typecheck`
Expected: 通过，无错误。

- [ ] **Step 3: 跑单测回归门禁**

Run: `npm test`
Expected: 全部通过。

- [ ] **Step 4: 手动可视化验证 Bug 2 — 新建面板**

`npm run dev` 启动应用，打开「新建面板」弹窗（侧边栏顶部「新建面板」按钮）：

1. 串口模式下，依次点开 5 个下拉：**串口、波特率、数据位、停止位、校验**。
2. 每个下拉点开后，确认：
   - 下拉列表**完整浮在对话框面板之上**，能看清所有选项、可点击选中。
   - 选项的半透明背景 + 模糊（`bg-popover/70 ... backdrop-blur-2xl`）正常渲染。
   - 下拉不被对话框面板遮挡、不被对话框 overlay 盖住。
3. 选中后下拉正常收起，值正确回填到 trigger。

- [ ] **Step 5: 手动验证连带受益场景 — CommandEditor**

打开命令编辑器（CommandEditor），找到行内 mode 选择 Select，点开下拉，确认下拉同样完整浮在对话框面板之上、可选。

- [ ] **Step 6: 提交**

```bash
git add src/components/ui/select.tsx
git commit -m "fix(ui): Select 下拉 z-index 提至 3250，不被 Dialog 面板(3201) 遮挡

script-editor.css 全局 !important 把 dialog-content 提到 z-3201，
而 SelectContent 仍是 z-50，导致 Dialog 内嵌的 Select 下拉（如新建
面板、命令编辑器）被对话框面板盖住。提到 z-3250 高于 3201 即根治。"
```

---

## Task 3: 同步 z-index 层级文档（globals.css 注释）

**Files:**
- Modify: `src/styles/globals.css:9-18`

Spec 标此步为「可选，建议」——补一行注释，保持层级表与实际值一致，避免后人重复踩 Bug 2 的坑。

- [ ] **Step 1: 在 z-index 注释里补 Select 一行**

修改 `src/styles/globals.css`，把当前的 z-index 注释块：
```css
/*
  z-index 层级（统一参考）：
    Radix 浮层（dialog/select/menu/tooltip）默认 z-50
    脚本编辑器全屏背景       z-index 3000   （script-editor.css）
    脚本编辑器最小化条       z-index 3050   （script-editor.css）
    脚本编辑器内下拉         z-index 3100   （script-editor.css）
    确认/输入弹窗 overlay    z-index 3200   （script-editor.css，!important 提升 Radix 默认值）
    确认/输入弹窗 content    z-index 3201
  说明：脚本编辑器的背景层高于 Radix 默认 z-50，故其内部弹窗需在 script-editor.css
  以 !important 提升至 3200+；其他窗口的 Radix 弹窗沿用默认 z-50 即可。
*/
```

改为（在 3201 行下方追加 Select 3250 一行，并更新说明）：
```css
/*
  z-index 层级（统一参考）：
    Radix 浮层（dialog/menu/tooltip）默认 z-50
    脚本编辑器全屏背景       z-index 3000   （script-editor.css）
    脚本编辑器最小化条       z-index 3050   （script-editor.css）
    脚本编辑器内下拉         z-index 3100   （script-editor.css）
    确认/输入弹窗 overlay    z-index 3200   （script-editor.css，!important 提升 Radix 默认值）
    确认/输入弹窗 content    z-index 3201
    Select 下拉（ui/select） z-index 3250   （高于 3201，确保 Dialog 内嵌下拉可见）
  说明：script-editor.css 的全局 !important 把 dialog-content 提到 z-3201，故
    SelectContent（默认 z-50）需提到 3250 才能在 Dialog 内正常浮显。
*/
```

- [ ] **Step 2: 提交**

```bash
git add src/styles/globals.css
git commit -m "docs(css): z-index 层级表补 Select 3250 一行，与实际值一致"
```

---

## Task 4: 全量回归与收尾

- [ ] **Step 1: 全量 typecheck**

Run: `npm run typecheck`
Expected: 通过。

- [ ] **Step 2: 全量单测**

Run: `npm test`
Expected: 全部通过。

- [ ] **Step 3: 合并手动验证（Bug 1 + Bug 2 一起再过一遍）**

`npm run dev` 启动，一次性确认：
1. 长名面板的操作按钮簇完整在视口内（Bug 1）。
2. 新建面板 5 个下拉都浮在对话框之上、可选（Bug 2）。
3. CommandEditor 的 mode 下拉正常（Bug 2 连带）。

- [ ] **Step 4: 填写 PR 说明**

PR 描述包含：
- 两个 bug 的根因（尤其 Bug 2 的 z-index 修正说明）。
- 手动验证结果（上述步骤的截图/录屏）。
- typecheck + test 结果。

> 不需要 rebuild serialport（本次未动 native 依赖）。
