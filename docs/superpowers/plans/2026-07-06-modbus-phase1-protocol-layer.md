# Modbus 支持 — 阶段 1：协议层 + 主进程服务 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Electron 主进程引入 `modbus-serial`，建立与现有 `ports` 表平行的 `modbusClients` 注册表，实现 Modbus RTU/TCP/ASCII 主站连接、读、写、轮询，并暴露一组 `modbus:*` IPC 通道与 `window.api.modbus`。本阶段无 UI——以单元测试（mock client）与 DevTools 手动验证为验收。

**Architecture:** 镜像现有串口架构。主进程持有 `modbusClients: Map<panelId, ModbusClientEntry>`，`modbus-serial` 的 client 实例、轮询定时器、CRC/MBAP 解码全部在主进程。通过依赖注入使 `ensureModbusOpen`/`readOnce`/`writeOnce`/`applyPolls` 可在测试中替换 client 工厂，避免真实硬件依赖。preload 通过 `contextBridge` 暴露 `modbus` 域，渲染进程通过 `window.api.modbus.*` 调用。

**Tech Stack:** TypeScript / Electron (ipcMain + contextBridge) / `modbus-serial` / Vitest

**Spec:** `docs/superpowers/specs/2026-07-06-modbus-support-design.md`（第 1、2.1-2.2、3.1-3.4 节）

**范围说明（阶段 1 边界）：** 本计划只交付"协议层 + 主进程服务 + IPC + preload + mock-api + 单元测试"。**不**包含：面板 UI（阶段 2）、RTU/ASCII 连接分支的真实代码（阶段 3，本阶段留 TCP 实现 + RTU/ASCII 接口桩）、脚本沙箱 `modbusRead/Write`（阶段 4，本阶段仅预留注册表，沙箱函数留空抛错）。这样阶段 1 可独立通过单测验收、可合并。

---

## 文件结构

| 文件 | 责任 | 操作 |
|---|---|---|
| `package.json` | 加 `modbus-serial` 依赖 | 修改（第 62 行附近） |
| `shared/types.ts` | 新增 Modbus 类型段；`WindowAPI` 加 `modbus` | 修改（基础类型段后 + 第 363-381 行） |
| `electron/modbusService.ts` | Modbus 主进程服务核心：注册表、连接、读、写、轮询、错误翻译（可注入 client 工厂） | **新建** |
| `electron/main.ts` | 接入 `modbusService`：注册 `modbus:*` IPC、退出时清理、`window-all-closed` 关闭 modbus client | 修改（第 54、749/750、1880-1907 行附近） |
| `electron/preload.ts` | `modbus` 域 contextBridge | 修改（第 76/77 行后） |
| `src/shared/dev/mock-api.ts` | `modbus` 桩 | 修改（第 47 行后） |
| `test/modbus-service.test.ts` | 主进程服务单测（mock client 工厂） | **新建** |
| `test/modbus-ipc.test.ts` | 类型契约：`ModbusAPI` 与 `WindowAPI.modbus` 形状 | **新建** |

**为何把服务逻辑放进独立的 `electron/modbusService.ts` 而非塞进 `main.ts`：** `main.ts` 已 2000+ 行。独立文件让 ~250 行的 Modbus 服务可单测（可直接 import 其导出的纯函数/可注入函数），并保持 `main.ts` 只做"IPC 注册 + 生命周期接线"。

---

## Task 1: 依赖与类型契约先行（`modbus-serial` + `shared/types.ts`）

**Files:**
- Modify: `package.json`（第 62 行 `"serialport": "^12.0.0",` 之后）
- Modify: `shared/types.ts`（第 103 行 `ScriptLogPayload` 块结束后、第 105 行 `// ============ 脚本编辑器图结构 ============` 之前；以及第 128-136 行 `ControlSpec`、第 363-381 行 `WindowAPI`）
- Test: `test/modbus-ipc.test.ts`（新建）

- [ ] **Step 1: 安装依赖**

运行：`npm install modbus-serial`
然后在 `package.json` 确认 `dependencies` 里出现 `"modbus-serial": "^x.x.x"`（与 `serialport` 同段）。

- [ ] **Step 2: 写类型契约失败测试（先于实现）**

新建 `test/modbus-ipc.test.ts`：

```ts
import { describe, it, expectTypeOf } from 'vitest'
import type { WindowAPI, ModbusAPI, ModbusVariant, ModbusConnectOptions, ModbusBlock, ModbusBlockUpdate, ModbusWriteTarget, ModbusEvent } from '@shared/types'

describe('Modbus IPC 类型契约', () => {
  it('WindowAPI 含 modbus 域', () => {
    expectTypeOf<WindowAPI>().toHaveProperty('modbus').toEqualTypeOf<ModbusAPI>()
  })

  it('ModbusVariant 覆盖三种变体', () => {
    const v: ModbusVariant = 'rtu'
    expectTypeOf<ModbusVariant>().toEqualTypeOf<'rtu' | 'tcp' | 'ascii'>()
    void v
  })

  it('ModbusBlock.functionCode 限定 1-4', () => {
    expectTypeOf<ModbusBlock['functionCode']>().toEqualTypeOf<1 | 2 | 3 | 4>()
  })

  it('ModbusWriteTarget.functionCode 限定 5/6/15/16', () => {
    expectTypeOf<ModbusWriteTarget['functionCode']>().toEqualTypeOf<5 | 6 | 15 | 16>()
  })

  it('ModbusBlockUpdate 含 error 可选字段', () => {
    const u: ModbusBlockUpdate = { panelId: 'p', blockId: 'b', values: [1], ts: 0, error: 'timeout' }
    expectTypeOf(u.error).toEqualTypeOf<string | undefined>()
  })

  it('ModbusConnectOptions TCP/串口字段可选', () => {
    const o: ModbusConnectOptions = { variant: 'tcp', tcpHost: '127.0.0.1', tcpPort: 502 }
    void o
  })

  it('ModbusAPI 暴露完整方法集', () => {
    expectTypeOf<ModbusAPI>().toMatchTypeOf<{
      open: (panelId: string, options: ModbusConnectOptions) => Promise<{ ok: boolean; message?: string }>
      close: (panelId: string) => Promise<void>
      read: (panelId: string, slaveId: number, fc: 1 | 2 | 3 | 4, addr: number, qty: number) => Promise<{ values: number[]; error?: string }>
      write: (panelId: string, target: ModbusWriteTarget) => Promise<{ ok: boolean; error?: string }>
      setPolls: (panelId: string, blocks: ModbusBlock[]) => Promise<void>
      status: (panelId: string) => Promise<'closed' | 'opening' | 'open' | 'error'>
      onData: (cb: (u: ModbusBlockUpdate) => void) => () => void
      onEvent: (cb: (e: ModbusEvent) => void) => () => void
    }>()
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

运行：`npx vitest run test/modbus-ipc.test.ts`
预期：FAIL，编译错误——`ModbusAPI` 等类型未定义。

- [ ] **Step 4: 在 `shared/types.ts` 加 Modbus 类型段**

在第 103 行（`ScriptLogPayload` 接口结束）之后、第 105 行（`// ============ 脚本编辑器图结构 ============`）之前插入：

```ts

// ============ Modbus ============

export type ModbusVariant = 'rtu' | 'tcp' | 'ascii'

export interface ModbusConnectOptions {
  variant: ModbusVariant
  // RTU/ASCII 串口参数
  serialPath?: string
  baudRate?: number
  dataBits?: 7 | 8
  stopBits?: 1 | 2
  parity?: 'none' | 'even' | 'odd'
  // TCP 参数
  tcpHost?: string
  tcpPort?: number
}

export interface ModbusBlock {
  id: string
  title?: string
  slaveId: number                 // 1-247
  functionCode: 1 | 2 | 3 | 4
  startAddress: number            // 0-65535
  quantity: number
  pollEnabled: boolean
  pollIntervalMs: number
  displayFormat: 'signed' | 'unsigned' | 'hex' | 'binary'
    | 'float32'           // big-endian, ABCD
    | 'float32-swapped'   // 字交换, CDAB
    | 'float32-byte'      // 字节交换, BADC
    | 'float32-word-byte' // 字+字节交换, DCBA
}

export interface ModbusWriteTarget {
  slaveId: number
  functionCode: 5 | 6 | 15 | 16
  startAddress: number
  values: number[]
}

export interface ModbusBlockUpdate {
  panelId: string
  blockId: string
  values: number[]
  ts: number
  error?: string
}

export interface ModbusEvent {
  id: string
  type: 'open' | 'close' | 'error'
  message?: string
}
```

在 `ControlSpec` 接口（第 134 行）把 `source` 联合改为：
```ts
  source?: 'serial-panels' | 'serial-ports' | 'modbus-panels'
```

在 API 域接口段（第 172 行 `// ============ API 域接口 ============` 之后、`SerialAPI` 之前，或任意域之后）加：
```ts
export interface ModbusAPI {
  open: (panelId: string, options: ModbusConnectOptions) => Promise<{ ok: boolean; message?: string }>
  close: (panelId: string) => Promise<void>
  read: (panelId: string, slaveId: number, fc: 1 | 2 | 3 | 4, addr: number, qty: number) => Promise<{ values: number[]; error?: string }>
  write: (panelId: string, target: ModbusWriteTarget) => Promise<{ ok: boolean; error?: string }>
  setPolls: (panelId: string, blocks: ModbusBlock[]) => Promise<void>
  status: (panelId: string) => Promise<'closed' | 'opening' | 'open' | 'error'>
  onData: (cb: (u: ModbusBlockUpdate) => void) => () => void
  onEvent: (cb: (e: ModbusEvent) => void) => () => void
}
```

在 `WindowAPI`（第 363-381 行）加一行 `modbus: ModbusAPI`（紧跟 `serial` 之后）：
```ts
export interface WindowAPI {
  serial: SerialAPI
  modbus: ModbusAPI
  tcp: TcpAPI
  // ... 其余不变
}
```

- [ ] **Step 5: 跑测试确认通过**

运行：`npx vitest run test/modbus-ipc.test.ts`
预期：PASS（类型契约成立）。

- [ ] **Step 6: 跑全量 typecheck 确认未破坏现有代码**

运行：`npm run typecheck`
预期：PASS。若失败，多半是 `WindowAPI` 新增 `modbus` 后，`mock-api.ts` 的 `as unknown as WindowAPI` 断言不满足——这是预期的，下一个 Task 修 mock。

- [ ] **Step 7: 提交**

```bash
git add package.json package-lock.json shared/types.ts test/modbus-ipc.test.ts
git commit -m "feat(modbus): add modbus-serial dep and IPC type contract"
```

---

## Task 2: mock-api 桩（让 web-preview 不崩）

**Files:**
- Modify: `src/shared/dev/mock-api.ts`（第 47 行 `serial:` 段结束后）
- Modify: `test/modbus-ipc.test.ts`（已存在）

- [ ] **Step 1: 写失败断言——在 modbus-ipc.test.ts 末尾加一条运行时测试**

在 `test/modbus-ipc.test.ts` 顶部追加 import：
```ts
import { describe, it, expect } from 'vitest'
```
（替换原 `import { describe, it, expectTypeOf } from 'vitest'`）

在文件末尾追加：
```ts
describe('mock-api modbus 桩', () => {
  it('installWebPreviewApiMock 后 window.api.modbus 存在且为桩', async () => {
    // @ts-expect-error 直接导入内部函数
    const { installWebPreviewApiMock } = await import('../src/shared/dev/mock-api')
    // 先清掉可能存在的 api
    // @ts-expect-error 测试环境操作 window
    delete (window as any).api
    installWebPreviewApiMock()
    // @ts-expect-error window.api 在 mock 下必存在
    expect(window.api).toBeDefined()
    // @ts-expect-error
    expect(window.api.modbus).toBeDefined()
    // @ts-expect-error
    expect(typeof window.api.modbus.open).toBe('function')
    // @ts-expect-error
    expect(typeof window.api.modbus.onData).toBe('function')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

运行：`npx vitest run test/modbus-ipc.test.ts`
预期：新用例 FAIL（`window.api.modbus` 为 `undefined`）。

- [ ] **Step 3: 在 `src/shared/dev/mock-api.ts` 加 `modbus` 桩**

在第 47 行（`serial:` 段的结束 `},`）之后插入：
```ts
  modbus: {
    open: async () => ({ ok: true }),
    close: async () => undefined,
    read: async () => ({ values: [] }),
    write: async () => ({ ok: true }),
    setPolls: async () => undefined,
    status: async () => 'closed' as const,
    onData: () => emptyUnsubscribe,
    onEvent: () => emptyUnsubscribe,
  },
```

- [ ] **Step 4: 跑测试确认通过**

运行：`npx vitest run test/modbus-ipc.test.ts`
预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add src/shared/dev/mock-api.ts test/modbus-ipc.test.ts
git commit -m "feat(modbus): add modbus stub to web-preview mock-api"
```

---

## Task 3: 主进程服务核心——`readOnce`（TDD，可注入 client）

这是整个 Modbus 服务的核心读函数，被手动读、轮询、脚本沙箱共用。先从它开始，因为它纯逻辑、易测。

**Files:**
- Create: `electron/modbusService.ts`
- Create: `test/modbus-service.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `test/modbus-service.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { readOnce } from '../electron/modbusService'

// 一个最小 mock client，模拟 modbus-serial 的方法签名
function makeMockClient() {
  return {
    setID: vi.fn(),
    setTimeout: vi.fn(),
    readCoils: vi.fn().mockResolvedValue({ data: [true, false, true] }),
    readDiscreteInputs: vi.fn().mockResolvedValue({ data: [false, true] }),
    readHoldingRegisters: vi.fn().mockResolvedValue({ data: [100, 200, 300] }),
    readInputRegisters: vi.fn().mockResolvedValue({ data: [7, 8] }),
    writeCoil: vi.fn().mockResolvedValue(undefined),
    writeRegister: vi.fn().mockResolvedValue(undefined),
    writeCoils: vi.fn().mockResolvedValue(undefined),
    writeRegisters: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

describe('readOnce', () => {
  it('FC3 读保持寄存器：调用 readHoldingRegisters 并返回数字数组', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    const values = await readOnce(entry, { slaveId: 1, functionCode: 3, startAddress: 0, quantity: 3 })
    expect(client.setID).toHaveBeenCalledWith(1)
    expect(client.readHoldingRegisters).toHaveBeenCalledWith(0, 3)
    expect(values).toEqual([100, 200, 300])
  })

  it('FC4 读输入寄存器：调用 readInputRegisters', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    const values = await readOnce(entry, { slaveId: 2, functionCode: 4, startAddress: 10, quantity: 2 })
    expect(client.readInputRegisters).toHaveBeenCalledWith(10, 2)
    expect(values).toEqual([7, 8])
  })

  it('FC1 读线圈：布尔数组转 0/1', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    const values = await readOnce(entry, { slaveId: 1, functionCode: 1, startAddress: 0, quantity: 3 })
    expect(client.readCoils).toHaveBeenCalledWith(0, 3)
    expect(values).toEqual([1, 0, 1])
  })

  it('FC2 读离散输入：布尔数组转 0/1', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    const values = await readOnce(entry, { slaveId: 1, functionCode: 2, startAddress: 0, quantity: 2 })
    expect(client.readDiscreteInputs).toHaveBeenCalledWith(0, 2)
    expect(values).toEqual([0, 1])
  })

  it('未知功能码抛错', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    await expect(readOnce(entry, { slaveId: 1, functionCode: 99 as any, startAddress: 0, quantity: 1 }))
      .rejects.toThrow(/不支持的功能码/)
  })

  it('client 抛错时透传（超时）', async () => {
    const client = makeMockClient()
    client.readHoldingRegisters.mockRejectedValue(new Error('Modbus timeout'))
    const entry = { client } as any
    await expect(readOnce(entry, { slaveId: 1, functionCode: 3, startAddress: 0, quantity: 1 }))
      .rejects.toThrow('Modbus timeout')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

运行：`npx vitest run test/modbus-service.test.ts`
预期：FAIL（`Cannot find module '../electron/modbusService'`）。

- [ ] **Step 3: 实现 `readOnce`**

新建 `electron/modbusService.ts`：

```ts
// electron/modbusService.ts
// Modbus 主进程服务核心。镜像 electron/main.ts 的 ports 表模式，
// 但为可测试性抽到独立文件，并支持 client 工厂注入。
import type { BrowserWindow } from 'electron'
import type {
  ModbusConnectOptions, ModbusVariant, ModbusBlock, ModbusBlockUpdate,
} from '@shared/types'

// ---- 注册表（与 ports 表平行）----

export interface ModbusClientEntry {
  panelId: string
  variant: ModbusVariant
  client: any                 // modbus-serial 实例（或测试中的 mock）
  connectOptions: ModbusConnectOptions
  polls: Map<string, { block: ModbusBlock; timer: NodeJS.Timeout | null }>
  status: 'closed' | 'opening' | 'open' | 'error'
  lastError?: string
}

export const modbusClients = new Map<string, ModbusClientEntry>()

// 用于广播事件到所有渲染窗口（由 main.ts 注入，避免本文件直接依赖 BrowserWindow）
let broadcaster: ((channel: string, payload: unknown) => void) | null = null
export function setModbusBroadcaster(fn: (channel: string, payload: unknown) => void) {
  broadcaster = fn
}
function broadcast(channel: string, payload: unknown) {
  if (broadcaster) broadcaster(channel, payload)
}

// modbus-serial client 工厂（可注入）。默认工厂在 main.ts 接线时设置。
type ClientFactory = (opts: ModbusConnectOptions) => Promise<any>
let clientFactory: ClientFactory = defaultClientFactory
export function setModbusClientFactory(f: ClientFactory) {
  clientFactory = f
}

async function defaultClientFactory(_opts: ModbusConnectOptions): Promise<any> {
  // 默认工厂使用真实的 modbus-serial。延迟 require 避免单元测试时强依赖。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ModbusRTU = require('modbus-serial')
  const client = new ModbusRTU()
  return client
}

// ---- 核心读（手动读 / 轮询 / 脚本沙箱共用）----

export interface ReadParams {
  slaveId: number
  functionCode: 1 | 2 | 3 | 4
  startAddress: number
  quantity: number
}

export async function readOnce(entry: ModbusClientEntry, params: ReadParams): Promise<number[]> {
  const c = entry.client
  c.setID(params.slaveId)
  c.setTimeout(2000) // 默认 2s
  const { functionCode: fc, startAddress: addr, quantity: qty } = params
  switch (fc) {
    case 1: {
      const r = await c.readCoils(addr, qty)
      return normalizeData(r).map((b: unknown) => (b ? 1 : 0))
    }
    case 2: {
      const r = await c.readDiscreteInputs(addr, qty)
      return normalizeData(r).map((b: unknown) => (b ? 1 : 0))
    }
    case 3: {
      const r = await c.readHoldingRegisters(addr, qty)
      return normalizeData(r).map((n: unknown) => Number(n))
    }
    case 4: {
      const r = await c.readInputRegisters(addr, qty)
      return normalizeData(r).map((n: unknown) => Number(n))
    }
    default:
      throw new Error(`不支持的功能码: ${fc}`)
  }
}

// modbus-serial 响应可能是 { data: [...] } 或 { array: [...] }，统一取数组
function normalizeData(r: any): any[] {
  if (Array.isArray(r)) return r
  if (Array.isArray(r?.data)) return r.data
  if (Array.isArray(r?.array)) return r.array
  return []
}
```

- [ ] **Step 4: 跑测试确认通过**

运行：`npx vitest run test/modbus-service.test.ts`
预期：PASS（6 条）。

- [ ] **Step 5: typecheck**

运行：`npm run typecheck`
预期：PASS。

- [ ] **Step 6: 提交**

```bash
git add electron/modbusService.ts test/modbus-service.test.ts
git commit -m "feat(modbus): add readOnce core with injectable client factory"
```

---

## Task 4: `writeOnce`（TDD）

**Files:**
- Modify: `electron/modbusService.ts`
- Modify: `test/modbus-service.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/modbus-service.test.ts` 顶部 import 花括号里加 `writeOnce`：
```ts
import { readOnce, writeOnce } from '../electron/modbusService'
```

在文件末尾追加：
```ts
describe('writeOnce', () => {
  it('FC6 写单寄存器：调用 writeRegister', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    await writeOnce(entry, { slaveId: 1, functionCode: 6, startAddress: 5, values: [42] })
    expect(client.setID).toHaveBeenCalledWith(1)
    expect(client.writeRegister).toHaveBeenCalledWith(5, 42)
  })

  it('FC5 写单线圈：values[0] 非 0 转 true', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    await writeOnce(entry, { slaveId: 1, functionCode: 5, startAddress: 3, values: [1] })
    expect(client.writeCoil).toHaveBeenCalledWith(3, true)
    client.writeCoil.mockClear()
    await writeOnce(entry, { slaveId: 1, functionCode: 5, startAddress: 3, values: [0] })
    expect(client.writeCoil).toHaveBeenCalledWith(3, false)
  })

  it('FC16 写多寄存器：调用 writeRegisters', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    await writeOnce(entry, { slaveId: 1, functionCode: 16, startAddress: 10, values: [1, 2, 3] })
    expect(client.writeRegisters).toHaveBeenCalledWith(10, [1, 2, 3])
  })

  it('FC15 写多线圈：values 0/1 转 boolean 数组', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    await writeOnce(entry, { slaveId: 1, functionCode: 15, startAddress: 0, values: [1, 0, 1] })
    expect(client.writeCoils).toHaveBeenCalledWith(0, [true, false, true])
  })

  it('未知功能码抛错', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    await expect(writeOnce(entry, { slaveId: 1, functionCode: 99 as any, startAddress: 0, values: [1] }))
      .rejects.toThrow(/不支持的功能码/)
  })

  it('FC5/FC6 values 长度不为 1 抛错', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    await expect(writeOnce(entry, { slaveId: 1, functionCode: 6, startAddress: 0, values: [1, 2] }))
      .rejects.toThrow(/单写.*1 个值/)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

运行：`npx vitest run test/modbus-service.test.ts`
预期：FAIL（`writeOnce is not exported`）。

- [ ] **Step 3: 实现 `writeOnce`**

在 `electron/modbusService.ts` 末尾（`readOnce` 之后）加：

```ts
export interface WriteParams {
  slaveId: number
  functionCode: 5 | 6 | 15 | 16
  startAddress: number
  values: number[]
}

export async function writeOnce(entry: ModbusClientEntry, params: WriteParams): Promise<void> {
  const c = entry.client
  c.setID(params.slaveId)
  c.setTimeout(2000)
  const { functionCode: fc, startAddress: addr, values } = params
  switch (fc) {
    case 5: {
      if (values.length !== 1) throw new Error('单写线圈(FC5)需要恰好 1 个值')
      await c.writeCoil(addr, !!values[0])
      return
    }
    case 6: {
      if (values.length !== 1) throw new Error('单写寄存器(FC6)需要恰好 1 个值')
      await c.writeRegister(addr, Number(values[0]))
      return
    }
    case 15: {
      await c.writeCoils(addr, values.map((v) => !!v))
      return
    }
    case 16: {
      await c.writeRegisters(addr, values.map((v) => Number(v)))
      return
    }
    default:
      throw new Error(`不支持的功能码: ${fc}`)
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

运行：`npx vitest run test/modbus-service.test.ts`
预期：PASS（6 + 6 = 12 条）。

- [ ] **Step 5: 提交**

```bash
git add electron/modbusService.ts test/modbus-service.test.ts
git commit -m "feat(modbus): add writeOnce for FC5/6/15/16"
```

---

## Task 5: `applyPolls` 轮询机制（TDD，用假定时器）

**Files:**
- Modify: `electron/modbusService.ts`
- Modify: `test/modbus-service.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/modbus-service.test.ts` 顶部 import 加 `applyPolls`、`modbusClients`：
```ts
import { readOnce, writeOnce, applyPolls, modbusClients } from '../electron/modbusService'
```

在文件末尾追加：
```ts
describe('applyPolls', () => {
  beforeEach(() => {
    modbusClients.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pollEnabled=true 的区块立即读一次 + 启动 interval', async () => {
    const client = makeMockClient()
    client.readHoldingRegisters.mockResolvedValue({ data: [11, 22] })
    const entry: any = {
      panelId: 'p1', variant: 'tcp', client,
      connectOptions: { variant: 'tcp' }, polls: new Map(), status: 'open',
    }
    modbusClients.set('p1', entry)

    const blocks: any[] = [
      { id: 'b1', slaveId: 1, functionCode: 3, startAddress: 0, quantity: 2, pollEnabled: true, pollIntervalMs: 1000 },
    ]
    applyPolls('p1', blocks)

    // 立即首次读
    await vi.advanceTimersByTimeAsync(0)
    expect(client.readHoldingRegisters).toHaveBeenCalledTimes(1)

    // 推进一个周期后再读一次
    await vi.advanceTimersByTimeAsync(1000)
    expect(client.readHoldingRegisters).toHaveBeenCalledTimes(2)
  })

  it('pollEnabled=false 的区块不启动 interval', async () => {
    const client = makeMockClient()
    const entry: any = {
      panelId: 'p1', variant: 'tcp', client,
      connectOptions: { variant: 'tcp' }, polls: new Map(), status: 'open',
    }
    modbusClients.set('p1', entry)

    applyPolls('p1', [{ id: 'b1', slaveId: 1, functionCode: 3, startAddress: 0, quantity: 2, pollEnabled: false, pollIntervalMs: 1000 } as any])
    await vi.advanceTimersByTimeAsync(3000)
    expect(client.readHoldingRegisters).not.toHaveBeenCalled()
  })

  it('轮询间隔 <50ms 兜底为 50ms', async () => {
    const client = makeMockClient()
    const entry: any = {
      panelId: 'p1', variant: 'tcp', client,
      connectOptions: { variant: 'tcp' }, polls: new Map(), status: 'open',
    }
    modbusClients.set('p1', entry)
    applyPolls('p1', [{ id: 'b1', slaveId: 1, functionCode: 3, startAddress: 0, quantity: 1, pollEnabled: true, pollIntervalMs: 10 } as any])
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(49)
    expect(client.readHoldingRegisters).toHaveBeenCalledTimes(1) // 只首次读
    await vi.advanceTimersByTimeAsync(1)
    expect(client.readHoldingRegisters).toHaveBeenCalledTimes(2) // 50ms 到点
  })

  it('读失败时广播 error，不抛出（不影响其他区块）', async () => {
    const client = makeMockClient()
    client.readHoldingRegisters.mockRejectedValue(new Error('timeout'))
    client.readInputRegisters.mockResolvedValue({ data: [9] })
    const events: any[] = []
    // 注入 broadcaster
    setModbusBroadcaster((_ch, payload) => events.push(payload))

    const entry: any = {
      panelId: 'p1', variant: 'tcp', client,
      connectOptions: { variant: 'tcp' }, polls: new Map(), status: 'open',
    }
    modbusClients.set('p1', entry)

    applyPolls('p1', [
      { id: 'b1', slaveId: 1, functionCode: 3, startAddress: 0, quantity: 1, pollEnabled: true, pollIntervalMs: 1000 } as any,
      { id: 'b2', slaveId: 2, functionCode: 4, startAddress: 0, quantity: 1, pollEnabled: true, pollIntervalMs: 1000 } as any,
    ])
    await vi.advanceTimersByTimeAsync(0)

    const e1 = events.find((e) => e.blockId === 'b1')
    const e2 = events.find((e) => e.blockId === 'b2')
    expect(e1.error).toBeTruthy()
    expect(e2.values).toEqual([9])
    expect(events).toHaveLength(2)
  })

  it('二次调用 applyPolls 清除旧 timers', async () => {
    const client = makeMockClient()
    const entry: any = {
      panelId: 'p1', variant: 'tcp', client,
      connectOptions: { variant: 'tcp' }, polls: new Map(), status: 'open',
    }
    modbusClients.set('p1', entry)

    applyPolls('p1', [{ id: 'b1', slaveId: 1, functionCode: 3, startAddress: 0, quantity: 1, pollEnabled: true, pollIntervalMs: 1000 } as any])
    await vi.advanceTimersByTimeAsync(0)
    const countAfterFirst = client.readHoldingRegisters.mock.calls.length

    applyPolls('p1', []) // 清空
    await vi.advanceTimersByTimeAsync(5000)
    expect(client.readHoldingRegisters.mock.calls.length).toBe(countAfterFirst) // 不再增长
  })
})
```

补充 import：
```ts
import { readOnce, writeOnce, applyPolls, modbusClients, setModbusBroadcaster } from '../electron/modbusService'
import { beforeEach, afterEach } from 'vitest'
```

- [ ] **Step 2: 跑测试确认失败**

运行：`npx vitest run test/modbus-service.test.ts`
预期：FAIL（`applyPolls is not exported`）。

- [ ] **Step 3: 实现 `applyPolls`**

在 `electron/modbusService.ts` 末尾加：

```ts
export function applyPolls(panelId: string, blocks: ModbusBlock[]) {
  const entry = modbusClients.get(panelId)
  if (!entry) return

  // 清除所有现有 timers
  for (const p of entry.polls.values()) {
    if (p.timer) clearInterval(p.timer)
  }
  entry.polls.clear()

  for (const block of blocks) {
    const doRead = async () => {
      try {
        const values = await readOnce(entry, {
          slaveId: block.slaveId,
          functionCode: block.functionCode,
          startAddress: block.startAddress,
          quantity: block.quantity,
        })
        const update: ModbusBlockUpdate = { panelId, blockId: block.id, values, ts: Date.now() }
        broadcast('modbus:data', update)
      } catch (e: any) {
        const update: ModbusBlockUpdate = {
          panelId, blockId: block.id, values: [], ts: Date.now(), error: translateModbusError(e),
        }
        broadcast('modbus:data', update)
      }
    }

    const intervalMs = Math.max(50, block.pollIntervalMs)
    const timer = block.pollEnabled ? setInterval(() => { void doRead() }, intervalMs) : null
    entry.polls.set(block.id, { block, timer })
    if (block.pollEnabled) void doRead() // 立即首次读
  }
}

// 把 modbus-serial / Modbus 异常翻译成可读中文消息
export function translateModbusError(e: any): string {
  const code = e?.modbusExceptionCode ?? e?.code
  if (code != null) {
    const map: Record<number, string> = {
      1: '非法功能码(01)', 2: '非法地址(02)', 3: '非法值(03)', 4: '从站故障(04)',
    }
    return `从站异常：${map[code] ?? `代码(${String(code).padStart(2, '0')})`}`
  }
  return String(e?.message ?? e)
}
```

- [ ] **Step 4: 跑测试确认通过**

运行：`npx vitest run test/modbus-service.test.ts`
预期：PASS（12 + 5 = 17 条）。注意"读失败时广播 error"用例依赖 `setModbusBroadcaster`——确认该函数已在 Task 3 导出（已导出）。

- [ ] **Step 5: 提交**

```bash
git add electron/modbusService.ts test/modbus-service.test.ts
git commit -m "feat(modbus): add applyPolls with error isolation and timer cleanup"
```

---

## Task 6: `ensureModbusOpen` / `closeModbus` 连接生命周期（TDD）

**Files:**
- Modify: `electron/modbusService.ts`
- Modify: `test/modbus-service.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/modbus-service.test.ts` 顶部 import 加 `ensureModbusOpen`、`closeModbus`、`setModbusClientFactory`：
```ts
import {
  readOnce, writeOnce, applyPolls, modbusClients,
  setModbusBroadcaster, setModbusClientFactory,
  ensureModbusOpen, closeModbus,
} from '../electron/modbusService'
```

在文件末尾追加：
```ts
describe('ensureModbusOpen / closeModbus', () => {
  beforeEach(() => {
    modbusClients.clear()
    vi.useRealTimers()
  })

  it('TCP 连接成功：注入 client 工厂返回带 connectTCP 的 client，状态 open', async () => {
    const fakeClient = makeMockClient()
    fakeClient.connectTCP = vi.fn().mockResolvedValue(undefined)
    setModbusClientFactory(async () => fakeClient)

    const events: any[] = []
    setModbusBroadcaster((_ch, payload) => events.push(payload))

    const r = await ensureModbusOpen('p1', { variant: 'tcp', tcpHost: '127.0.0.1', tcpPort: 502 })
    expect(r.ok).toBe(true)
    expect(fakeClient.connectTCP).toHaveBeenCalledWith('127.0.0.1', expect.objectContaining({ port: 502 }))
    expect(modbusClients.get('p1')?.status).toBe('open')
    expect(events.some((e) => e.type === 'open')).toBe(true)
  })

  it('连接失败：返回 ok:false，发 error 事件，不进入注册表', async () => {
    const fakeClient = makeMockClient()
    fakeClient.connectTCP = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    setModbusClientFactory(async () => fakeClient)

    const events: any[] = []
    setModbusBroadcaster((_ch, payload) => events.push(payload))

    const r = await ensureModbusOpen('p1', { variant: 'tcp', tcpHost: 'x', tcpPort: 502 })
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/ECONNREFUSED/)
    expect(modbusClients.has('p1')).toBe(false)
    expect(events.some((e) => e.type === 'error')).toBe(true)
  })

  it('已存在连接：先关旧的再重开', async () => {
    const old = makeMockClient()
    old.connectTCP = vi.fn().mockResolvedValue(undefined)
    setModbusClientFactory(async () => old)
    await ensureModbusOpen('p1', { variant: 'tcp', tcpHost: 'a', tcpPort: 502 })

    const fresh = makeMockClient()
    fresh.connectTCP = vi.fn().mockResolvedValue(undefined)
    setModbusClientFactory(async () => fresh)
    await ensureModbusOpen('p1', { variant: 'tcp', tcpHost: 'b', tcpPort: 502 })

    expect(old.close).toHaveBeenCalled()
    expect(modbusClients.get('p1')?.client).toBe(fresh)
  })

  it('closeModbus：清 timers、client.close、从注册表删除、发 close 事件', async () => {
    const fakeClient = makeMockClient()
    fakeClient.connectTCP = vi.fn().mockResolvedValue(undefined)
    setModbusClientFactory(async () => fakeClient)
    const events: any[] = []
    setModbusBroadcaster((_ch, payload) => events.push(payload))

    await ensureModbusOpen('p1', { variant: 'tcp', tcpHost: 'a', tcpPort: 502 })
    // 注入一个轮询 timer
    modbusClients.get('p1')!.polls.set('b1', { block: {} as any, timer: setInterval(() => {}, 1000) })

    await closeModbus('p1')
    expect(fakeClient.close).toHaveBeenCalled()
    expect(modbusClients.has('p1')).toBe(false)
    expect(events.some((e) => e.type === 'close')).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

运行：`npx vitest run test/modbus-service.test.ts`
预期：FAIL（`ensureModbusOpen is not exported`）。

- [ ] **Step 3: 实现 `ensureModbusOpen` / `closeModbus`**

在 `electron/modbusService.ts` 末尾加：

```ts
export async function ensureModbusOpen(
  panelId: string,
  opts: ModbusConnectOptions,
): Promise<{ ok: boolean; message?: string }> {
  // 已存在则先关
  if (modbusClients.has(panelId)) {
    await closeModbus(panelId).catch(() => {})
  }

  let client: any
  try {
    client = await clientFactory(opts)
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    broadcast('modbus:event', { id: panelId, type: 'error', message: msg })
    return { ok: false, message: msg }
  }

  const entry: ModbusClientEntry = {
    panelId, variant: opts.variant, client, connectOptions: opts,
    polls: new Map(), status: 'opening',
  }
  modbusClients.set(panelId, entry)

  try {
    if (opts.variant === 'tcp') {
      await client.connectTCP(opts.tcpHost, { port: opts.tcpPort ?? 502 })
    } else if (opts.variant === 'rtu') {
      // 阶段 3 实现；阶段 1 先抛错占位
      throw new Error('RTU 连接将在阶段 3 实现')
    } else if (opts.variant === 'ascii') {
      throw new Error('ASCII 连接将在阶段 3 实现')
    }
    entry.status = 'open'
    broadcast('modbus:event', { id: panelId, type: 'open' })
    return { ok: true }
  } catch (e: any) {
    entry.status = 'error'
    entry.lastError = String(e?.message ?? e)
    modbusClients.delete(panelId)
    try { await client.close() } catch { /* ignore */ }
    const msg = String(e?.message ?? e)
    broadcast('modbus:event', { id: panelId, type: 'error', message: msg })
    return { ok: false, message: msg }
  }
}

export async function closeModbus(panelId: string): Promise<void> {
  const entry = modbusClients.get(panelId)
  if (!entry) return
  // 清 timers
  for (const p of entry.polls.values()) {
    if (p.timer) clearInterval(p.timer)
  }
  entry.polls.clear()
  try { await entry.client?.close?.() } catch { /* ignore */ }
  modbusClients.delete(panelId)
  broadcast('modbus:event', { id: panelId, type: 'close' })
}
```

- [ ] **Step 4: 跑测试确认通过**

运行：`npx vitest run test/modbus-service.test.ts`
预期：PASS（全部用例）。

- [ ] **Step 5: 提交**

```bash
git add electron/modbusService.ts test/modbus-service.test.ts
git commit -m "feat(modbus): add ensureModbusOpen/closeModbus lifecycle (TCP)"
```

---

## Task 7: 在 `electron/main.ts` 接线（IPC 注册 + 广播器 + 退出清理）

把 `modbusService` 接进主进程：注入 broadcaster、注册 `modbus:*` IPC、退出时清理。

**Files:**
- Modify: `electron/main.ts`（第 54 行后、第 749/750 行后、第 1880-1907 行的 `window-all-closed`）
- 无新增测试（接线代码，由 E2E 在阶段 2 覆盖）

- [ ] **Step 1: 在 `main.ts` 顶部 import modbusService**

在 `electron/main.ts` 顶部 import 区（`const ports = ...` 第 54 行之前）加：

```ts
import {
  modbusClients, ensureModbusOpen, closeModbus, readOnce, writeOnce,
  applyPolls, setModbusBroadcaster, setModbusClientFactory,
} from './modbusService'
```

- [ ] **Step 2: 注入 broadcaster（模块初始化区）**

在 `main.ts` 中 `app.whenReady()` 之前（与其它模块级初始化同区，例如紧接 `const ports = ...` 这一组声明之后）加：

```ts
// 把 BrowserWindow 广播能力注入 modbus 服务
setModbusBroadcaster((channel, payload) => {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
})
```

- [ ] **Step 3: 注册 `modbus:*` IPC handlers**

在 `electron/main.ts` 第 749 行（`serial:write` handler）之后、第 750 行（`file:readHex`）之前插入：

```ts

// ============ Modbus ============
ipcMain.handle('modbus:open', async (_e, panelId: string, opts: any) => ensureModbusOpen(panelId, opts))
ipcMain.handle('modbus:close', async (_e, panelId: string) => { await closeModbus(panelId); return undefined })
ipcMain.handle('modbus:read', async (_e, panelId: string, slaveId: number, fc: 1|2|3|4, addr: number, qty: number) => {
  const entry = modbusClients.get(panelId)
  if (!entry) return { values: [], error: 'Modbus 面板未连接' }
  try {
    const values = await readOnce(entry, { slaveId, functionCode: fc, startAddress: addr, quantity: qty })
    return { values, error: undefined }
  } catch (e: any) {
    return { values: [], error: String(e?.message ?? e) }
  }
})
ipcMain.handle('modbus:write', async (_e, panelId: string, target: any) => {
  const entry = modbusClients.get(panelId)
  if (!entry) return { ok: false, error: 'Modbus 面板未连接' }
  try {
    await writeOnce(entry, target)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) }
  }
})
ipcMain.handle('modbus:setPolls', async (_e, panelId: string, blocks: any[]) => {
  applyPolls(panelId, blocks)
  return undefined
})
ipcMain.handle('modbus:status', async (_e, panelId: string) => modbusClients.get(panelId)?.status ?? 'closed')
```

- [ ] **Step 4: 退出清理——`window-all-closed` 关闭所有 modbus client**

在 `electron/main.ts` 的 `window-all-closed` handler（约第 1880-1907 行）里，找到 `ports.forEach(({ port }) => { try { port.close() } catch { } })`（第 1883 行）之后、TCP sockets 清理之前，插入：

```ts
  // 关闭所有 Modbus 连接
  modbusClients.forEach((entry) => {
    for (const p of entry.polls.values()) { if (p.timer) clearInterval(p.timer) }
    try { entry.client?.close?.(() => {}) } catch { /* ignore */ }
  })
  modbusClients.clear()
```

- [ ] **Step 5: typecheck + 构建**

运行：`npm run typecheck`
预期：PASS。

运行：`npm run build`
预期：PASS（确认 `modbus-serial` 能被 electron-vite 正确打包进主进程 bundle）。

- [ ] **Step 6: 提交**

```bash
git add electron/main.ts
git commit -m "feat(modbus): wire modbus IPC handlers and teardown in main process"
```

---

## Task 8: preload `modbus` 域

**Files:**
- Modify: `electron/preload.ts`（第 76 行 `serial:` 段的结束 `},` 之后）

- [ ] **Step 1: 在 preload 加 `modbus` 域**

在 `electron/preload.ts` 第 76 行（`serial:` 块结束的 `},`）之后、第 77 行（`panel: {`）之前插入：

```ts
  modbus: {
    open: (panelId, options) => ipcRenderer.invoke('modbus:open', panelId, options),
    close: (panelId) => ipcRenderer.invoke('modbus:close', panelId),
    read: (panelId, slaveId, fc, addr, qty) =>
      ipcRenderer.invoke('modbus:read', panelId, slaveId, fc, addr, qty),
    write: (panelId, target) => ipcRenderer.invoke('modbus:write', panelId, target),
    setPolls: (panelId, blocks) => ipcRenderer.invoke('modbus:setPolls', panelId, blocks),
    status: (panelId) => ipcRenderer.invoke('modbus:status', panelId),
    onData: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload as ModbusBlockUpdate)
      ipcRenderer.on('modbus:data', listener)
      return () => ipcRenderer.off('modbus:data', listener)
    },
    onEvent: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: any) => cb(payload as ModbusEvent)
      ipcRenderer.on('modbus:event', listener)
      return () => ipcRenderer.off('modbus:event', listener)
    }
  },
```

并在 `preload.ts` 顶部 import 区加类型 import（若尚无 `@shared/types` import）：
```ts
import type { ModbusBlockUpdate, ModbusEvent } from '@shared/types'
```

- [ ] **Step 2: typecheck + 构建**

运行：`npm run typecheck`
预期：PASS（`WindowAPI.modbus` 已在 Task 1 定义，preload 的 `api` 对象将满足接口）。

运行：`npm run build`
预期：PASS。

- [ ] **Step 3: 提交**

```bash
git add electron/preload.ts
git commit -m "feat(modbus): expose modbus domain via contextBridge preload"
```

---

## Task 9: 手动验证（mock TCP 从站 + DevTools）

验证阶段 1 端到端可用（无 UI，用 DevTools 直接调 IPC）。

- [ ] **Step 1: 启动一个最小 Modbus TCP mock 从站**

用 Node 起一个一次性脚本 `scripts/mock-modbus-slave.js`（临时文件，验证后删除）：

```js
// 临时验证脚本：一个最小 Modbus TCP 从站，只响应 FC3 读保持寄存器
const net = require('net')
const regs = new Array(100).fill(0)
for (let i = 0; i < 10; i++) regs[i] = (i + 1) * 10 // reg[0..9] = 10,20,..100

const server = net.createServer((sock) => {
  let buf = Buffer.alloc(0)
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 12) { // MBAP 7B + min PDU 5B（FC3 请求）
      const tx = buf.readUInt16BE(0)
      const proto = buf.readUInt16BE(2)
      const len = buf.readUInt16BE(4)
      const unit = buf.readUInt8(6)
      const fc = buf.readUInt8(7)
      if (proto !== 0 || buf.length < 6 + len) break
      const pdu = buf.subarray(6, 6 + len)
      buf = buf.subarray(6 + len)
      if (fc === 3) {
        const addr = pdu.readUInt16BE(1)
        const qty = pdu.readUInt16BE(3)
        const byteCount = qty * 2
        const respPdu = Buffer.allocUnsafe(2 + byteCount)
        respPdu.writeUInt8(3, 0)
        respPdu.writeUInt8(byteCount, 1)
        for (let i = 0; i < qty; i++) respPdu.writeUInt16BE(regs[addr + i] ?? 0, 2 + i * 2)
        const mbap = Buffer.allocUnsafe(7)
        mbap.writeUInt16BE(tx, 0)
        mbap.writeUInt16BE(0, 2)
        mbap.writeUInt16BE(respPdu.length, 4)
        mbap.writeUInt8(unit, 6)
        sock.write(Buffer.concat([mbap, respPdu]))
      }
    }
  })
})
server.listen(5020, () => console.log('mock modbus slave on :5020'))
```

运行：`node scripts/mock-modbus-slave.js`（保持运行）。

- [ ] **Step 2: `npm run dev` 启动 Electron**

- [ ] **Step 3: 在主窗口 DevTools Console 执行**

```js
// 1. 连接
await window.api.modbus.open('test-panel', { variant: 'tcp', tcpHost: '127.0.0.1', tcpPort: 5020 })
// 期望: { ok: true }

// 2. 读 FC3
await window.api.modbus.read('test-panel', 1, 3, 0, 4)
// 期望: { values: [10, 20, 30, 40], error: undefined }

// 3. 写 FC6（mock 未实现写，会超时——验证错误路径）
await window.api.modbus.write('test-panel', { slaveId: 1, functionCode: 6, startAddress: 0, values: [99] })
// 期望: { ok: false, error: '...' }

// 4. 关闭
await window.api.modbus.close('test-panel')
// 期望: undefined

// 5. 状态
await window.api.modbus.status('test-panel')
// 期望: 'closed'
```

全部符合预期即阶段 1 功能验收通过。

- [ ] **Step 4: 清理临时脚本**

删除 `scripts/mock-modbus-slave.js`（不提交）。

- [ ] **Step 5: 跑全量测试 + typecheck 收尾**

运行：`npm run typecheck && npm test`
预期：全部 PASS。

- [ ] **Step 6: 提交（若有遗留改动）**

```bash
git status
# 若无改动则跳过；否则：
git add -A
git commit -m "chore(modbus): phase 1 verification complete"
```

---

## 阶段 1 完成标准

- [ ] `modbus-serial` 依赖已加，`npm run build` 能打包
- [ ] `shared/types.ts` 含完整 Modbus 类型段 + `ModbusAPI` + `WindowAPI.modbus`
- [ ] `electron/modbusService.ts` 实现：`readOnce`/`writeOnce`/`applyPolls`/`ensureModbusOpen`/`closeModbus`/`translateModbusError`，全部可注入、可单测
- [ ] `test/modbus-service.test.ts` + `test/modbus-ipc.test.ts` 全绿（17+ 条）
- [ ] `electron/main.ts` 注册 `modbus:*` IPC、注入 broadcaster、退出清理
- [ ] `electron/preload.ts` 暴露 `modbus` 域
- [ ] `src/shared/dev/mock-api.ts` 含 `modbus` 桩
- [ ] DevTools 手动验证：连 mock 从站 → 读 FC3 成功 → 关闭
- [ ] RTU/ASCII 在 `ensureModbusOpen` 中留显式占位（抛"阶段 3 实现"），不静默失败
