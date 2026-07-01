# 侧栏面板行交互改进 — 设计

**日期**: 2026-06-28
**范围**: React 主窗口侧栏面板列表（`PaneList`）+ 数据总线（`dataBus`）
**动机**: 两件事合并（都改 `PaneList.tsx`，逻辑相关）：
1. **未读角标**：侧栏面板行显示"有多少条新数据未读"，让用户一眼看出哪个面板在刷数据。面板隐藏时尤其有用——看不见数据流，但有角标提示。
2. **行内操作收纳 + 引导**：长串口名会被截断、3 个常驻按钮（重命名/清空/删除）让行显得杂乱。改为：默认行只显示"连接方块 + 名字 + 未读角标 + 淡色 ⋮"，hover 该行时 ⋮ 变成 3 个操作按钮。⋮ 既是收纳入口也是功能发现信号——用户一看就知道"这里有操作"，无需额外的 toast/弹窗式引导。

## 已确认决策

| 项 | 决定 |
|----|------|
| 未读定义 | 面板隐藏，或显示但数据区没在底部 → 新数据 +1 |
| 已读清零 | `hidden=false` 且 `atBottom=true`（可见且看到最新行） |
| 显示上限 | 99+ 封顶 |
| 清零交互 | 点面板名 → 显示 + 置顶 + 滚到底（顺带清零） |
| 在底部信号 | 复用现有 `panel.autoScroll` 字段（语义即"用户在底部"） |
| 性能策略 | 计数并入 `appendChunk` 的同一次 `set`，零额外渲染 |
| 侧栏行默认态 | `[连接方块] [名字 flex-1] [未读角标] [淡色 ⋮]` |
| hover 展开 | hover 该行 → ⋮ 消失、3 个按钮（改名/清空/删除）滑入；移开 → 变回 ⋮ |
| 引导方式 | ⋮ 本身即发现信号，不加 toast/弹窗/分步引导 |
| 右键菜单 | 仍复用现有 `PaneContextMenu` 作补充入口（含隐藏/连接/记录/导出/弹窗等完整操作） |
| 长名字 | 靠 hover 的 `title` tooltip 看全；⋮ 让位给名字 |

## 背景

### 现有基础设施（可直接复用）
- `src/features/serial-panel/dataBus.ts` — `appendWithBuffering` 按路由收数据，每次真正写 chunk 时已在 store 内 `set` 一次。在此处加计数不增加 set 次数。
- `src/features/serial-panel/components/DataDisplay.tsx:36-41` — `handleScroll` 已计算 `atBottom`（`scrollHeight - scrollTop - clientHeight < 4`）并写入 `panel.autoScroll`。**`autoScroll` 字段语义即"在底部"，可直接当 atBottom 信号复用，不新增字段。**
- `src/features/serial-panel/components/PaneList.tsx` — 面板行渲染处，加角标的位置。
- `store.ts` `togglePanelOpen` / `setHidden` / `setActive` — 现有动作。

### 为何轻量
`unread` 计数并入 `appendChunk` 同一次状态更新：
- 不增加 `set` 调用次数（收一条数据本就会 set 一次 chunks）。
- 角标 DOM 是一个静态 span，数字变化只触发一次文本 diff。
- 99+ 封顶后数字静态，无持续重绘。
- 边际成本≈0，远小于已有的 chunks push + trim 开销。

## 设计

### 数据模型（`store.ts` / `types.ts`）
`Panel` 增加字段：
```
unread: number   // 未读条数，不持久化（重启归零）
```
- `genPanel` 初始化 `unread: 0`。
- `load` 不读持久化的 unread（保持 0）。
- `persist` 不写 unread（保持 config 文件干净）。
- `clearChunks` 同时清零 unread（清空即无未读）。
- `restoreChunks`（popout dock 回）清零 unread。

### 计数与清零（`dataBus.ts`）
在 `appendWithBuffering` 内，每次 `appendChunk` 前先判一次"是否已读"：
```
const p = usePanelsStore.getState().panels[id]
const isRead = !!p && !p.hidden && p.autoScroll   // 可见且在底部
```
**关键**：把 unread 计数与 chunk 追加**合并到同一次 store set**，避免双重渲染。具体做法——`store.ts` 新增内部能力或扩展 `appendChunk`，接收 `incrementUnread?: boolean`，在同一次 `set` 里一并更新 chunks 与 unread：
```
appendChunk(id, chunk, { incrementUnread: !isRead })
```
- `dataBus` 拿到 `isRead` 后，把该 flag 传给 `appendChunk`。
- store 内同一次 `set` 既写 chunks 又（按 flag）`unread += 1`。

### 清零交互（`PaneList.tsx`）
改 `handleToggle`：点名称时若当前隐藏 → 显示 + 置顶 + **强制滚到底**；若已显示 → 滚到底（不再隐藏，避免清零被打断）。

> 注：原 `handleToggle` 行为是"显示则隐藏、隐藏则显示"。为支持清零，调整为：点名称优先"显示并看底"，隐藏改由面板标题栏的 Eye 按钮或现有路径承担。**这是唯一的行为变更，需在 spec 明确**。

"强制滚到底"的实现：点名称时 `setAutoScroll(id, true)`。`DataDisplay` 的现有 effect（`rendered.length` 变化 + `autoScroll` 为真 → 滚到底）会处理滚动。但若此时无新数据（rendered.length 不变），effect 不触发——需补一个"滚到底"的显式触发。**实现细节（用 ref 方法 / key 重置 / 信号字段）在 plan 阶段定**，倾向最小改动：给 `DataDisplay` 加一个由 `unread===0` 切换触发的"滚到底"effect，或 PaneList 直接调一个 store action 触发滚动。

### 角标显示（`PaneList.tsx`）
面板名 `<button>` 内，名称后追加：
```
{p.unread > 0 && (
  <span className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
    {p.unread > 99 ? '99+' : p.unread}
  </span>
)}
```
- 隐藏面板也显示角标（这正是该功能的价值——提示隐藏面板在刷数据）。
- 整行已有 `opacity-50`（隐藏态），角标随之半透明，仍可辨识。

### 行内操作收纳 + ⋮ 引导（`PaneList.tsx`）
当前行结构：`[连接方块] [名字 flex-1 truncate] [改名] [清空] [删除]`，后三者 `shrink-0` 常驻，挤压名字宽度，长名字被 `...` 截断。

**改造**：3 个常驻按钮默认收起，行默认态变为 `[连接方块] [名字 flex-1 truncate] [未读角标] [淡色 ⋮]`。hover 该行（任意位置）时，`⋮` 隐藏、3 个按钮滑入；移开鼠标 → 按钮变回 `⋮`。

**为什么用 ⋮ 而非纯 hover 出按钮**：纯 hover 出按钮的话，新用户不 hover 就完全看不到操作入口，功能发现差。`⋮` 是通用的"这里有更多操作"符号，常驻但淡色（不抢视觉），既起到引导作用，又是交互入口——一举两得，无需 toast/弹窗式引导。

**hover 触发实现**：用 Tailwind 的 group/group-hover。行 div 加 `group`，3 个按钮容器用 `opacity-0 group-hover:opacity-100`；`⋮` 反向 `opacity-100 group-hover:opacity-0`，二者叠放在同一位置（用绝对定位 + transition 淡入淡出）。按钮区 `shrink-0` 不被压缩。

**右键菜单（补充入口）**：仍接入现有 `PaneContextMenu` 作补充——它含 hover 行没有的完整操作（隐藏/连接开关/记录/保留条数/复制/导出/弹窗/示波器等）。
- 用 `<ContextMenuTrigger asChild>` 包裹侧栏行 div。
- 验证过 `PaneContextMenu` 的 4 个外部 handler（`onToggleOpen/onToggleLogging/onExport/onPopout`）都不依赖面板 DOM，`PaneList` 内从 store + ipc 拼出即可。
- 好处：hover 行覆盖高频操作（改名/清空/删除），右键覆盖低频完整操作，两者互补。

**长名字看全**：名字按钮 `title` 设为完整名字。默认态因 `⋮` 取代了 3 个按钮，`flex-1` 名字区比当前更宽；hover 时按钮滑入会挤压名字，但此时用户正操作，短暂截断可接受。保留"双击重命名"快捷路径。

**交互汇总**：
- 点名字 → 显示+置顶+滚底清零（同未读角标设计）。
- 双击名字 → 重命名。
- hover 行 → 显 3 个按钮。
- 右键行 → 完整菜单。

## 不改动

- `FloatingPane.tsx` — 已显示面板靠 `autoScroll`（atBottom）自然清零，无需改。
- 连接 / 记录 / 几何逻辑全不动。
- 持久化格式不变（unread 不入 config）。

## 风险与缓解

1. **高频数据下角标跳动**：99+ 封顶后数字静态；且计数并入同一次 set，无额外渲染。可接受。
2. **"在底部"信号可靠性**：复用 `autoScroll`，由 `DataDisplay` 滚动事件实时维护，已验证可用。隐藏面板 `autoScroll` 停在最后值，但因 `hidden=true`，未读照样 +1，符合定义。
3. **清零交互的行为变更**：原"点名称切显隐"→ 改为"点名称显示+滚底"。隐藏入口改由面板标题栏 Eye 按钮承担（已存在）。这是用户可见的行为变化之一，需在 PR 说明。
4. **hover 与拖拽/右键共存**：侧栏行 `draggable`（排序）+ 右键菜单（`contextmenu`）+ group-hover（显按钮）三者同在一行。需验证：① hover 显按钮不干扰 dragstart；② 右键时按钮也能正常显；③ 拖拽过程中不会误触按钮。`contextmenu` 与 `dragstart` 是不同事件不冲突；group-hover 纯 CSS 不拦事件。实现时手测。
5. **触屏/无鼠标设备**：hover 在触屏不可靠，`⋮` 仍可见但"hover 变按钮"失效。本项目是桌面端 Electron，触屏非主要场景，暂不专门处理（如需可后续加点击展开）。

## 验证

- `npm run typecheck` — 新字段与签名扩展应通过。
- `npm test` — 新增：`dataBus` 计数单测（可见+底部不增、隐藏则增、99+ 封顶）、store `clearChunks` 清零。
- 手动（Electron）：
  1. 连接串口，面板可见在底部 → 角标始终 0。
  2. 滚离底部 → 新数据角标 +1。
  3. 点面板名（已显示）→ 滚到底，角标清零。
  4. 隐藏面板 → 新数据角标累积；点名称恢复 → 滚底清零。
  5. 连续刷屏 → 角标显示 99+ 后静态。
  6. 默认态：行尾显示淡色 ⋮，3 个按钮不可见，名字占满宽度。
  7. hover 行 → ⋮ 消失、3 个按钮淡入；移开 → 变回 ⋮。
  8. hover 出的按钮：重命名/清空（二次确认）/删除（二次确认）均生效。
  9. 右键行 → 弹出完整菜单；拖拽排序正常；三者不互相干扰。
  10. 长名字 → 默认态名字更宽可显示更多；hover 时按钮挤名字但仍可 hover tooltip 看全。

## 影响与回滚

- 改动文件：
  - `types.ts`（+1 字段 `unread`）
  - `store.ts`（计数并入 `appendChunk`、`clearChunks`/`restoreChunks` 清零）
  - `dataBus.ts`（判 `isRead` 传 flag 给 appendChunk）
  - `PaneList.tsx`（3 按钮改为 hover 显 + 淡色 ⋮、接入 `PaneContextMenu`、加未读角标、改清零交互）
  - 可能 `DataDisplay.tsx`（"点名称强制滚到底"的触发机制，plan 阶段定）
- **不新建** `PaneListItemContextMenu` —— 原样复用现有 `PaneContextMenu`。
- **不新建**引导/toast/onboarding 组件 —— ⋮ 本身即引导，零额外引导代码。
- `unread` 不入持久化，回滚只需还原上述文件，无数据迁移。
- 行为变更：
  1. 点名称从"切显隐"改为"显示+滚底"；隐藏入口移至标题栏 Eye 按钮（已存在）。
  2. 侧栏行的重命名/清空/删除从"常驻按钮"改为"hover 显 + ⋮"；补充右键完整菜单。
