# 侧栏连接状态勾选方块 — 视觉对齐设计

**日期**: 2026-06-28
**范围**: React 主窗口侧栏面板列表（`PaneList`）
**动机**: 复刻 legacy `renderer.js` 侧栏最左侧的 `.port-status` 勾选方块，让"隐藏面板仍可连接+记录"这一已存在的逻辑在视觉上可见。

## 背景与根因

### Legacy 行为（`renderer.js:2551-2693` + `styles.css:469-509`）
侧栏每行面板（`<li class="port-row">`）最左侧是 `.port-status` 方块按钮：
- **断开**：蓝色（`#409EFF`）圆角方块，中间一个白色小方块（`::after`，9×9px）。
- **已连接**：绿色（`#67c23a`）方块 + 白色 ✓。
- 点击切换 `serial.open/close`，**与面板 `.pane.hidden`（`display:none`）无关**。

关键：legacy 的连接与数据记录（`serial.onData` → `pane.chunks` / `textBuffer`）独立于面板可见性。隐藏的面板照常收数据，重新显示后内容仍在。

### React 现状（已正确，但视觉缺失）
逻辑层面已复刻：
- `src/features/serial-panel/dataBus.ts:52` — `appendWithBuffering` 仅按 `id` 过滤，**不检查 `hidden`**，隐藏面板照常累积 chunks ✅
- `src/features/serial-panel/store.ts:257` — `togglePanelOpen` 独立于 `hidden` ✅

**视觉根因**：`src/features/serial-panel/components/PaneList.tsx:114-121` 最左用 `size-3` 的 `Circle` 图标，且已连接态用 `text-success` 类 —— **该类在项目里不存在**（Tailwind v4 默认无 `success`，`globals.css` 也未定义 `--success` token）。grep 确认：源码中无任何 `--success`/`--color-success` 定义，`text-success` 仅出现在本文件与 docs。**因此绿色根本没渲染**，连接状态在侧栏"看不出来"。

## 目标

把侧栏最左的连接状态指示器改成醒目的勾选方块（语义 = 勾选 = 已连接），让用户一眼看出哪个面板在线。**仅视觉对齐，不改任何连接/记录逻辑。**

## 设计

### 配色方案（已选：融入主题 — 橙/绿）
- 断开态用项目主色 `--primary`（橙 oklch(0.553 0.195 38.402)）。
- 连接态用新增的 `--success`（绿）。
- 语义：橙方块（空）= 待连接；绿方块（✓）= 已连接。

### 断开态内容（已选：留空）
- 断开态方块**留空**（纯色方块），不画老版"方块里的方块"。连接态才显示白色 ✓。语义更直觉（空/✓），也更简洁。

### 改动 1 — 新增 `--success` token（`src/styles/globals.css`）
- `:root` 增加：`--success: oklch(0.65 0.17 145);`（绿色，饱和度与亮度参照 `--primary` 比例）。
- `.dark` 增加：`--success: oklch(0.7 0.16 145);`（暗色下略提亮）。
- `@theme inline` 块内增加：`--color-success: var(--success);`
- 效果：Tailwind v4 据此生成 `bg-success` / `text-success` 等类。项目内已有的 `text-success` 引用（`PaneList.tsx:116`、`PaneHeader.tsx` 等）也会一并生效。

### 改动 2 — `PaneList.tsx` 最左指示器（约 114-121 行）
- `import` 增加 `Check`（已在 `@phosphor-icons/react`，无需新依赖）。
- 替换现有 `<button>` 内容：

```
<button
  type="button"
  className={`shrink-0 grid size-4 place-items-center rounded-[4px] ${
    p.open ? 'bg-success' : 'bg-primary'
  }`}
  title={p.open ? '点击断开' : '点击连接'}
  onClick={() => togglePanelOpen(p.id)}
>
  {p.open && <Check className="size-3 text-white" weight="bold" />}
</button>
```

- 隐藏态整行已有 `opacity-50`（`PaneList.tsx:112`），方块随之半透明，无需额外处理。
- `title` 与 `onClick` 保持不变（仍是 `togglePanelOpen`）。

## 不改动

- `src/features/serial-panel/store.ts` — `togglePanelOpen` / `setHidden` 逻辑已正确。
- `src/features/serial-panel/dataBus.ts` — 隐藏态收数据已正确。
- `src/features/serial-panel/components/FloatingPane.tsx` — 面板内 `Power` 按钮保持现状（不在本次范围）。
- 不加"新数据到达"角标等额外功能（超出范围）。

## 验证

- `npm run typecheck` — 新增 token 与 `Check` 导入应无类型问题。
- `npm test` — 无逻辑变更，现有测试应全绿。
- 手动（Electron）：
  1. 新建串口面板 → 侧栏方块为橙（留空）。
  2. 点方块 → 变绿 + ✓，面板标题栏 `Power` 也同步亮。
  3. 点面板名 → 面板隐藏（整行 `opacity-50`，方块仍绿）。
  4. 此时向串口发数据 → 重新点面板名恢复，确认收到的内容仍在。
  5. 再点绿方块 → 断开，恢复橙方块。

## 影响与回滚

- 单文件逻辑改动（`PaneList.tsx` 约 8 行）+ 一个 CSS token（`globals.css` 3 行）。
- `--success` 是新增 token，不影响任何现有样式；若回滚，删除 token 与 `PaneList` 改动即可。
- 双轨：legacy `renderer.js` 不受影响（各自独立渲染）。
