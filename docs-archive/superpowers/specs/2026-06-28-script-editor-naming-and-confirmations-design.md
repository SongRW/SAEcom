# 脚本页：新建自定义命名 + 保存/删除提示

**日期：** 2026-06-28
**范围：** `src/features/script-editor/ScriptEditorDialog.tsx`（及其内部状态）
**状态：** 已通过设计评审，待实现

## 背景

脚本编辑器（`ScriptEditorDialog.tsx`）目前的三个动作行为如下：

| 动作 | 当前行为 |
|---|---|
| **新建** | 直接生成自增名 `Script_1.js` / `Script_2.js`，无法自定义 |
| **保存** | 无活动名 → 弹「另存为」输入框；有活动名 → 直接写入，无任何提示 |
| **删除** | 立即删除，无确认（易误删） |

需求：新建时可自定义名称；保存覆盖已有文件、删除脚本时给出提示。

## 目标行为

| 动作 | 目标行为 |
|---|---|
| **新建** | 弹 `PromptDialog` 让用户自定义名称；默认值沿用现有自增逻辑（`Script_N.js` 第一个未占用名）。若名称已存在则走覆盖确认流程 |
| **保存** | 无活动名 → 另存为弹窗；目标名已在脚本列表中 → 弹「确定覆盖吗？」后写入；否则直接写入 |
| **删除** | 弹 `AlertDialog`「确定删除脚本「xxx」吗？此操作不可撤销。」，确认后删除 |

### 保存提示时机（已与用户确认）

采用**「覆盖已有文件时才提示」**：

- 目标名是磁盘已存在的文件 → 弹覆盖确认。
- 保存到新文件 / 新建且名不重复 → 不提示。
- 这样既能防误覆盖，又不会在反复迭代保存时每次打扰用户。

### 不引入设置开关

保存覆盖是条件逻辑（与文件存在与否相关），删除总是确认。两者都不做成 `confirmClear`/`confirmDelete` 那样的偏好开关，与用户表述一致。

## 设计

### 复用现有对话框组件

仓库已具备全部基础设施，不新建抽象：

- **`PromptDialog`**（`src/components/ui/prompt-dialog.tsx`）：文本输入弹窗，替代被禁用的 `window.prompt`。当前文件已用它做「另存为」。新建命名也复用同一个组件。
- **`AlertDialog`**（`src/components/ui/alert-dialog.tsx`）：确认弹窗。`PaneContextMenu.tsx:162-177` 已用 `confirm` 状态对象 + 单个 `AlertDialog` 的模式做删除/清空确认——本方案完全沿用同一模式。

### 新增状态（`ScriptEditorDialog.tsx`）

```ts
const [createNameOpen, setCreateNameOpen] = useState(false)
const [confirmOverwrite, setConfirmOverwrite] = useState<{ name: string } | null>(null)
const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
```

### 行为改动

#### 1. 新建（`onNew` → `createScript`）

- 点击「新建」不再直接创建，而是 `setCreateNameOpen(true)`。
- 计算「下一个自增名」作为 `PromptDialog` 的 `defaultValue`（沿用现有 `Script_N.js` 自增循环逻辑）。
- 用户在弹窗里可修改名称。
- 确认（`onConfirm`）后：
  1. `normalizeScriptName(v)` 校验；空/非法 → 直接返回不创建。
  2. 若名称已存在于 `scripts` 列表 → 进入**覆盖确认流程**（与保存共用同一逻辑）。
  3. 否则 → 写空图 + 重置编辑器状态（沿用原 `createScript` 的写入/重置逻辑）。

#### 2. 保存（`onSave` → `saveScript`）

- 无活动名 → 仍是 `setSaveAsOpen(true)`（「另存为」弹窗，行为不变）。
- 有活动名 → 调用 `writeScriptAs(activeScriptName)`，但 `writeScriptAs` 改造为：
  - 名称是当前活动脚本（同名保存）→ 直接写入（正常保存，无提示）。
  - 名称在 `scripts` 列表中已存在（另存为时目标名重复）→ 暂存 `confirmOverwrite = { name }`，弹 `AlertDialog`「确定覆盖脚本「xxx」吗？」，确认后再写入。
  - 否则 → 直接写入。
- 「另存为」`PromptDialog` 的 `onConfirm` 走同一个 `writeScriptAs`，因此也获得覆盖保护。

> 注：同名保存（当前活动脚本名）不会触发覆盖确认——这是正常迭代保存，应当直接写入。

#### 3. 删除（`onDelete` → `deleteScript`）

- 点击「删除」先 `setDeleteConfirmOpen(true)`。
- `AlertDialog` 确认后再执行原 `deleteScript` 的删除 + 重置 + `refreshScripts` 逻辑。

### 复用 `AlertDialog` 的写法

完全对齐 `PaneContextMenu.tsx:162-177`：

```tsx
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
      <AlertDialogAction onClick={execDelete}>确定</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

覆盖确认同理，用 `confirmOverwrite` 状态 + 一个 `AlertDialog`。

### 接口不变

`Toolbar` 组件的 `onNew` / `onSave` / `onDelete` 回调签名不变；只有 `onNew` 的行为从「立即创建」变为「打开命名弹窗」。

## 保留的细节

- **新建默认值**：沿用现有自增循环作为 `PromptDialog` 的 `defaultValue`，用户仍可一键确定获得 `Script_N.js`。
- **`normalizeScriptName`**：两个 `onConfirm` 均复用；空/非法名直接返回。
- **无偏好开关**：保存覆盖、删除都不接入 settings store。

## 测试

- 对话框为 React 组件，难以做 DOM 级确认测试；逻辑层保持 `normalizeScriptName` 等可单测。
- 「文件名是否已存在」的判断来自 `scripts` 列表（已通过 `getIPC().scripts.list()` 加载），属于组件内既有数据，不需新提取逻辑。
- PR 描述中将记录手动 Electron 验证步骤（新建自定义名、保存覆盖提示、删除确认三条路径）。
- 提交前运行 `npm test` 与 `npm run typecheck`（依据 AGENTS.md）。

## 影响范围

- 主要改动文件：`src/features/script-editor/ScriptEditorDialog.tsx`。
- `Toolbar.tsx` 接口不变。
- 不影响 IPC 契约、serialport 打包、native 重建，不影响 legacy/React 共存。
