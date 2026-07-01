# zcode 风格设置界面改造设计

**日期**: 2026-06-26
**范围**: 新 React 侧(`src/features/settings/`),legacy `#dlgSettings` 不动
**目标**: 把现有单列 `SettingsDialog` 改造成 zcode 风格的「左导航 + 右分区」设置界面,并新增字体大小、重置默认、快捷键三个功能。

---

## 1. 背景与现状

当前设置界面(`src/features/settings/SettingsDialog.tsx` + `SettingsForm.tsx`)是一个 `max-w-lg` 的 shadcn `Dialog`,内部是单列堆叠的 9 个开关/输入项。入口为 Sidebar 底部「设置」按钮。

设置存储在 `localStorage['appSettings']`,由 zustand store `src/shared/store/settings.ts` 管理,与 legacy `renderer.js` 共享同一个 key。store 的 `persist()` 采用 merge 写入,保留 legacy 的 fx 字段(anim/winter 等),React 侧不管理。

现有字段:`fullscreen`、`dark`、`rxTimestamp`、`txTimestamp`、`confirmClear`、`confirmDelete`、`charEncoding`、`bufferTime`、`echoSend`、`longCommandThreshold`。

---

## 2. 决策记录

| 决策点 | 选择 | 备注 |
|---|---|---|
| 整体方向 | 左导航 + 右分区 | 用户确认(选项 A) |
| 分区方案 | 通用 / 外观 / 串口 / 快捷键 / 关于 | 5 个分区 |
| 新功能 | 字体大小 + 重置默认 + 快捷键 | 全部要做 |
| 容器形态 | 加宽 Dialog(`max-w-2xl`) | 沿用现有入口,改动最小(选项 A) |
| 快捷键分区 | 方案 2:顺手补几个常用快捷键再展示 | 现状仅 `Ctrl/Cmd+B` 一条,补全后展示 |

---

## 3. 总体架构

改动全部在新 React 侧,legacy `#dlgSettings` 不动。

| 文件 | 改动 |
|---|---|
| `src/shared/store/settings.ts` | 新增 `fontSize` 字段;`reset()` 已重置所有字段,自动包含 `fontSize` |
| `src/features/settings/SettingsDialog.tsx` | 重构为左导航 + 右分区布局;加宽到 `max-w-2xl`;保留 `dark`/`fullscreen` 副作用,新增 `fontSize` effect |
| `src/features/settings/SettingsForm.tsx` | 删除,逻辑拆到 `ToggleRow.tsx` + 各分区组件 |
| **新增** `src/features/settings/shortcuts.ts` | `SHORTCUTS` 只读数据表 + `useGlobalShortcuts()` hook |
| **新增** `src/features/settings/SettingsNav.tsx` | 左侧导航 |
| **新增** `src/features/settings/SettingsContent.tsx` | 右侧内容区 |
| **新增** `src/features/settings/ToggleRow.tsx` | 抽出的通用开关行 |
| **新增** `src/features/settings/sections/GeneralSection.tsx` | 通用分区 |
| **新增** `src/features/settings/sections/AppearanceSection.tsx` | 外观分区 |
| **新增** `src/features/settings/sections/SerialSection.tsx` | 串口分区 |
| **新增** `src/features/settings/sections/ShortcutsSection.tsx` | 快捷键分区 |
| **新增** `src/features/settings/sections/AboutSection.tsx` | 关于分区 |
| `src/features/main-window/components/Sidebar.tsx` | 接入 `Ctrl+,` 打开设置;挂载 `useGlobalShortcuts()` |

**容器**:沿用现有入口(Sidebar 底部「设置」按钮 → Dialog)。关闭仍用 Dialog 自带的 × / Esc / 遮罩点击。不再保留底部「关闭」按钮(header 的 × 足够)。

---

## 4. 分区内容

| 分区 | 项 | 控件 | 备注 |
|---|---|---|---|
| **通用** | 全屏模式 | Switch | 已有 |
| | 清除前确认 | Switch | 已有 |
| | 删除前确认 | Switch | 已有 |
| | 重置全部为默认 | 按钮 | 🆕 调 `reset()`,含 `fontSize` |
| **外观** | 夜间模式 | Switch | 已有,触发主题副作用 |
| | 字体大小 | Select | 🆕 12/13/14/15/16/18/20,默认 14 |
| **串口** | 接收时间戳 | Switch | 已有 |
| | 发送时间戳 | Switch | 已有 |
| | 发送回显 | Switch | 已有 |
| | 字符编码 | Select | 已有 |
| | 接收缓冲(ms) | Input[number] | 已有 |
| **快捷键** | 切换侧边栏 | `Ctrl/Cmd+B` | 硬编码,只读 |
| | 打开设置 | `Ctrl/Cmd+,` | 🆕 |
| | 切换夜间模式 | `Ctrl/Cmd+Shift+L` | 🆕 |
| | 切换全屏 | `F11` | 🆕 统一走 store |
| | 关闭设置 | `Esc` | Dialog 默认行为,仅展示 |
| **关于** | 应用名 | 文本 | `SAEcom` |
| | 版本 | 文本 | `ipc.app.getVersion()` → `0.6.0` |
| | 描述 | 文本 | 基于Electron开发的多面板串口助手 |
| | 打开更新日志 | 按钮 | `ipc.changelog.open()` |

---

## 5. 数据与状态变更

### 5.1 settings store 新增字段

```ts
SettingKey 新增: | 'fontSize'
Settings 新增: fontSize: number  // 基础字号 px

DEFAULTS 新增: fontSize: 14
loadFromStorage 新增: fontSize 读取,number 且在 [12,20] 内,否则 14
```

- 持久化机制不变(merge 写入 `localStorage['appSettings']`,保留 legacy fx 字段)。
- `reset()` 现已重置所有字段,`fontSize` 自动包含,无需额外改。

### 5.2 字体大小副作用

在 `SettingsDialog` 加 effect,初始执行一次 + 监听变化:
```ts
useEffect(() => {
  document.documentElement.style.setProperty('--font-size-base', `${fontSize}px`)
}, [fontSize])
```

**风险点**:若现有样式用固定 px 而非 rem,字体大小功能影响范围会受限。实现时需确认;若 px 硬编码,该功能退化为只影响设置面板自身,或需额外样式改造(届时提出)。

### 5.3 「关于」版本数据来源

- 版本号:调 `await ipc.app.getVersion()`(已存在 `app:version` handler → `app.getVersion()`)。「关于」分区用 `useState` + `useEffect` 懒加载,挂载时取一次。
- 应用名/描述:写死 `SAEcom` / `基于Electron开发的多面板串口助手`(与 `package.json` 一致,不加 IPC 通道)。

---

## 6. 快捷键实现与全局监听

### 6.1 只读数据表

`src/features/settings/shortcuts.ts` 导出 `SHORTCUTS`,驱动快捷键分区 UI:

```ts
export interface ShortcutDef {
  id: string
  label: string
  combo: string          // win/linux 展示:"Ctrl+B"
  platformCombo?: string // mac 展示:"⌘B"
}
export const SHORTCUTS: ShortcutDef[] = [
  { id: 'sidebar',    label: '切换侧边栏',   combo: 'Ctrl+B', platformCombo: '⌘B' },
  { id: 'settings',   label: '打开设置',     combo: 'Ctrl+,', platformCombo: '⌘,' },
  { id: 'theme',      label: '切换夜间模式', combo: 'Ctrl+Shift+L', platformCombo: '⌘⇧L' },
  { id: 'fullscreen', label: '切换全屏',     combo: 'F11' },
  { id: 'close',      label: '关闭设置',     combo: 'Esc' },
]
```

按平台(mac/win)决定展示 `platformCombo` 还是 `combo`。

### 6.2 全局键盘监听 hook `useGlobalShortcuts()`

在主窗口顶层(Sidebar 或 App 根)挂一次,监听:

| 组合键 | 行为 | 实现方式 |
|---|---|---|
| `Ctrl/Cmd+,` | 打开设置 | 触发 `setSettingsOpen(true)` |
| `Ctrl/Cmd+Shift+L` | 切换夜间 | `setField('dark', !dark)`(走 store,主题副作用自动生效) |
| `F11` | 切换全屏 | `setField('fullscreen', !fullscreen)`(走 store → IPC) |

**注意点:**
- `Ctrl+B`(侧边栏)已存在于 `sidebar.tsx`,不动它,避免双重监听。
- 所有监听加 `e.preventDefault()` 并在组件卸载时清理。
- 输入框聚焦时(`e.target` 是 input/textarea/contenteditable)不触发这些快捷键,避免误拦截。
- `Esc 关闭设置` 是 Dialog 默认行为,不写额外监听。`F11` 写监听以统一走 store,确保与开关状态同步。

`Ctrl/Cmd+,` 打开设置需要把 `setSettingsOpen` 传给 `useGlobalShortcuts()`,故 hook 签名为 `useGlobalShortcuts({ onOpenSettings: () => void })`。

---

## 7. 组件结构与布局

### 7.1 文件结构

```
src/features/settings/
├── SettingsDialog.tsx        # 容器:加宽 Dialog + 左右两栏 + 副作用 effects
├── SettingsNav.tsx           # 左侧导航(5 项,高亮当前分区)
├── SettingsContent.tsx       # 右侧内容区(按 activeSection 渲染分区)
├── ToggleRow.tsx             # 通用开关行(各分区复用)
├── shortcuts.ts              # SHORTCUTS 表 + useGlobalShortcuts hook
└── sections/
    ├── GeneralSection.tsx
    ├── AppearanceSection.tsx
    ├── SerialSection.tsx
    ├── ShortcutsSection.tsx
    └── AboutSection.tsx
```

### 7.2 布局结构

```
┌─────────────────────────────────────────┐
│ 设置                                 ×   │  DialogHeader(标题 + 关闭)
├──────────┬──────────────────────────────┤
│ 通用     │                              │
│ 外观     │   <当前分区内容>              │  右侧 ScrollArea
│ 串口     │                              │
│ 快捷键   │                              │
│ 关于     │                              │
└──────────┴──────────────────────────────┘
```

- 左导航宽度固定(约 `w-40`),右内容区用 `<ScrollArea>` 包裹。
- 导航项点击切换 `activeSection` state(默认「通用」)。
- 不再有底部「关闭」按钮。

### 7.3 复用与迁移

- 现有 `SettingsForm.tsx` 的 ToggleRow / Select / Input 逻辑拆到 `ToggleRow.tsx` + `SerialSection.tsx`,删掉旧 `SettingsForm.tsx`。
- 现有 `SettingsDialog` 里的 `dark`/`fullscreen` 副作用 effects 保留,新增 `fontSize` effect。

---

## 8. 不在本次范围(YAGNI)

- 快捷键自定义/改键:本次只做只读展示 + 少量补全绑定。
- legacy `#dlgSettings` 同步改造:不动,保持双轨各自运行。
- 新增更多设置项(如 TCP/波特率预设等):不在本次范围。
- 字体大小影响 legacy 静态窗(about/changelog):本次只影响主窗口,静态窗不接入 `--font-size-base`。

---

## 9. 验证清单

- [ ] `npm run typecheck` 通过
- [ ] `npm test` 通过(现有测试不回归)
- [ ] 5 个分区切换正常,默认显示「通用」
- [ ] 字体大小下拉改 `--font-size-base`,主窗口字号跟随(若 px 硬编码则说明退化情况)
- [ ] 重置按钮把所有字段(含 fontSize)恢复默认并持久化
- [ ] `Ctrl/Cmd+,` 打开设置、`Ctrl/Cmd+Shift+L` 切夜间、`F11` 切全屏均生效
- [ ] 输入框聚焦时不被快捷键拦截
- [ ] 「关于」分区显示版本 0.6.0,「打开更新日志」按钮可用
- [ ] 关闭设置(×/Esc/遮罩)正常
