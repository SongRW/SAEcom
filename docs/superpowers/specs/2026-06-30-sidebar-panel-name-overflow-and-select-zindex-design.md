# 侧边栏面板名溢出 & 新建面板下拉被遮 修复设计

- 日期：2026-06-30
- 分支：develop_srw
- 类型：bugfix
- 影响文件：`src/features/serial-panel/components/PaneList.tsx`、`src/components/ui/select.tsx`

## 背景

用户报告侧边栏两个 UI 缺陷：

1. **Bug 1**：侧边栏中面板名字过长时，仍会把「面板选择栏」最右边的操作按钮簇挤出可视范围外。
2. **Bug 2**：新建面板弹窗（`NewPanelDialog`）里，Select 下拉的内容（串口 / 波特率 / 数据位 / 停止位 / 校验）看不到，疑似 z 序太低。

## 根因分析

### Bug 1 — 长面板名撑出侧边栏

行容器位于 `src/features/serial-panel/components/PaneList.tsx:152`：

```tsx
className={`group flex items-center gap-1 rounded px-1.5 py-1 text-sm hover:bg-accent ...`}
```

问题点：

- 行容器只有 `flex items-center gap-1`，**没有 `min-w-0` / `overflow-hidden`**，因此 flex 容器整体没有被钳制在侧边栏宽度内。
- 右侧操作按钮簇（`PaneList.tsx:179`）是 `shrink-0 w-[80px]`，固定不收缩。
- 名字按钮（`:162`）本身有 `min-w-0 flex-1`，名字 `<span>`（`:169`）有 `truncate`。但当行容器不被钳制时，长名字会把整行撑开超过侧边栏宽度，`truncate` 无从收缩。
- 祖先链 `SidebarContent`（`sidebar.tsx:369`）是 `overflow-auto`，因此宽度溢出的行会落进水平滚动区，把操作按钮簇推到视口外。

对照参考：`SidebarMenuButton`（`sidebar.tsx:471`）的变体类名里就显式带了 `overflow-hidden`，正是为了同样的截断场景。

### Bug 2 — 新建面板 Select 下拉被对话框面板盖住

> 这是本次设计的关键修正点：初判曾怀疑「Dialog z 序太低」，深挖代码后推翻。

**一手事实：**

- `src/components/ui/select.tsx:70` 的 `SelectContent` 类名是 `z-50`。
- `src/components/ui/dialog.tsx:42,64` 的 `DialogOverlay` / `DialogContent` 类名写的是 `z-50`。
- 但 `src/features/script-editor/script-editor.css:1447-1455` 有一条**全局 `!important` 规则**：

  ```css
  [data-slot="dialog-overlay"],
  [data-slot="alert-dialog-overlay"] { z-index: 3200 !important; }
  [data-slot="dialog-content"],
  [data-slot="alert-dialog-content"] { z-index: 3201 !important; }
  ```

- 该 CSS 文件在**主窗口也加载**（`src/app/mainwindow.tsx:5`），不止脚本编辑器窗口。

**推论：**

- 运行时所有 Dialog 的 overlay/content 实际 z-index 是 **3200 / 3201**，而不是 `dialog.tsx` 里写的 z-50。
- 该 `!important` 规则**只覆盖** `[data-slot="dialog-*"]` 和 `[data-slot="alert-dialog-*"]`，**不覆盖** `[data-slot="select-content"]`。
- 因此 `SelectContent` 运行时仍是 **z-50**。
- Dialog content 与 Select content 都通过 Radix portal 挂到 `body`，两者在同一个根 stacking context 下直接比较 z-index：**50 ≪ 3201**，下拉列表被对话框面板盖住 → 看不到下拉内容。

**结论：根因不在「Dialog 太低」，而在「Select 太低」。** 直接改 `dialog.tsx` 把 z-50 提到 z-[3200]/z-[3201] 是**无效改动**（普通 CSS 会被 `!important` 压制，且运行时 Dialog 本就已是 3201）。

连带受益的场景：`src/features/commands/components/CommandEditor.tsx` 的 Dialog 内也嵌有 Select（每行 mode 选择），同根因，会随本次修法一并修复。

## 方案

### Bug 1 修复

`PaneList.tsx:152` 行容器 className 追加 `min-w-0 overflow-hidden`。

效果：flex 链上子项被钳制在侧边栏宽度内 —— 名字按钮的 `min-w-0 flex-1` + `truncate` 真正生效收缩，`shrink-0 w-[80px]` 操作按钮簇原位保留在视口内。与 `SidebarMenuButton` 的 `overflow-hidden` 做法一致。

双击重命名的 `title`（`PaneList.tsx:165`，`displayName(p) + '（双击重命名）'`）已存在，鼠标悬停长名仍可看全名，截断不影响可用性。

### Bug 2 修复

`select.tsx:70` 把 `SelectContent` 的 `z-50` 改为 `z-[3250]`。

- `3250 > 3201`（dialog content），任何 Dialog 内嵌的 Select 下拉都能浮在面板之上。
- `3250` 低于未来可能的更高层级；全项目 grep 确认无其它元素占用 `z-[3201, 3250)` 区间。
- 脚本编辑器内部用的是自己的 `.script-editor-select-content`（`z-3100 !important`，`script-editor.css:1062`），非 `ui/select.tsx`，不受影响。

### 连带核查结论（用户要求「连带核查其它弹窗」）

| 弹窗 | 内部嵌套 Radix 浮层 | 提层后影响 |
|------|---------------------|------------|
| `SettingsDialog` | 无 | 无 |
| `SelectGroupDialog` | 无 | 无 |
| `PromptDialog`（含各处确认/输入弹窗） | 无 | 无 |
| `NewPanelDialog` | 5 个 Select | **受益**：下拉不再被对话框面板盖 |
| `CommandEditor` | Select + 同级 AlertDialog/SelectGroupDialog | **受益**：mode 下拉不再被对话框面板盖 |
| toast（sonner） | — | sonner 默认在 Radix 浮层之上，3250 不影响 |
| 脚本编辑器 | 用自有 `.script-editor-select-content`(z-3100) | 不受影响 |

**结论：提 SelectContent 到 3250 无副作用。**

### 层级文档同步（可选，建议）

在 `src/styles/globals.css:9-18` 的 z-index 层级注释里补一条：

```
Select 下拉（ui/select）    z-index 3250   （高于确认/输入弹窗 3201，确保 Dialog 内下拉可见）
```

保持层级表与实际值一致，避免后人重复踩坑。

## 改动清单

1. `src/features/serial-panel/components/PaneList.tsx:152` —— 行容器 className 追加 `min-w-0 overflow-hidden`。
2. `src/components/ui/select.tsx:70` —— `SelectContent` 的 `z-50` 改为 `z-[3250]`。
3. `src/styles/globals.css:9-18`（可选）—— z-index 层级注释补 Select 一行。

## 验证清单

1. `npm run typecheck` 通过。
2. `npm test` 通过。
3. 手动验证（写入 PR 说明）：
   - **Bug 1**：造一个备注名 50+ 字的面板，确认侧边栏内操作按钮簇（默认 `⋮`，hover 显示「添加备注 / 清空数据 / 删除面板」3 个按钮）完整可见、不被挤出视口；名字以省略号截断；hover 名字时 `title` 显示完整名。
   - **Bug 2**：打开「新建面板」弹窗，依次点开串口 / 波特率 / 数据位 / 停止位 / 校验 5 个下拉，确认下拉列表完整浮在对话框面板之上、可正常选中；同时在命令编辑器（CommandEditor）里验证 mode 下拉同样正常。

## 非目标 / 不做的事

- **不**改 `dialog.tsx` 的 z-50（运行时已被 `!important` 提到 3201，改它是无效改动）。
- **不**重构 `script-editor.css` 的 `!important` 提层规则（超出本次范围，且删它需更大范围回归测试）。
- **不**改 `PaneList` 的按钮簇宽度、hover 交互逻辑（只解决溢出，不动交互）。
- **不**处理 `PaneHeader`（浮动面板标题栏）的名字截断（用户未报告，且该处已是 `truncate`）。
