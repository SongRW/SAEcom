# Modbus 支持 — 阶段 2：Modbus 面板 UI 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在窗口栏新增 `modbus` 面板类型，作为 Modbus 主站：配置 TCP/RTU/ASCII 连接 + 多区块寄存器视图 + 手动读写 + 轮询 + CSV 映射导入导出 + popout 支持。复用阶段 1 已就绪的 `modbus:*` IPC 与 `modbusService`。

**Architecture:** 复用 `usePanelsStore`——modbus 面板与 serial/tcp 面板同在一个 `panels` Record。`Panel` 接口加可选 `modbus` 字段存连接参数与区块配置；轮询值缓存在 `modbus.blockValues`（不持久化）。`FloatingPane` 按 `panel.type==='modbus'` 分支渲染 `ModbusPanelBody`（取代 `DataDisplay+SendBar`）。新增 `useModbusDataBus` 监听 `modbus:data`/`modbus:event`，按 `(panelId,blockId)` 路由到 store。popout 全链路支持（`panel:popout` 传 type + modbus 数据，`panel.tsx` 加 modbus 分支）。

**Tech Stack:** TypeScript / React 19 / Zustand / Radix UI (shadcn) / Electron IPC / Playwright

**Spec:** `docs/superpowers/specs/2026-07-06-modbus-support-design.md`（第 2.3-2.5 节）

**阶段 1 已就绪（本计划依赖）：** `electron/modbusService.ts`、`modbus:*` IPC（main.ts:760-789）、preload `modbus` 域（preload.ts:78-95）、mock-api 桩、shared Modbus 类型（`ModbusConnectOptions`/`ModbusBlock`/`ModbusBlockUpdate`/`ModbusEvent`/`ModbusAPI`）、`PanelType` 已含 `'modbus'`（types.ts:45 待改，shared 已加但 renderer 的 types.ts 是独立的——见 Task 1）。

**⚠️ 重要：两个 `types.ts` 文件**
- `shared/types.ts` — IPC 契约（阶段 1 已加 `ModbusAPI` 等）
- `src/features/serial-panel/types.ts` — renderer 域类型（`Panel`/`PanelType`/`PanelChunk` 等，**独立于** shared）
本计划同时改这两个，不要混淆。

---

## 文件结构

| 文件 | 责任 | 操作 |
|---|---|---|
| `src/features/serial-panel/types.ts` | `PanelType` 加 `'modbus'`；`Panel` 加可选 `modbus` 字段；新增 `ModbusPanelState` 类型 | 修改（第 45、50-88 行） |
| `src/features/serial-panel/store.ts` | `genPanel` 支持 modbus；`togglePanelOpen` 加 modbus 分支；`persist`/`load` 保存 modbus 配置；新增 `setModbusBlockValues`/`setModbusBlocks`/`setModbusStatus` actions | 修改（第 16-51、124-161、274-299、452-514 行） |
| `src/features/modbus-panel/` | **新特性目录** | 新建 |
| `src/features/modbus-panel/useModbusDataBus.ts` | 监听 `modbus:data`/`modbus:event` → store | 新建 |
| `src/features/modbus-panel/format.ts` | 地址前缀 + displayFormat 解码纯函数 | 新建 |
| `src/features/modbus-panel/csv.ts` | 区块配置 CSV 解析/序列化纯函数 | 新建 |
| `src/features/modbus-panel/ModbusPanelBody.tsx` | 面板主体（连接条 + 工具栏 + 区块列表） | 新建 |
| `src/features/modbus-panel/components/ModbusBlockTable.tsx` | 单区块寄存器表格 | 新建 |
| `src/features/modbus-panel/components/ModbusConnectBar.tsx` | 连接配置条 | 新建 |
| `src/features/modbus-panel/components/ModbusManualDrawer.tsx` | 手动读写抽屉 | 新建 |
| `src/features/serial-panel/components/FloatingPane.tsx` | `type==='modbus'` 分支渲染 `ModbusPanelBody` | 修改（第 163-166 行） |
| `src/features/serial-panel/components/NewPanelDialog.tsx` | 加 Modbus 选项 | 修改（第 28、71-78、80、37-62 行） |
| `src/features/serial-panel/components/PaneContextMenu.tsx` | modbus 开/关连接标签 | 修改（第 96 行） |
| `src/features/serial-panel/SerialPanelWorkspace.tsx` | 挂载 `useModbusDataBus` | 修改（第 24 行） |
| `electron/main.ts` | `panel:popout` 传递 type + modbus 数据 | 修改（第 946-1000 行） |
| `src/app/panel.tsx` | popout 支持 modbus（readQuery + body 分支 + modbus 监听器） | 修改（第 25-40、50+ 行） |
| `test/modbus-format.test.ts` | format 纯函数单测 | 新建 |
| `test/modbus-csv.test.ts` | csv 纯函数单测 | 新建 |
| `e2e/modbus-panel-basic.spec.ts` | 面板基础 E2E | 新建 |
| `e2e/modbus-panel-poll.spec.ts` | 轮询 E2E | 新建 |
| `e2e/modbus-panel-csv.spec.ts` | CSV E2E | 新建 |

---

## Task 1: 类型扩展（renderer `types.ts` + `Panel.modbus` 字段）

**Files:**
- Modify: `src/features/serial-panel/types.ts`
- Modify: `test/modbus-ipc.test.ts`（补类型断言，已有）

- [ ] **Step 1: 读现状**

读 `src/features/serial-panel/types.ts` 确认第 45 行 `PanelType` 和第 50-88 行 `Panel` 接口的当前内容。

- [ ] **Step 2: 扩展 PanelType**

第 45 行：
```ts
// before
export type PanelType = 'serial' | 'tcp'
// after
export type PanelType = 'serial' | 'tcp' | 'modbus'
```

- [ ] **Step 3: 加 ModbusPanelState 类型 + Panel.modbus 可选字段**

在 `Panel` 接口**之前**加（从 `@shared/types` 复用 `ModbusBlock`/`ModbusConnectOptions`）：
```ts
import type { ModbusBlock, ModbusConnectOptions } from '@shared/types'

/** modbus 面板的运行/配置状态（复用 usePanelsStore，挂到 Panel.modbus） */
export interface ModbusPanelState {
  /** 连接参数（持久化） */
  connectOptions: ModbusConnectOptions
  /** 区块配置（持久化） */
  blocks: ModbusBlock[]
  /** 连接状态（运行时，不持久化） */
  status: 'closed' | 'opening' | 'open' | 'error'
  /** 最后错误（运行时） */
  lastError?: string
  /** 区块值缓存：blockId → { values, ts, error }（运行时，不持久化） */
  blockValues: Record<string, { values: number[]; ts: number; error?: string }>
}
```

在 `Panel` 接口末尾（第 72 行 `z: number` 之后）加可选字段：
```ts
  z: number
  /** modbus 面板专属状态（仅 type==='modbus' 时使用） */
  modbus?: ModbusPanelState
```

- [ ] **Step 4: typecheck**

`npm run typecheck`。预期：可能有几处因 `PanelType` 加了 `'modbus'` 而 switch/三元未覆盖的报错（store.ts togglePanelOpen、SendBar.tsx）——这些在后续 Task 修。**只要 types.ts 自身类型定义无错即可**，其他文件的类型错误记录下来，后续 Task 处理。如果 typecheck 完全因未覆盖分支失败，可暂时在 togglePanelOpen/SendBar 的类型分支末尾兜底（后续 Task 会替换）。

- [ ] **Step 5: 提交**

```bash
git add src/features/serial-panel/types.ts
git commit -m "feat(modbus-panel): add PanelType 'modbus' and Panel.modbus field"
```

---

## Task 2: format 纯函数（地址前缀 + displayFormat 解码）TDD

**Files:**
- Create: `src/features/modbus-panel/format.ts`
- Create: `test/modbus-format.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `test/modbus-format.test.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { modbusAddressLabel, decodeRegisterValue, formatCellDisplay } from '../src/features/modbus-panel/format'

describe('modbusAddressLabel', () => {
  it('FC1 线圈加 0x 前缀（地址 +1 显示）', () => {
    expect(modbusAddressLabel(1, 0)).toBe('00001')
    expect(modbusAddressLabel(1, 9)).toBe('00010')
  })
  it('FC2 离散输入加 1x 前缀', () => {
    expect(modbusAddressLabel(2, 0)).toBe('10001')
  })
  it('FC4 输入寄存器加 3x 前缀', () => {
    expect(modbusAddressLabel(4, 0)).toBe('30001')
  })
  it('FC3 保持寄存器加 4x 前缀', () => {
    expect(modbusAddressLabel(3, 0)).toBe('40001')
    expect(modbusAddressLabel(3, 99)).toBe('40100')
  })
})

describe('formatCellDisplay (单寄存器)', () => {
  it('unsigned', () => {
    expect(formatCellDisplay([65535], 'unsigned')).toBe('65535')
  })
  it('signed 负数', () => {
    expect(formatCellDisplay([0xFFFF], 'signed')).toBe('-1')
  })
  it('hex', () => {
    expect(formatCellDisplay([255], 'hex')).toBe('00FF')
  })
  it('binary', () => {
    expect(formatCellDisplay([5], 'binary')).toBe('0000000000000101')
  })
})

describe('decodeRegisterValue (float32，消费 2 寄存器)', () => {
  it('float32 ABCD (big-endian)：1.0 = [0x3F80, 0x0000]', () => {
    expect(decodeRegisterValue([0x3f80, 0x0000], 'float32')).toBe('1')
  })
  it('float32-swapped CDAB：1.0 = [0x0000, 0x3F80]', () => {
    expect(decodeRegisterValue([0x0000, 0x3f80], 'float32-swapped')).toBe('1')
  })
  it('float32-byte BADC：1.0 = [0x803F, 0x0000]', () => {
    expect(decodeRegisterValue([0x803f, 0x0000], 'float32-byte')).toBe('1')
  })
  it('float32-word-byte DCBA：1.0 = [0x0000, 0x803F]', () => {
    expect(decodeRegisterValue([0x0000, 0x803f], 'float32-word-byte')).toBe('1')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

`npx vitest run test/modbus-format.test.ts` → FAIL（模块不存在）。

- [ ] **Step 3: 实现 format.ts**

新建 `src/features/modbus-panel/format.ts`：
```ts
// 地址前缀 + displayFormat 解码纯函数（无副作用，便于单测）

/** Modbus 地址显示：FC→前缀 + 地址+1（Modbus 地址从 1 开始，0-based 协议地址需 +1） */
export function modbusAddressLabel(functionCode: 1 | 2 | 3 | 4, address: number): string {
  const prefix = functionCode === 1 ? 0
    : functionCode === 2 ? 1
    : functionCode === 4 ? 3
    : 4 // FC3
  return String(prefix * 10000 + address + 1).padStart(5, '0')
}

/** 单寄存器格式化（signed/unsigned/hex/binary） */
export function formatCellDisplay(values: number[], format: 'signed' | 'unsigned' | 'hex' | 'binary'): string {
  const v = values[0] ?? 0
  const u16 = v & 0xffff
  switch (format) {
    case 'unsigned': return String(u16)
    case 'signed': return String(u16 >= 0x8000 ? u16 - 0x10000 : u16)
    case 'hex': return u16.toString(16).toUpperCase().padStart(4, '0')
    case 'binary': return u16.toString(2).padStart(16, '0')
  }
}

/** float32 解码：消费 2 个寄存器，按 4 种字节序 */
export function decodeRegisterValue(values: number[], format: 'float32' | 'float32-swapped' | 'float32-byte' | 'float32-word-byte'): string {
  if (values.length < 2) return '—'
  const a = values[0] & 0xffff
  const b = values[1] & 0xffff
  // 4 字节，按字节序排列。a 是第一个寄存器（含高/低字节取决于序）
  const aHi = (a >> 8) & 0xff, aLo = a & 0xff
  const bHi = (b >> 8) & 0xff, bLo = b & 0xff
  let bytes: number[]
  switch (format) {
    case 'float32':         bytes = [aHi, aLo, bHi, bLo]; break           // ABCD
    case 'float32-swapped': bytes = [bHi, bLo, aHi, aLo]; break           // CDAB
    case 'float32-byte':    bytes = [aLo, aHi, bLo, bHi]; break           // BADC
    case 'float32-word-byte': bytes = [bLo, bHi, aLo, aHi]; break         // DCBA
  }
  const buf = new ArrayBuffer(4)
  const view = new DataView(buf)
  bytes.forEach((byte, i) => view.setUint8(i, byte))
  const num = view.getFloat32(0, false) // big-endian 拼好的字节
  // 避免科学计数法抖动；整数显示无小数点
  return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(6)))
}
```

- [ ] **Step 4: 跑测试确认通过**

`npx vitest run test/modbus-format.test.ts` → PASS（11 条）。

- [ ] **Step 5: 提交**

```bash
git add src/features/modbus-panel/format.ts test/modbus-format.test.ts
git commit -m "feat(modbus-panel): add address-label and displayFormat decoders"
```

---

## Task 3: CSV 映射导入/导出纯函数 TDD

**Files:**
- Create: `src/features/modbus-panel/csv.ts`
- Create: `test/modbus-csv.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `test/modbus-csv.test.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { serializeBlocksCsv, parseBlocksCsv } from '../src/features/modbus-panel/csv'
import type { ModbusBlock } from '@shared/types'

const sample: ModbusBlock[] = [
  { id: 'b1', title: '温度区', slaveId: 1, functionCode: 3, startAddress: 0, quantity: 8, pollEnabled: true, pollIntervalMs: 1000, displayFormat: 'float32-swapped' },
  { id: 'b2', slaveId: 2, functionCode: 1, startAddress: 100, quantity: 16, pollEnabled: false, pollIntervalMs: 500, displayFormat: 'unsigned' },
]

describe('serializeBlocksCsv', () => {
  it('生成带 header 的 CSV，id 不导出', () => {
    const csv = serializeBlocksCsv(sample)
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('title,slaveId,functionCode,startAddress,quantity,pollEnabled,pollIntervalMs,displayFormat')
    expect(lines[1]).toBe('温度区,1,3,0,8,true,1000,float32-swapped')
    expect(lines[2]).toBe(',2,1,100,16,false,500,unsigned')
    expect(csv).not.toContain('b1') // id 不导出
  })
})

describe('parseBlocksCsv', () => {
  it('解析并重新生成 id（追加语义）', () => {
    const csv = serializeBlocksCsv(sample)
    const parsed = parseBlocksCsv(csv)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].title).toBe('温度区')
    expect(parsed[0].id).not.toBe('b1') // 新 id
    expect(parsed[0].slaveId).toBe(1)
    expect(parsed[0].pollEnabled).toBe(true)
    expect(parsed[1].title).toBeUndefined()
    expect(parsed[1].functionCode).toBe(1)
  })

  it('缺列用默认值（pollEnabled 缺失为 false）', () => {
    const csv = 'slaveId,functionCode,startAddress,quantity,displayFormat\n1,3,0,4,signed'
    const parsed = parseBlocksCsv(csv)
    expect(parsed[0].pollEnabled).toBe(false)
    expect(parsed[0].pollIntervalMs).toBe(1000)
  })

  it('非法行跳过（slaveId 越界、fc 非法）', () => {
    const csv = [
      'title,slaveId,functionCode,startAddress,quantity,pollEnabled,pollIntervalMs,displayFormat',
      'ok,1,3,0,4,true,1000,signed',
      'bad-slave,300,3,0,4,true,1000,signed',    // slaveId > 247
      'bad-fc,1,7,0,4,true,1000,signed',          // fc 非 1-4
      'bad-qty,1,3,0,99999,true,1000,signed',     // quantity > 2000
    ].join('\n')
    const parsed = parseBlocksCsv(csv)
    expect(parsed).toHaveLength(1) // 只有 ok 行
    expect(parsed[0].title).toBe('ok')
  })

  it('往返一致（序列化→解析→序列化，忽略 id）', () => {
    const csv1 = serializeBlocksCsv(sample)
    const reparsed = parseBlocksCsv(csv1)
    const csv2 = serializeBlocksCsv(reparsed)
    expect(csv2).toBe(csv1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

`npx vitest run test/modbus-csv.test.ts` → FAIL。

- [ ] **Step 3: 实现 csv.ts**

新建 `src/features/modbus-panel/csv.ts`：
```ts
import type { ModbusBlock, ModbusBlock as B } from '@shared/types'

const HEADER = 'title,slaveId,functionCode,startAddress,quantity,pollEnabled,pollIntervalMs,displayFormat'
const FIELDS = ['title', 'slaveId', 'functionCode', 'startAddress', 'quantity', 'pollEnabled', 'pollIntervalMs', 'displayFormat'] as const

function genId(): string {
  return 'b_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** 序列化区块为 CSV（不导出 id） */
export function serializeBlocksCsv(blocks: B[]): string {
  const rows = blocks.map((b) =>
    [b.title ?? '', b.slaveId, b.functionCode, b.startAddress, b.quantity, b.pollEnabled, b.pollIntervalMs, b.displayFormat]
      .map(csvEscape).join(',')
  )
  return [HEADER, ...rows].join('\n') + '\n'
}

function csvEscape(v: unknown): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 解析 CSV 为区块（重新生成 id，跳过非法行） */
export function parseBlocksCsv(csv: string): ModbusBlock[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const header = splitCsvLine(lines[0])
  const out: ModbusBlock[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const row: Record<string, string> = {}
    header.forEach((h, idx) => { row[h.trim()] = (cells[idx] ?? '').trim() })
    try {
      const block = rowToBlock(row)
      if (block) out.push(block)
    } catch { /* 跳过非法行 */ }
  }
  return out
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQ = false
      else cur += c
    } else {
      if (c === ',') { result.push(cur); cur = '' }
      else if (c === '"') inQ = true
      else cur += c
    }
  }
  result.push(cur)
  return result
}

function rowToBlock(row: Record<string, string>): ModbusBlock | null {
  const slaveId = Number(row.slaveId)
  const functionCode = Number(row.functionCode) as 1 | 2 | 3 | 4
  const startAddress = Number(row.startAddress)
  const quantity = Number(row.quantity)
  const pollIntervalMs = row.pollIntervalMs ? Number(row.pollIntervalMs) : 1000
  const displayFormat = (row.displayFormat || 'unsigned') as ModbusBlock['displayFormat']

  // 校验
  if (!Number.isInteger(slaveId) || slaveId < 1 || slaveId > 247) throw new Error('bad slaveId')
  if (![1, 2, 3, 4].includes(functionCode)) throw new Error('bad fc')
  if (!Number.isFinite(startAddress) || startAddress < 0 || startAddress > 65535) throw new Error('bad addr')
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2000) throw new Error('bad qty')

  return {
    id: genId(),
    title: row.title || undefined,
    slaveId, functionCode, startAddress, quantity,
    pollEnabled: row.pollEnabled === 'true',
    pollIntervalMs: Number.isFinite(pollIntervalMs) ? pollIntervalMs : 1000,
    displayFormat,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

`npx vitest run test/modbus-csv.test.ts` → PASS（4 describe 全过）。

- [ ] **Step 5: 提交**

```bash
git add src/features/modbus-panel/csv.ts test/modbus-csv.test.ts
git commit -m "feat(modbus-panel): add CSV block-map serialize/parse with validation"
```

---

## Task 4: store 扩展（genPanel/togglePanelOpen/persist/load + modbus actions）

**Files:**
- Modify: `src/features/serial-panel/store.ts`

- [ ] **Step 1: genPanel 支持 modbus**

在 `genPanel` 的 params 类型加 `modbus?: ModbusPanelState`（import 自 `./types`），返回对象加 `modbus: params.modbus`。

- [ ] **Step 2: addPanel 透传 modbus**

`addPanel`（第 171 行）签名加 `modbus?` 参数，传给 `genPanel`。注意 modbus 面板的 `id` 用 `modbus://variant/host:port` 或类似可识别前缀（popout/load 类型推断依赖）。

- [ ] **Step 3: togglePanelOpen 加 modbus 分支**

第 274-299 行，改成三分支：
```ts
async togglePanelOpen(id) {
  const p = get().panels[id]
  if (!p) return
  const ipc = getIPC()
  try {
    if (p.open) {
      if (p.type === 'tcp') await ipc.tcp.close(id)
      else if (p.type === 'modbus') await ipc.modbus.close(id)
      else await ipc.serial.close(id)
      get().setPaneOpen(id, false)
    } else {
      if (p.type === 'tcp') {
        const m = id.match(/^tcp:\/\/([^:]+):(\d+)$/)
        if (!m) { get().appendSysLine(id, '[错误] TCP 地址格式无效'); return }
        const res = await ipc.tcp.open(m[1], Number(m[2]), p.options)
        if (res && res.ok === false) { get().appendSysLine(id, `[错误] ${res.error || '打开失败'}`); return }
      } else if (p.type === 'modbus' && p.modbus) {
        const res = await ipc.modbus.open(id, p.modbus.connectOptions)
        if (!res.ok) { get().setModbusStatus(id, 'error', res.message); return }
        get().setModbusStatus(id, 'open')
        // 连接成功后下发轮询配置
        await ipc.modbus.setPolls(id, p.modbus.blocks)
      } else {
        const res = await ipc.serial.open(id, p.options)
        if (res && res.ok === false) { get().appendSysLine(id, `[错误] ${res.error || '打开失败'}`); return }
      }
      get().setPaneOpen(id, true)
    }
  } catch (e) { get().appendSysLine(id, `[错误] ${String(e)}`) }
},
```

- [ ] **Step 4: persist 保存 modbus 配置**

`persist()`（第 124 行）的 map 回调里，在 `note: p.note` 之后加：
```ts
          modbus: p.modbus ? {
            connectOptions: p.modbus.connectOptions,
            blocks: p.modbus.blocks,
          } : undefined,
```
（只持久化 connectOptions + blocks，不存 status/blockValues）

- [ ] **Step 5: load 读取 modbus 配置**

`load()`（第 452 行）里，重建 panel 时，若 `c.modbus` 存在，把它接到 `genPanel` 的 `modbus` 参数（补 `status:'closed'`, `blockValues:{}`）。同时第 468 行的类型推断加 modbus id 前缀识别：
```ts
const type = (c.type as PanelType)
  || (id.startsWith('tcp://') ? 'tcp' : id.startsWith('modbus://') ? 'modbus' : 'serial')
```

- [ ] **Step 6: 新增 modbus actions**

在 `PanelsState` 接口和 store 返回对象里加：
```ts
setModbusStatus: (id: string, status: ModbusPanelState['status'], error?: string) => void
setModbusBlocks: (id: string, blocks: ModbusBlock[]) => void
setModbusConnectOptions: (id: string, opts: ModbusConnectOptions) => void
updateModbusBlockValue: (panelId: string, blockId: string, values: number[], ts: number, error?: string) => void
```
实现要点：
- `setModbusStatus`：`set` 更新 `panels[id].modbus.status`（+ lastError），不 persist（运行时状态）。
- `setModbusBlocks`：更新 `panels[id].modbus.blocks`，persist，若面板已 open 则调 `ipc.modbus.setPolls` 刷新轮询。
- `updateModbusBlockValue`：更新 `panels[id].modbus.blockValues[blockId]`，不 persist（高频，运行时）。

- [ ] **Step 7: typecheck**

`npm run typecheck`。修复所有因 modbus 分支引入的类型错误（主要在 store 内部）。

- [ ] **Step 8: 提交**

```bash
git add src/features/serial-panel/store.ts
git commit -m "feat(modbus-panel): wire modbus open/close/persist into panels store"
```

---

## Task 5: useModbusDataBus（modbus:data/event → store）

**Files:**
- Create: `src/features/modbus-panel/useModbusDataBus.ts`
- Modify: `src/features/serial-panel/SerialPanelWorkspace.tsx`

- [ ] **Step 1: 实现 useModbusDataBus**

新建 `src/features/modbus-panel/useModbusDataBus.ts`：
```ts
import { useEffect } from 'react'
import { useIPC } from '@/shared/ipc'
import { usePanelsStore } from '@/features/serial-panel/store'

/** 监听 modbus:data / modbus:event，路由到 panels store（仅处理存在的 modbus 面板）。 */
export function useModbusDataBus() {
  const ipc = useIPC()
  const updateModbusBlockValue = usePanelsStore((s) => s.updateModbusBlockValue)
  const setModbusStatus = usePanelsStore((s) => s.setModbusStatus)

  useEffect(() => {
    const offData = ipc.modbus.onData((u) => {
      updateModbusBlockValue(u.panelId, u.blockId, u.values, u.ts, u.error)
    })
    const offEvent = ipc.modbus.onEvent((e) => {
      if (e.type === 'error') setModbusStatus(e.id, 'error', e.message)
      else if (e.type === 'close') setModbusStatus(e.id, 'closed')
      else if (e.type === 'open') setModbusStatus(e.id, 'open')
    })
    return () => { offData(); offEvent() }
  }, [ipc, updateModbusBlockValue, setModbusStatus])
}
```

- [ ] **Step 2: 在 SerialPanelWorkspace 挂载**

`SerialPanelWorkspace.tsx` 顶部 import `{ useModbusDataBus } from '@/features/modbus-panel/useModbusDataBus'`，在 `useSerialDataBus()` 调用（第 24 行）之后加 `useModbusDataBus()`。

- [ ] **Step 3: typecheck + 提交**

```bash
git add src/features/modbus-panel/useModbusDataBus.ts src/features/serial-panel/SerialPanelWorkspace.tsx
git commit -m "feat(modbus-panel): add useModbusDataBus routing modbus events to store"
```

---

## Task 6: ModbusBlockTable（单区块寄存器表格）

**Files:**
- Create: `src/features/modbus-panel/components/ModbusBlockTable.tsx`

- [ ] **Step 1: 实现组件**

新建 `src/features/modbus-panel/components/ModbusBlockTable.tsx`。Props: `{ panelId: string; block: ModbusBlock; value?: { values: number[]; ts: number; error?: string } }`。功能：
- 折叠头：标题/`从站: slaveId FC 起始 数量` + `[轮询 ▶/⏸]` 切换 `block.pollEnabled`（调 `setModbusBlocks` 回写）+ `[刷新]`（调 `ipc.modbus.read`）+ `[编辑]`+`[删除]`
- 表格列：`地址 | 值 | 格式 | 上次更新 | 状态`
- 地址用 `modbusAddressLabel(block.functionCode, block.startAddress + i)`
- 值用 `formatCellDisplay` 或 `decodeRegisterValue`（float32 消费 2 寄存器，行数减半）
- 状态：error 时 `⚠ title=error`，否则按 ts 显示时间或 `○`
- 双击寄存器单元格（FC3）→ 小输入框 → 写单值（`ipc.modbus.write` FC6）

（具体 JSX 用 shadcn 的 Table/Button/Input 组件，2-space 无分号。刷新/轮询切换接 `usePanelsStore`。）

- [ ] **Step 2: typecheck + 提交**

```bash
git add src/features/modbus-panel/components/ModbusBlockTable.tsx
git commit -m "feat(modbus-panel): add ModbusBlockTable with poll toggle and inline write"
```

---

## Task 7: ModbusConnectBar + ModbusManualDrawer

**Files:**
- Create: `src/features/modbus-panel/components/ModbusConnectBar.tsx`
- Create: `src/features/modbus-panel/components/ModbusManualDrawer.tsx`

- [ ] **Step 1: ModbusConnectBar**

连接配置条。Props: `{ panel: Panel }`。功能：
- 变体下拉 `[RTU/TCP/ASCII]`（RTU/ASCII 阶段 3 启用，本阶段 disable+tooltip）
- TCP 分支：host 输入 + port 输入
- `[连接/断开]` 按钮 → `togglePanelOpen(panel.id)`
- 状态徽章：`● 已连接 / ○ 未连接 / ⚠ 错误:lastError`
- 连接参数变更 → `setModbusConnectOptions`（断开状态下可编辑，已连接禁用编辑）

- [ ] **Step 2: ModbusManualDrawer**

手动读写抽屉。Props: `{ panel: Panel; open: boolean; onOpenChange }`。功能：
- 操作下拉 `[读/写]`
- 读：slaveId/fc/起始/数量 → `ipc.modbus.read` → 结果区显示 values 数组
- 写：slaveId/fc/起始/值(逗号分隔) → `ipc.modbus.write`
- 错误显示

- [ ] **Step 3: typecheck + 提交**

```bash
git add src/features/modbus-panel/components/ModbusConnectBar.tsx src/features/modbus-panel/components/ModbusManualDrawer.tsx
git commit -m "feat(modbus-panel): add connect bar and manual read/write drawer"
```

---

## Task 8: ModbusPanelBody + 工具栏 + CSV + FloatingPane 分支

**Files:**
- Create: `src/features/modbus-panel/ModbusPanelBody.tsx`
- Modify: `src/features/serial-panel/components/FloatingPane.tsx`

- [ ] **Step 1: ModbusPanelBody**

组合：`ModbusConnectBar` + 工具栏（`[+新增区块] [手动读写…] [全部刷新] [暂停所有轮询] [导入映射] [导出映射]`）+ 区块列表（每个 `ModbusBlockTable`）。新增区块弹一个小区块编辑 dialog（slaveId/fc/起始/数量/格式/轮询间隔）。

CSV 导入/导出用 Task 3 的纯函数 + `ipc.file.pickOpen`（导入读文件文本）+ `ipc.logger.pickFile` 或新 IPC（导出写文件）。导入是追加语义：`parseBlocksCsv` → 合并到现有 blocks → `setModbusBlocks`。

- [ ] **Step 2: FloatingPane 分支**

第 163-166 行，把 `<DataDisplay/>` + `<SendBar/>` 包成分支：
```tsx
{panel.type === 'modbus' && panel.modbus ? (
  <ModbusPanelBody panel={panel} />
) : (
  <>
    <div className="flex flex-1 flex-col overflow-hidden">
      <DataDisplay panel={panel} />
    </div>
    <SendBar panel={panel} />
  </>
)}
```

- [ ] **Step 3: typecheck + 提交**

```bash
git add src/features/modbus-panel/ModbusPanelBody.tsx src/features/serial-panel/components/FloatingPane.tsx
git commit -m "feat(modbus-panel): add ModbusPanelBody and branch FloatingPane by type"
```

---

## Task 9: NewPanelDialog 加 Modbus 选项

**Files:**
- Modify: `src/features/serial-panel/components/NewPanelDialog.tsx`

- [ ] **Step 1: 加 modbus mode**

`mode` 类型加 `'modbus'`（第 28 行）。加第三个选择按钮（第 77 行后）。
- 字段：变体（仅 TCP 可选，RTU/ASCII disable）、host、port、从站默认地址
- `handleConfirm`（第 37 行）加 modbus 分支：
```ts
} else if (mode === 'modbus') {
  const id = `modbus://tcp/${host}:${tcpPort}`
  ok = addPanel({
    id, name: id, type: 'modbus',
    modbus: {
      connectOptions: { variant: 'tcp', tcpHost: host, tcpPort },
      blocks: [],
      status: 'closed', blockValues: {},
    },
  })
}
```

- [ ] **Step 2: typecheck + 提交**

```bash
git add src/features/serial-panel/components/NewPanelDialog.tsx
git commit -m "feat(modbus-panel): add Modbus option to NewPanelDialog"
```

---

## Task 10: PaneContextMenu 标签 + 杂项集成

**Files:**
- Modify: `src/features/serial-panel/components/PaneContextMenu.tsx`

- [ ] **Step 1: modbus 开关连接标签**

第 96 行 `panel.type === 'tcp' ? '关闭连接' : '关闭串口'` 改为三分支，modbus 也用"连接"语义（`'关闭连接'`）。

- [ ] **Step 2: 提交**

```bash
git add src/features/serial-panel/components/PaneContextMenu.tsx
git commit -m "feat(modbus-panel): use connection labels for modbus in context menu"
```

---

## Task 11: Popout 支持（main.ts + panel.tsx）

**Files:**
- Modify: `electron/main.ts`（panel:popout handler，第 946-1000 行）
- Modify: `src/app/panel.tsx`

- [ ] **Step 1: main.ts panel:popout 传 type + modbus 数据**

`ipcMain.handle('panel:popout', ...)` 的解构加 `type` 和 `modbusStr`。在 dev/prod 两处 URLSearchParams/query 都加 `type` 和 `modbus` 参数。`panel:loadContent` 的 payload 也带 `modbusStr`。

- [ ] **Step 2: FloatingPane handlePopout 传新参数**

第 113-128 行 `handlePopout`：`ipc.panel.popout` 的参数补 `panel.type` 和 `JSON.stringify(panel.modbus ?? null)`。需要同步 preload 的 `panel.popout` 签名（`shared/types.ts` `PanelAPI.popout` + preload.ts 实现）。

- [ ] **Step 3: panel.tsx readQuery 读 type**

第 38 行改为：
```ts
const type = (p.get('type') as PanelType)
  || (id.startsWith('tcp://') ? 'tcp' : id.startsWith('modbus://') ? 'modbus' : 'serial')
const modbus = type === 'modbus' ? JSON.parse(p.get('modbus') || 'null') : null
```

- [ ] **Step 4: panel.tsx body 分支 + modbus 监听器**

popout body 按 type 分支：modbus 时渲染一个简化的 `ModbusPanelBody`（复用主窗组件，传一个从 query 重建的临时 panel 对象）。注册 `ipc.modbus.onData/onEvent`（同主窗 data bus 逻辑，但更新本地 state 而非 store）。

- [ ] **Step 5: preload + shared/types PanelAPI.popout 签名扩展**

`PanelAPI.popout` 加 `type?: PanelType` 和 `modbusStr?: string` 参数。preload 实现透传。

- [ ] **Step 6: typecheck + build + 提交**

```bash
git add electron/main.ts electron/preload.ts shared/types.ts src/app/panel.tsx src/features/serial-panel/components/FloatingPane.tsx
git commit -m "feat(modbus-panel): support modbus panel popout with type-aware query"
```

---

## Task 12: E2E — modbus-panel-basic

**Files:**
- Create: `e2e/modbus-panel-basic.spec.ts`

- [ ] **Step 1: 写 E2E**

复用 `startModbusSlave` 与 fixtures。流程：
1. 新建 Modbus(TCP) 面板（驱动 NewPanelDialog UI）
2. 填 host=127.0.0.1 port=slave.port → 确认
3. 连接 → 状态徽章变绿
4. `[+新增区块]` → FC3 slave=1 addr=0 qty=4 → 表格出现 4 行，值 `[10,20,30,40]`
5. `[手动读写…]` → 读 FC3 slave=1 addr=0 qty=2 → 结果显示 `[10,20]`
6. 关闭从站 → 区块状态列变 ⚠

- [ ] **Step 2: 跑 + 提交**

```bash
npm run build && npx playwright test e2e/modbus-panel-basic.spec.ts
git add e2e/modbus-panel-basic.spec.ts
git commit -m "test(modbus-panel): e2e for basic connect/block/manual-read flow"
```

---

## Task 13: E2E — modbus-panel-poll + modbus-panel-csv

**Files:**
- Create: `e2e/modbus-panel-poll.spec.ts`
- Create: `e2e/modbus-panel-csv.spec.ts`

- [ ] **Step 1: poll E2E**

启用区块轮询 → 等 2 周期 → 断言 ts 更新过 → `[暂停所有轮询]` → ts 不再更新。

- [ ] **Step 2: csv E2E**

配置 2 个区块 → `[导出映射]` → 删除所有区块 → `[导入映射]` → 断言 2 个区块恢复（标题/参数一致）。

- [ ] **Step 3: 跑 + 提交**

```bash
git add e2e/modbus-panel-poll.spec.ts e2e/modbus-panel-csv.spec.ts
git commit -m "test(modbus-panel): e2e for polling and csv map import/export"
```

---

## 阶段 2 完成标准

- [ ] `PanelType` 含 `'modbus'`，`Panel.modbus` 可选字段就位
- [ ] NewPanelDialog 可创建 Modbus(TCP) 面板
- [ ] 面板可连接 mock 从站，状态徽章正确
- [ ] 多区块表格显示寄存器值（FC1-4），支持 float32 四种字节序
- [ ] 手动读写抽屉（FC5/6/15/16 写、FC1-4 读）
- [ ] 轮询启停，错误隔离
- [ ] CSV 映射导入/导出（追加语义、非法行跳过）
- [ ] popout 支持 modbus 面板
- [ ] format/csv 纯函数单测全绿
- [ ] 3 个 E2E spec 全绿（basic/poll/csv）
- [ ] `npm run typecheck` + `npm run build` 通过
