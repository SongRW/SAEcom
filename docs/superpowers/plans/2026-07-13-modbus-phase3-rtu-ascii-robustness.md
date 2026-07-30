# Modbus 支持 — 阶段 3：RTU/ASCII 变体 + 连接健壮性 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Modbus 面板支持 RTU 与 ASCII 串口变体（阶段 1/2 留的占位桩），并修复 TCP 从站中途断开时主站不感知的健壮性缺口（`isOpen` 轮询 + 读超时事件）。

**Architecture:** `ensureModbusOpen` 的 `rtu`/`ascii` 分支调用 modbus-serial 的 `connectRTUBuffered(path, opts)` / `connectAsciiSerial(path, opts)`（与 TCP 同一 `ModbusRTU` 构造器，无需新导入）。连接健壮性：在 `applyPolls` 的每次轮询读前检查 `client.isOpen`，断开则标记区块 error + 广播连接级 error 事件；同时给 client 注册 `on('close')`/`on('error')` 监听（虽对 TCP 不可靠，但对 RTU/serialport 的 close 有效，作为 best-effort 补充）。

**Tech Stack:** TypeScript / `modbus-serial` v8 / `serialport` v12 / Vitest / Playwright

**Spec:** `docs/superpowers/specs/2026-07-06-modbus-support-design.md`（第 4.1 节错误处理 + 第 3.1 节 RTU/ASCII 句柄说明）

**阶段 1/2 已就绪：** `electron/modbusService.ts` 的 `ensureModbusOpen`（RTU/ASCII 在第 222-227 行抛占位错）、`applyPolls`、`readOnce`/`writeOnce`、`closeModbus`；UI 的 `ModbusConnectBar`（RTU/ASCII 选项 disable + tooltip"阶段 3 支持"）；`ModbusConnectOptions` 类型已含 `serialPath/baudRate/dataBits/stopBits/parity`。

**关键技术约束（来自探索）：**
- modbus-serial v8 的 TcpPort 在 socket error 时**不 re-emit error 事件**，且 close 被 `openFlag` 抑制——`client.on('error'/'close')` 对 TCP 断开不可靠。可靠检测靠 `client.isOpen` 轮询 + 读超时。
- `client.on('close'/'error')` 对 RTU（serialport 底层）有效，作为 best-effort 监听仍值得注册。
- RTU/ASCII 无硬件 E2E 不可行（需 com0com 驱动）。单测用 mock client；客户端逻辑用 `ModbusRTU.TestPort`（内存端口）。

---

## 文件结构

| 文件 | 责任 | 操作 |
|---|---|---|
| `electron/modbusService.ts` | RTU/ASCII 连接分支 + `isOpen` 轮询检查 + client close/error 监听 | 修改（第 222-227、125-160 行） |
| `src/features/modbus-panel/components/ModbusConnectBar.tsx` | 启用 RTU/ASCII 选项 + 串口参数字段 | 修改 |
| `test/modbus-service.test.ts` | RTU/ASCII 连接单测 + isOpen 降级单测 | 修改 |

---

## Task 1: RTU/ASCII 连接分支实现（TDD）

**Files:**
- Modify: `electron/modbusService.ts`（第 222-227 行占位 → 真实实现）
- Modify: `test/modbus-service.test.ts`（补 mock client 的 RTU/ASCII 方法 + 连接单测）

- [ ] **Step 1: 扩展 mock client 支持 RTU/ASCII**

在 `test/modbus-service.test.ts` 的 `makeMockClient()` 里加：
```ts
    connectRTUBuffered: vi.fn().mockResolvedValue(undefined),
    connectAsciiSerial: vi.fn().mockResolvedValue(undefined),
```

- [ ] **Step 2: 写失败测试**

在 `test/modbus-service.test.ts` 的 `ensureModbusOpen / closeModbus` describe 块末尾追加：
```ts
  it('RTU 连接：调用 connectRTUBuffered 并传 serialPath + 串口参数', async () => {
    const fakeClient = makeMockClient()
    setModbusClientFactory(async () => fakeClient)
    const r = await ensureModbusOpen('p1', {
      variant: 'rtu', serialPath: 'COM3', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none',
    })
    expect(r.ok).toBe(true)
    expect(fakeClient.connectRTUBuffered).toHaveBeenCalledWith('COM3', expect.objectContaining({
      baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none',
    }))
    expect(modbusClients.get('p1')?.status).toBe('open')
  })

  it('ASCII 连接：调用 connectAsciiSerial', async () => {
    const fakeClient = makeMockClient()
    setModbusClientFactory(async () => fakeClient)
    const r = await ensureModbusOpen('p1', {
      variant: 'ascii', serialPath: '/dev/ttyUSB0', baudRate: 19200, dataBits: 7, stopBits: 1, parity: 'even',
    })
    expect(r.ok).toBe(true)
    expect(fakeClient.connectAsciiSerial).toHaveBeenCalledWith('/dev/ttyUSB0', expect.objectContaining({
      baudRate: 19200, parity: 'even',
    }))
  })

  it('RTU 连接失败：返回 ok:false，发 error 事件，不进入注册表', async () => {
    const fakeClient = makeMockClient()
    fakeClient.connectRTUBuffered.mockRejectedValue(new Error('权限不足'))
    setModbusClientFactory(async () => fakeClient)
    const events: any[] = []
    setModbusBroadcaster((_ch, payload) => events.push(payload))
    const r = await ensureModbusOpen('p1', { variant: 'rtu', serialPath: 'COM9', baudRate: 9600 })
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/权限不足/)
    expect(modbusClients.has('p1')).toBe(false)
    expect(events.some((e) => e.type === 'error')).toBe(true)
  })
```

- [ ] **Step 3: 跑测试确认失败**

`npx vitest run test/modbus-service.test.ts` → 3 条新用例 FAIL（仍抛"阶段 3 实现"占位错）。

- [ ] **Step 4: 实现 RTU/ASCII 分支**

`electron/modbusService.ts` 第 222-227 行，把占位 `throw` 替换为真实连接。整个 variant 分支改为：
```ts
    if (opts.variant === 'tcp') {
      await withTimeout(
        client.connectTCP(opts.tcpHost, { port: opts.tcpPort ?? 502 }),
        CONNECT_TIMEOUT_MS,
        `Modbus TCP 连接超时 (${opts.tcpHost}:${opts.tcpPort ?? 502})`
      )
    } else if (opts.variant === 'rtu') {
      if (!opts.serialPath) throw new Error('RTU 缺少 serialPath')
      await withTimeout(
        client.connectRTUBuffered(opts.serialPath, {
          baudRate: opts.baudRate ?? 9600,
          dataBits: opts.dataBits ?? 8,
          stopBits: opts.stopBits ?? 1,
          parity: opts.parity ?? 'none',
        }),
        CONNECT_TIMEOUT_MS,
        `Modbus RTU 连接超时 (${opts.serialPath})`
      )
    } else if (opts.variant === 'ascii') {
      if (!opts.serialPath) throw new Error('ASCII 缺少 serialPath')
      await withTimeout(
        client.connectAsciiSerial(opts.serialPath, {
          baudRate: opts.baudRate ?? 19200,
          dataBits: opts.dataBits ?? 7,
          stopBits: opts.stopBits ?? 1,
          parity: opts.parity ?? 'even',
        }),
        CONNECT_TIMEOUT_MS,
        `Modbus ASCII 连接超时 (${opts.serialPath})`
      )
    }
```

- [ ] **Step 5: 跑测试确认通过**

`npx vitest run test/modbus-service.test.ts` → 全部 PASS。

- [ ] **Step 6: typecheck + 提交**

```bash
npm run typecheck
git add electron/modbusService.ts test/modbus-service.test.ts
git commit -m "feat(modbus): implement RTU/ASCII connect branches in ensureModbusOpen"
```

---

## Task 2: 连接健壮性 — client close/error 监听 + isOpen 轮询检查

修复阶段 2 E2E 发现的"从站断开主站不感知"缺口。

**Files:**
- Modify: `electron/modbusService.ts`
- Modify: `test/modbus-service.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/modbus-service.test.ts` 末尾加一个新 describe 块：
```ts
describe('连接健壮性（断开检测）', () => {
  beforeEach(() => {
    modbusClients.clear()
    vi.useRealTimers()
  })

  it('client 触发 close 事件时广播 modbus:event close + 清轮询', async () => {
    const fakeClient = makeMockClient()
    fakeClient.isOpen = true
    // 让 on('close') 可触发
    const handlers: Record<string, Function> = {}
    fakeClient.on = vi.fn((event: string, cb: Function) => { handlers[event] = cb; return fakeClient })
    setModbusClientFactory(async () => fakeClient)

    const events: any[] = []
    setModbusBroadcaster((_ch, payload) => events.push(payload))

    await ensureModbusOpen('p1', { variant: 'tcp', tcpHost: 'x', tcpPort: 502 })
    // 注入一个轮询 timer
    modbusClients.get('p1')!.polls.set('b1', { block: { id: 'b1', slaveId: 1, functionCode: 3, startAddress: 0, quantity: 1 } as any, timer: setInterval(() => {}, 100000) })

    // 模拟底层断开触发 close
    handlers['close']?.()

    expect(events.some((e) => e.type === 'close')).toBe(true)
    // 轮询 timer 应被清除
    const entry = modbusClients.get('p1')
    expect(entry?.polls.size).toBe(0)
  })

  it('client 触发 error 事件时广播 modbus:event error', async () => {
    const fakeClient = makeMockClient()
    fakeClient.isOpen = true
    const handlers: Record<string, Function> = {}
    fakeClient.on = vi.fn((event: string, cb: Function) => { handlers[event] = cb; return fakeClient })
    setModbusClientFactory(async () => fakeClient)

    const events: any[] = []
    setModbusBroadcaster((_ch, payload) => events.push(payload))

    await ensureModbusOpen('p1', { variant: 'tcp', tcpHost: 'x', tcpPort: 502 })
    handlers['error']?.(new Error('socket hang up'))

    expect(events.some((e) => e.type === 'error' && e.message?.includes('socket hang up'))).toBe(true)
  })

  it('轮询读前检查 isOpen：断开时跳过读并广播区块 error', async () => {
    const fakeClient = makeMockClient()
    fakeClient.isOpen = false  // 模拟已断开
    fakeClient.readHoldingRegisters.mockResolvedValue({ data: [1] })
    setModbusClientFactory(async () => fakeClient)

    const events: any[] = []
    setModbusBroadcaster((_ch, payload) => events.push(payload))

    const entry: any = {
      panelId: 'p1', variant: 'tcp', client: fakeClient,
      connectOptions: { variant: 'tcp' }, polls: new Map(), status: 'open',
    }
    modbusClients.set('p1', entry)

    applyPolls('p1', [{ id: 'b1', slaveId: 1, functionCode: 3, startAddress: 0, quantity: 1, pollEnabled: true, pollIntervalMs: 1000, displayFormat: 'signed' } as any])
    await vi.advanceTimersByTimeAsync(0)

    // isOpen=false → 不应调用 readHoldingRegisters
    expect(fakeClient.readHoldingRegisters).not.toHaveBeenCalled()
    // 应广播区块级 error
    const blockUpdate = events.find((e) => e.blockId === 'b1')
    expect(blockUpdate?.error).toBeTruthy()
  })
})
```

注意：第三个测试需要 fake timers（`vi.useFakeTimers()`）——在 beforeEach 里设为 real，单独在这个 it 里用 `vi.useFakeTimers()` 并在 afterEach 或 it 末尾 `vi.useRealTimers()`。或把这条单独放一个带 `beforeEach(useFakeTimers)` 的 describe。

- [ ] **Step 2: 跑测试确认失败**

`npx vitest run test/modbus-service.test.ts` → 新用例 FAIL（`on` 未被调用 / isOpen 未检查）。

- [ ] **Step 3: 实现健壮性逻辑**

在 `electron/modbusService.ts`：

3a. 在 `ensureModbusOpen` 成功连接后（`entry.status = 'open'` 之前），注册 close/error 监听：
```ts
    // 注册 close/error 监听（best-effort：TCP 下不可靠，RTU/serialport 下有效）。
    // TCP 断开的可靠检测靠 applyPolls 的 isOpen 轮询检查（见下）。
    entry.client.on?.('close', () => {
      if (modbusClients.get(panelId) !== entry) return // 已被 closeModbus 接管
      for (const p of entry.polls.values()) { if (p.timer) clearInterval(p.timer) }
      entry.polls.clear()
      entry.status = 'closed'
      broadcast('modbus:event', { id: panelId, type: 'close' })
    })
    entry.client.on?.('error', (err: any) => {
      if (modbusClients.get(panelId) !== entry) return
      entry.status = 'error'
      entry.lastError = String(err?.message ?? err)
      broadcast('modbus:event', { id: panelId, type: 'error', message: String(err?.message ?? err) })
    })
```

3b. 在 `applyPolls` 的 `doRead` 闭包开头，加 `isOpen` 检查（在 `try` 之前）：
```ts
    const doRead = async () => {
      // 连接已断开（isOpen=false）则跳过读，标记区块 error，避免无谓超时。
      // 这是 TCP 断开的可靠检测手段（modbus-serial v8 的 close/error 事件对 TCP 不可靠）。
      if (entry.client?.isOpen === false) {
        const update: ModbusBlockUpdate = {
          panelId, blockId: block.id, values: [], ts: Date.now(),
          error: '连接已断开',
        }
        broadcast('modbus:data', update)
        return
      }
      try {
        // ... 原有 readOnce 逻辑不变
```

- [ ] **Step 4: 跑测试确认通过**

`npx vitest run test/modbus-service.test.ts` → 全部 PASS。

- [ ] **Step 5: typecheck + 提交**

```bash
npm run typecheck
git add electron/modbusService.ts test/modbus-service.test.ts
git commit -m "fix(modbus): detect mid-connection disconnect via isOpen check + close/error listeners"
```

---

## Task 3: UI 启用 RTU/ASCII（ModbusConnectBar 串口参数字段）

**Files:**
- Modify: `src/features/modbus-panel/components/ModbusConnectBar.tsx`
- Modify: `src/features/serial-panel/components/NewPanelDialog.tsx`

- [ ] **Step 1: ModbusConnectBar — 去掉 RTU/ASCII 的 disable，加串口参数字段**

当前 RTU/ASCII SelectItem 是 `disabled` + tooltip"阶段 3 支持"。改为：
- 去掉 `disabled`。
- 当 variant 是 `rtu`/`ascii` 时，显示串口参数字段（serialPath Select from `ipc.serial.list()` 已知的端口列表 + baudRate/dataBits/parity/stopBits 输入/选择），替代 TCP 的 host/port 字段。
- variant 切换时调用 `setModbusConnectOptions(panel.id, {...connectOptions, variant, serialPath, baudRate, ...})`。
- RTU 默认 baudRate 9600/dataBits 8/parity none/stopBits 1；ASCII 默认 baudRate 19200/dataBits 7/parity even（典型 ASCII 配置）。

参照 `NewPanelDialog` 的 serial 字段渲染模式获取端口列表（它用 `knownPorts` from store）。

- [ ] **Step 2: NewPanelDialog — modbus 创建支持选变体 + 串口参数**

当前 modbus 创建分支只填 TCP host/port。扩展为：modbus mode 下也有变体选择（TCP/RTU/ASCII），TCP 显示 host/port，RTU/ASCII 显示串口选择 + 参数。`handleConfirm` 的 modbus 分支根据 variant 构建不同的 `connectOptions` 和 `id`：
- TCP: `id = modbus://tcp/host:port`
- RTU: `id = modbus://rtu/path`
- ASCII: `id = modbus://ascii/path`

- [ ] **Step 3: typecheck + build + 提交**

```bash
npm run typecheck && npm run build
git add src/features/modbus-panel/components/ModbusConnectBar.tsx src/features/serial-panel/components/NewPanelDialog.tsx
git commit -m "feat(modbus-panel): enable RTU/ASCII variant selection with serial params"
```

---

## Task 4: E2E 回归 — 确认 TCP 流程仍绿 + 新增断开检测 E2E

**Files:**
- Create: `e2e/modbus-disconnect.spec.ts`

- [ ] **Step 1: 新增断开检测 E2E**

复用 `startModbusSlave`。流程：
1. 创建 modbus TCP 面板 + 连接 + 加区块（pollEnabled, interval 500ms）
2. 等 1 个周期确认值到达
3. `slave.close()`（停从站）
4. 等 2-3 个周期（轮询的 isOpen 检查或读超时触发）
5. 断言区块状态列出现 ⚠ / error（面板感知到断开）

- [ ] **Step 2: 跑全部 modbus E2E 确认无回归**

`npx playwright test e2e/modbus-ipc.spec.ts e2e/modbus-panel-basic.spec.ts e2e/modbus-panel-poll.spec.ts e2e/modbus-panel-csv.spec.ts e2e/modbus-disconnect.spec.ts`

- [ ] **Step 3: 提交**

```bash
git add e2e/modbus-disconnect.spec.ts
git commit -m "test(modbus): e2e for mid-connection disconnect detection"
```

---

## 阶段 3 完成标准

- [ ] `ensureModbusOpen` 的 rtu/ascii 分支调用 `connectRTUBuffered`/`connectAsciiSerial`
- [ ] `applyPolls` 每次读前检查 `client.isOpen`，断开时标记区块 error
- [ ] `ensureModbusOpen` 注册 `client.on('close')`/`on('error')`（best-effort）
- [ ] UI 可选 RTU/ASCII 变体 + 串口参数字段
- [ ] 单测覆盖：RTU/ASCII 连接、isOpen 降级、close/error 事件
- [ ] E2E：断开检测 + 全部既有 modbus E2E 无回归
- [ ] `npm run typecheck` + `npm run build` 通过
