# 批次 1 · P0 数据丢失修复 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 3 个 P0 数据丢失/正确性缺陷——删分组静默丢命令（C6）、`hexToBytes('')` 抛 TypeError 且误导报错（C11）、命令持久化无防抖且退出前无 flush 导致最后一次保存丢失（C8）。

**Architecture:** 三条互相独立，各自 TDD（先写失败测试 → 最小实现 → 通过 → 提交）。C6/C11 是纯渲染层逻辑修正；C8 跨渲染 store + preload + 主进程三层，引入防抖 + `before-quit` 同步 flush。所有改动保持与现有模式一致（zustand store action、IPC `commands:*` channel、`saveJsonSafe` 写盘工具）。

**Tech Stack:** TypeScript、React、zustand、Electron（ipcMain/ipcRenderer）、Vitest（node 环境）。

**对应 spec:** `docs/superpowers/specs/2026-06-29-code-review-remediation-plan.md` 的 C6/C11/C8 卡片。

**分支约定:** 在 `develop_srw` 上继续提交。每个 Task 末尾各自 commit，commit message 遵循 Conventional Commits（`fix(commands): ...` / `fix(panel): ...` / `fix(persistence): ...`）。

---

## 文件结构总览

| 文件 | 职责 | 本批次改动 |
|---|---|---|
| `src/features/commands/store.ts` | 命令 zustand store（C6 修复 removeGroup；C8 加防抖 + flush） | 改 |
| `test/commands-batch.test.ts` | 已有批量操作测试 | 加 removeGroup 用例 |
| `test/commands-remove-group.test.ts` | removeGroup 新测试（迁移语义 + 边界） | 新建 |
| `src/features/commands/components/GroupManager.tsx` | 分组管理 UI（C6 加删除确认弹窗） | 改 |
| `src/components/ui/alert-dialog.tsx` | 已有 shadcn alert-dialog（确认弹窗复用，不新建） | 不改，仅引用 |
| `src/features/main-window/components/ActivePanelConfigPanel.tsx` | C11 修 hexToBytes + sendFile 报错文案 | 改 |
| `test/active-panel-hex.test.ts` | hexToBytes 单测 | 新建 |
| `electron/preload.ts` | C8 加 `commands:flush` invoke + 改 `save` 保持火忘（但 flush 用 invoke） | 改 |
| `electron/main.ts` | C8 加 `commands:flush` handler + `before-quit` 同步 flush | 改 |
| `shared/types.ts` | C8 给 WindowAPI 加 `flush` 类型 | 改 |

**设计决策（已与用户确认 + spec 落实）：**
- C6 语义 = **迁移命令到 fallback 组**（删 `.filter`、复活 `.map` 死代码分支），删除前**加确认弹窗**。
- C8 flush 机制 = **`invoke`（异步）+ 主进程 `before-quit` 用 `event.preventDefault()` 阻止退出，flush 完成后 `app.exit(0)`**。不用 `sendSync`（阻塞且 Electron 31+ 在部分场景受限）。防抖窗口 = 400ms。

---

## Task 1: C6 — removeGroup 改为迁移命令（修复死代码）

**Files:**
- Modify: `src/features/commands/store.ts:247-262`（removeGroup）
- Test: `test/commands-remove-group.test.ts`（新建）

### Step 1.1: 写失败测试（迁移语义 + 边界）

- [ ] 新建 `test/commands-remove-group.test.ts`：

```ts
/**
 * removeGroup 单测：验证删除分组时命令迁移到 fallback（而非删除），且至少保留一个分组。
 * 覆盖 spec C6：删分组不应静默丢失命令。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useCommandsStore } from '../src/features/commands/store'

const apiShim = {
  commands: { save: vi.fn(), load: vi.fn().mockResolvedValue([]) }
}
const lsStore = new Map<string, string>()
const lsShim = {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
  clear: () => lsStore.clear()
}

beforeEach(() => {
  const g = globalThis as Record<string, unknown>
  g.window = { api: apiShim }
  g.api = apiShim
  g.localStorage = lsShim
  lsStore.clear()
  useCommandsStore.setState({
    commands: [],
    groupsMeta: { groups: ['默认分组'], active: '默认分组', visible: ['默认分组'] },
    loaded: true
  })
  apiShim.commands.save.mockClear()
})

describe('removeGroup — 迁移语义', () => {
  it('删除分组时，组内命令迁移到 fallback 组，命令不丢失', () => {
    useCommandsStore.setState({
      commands: [
        { id: 'a', name: 'A', data: '1', mode: 'text', group: 'G1' },
        { id: 'b', name: 'B', data: '2', mode: 'text', group: 'G2' },
        { id: 'c', name: 'C', data: '3', mode: 'text', group: '默认分组' }
      ],
      groupsMeta: {
        groups: ['默认分组', 'G1', 'G2'],
        active: 'G1',
        visible: ['默认分组', 'G1', 'G2']
      }
    })

    useCommandsStore.getState().removeGroup('G1')

    const cmds = useCommandsStore.getState().commands
    // 三条命令都在，没有丢失
    expect(cmds.map((c) => c.id).sort()).toEqual(['a', 'b', 'c'])
    // 原 G1 的命令现在归到 fallback 组（fallback = groups 里第一个非 name 的，即 '默认分组'）
    const a = cmds.find((c) => c.id === 'a')!
    expect(a.group).not.toBe('G1')
    expect(a.group).toBe('默认分组')
  })

  it('删除当前 active 分组时，active 迁移到 fallback', () => {
    useCommandsStore.setState({
      commands: [],
      groupsMeta: {
        groups: ['默认分组', 'G1'],
        active: 'G1',
        visible: ['默认分组', 'G1']
      }
    })
    useCommandsStore.getState().removeGroup('G1')
    const meta = useCommandsStore.getState().groupsMeta
    expect(meta.groups).toEqual(['默认分组'])
    expect(meta.active).toBe('默认分组')
  })

  it('只有一个分组时，removeGroup 不做任何变更', () => {
    useCommandsStore.setState({
      commands: [{ id: 'a', name: 'A', data: '1', mode: 'text', group: '默认分组' }],
      groupsMeta: { groups: ['默认分组'], active: '默认分组', visible: ['默认分组'] }
    })
    useCommandsStore.getState().removeGroup('默认分组')
    // 分组与命令均不变
    expect(useCommandsStore.getState().groupsMeta.groups).toEqual(['默认分组'])
    expect(useCommandsStore.getState().commands).toHaveLength(1)
  })

  it('组内命令 group 字段为空时，迁移到 fallback 而非被删除', () => {
    useCommandsStore.setState({
      commands: [{ id: 'x', name: 'X', data: '', mode: 'text', group: '' }],
      groupsMeta: { groups: ['默认分组', 'G1'], active: '默认分组', visible: ['默认分组', 'G1'] }
    })
    useCommandsStore.getState().removeGroup('G1')
    expect(useCommandsStore.getState().commands).toHaveLength(1)
  })

  it('removeGroup 后触发 persist（commands.save 被调用）', () => {
    useCommandsStore.setState({
      commands: [{ id: 'a', name: 'A', data: '1', mode: 'text', group: 'G1' }],
      groupsMeta: { groups: ['默认分组', 'G1'], active: 'G1', visible: ['默认分组', 'G1'] }
    })
    useCommandsStore.getState().removeGroup('G1')
    expect(apiShim.commands.save).toHaveBeenCalledTimes(1)
  })
})
```

### Step 1.2: 运行测试，确认失败

- [ ] 运行：`npx vitest run test/commands-remove-group.test.ts`
- [ ] **预期：FAIL**。第一个用例会失败——当前实现 `.filter` 删掉了 G1 的命令，`cmds` 长度 < 3，且 `a.group` 仍是 'G1'（实际上 a 已被删除，`find` 返回 undefined，`.group` 抛错）。报错形如 "expected [ 'b','c' ] to equal [ 'a','b','c' ]"。

### Step 1.3: 最小实现——修复 removeGroup

- [ ] 修改 `src/features/commands/store.ts`，把 `removeGroup`（行 247-262）替换为：

```ts
    removeGroup(name) {
      set((s) => {
        if (s.groupsMeta.groups.length <= 1) return s // 至少保留一个分组
        // fallback = 删除 name 后剩余分组里的第一个（若无则用 DEFAULT_GROUP）
        const fallback = s.groupsMeta.groups.find((g) => g !== name) || DEFAULT_GROUP
        const meta: CmdGroupsMeta = {
          groups: s.groupsMeta.groups.filter((g) => g !== name),
          active: s.groupsMeta.active === name ? fallback : s.groupsMeta.active,
          visible: s.groupsMeta.visible.filter((g) => g !== name)
        }
        // 迁移而非删除：组内（含 group 字段为空落在该组的）命令归入 fallback 组
        const commands = s.commands.map((c) =>
          (c.group || DEFAULT_GROUP) === name ? { ...c, group: fallback } : c
        )
        return { groupsMeta: meta, commands }
      })
      persist()
    },
```

关键变化：删掉了 `.filter((c) => (c.group || DEFAULT_GROUP) !== name)`（删除分支），只保留 `.map`（迁移分支）。这正是原死代码的意图。

### Step 1.4: 运行测试，确认通过

- [ ] 运行：`npx vitest run test/commands-remove-group.test.ts`
- [ ] **预期：PASS**（全部 5 个用例）。

### Step 1.5: 回归——跑全量命令相关测试，确认没破坏其它

- [ ] 运行：`npx vitest run test/commands-batch.test.ts test/commands-send.test.ts test/commands-remove-group.test.ts`
- [ ] **预期：全 PASS**。重点确认 `commands-batch.test.ts` 仍通过（removeGroup 的死代码修复不影响 removeCommands/moveCommands 等其它 action）。

### Step 1.6: typecheck

- [ ] 运行：`npm run typecheck`
- [ ] **预期：无错误**。

### Step 1.7: 提交

- [ ] 提交：

```bash
git add src/features/commands/store.ts test/commands-remove-group.test.ts
git commit -m "fix(commands): removeGroup 迁移组内命令到 fallback 而非静默删除

修复 store.ts:257-258 的死代码：原 .filter 先删光了组内命令，
.map 的迁移分支永不命中。现删除 .filter、保留迁移逻辑，
删分组时命令归入 fallback 组，不再永久丢失。覆盖 spec C6。"
```

---

## Task 2: C6 — GroupManager 加删除确认弹窗

**Files:**
- Modify: `src/features/commands/components/GroupManager.tsx`（removeGroup 调用点 line 122）

**说明：** Task 1 修复了 store 语义（不再丢命令），但删除仍是「点一下立即执行」。用户误删虽不再丢命令（会迁移），但仍需确认，避免误操作。本 Task 加确认弹窗，展示「将迁移 N 条命令到 fallback」。

### Step 2.1: 检查 alert-dialog 组件 API（确认可复用，避免臆造 props）

- [ ] 运行：`head -40 src/components/ui/alert-dialog.tsx`
- [ ] 确认导出的组件名与 props（应为 `AlertDialog`/`AlertDialogTrigger`/`AlertDialogContent`/`AlertDialogAction`/`AlertDialogCancel`/`AlertDialogHeader`/`AlertDialogTitle`/`AlertDialogDescription`/`AlertDialogFooter`，shadcn 标准）。记录实际导出名，后续步骤据此引用。

### Step 2.2: 在 GroupManager 加确认弹窗

- [ ] 修改 `src/features/commands/components/GroupManager.tsx`：
  - 顶部 import 增加：
    ```tsx
    import {
      AlertDialog,
      AlertDialogAction,
      AlertDialogCancel,
      AlertDialogContent,
      AlertDialogDescription,
      AlertDialogFooter,
      AlertDialogHeader,
      AlertDialogTitle
    } from '@/components/ui/alert-dialog'
    ```
  - 在组件内（`const [renameVal, setRenameVal] = useState('')` 之后）加待删分组状态：
    ```tsx
    const [pendingRemove, setPendingRemove] = useState<string | null>(null)
    ```
  - 把删除按钮（line 118-127 的 `<Button ... onClick={() => removeGroup(g)} ...>`）改为 `onClick={() => setPendingRemove(g)}`（不再直接 removeGroup）。
  - 在 return 的最外层 `<div>` 闭合前，加 AlertDialog：
    ```tsx
      <AlertDialog open={pendingRemove !== null} onOpenChange={(o) => { if (!o) setPendingRemove(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除分组「{pendingRemove}」？</AlertDialogTitle>
            <AlertDialogDescription>
              该分组下的 {useCommandsStore.getState().commands.filter((c) => (c.group || '默认分组') === pendingRemove).length} 条命令将迁移到「{groupsMeta.groups.find((g) => g !== pendingRemove) || '默认分组'}」。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRemove) removeGroup(pendingRemove)
                setPendingRemove(null)
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ```

### Step 2.3: typecheck

- [ ] 运行：`npm run typecheck`
- [ ] **预期：无错误**。若报 `AlertDialogTitle`/`AlertDialogDescription` 等未导出，回到 Step 2.1 核对实际导出名并修正 import。

### Step 2.4: 手动验证（Electron）

- [ ] 运行 `npm run dev`，在命令面板分组管理里：
  1. 建两个分组 G1、G2，在 G1 加几条命令；
  2. 点 G1 的删除按钮 → 弹窗显示「将迁移 N 条命令到 G2」；
  3. 点取消 → 无变化；
  4. 再点删除 → 确认 → G1 消失，命令出现在 G2；
  5. 只剩一个分组时删除按钮 disabled（原有逻辑，确认仍生效）。
- [ ] **记录验证结果到 PR 描述**（本批次 UI 改动需截图/录屏）。

### Step 2.5: 提交

- [ ] 提交：

```bash
git add src/features/commands/components/GroupManager.tsx
git commit -m "feat(commands): 删除分组前加确认弹窗

弹窗展示将迁移的命令数与目标 fallback 组，避免误删。
配合 Task 1 的迁移语义，删除分组不再静默丢命令。覆盖 spec C6。"
```

---

## Task 3: C11 — 修复 hexToBytes 空串/格式校验 + 报错文案

**Files:**
- Modify: `src/features/main-window/components/ActivePanelConfigPanel.tsx:21-23`（hexToBytes）、`:198`（调用）、`:231-232`（catch）
- Test: `test/active-panel-hex.test.ts`（新建）

### Step 3.1: 抽出 hexToBytes 并写失败测试

`hexToBytes` 当前是组件文件内的私有函数，无法直接测。先把校验逻辑抽成可测的纯函数（同文件导出，或就近测试）。

- [ ] 新建 `test/active-panel-hex.test.ts`：

```ts
/**
 * hexToBytes 单测：覆盖空串、奇数位、非法字符、正常 hex。
 * 覆盖 spec C11：空串不应抛 TypeError，非法输入应给语义化错误。
 */
import { describe, expect, it } from 'vitest'
import { hexToBytes, hexParseError } from '../src/features/main-window/components/ActivePanelConfigPanel'

describe('hexToBytes', () => {
  it('空串返回空 Uint8Array（不抛）', () => {
    expect(() => hexToBytes('')).not.toThrow()
    expect(Array.from(hexToBytes(''))).toEqual([])
  })

  it('正常偶数位 hex 正确解析', () => {
    expect(Array.from(hexToBytes('48656c6c6f'))).toEqual([72, 101, 108, 108, 111])
    expect(Array.from(hexToBytes('00ff'))).toEqual([0, 255])
  })

  it('大小写均可', () => {
    expect(Array.from(hexToBytes('AABB'))).toEqual([170, 187])
    expect(Array.from(hexToBytes('aabb'))).toEqual([170, 187])
  })

  it('含空格/空白时自动去除（兼容主进程 file.readHex 可能带的空白）', () => {
    expect(Array.from(hexToBytes('48 65'))).toEqual([72, 101])
  })
})

describe('hexParseError — 语义化校验', () => {
  it('偶数位合法 hex 返回 null', () => {
    expect(hexParseError('48656c6c6f')).toBeNull()
  })
  it('奇数位返回明确提示', () => {
    expect(hexParseError('4865c')).toMatch(/奇数位|odd/i)
  })
  it('非法字符返回明确提示', () => {
    expect(hexParseError('48gg')).toMatch(/非十六进制|invalid/i)
  })
  it('空串返回 null（空是合法的，只是没数据）', () => {
    expect(hexParseError('')).toBeNull()
  })
})
```

### Step 3.2: 运行测试，确认失败

- [ ] 运行：`npx vitest run test/active-panel-hex.test.ts`
- [ ] **预期：FAIL**——`hexToBytes`/`hexParseError` 未导出，报 "does not provide an export named 'hexToBytes'"。

### Step 3.3: 最小实现——重写 hexToBytes + 加 hexParseError 并导出

- [ ] 修改 `src/features/main-window/components/ActivePanelConfigPanel.tsx`，把 line 20-23 的 `hexToBytes` 替换为（同时新增 `hexParseError`，都 export）：

```ts
/** 校验 hex 字符串，合法返回 null，非法返回中文错误描述（供 UI 展示） */
export function hexParseError(hex: string): string | null {
  const clean = String(hex || '').replace(/\s+/g, '')
  if (clean === '') return null // 空串合法（无数据），由调用方决定是否拦截
  if (!/^[0-9a-fA-F]*$/.test(clean)) return 'HEX 格式错误：包含非十六进制字符'
  if (clean.length % 2 !== 0) return 'HEX 格式错误：长度为奇数位'
  return null
}

/** hex 字符串（每字节两字符）→ Uint8Array。空串返回空数组，不抛错。 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = String(hex || '').replace(/\s+/g, '')
  if (clean === '') return new Uint8Array(0)
  const bytes = clean.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  return new Uint8Array(bytes)
}
```

### Step 3.4: 运行测试，确认通过

- [ ] 运行：`npx vitest run test/active-panel-hex.test.ts`
- [ ] **预期：PASS**（全部用例）。

### Step 3.5: 在 sendFile 调用点加格式校验，改进 catch 文案

- [ ] 修改 `src/features/main-window/components/ActivePanelConfigPanel.tsx` 的 `sendFile` 函数：
  - 在 line 198 `const bytes = hexToBytes(res.hex || '')` **之前**加校验：
    ```ts
      const hexRaw = res.hex || ''
      const parseErr = hexParseError(hexRaw)
      if (parseErr) {
        appendSysLine(pnl.id, `[错误] ${parseErr}`)
        return
      }
      const bytes = hexToBytes(hexRaw)
    ```
    （删除原 line 198 的 `const bytes = hexToBytes(res.hex || '')`，由上面的两步替代。）
  - 改进 catch（line 231-232）文案，区分错误类型，不再裸拼 `String(e)`：
    ```ts
      } catch (e) {
        const msg = e instanceof Error ? e.message : '未知错误'
        appendSysLine(pnl.id, `[错误] 文件发送失败：${msg}`)
      }
    ```

### Step 3.6: typecheck + 全量测试

- [ ] 运行：`npm run typecheck`
- [ ] 运行：`npx vitest run test/active-panel-hex.test.ts test/active-panel-config.test.ts`
- [ ] **预期：无错误 + 全 PASS**。

### Step 3.7: 手动验证（Electron）

- [ ] 运行 `npm run dev`，在面板选一个文件发送：
  1. 正常文件 → 正常发送，进度/完成提示正常；
  2. （若可构造）读取一个返回空 hex 的文件 → 不再崩溃，给「文件为空或无数据」相关行为（空 bytes → raw 分支 `for` 循环不执行，直接打「发送完成」，可接受）。
- [ ] **记录验证结果到 PR 描述**。

### Step 3.8: 提交

- [ ] 提交：

```bash
git add src/features/main-window/components/ActivePanelConfigPanel.tsx test/active-panel-hex.test.ts
git commit -m "fix(panel): hexToBytes 空串不再抛 TypeError，非法 hex 给语义化提示

修复 ActivePanelConfigPanel.tsx:21-23：''.match(/.{2}/g) 返回 null，
! 断言后 null.map() 抛 TypeError，外层 catch 拼成误导性的
「文件发送失败：TypeError」。现空串返回空数组、非法输入拦截并给
明确中文提示，catch 用 e.message 替代 String(e)。覆盖 spec C11。"
```

---

## Task 4: C8 — 命令持久化加防抖

**Files:**
- Modify: `src/features/commands/store.ts:90-100`（persist 加防抖）

### Step 4.1: 写失败测试——防抖期间不写盘，flush 立即写

- [ ] 新建 `test/commands-persist-debounce.test.ts`：

```ts
/**
 * 命令持久化防止单测：验证 updateCommand 触发的 persist 被防抖，
 * 连续多次变更只在防抖窗口后写一次；flushNow 立即触发挂起的写入。
 * 覆盖 spec C8 防抖部分。
 */
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { useCommandsStore } from '../src/features/commands/store'

const apiShim = {
  commands: { save: vi.fn(), load: vi.fn().mockResolvedValue([]) }
}
const lsStore = new Map<string, string>()
const lsShim = {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
  clear: () => lsStore.clear()
}

beforeEach(() => {
  const g = globalThis as Record<string, unknown>
  g.window = { api: apiShim }
  g.api = apiShim
  g.localStorage = lsShim
  lsStore.clear()
  useCommandsStore.setState({
    commands: [{ id: 'a', name: '', data: '', mode: 'text', group: '默认分组' }],
    groupsMeta: { groups: ['默认分组'], active: '默认分组', visible: ['默认分组'] },
    loaded: true
  })
  apiShim.commands.save.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('persist 防抖', () => {
  it('连续 updateCommand 在防抖窗口内只写一次盘', () => {
    vi.useFakeTimers()
    const store = useCommandsStore.getState()
    store.updateCommand('a', { data: 'x' })
    store.updateCommand('a', { data: 'xx' })
    store.updateCommand('a', { data: 'xxx' })
    // 防抖窗口内尚未写盘
    expect(apiShim.commands.save).not.toHaveBeenCalled()
    // 推进防抖窗口
    vi.advanceTimersByTime(500)
    expect(apiShim.commands.save).toHaveBeenCalledTimes(1)
  })

  it('flushNow 立即写盘（不等防抖窗口）', () => {
    vi.useFakeTimers()
    const store = useCommandsStore.getState()
    store.updateCommand('a', { data: 'y' })
    expect(apiShim.commands.save).not.toHaveBeenCalled()
    store.flushNow()
    expect(apiShim.commands.save).toHaveBeenCalledTimes(1)
  })
})
```

### Step 4.2: 运行测试，确认失败

- [ ] 运行：`npx vitest run test/commands-persist-debounce.test.ts`
- [ ] **预期：FAIL**——当前 persist 每次立即调用 save，第一个用例 `expect(apiShim.commands.save).not.toHaveBeenCalled()` 会失败（实际调用 3 次）；且 `flushNow` 不存在。

### Step 4.3: 实现——persist 防抖 + 暴露 flushNow

- [ ] 修改 `src/features/commands/store.ts`：
  - 顶部 import 区加 `setTimeout`/`clearTimeout` 无需 import（全局），但需一个模块级 timer 变量。
  - 在 `export const useCommandsStore = create<CommandsState>((set, get) => {` 之前加防抖工具：
    ```ts
    /** persist 防抖窗口（ms）。连续快速变更只触发一次落盘。 */
    const PERSIST_DEBOUNCE_MS = 400
    let persistTimer: ReturnType<typeof setTimeout> | null = null
    /** 待落盘的快照；flushNow 与退出前 flush 用它立即写。 */
    ```
  - 把 `CommandsState` 接口（line 52-83）加一个方法：
    ```ts
      /** 立即落盘挂起的变更（防抖窗口外也安全调用），供退出前 flush 使用 */
      flushNow: () => void
    ```
  - 把内部 `persist`（line 92-100）改为防抖版，并新增 flushNow action。在 `return {` 之前（紧跟 `syncGroupsMeta` 函数之后）改造 persist：
    ```ts
      /** 持久化 commands 到主进程 + 同步分组元信息到 localStorage（防抖） */
      function persist() {
        if (persistTimer) clearTimeout(persistTimer)
        persistTimer = setTimeout(() => {
          persistTimer = null
          flushNow()
        }, PERSIST_DEBOUNCE_MS)
      }

      /** 立即落盘（不防抖）。退出前与防抖到期都会调用。 */
      function writeNow() {
        const { commands, groupsMeta } = get()
        try {
          getIPC().commands.save(commands)
        } catch {
          /* web 预览无 ipc，忽略 */
        }
        persistGroupsMeta(groupsMeta)
      }
    ```
    （注意：内部辅助函数命名为 `writeNow`，避免与下面 action 同名冲突。）
  - 在 return 对象里（`toggleGroupVisible` 之后）加 flushNow action：
    ```ts
      ,
      flushNow() {
        if (persistTimer) {
          clearTimeout(persistTimer)
          persistTimer = null
        }
        writeNow()
      }
    ```

### Step 4.4: 运行测试，确认通过

- [ ] 运行：`npx vitest run test/commands-persist-debounce.test.ts`
- [ ] **预期：PASS**。

### Step 4.5: 回归——全量命令测试

- [ ] 运行：`npx vitest run test/commands-batch.test.ts test/commands-send.test.ts test/commands-remove-group.test.ts test/commands-persist-debounce.test.ts`
- [ ] **预期：全 PASS**。若 commands-batch/commands-send 因防抖导致 save 调用计数变化而失败，检查这些测试是否依赖「立即 save」——若是，需在这些测试里调用 `flushNow()` 或 `vi.advanceTimersByTime(500)` 后再断言 save 次数（在 Step 4.6 处理）。

### Step 4.6: 修正依赖立即 save 的既有测试（如需要）

- [ ] 检查 `test/commands-batch.test.ts`、`test/commands-send.test.ts` 里断言 `apiShim.commands.save` 被调用的用例。
  - 若用 `useFakeTimers`，在断言前加 `vi.advanceTimersByTime(500)`；
  - 若用 real timers，在 action 后调用 `useCommandsStore.getState().flushNow()` 再断言。
- [ ] 重新运行 Step 4.5，确认全 PASS。

### Step 4.7: typecheck

- [ ] 运行：`npm run typecheck`
- [ ] **预期：无错误**（shared/types.ts 的 WindowAPI 暂未改，本 Task 不涉及 IPC，下一 Task 才加 flush channel）。

### Step 4.8: 提交

- [ ] 提交：

```bash
git add src/features/commands/store.ts test/commands-persist-debounce.test.ts test/commands-batch.test.ts test/commands-send.test.ts
git commit -m "fix(persistence): 命令持久化加 400ms 防抖，避免每次按键全量写盘

store.persist 原每次 updateCommand（每次按键）同步调用
ipcRenderer.send + fs.writeFileSync 全量重写 commands.json。
现改防抖：连续变更 400ms 后落一次盘；新增 flushNow action
供退出前 flush 使用（下一 Task 接入）。覆盖 spec C8 防抖部分。"
```

---

## Task 5: C8 — 退出前 flush（preload + main + store 接线）

**Files:**
- Modify: `electron/preload.ts:124-127`（commands，加 flush）
- Modify: `electron/main.ts:635` 之后（加 commands:flush handler）、`1737`（加 before-quit flush）
- Modify: `shared/types.ts`（WindowAPI 加 flush 类型）
- Modify: `src/features/commands/store.ts`（flushNow 调用 ipc flush）
- Modify: `src/app/mainwindow.tsx` 或挂载点（注册 beforeunload 触发 flushNow）

### Step 5.1: 给 CommandsAPI 加 flush 类型

`shared/types.ts:275-278` 现有定义：
```ts
export interface CommandsAPI {
  load: () => Promise<unknown[]>
  save: (cmds: unknown[]) => void
}
```

- [ ] 在 `save` 之后加 `flush`：
  ```ts
  export interface CommandsAPI {
    load: () => Promise<unknown[]>
    save: (cmds: unknown[]) => void
    /** 同步落盘挂起的命令（退出前调用，返回后主进程才退出） */
    flush: () => Promise<void>
  }
  ```

### Step 5.2: preload 暴露 flush（invoke，保证主进程处理完才 resolve）

- [ ] 修改 `electron/preload.ts` line 124-127 的 `commands` 块，加 flush：
  ```ts
    commands: {
      load: () => ipcRenderer.invoke('commands:load'),
      save: (cmds) => ipcRenderer.send('commands:save', cmds),
      flush: () => ipcRenderer.invoke('commands:flush')
    },
  ```

### Step 5.3: main 注册 commands:flush handler

- [ ] 在 `electron/main.ts` line 635 `ipcMain.on('commands:save', ...)` 之后加：
  ```ts
  // 退出前同步 flush：渲染层 flushNow 已把最新 commands 经 save 发来；
  // 此 handler 触发一次显式落盘并 resolve，before-quit 据此确保写完才退。
  ipcMain.handle('commands:flush', () => {
    // commands.json 由 commands:save 的 writeFileSync 同步写入；
    // 这里仅作栅栏：invoke 返回即表示此前所有 send('commands:save') 已被处理。
    return true
  })
  ```
  **说明：** `commands:save` 用 `ipcRenderer.send` 是火忘，但主进程 `ipcMain.on` handler 是按收到顺序同步执行 `saveCommandsConfig`（内部 `writeFileSync` 同步）。`commands:flush` 用 `invoke`，其 resolve 发生在所有已到达的 `send` 之后，因此 before-quit await flush 即可保证「flushNow 触发的最后一次 save 已落盘」。

### Step 5.4: main 加 before-quit flush 栅栏

- [ ] 在 `electron/main.ts` line 1737 `app.on('window-all-closed', ...)` 之前加：
  ```ts
  // 退出前栅栏：渲染层 beforeunload 会同步 flushNow + invoke('commands:flush')；
  // 用 preventDefault 阻止立即退出，留 1.5s 让 flush 完成，超时强退兜底防卡死。
  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    setTimeout(() => app.exit(0), 1500)
  })
  ```
  **说明：** 用 `quitting` flag 防止 `app.exit(0)` 再次触发 before-quit 死循环。不跨进程发 `app:flush-pending`——渲染层的 `beforeunload`（Step 5.6）已主动 flush，主进程只需让出时间窗口。兜底 1.5s 强退防止渲染层崩溃时卡死。

### Step 5.5: store.flushNow 调用 ipc flush

- [ ] 修改 `src/features/commands/store.ts` 的 `writeNow`（Task 4 加的内部函数），在 `save(commands)` 后追加 flush 通知（可选，让主进程显式栅栏）：
  ```ts
    function writeNow() {
      const { commands, groupsMeta } = get()
      try {
        getIPC().commands.save(commands)
        void getIPC().commands.flush?.() // 可选栅栏；?. 兼容老 preload
      } catch {
        /* web 预览无 ipc，忽略 */
      }
      persistGroupsMeta(groupsMeta)
    }
  ```
  **说明：** `flush` 用 `?.` 因 web 预览/mock-api 可能未实现；正式环境 preload 已加。save 已火忘，flush 的 invoke 作为「写完栅栏」——主进程在处理完此前所有 save 后才 resolve flush。

### Step 5.6: 渲染层注册 beforeunload 触发 flushNow

`src/app/mainwindow.tsx` 当前内容（13 行，仅 createRoot + StrictMode + `<MainWindow/>`，无组件体可放 effect）。beforeunload 监听放 `MainWindow` 组件内最合适（它已存在于 `src/features/main-window/MainWindow.tsx`，是常驻组件）。

- [ ] 在 `src/features/main-window/MainWindow.tsx` 顶部 import 区加：
  ```tsx
  import { useCommandsStore } from '@/features/commands/store'
  ```
- [ ] 在 `MainWindow` 组件函数体内（紧接已有的 hooks 之后）加 effect：
  ```tsx
  useEffect(() => {
    const handler = () => {
      // 关闭/退出前立即落盘挂起的命令（防抖窗口内未写的）
      useCommandsStore.getState().flushNow()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])
  ```
  （`useEffect` 已在 MainWindow.tsx import，确认无需额外引入。）
- [ ] **说明：** beforeunload 在窗口关闭/Cmd+Q 时触发，同步调用 flushNow（clearTimeout + 立即 save + flush invoke）。主进程 before-quit 的 1.5s 窗口足够覆盖这个同步 flush。

### Step 5.7: mock-api 补 flush（web 预览兼容）

`src/shared/dev/mock-api.ts:90-93` 现有：
```ts
        commands: {
            load: async () => [],
            save: noop
        },
```

- [ ] 在 `save: noop` 之后加 `flush: async () => {}`：
  ```ts
        commands: {
            load: async () => [],
            save: noop,
            flush: async () => {}
        },
  ```

### Step 5.8: typecheck

- [ ] 运行：`npm run typecheck`
- [ ] **预期：无错误**。若 `commands.flush` 类型与 mock-api/preload 不一致，按报错对齐。

### Step 5.9: 全量测试回归

- [ ] 运行：`npm test`
- [ ] **预期：全 PASS**。重点确认命令相关、main 进程相关测试不回归。

### Step 5.10: 手动验证（Electron，多平台相关行为）

- [ ] 运行 `npm run dev`：
  1. 打开命令面板，快速输入一串字符（不等的，模拟连续按键）；
  2. **立即** Cmd+Q（mac）/ 关闭窗口（Win）退出；
  3. 重新启动 App，打开命令面板，确认最后一次输入已落盘（未丢）。
- [ ] 对照改前：改前同样操作会丢失防抖窗口内最后一次输入（或在途 send 丢失）。
- [ ] **记录验证结果到 PR 描述**（含平台）。

### Step 5.11: 提交

- [ ] 提交：

```bash
git add electron/preload.ts electron/main.ts shared/types.ts src/features/commands/store.ts src/app/mainwindow.tsx src/shared/dev/mock-api.ts
git commit -m "fix(persistence): 退出前 flush 命令，避免在途保存丢失

commands.save 原用 ipcRenderer.send（火忘），退出时
window-all-closed → app.quit 可能在 send 未投递前退出，
导致最后一次按键的保存丢失。新增 commands:flush invoke
作为写完栅栏，before-quit 阻止退出 1.5s 等渲染层
beforeunload 触发 flushNow，超时强退兜底。覆盖 spec C8。"
```

---

## Task 6: 全量回归 + typecheck + 验证收尾

### Step 6.1: 全量测试

- [ ] 运行：`npm test`
- [ ] **预期：全 PASS**。若有失败，定位是哪条 Task 引入，回该 Task 修复。

### Step 6.2: typecheck

- [ ] 运行：`npm run typecheck`
- [ ] **预期：无错误**。

### Step 6.3: 手动验证清单（Electron）

- [ ] C6：删分组 → 弹确认 → 命令迁移到 fallback（Task 2.4）。
- [ ] C11：文件发送不崩，非法 hex 有提示（Task 3.7）。
- [ ] C8：快速输入后立即退出 → 重开不丢（Task 5.10）。

### Step 6.4: PR 描述准备

- [ ] 汇总三个修复 + 测试结果 + 平台手动验证记录 + 截图/录屏（C6 弹窗、C8 退出不丢）。
- [ ] 在 PR 中说明：本批次为 P0 止血，后续 P1/P2/P3 见 `docs/superpowers/specs/2026-06-29-code-review-remediation-plan.md`。

---

## 设计决策备注（供实现者参考，非任务）

1. **C8 flush 为何用 before-quit + setTimeout 而非 sendSync？** `ipcRenderer.sendSync` 会阻塞渲染层且 Electron 在某些场景（如 before-quit 时序）行为不稳定；`before-quit` + `event.preventDefault()` + `setTimeout(force quit, 1500)` 给渲染层 beforeunload 的同步 flush 留窗口，超时强退兜底，更稳妥。

2. **C8 兜底 1.5s/2s 强退是否可能丢数据？** 极端情况（渲染层崩溃）会丢防抖窗口内的输入，但这是不可恢复场景；正常退出 flushNow 是同步的（save 用 send 非阻塞，但主进程 on handler 同步 writeFileSync，flush 的 invoke 保证栅栏），1.5s 远超需要。

3. **C6 为何保留「至少一个分组」限制？** `syncGroupsMeta`（store.ts:103-122）依赖至少一个分组兜底空 group 命令；删光会导致 active/visible 无效。保留原限制。

4. **C11 空 hex 的行为：** 空文件 → bytes 为空 → raw 分支 for 循环不执行 → 直接「发送完成」。语义合理（空文件无需发送），不额外拦截。

5. **测试时序：** Vitest 默认 real timers；防抖测试必须 `vi.useFakeTimers()` + `vi.advanceTimersByTime`，并在 afterEach `vi.useRealTimers()` 避免污染其它用例。
