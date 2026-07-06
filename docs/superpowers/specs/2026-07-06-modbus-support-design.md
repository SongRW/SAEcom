# Modbus 支持设计

**日期**: 2026-07-06
**状态**: 待实现
**主题**: 为窗口栏（串口面板）与脚本页（Rete 节点图）新增 Modbus 支持：新增 `modbus` 面板类型（主站 + 寄存器视图）与两个脚本节点（读/写）。

## 目标

为 SAEcom 增加 Modbus 主站能力，覆盖 RTU / TCP / ASCII 三种变体：

- **窗口栏**：新增 `modbus` 面板类型。用户配置连接（串口参数或 TCP 主机端口）与若干"区块"（slaveId + 功能码 + 起始地址 + 数量），面板作为主站周期轮询或手动读取寄存器/线圈，结果以多区块表格展示，支持手动写入与 CSV 映射导入/导出。体验对标 Modbus Poll。
- **脚本页**：新增 `modbus-read`、`modbus-write` 两个 Rete 节点，复用面板已打开的 Modbus 连接，支持 FC1/2/3/4 读与 FC5/6/15/16 写。

### 非目标（本期不做）

- Modbus 从站（slave/server）模式——本期只做主站。
- Modbus over UDP / Modbus Gateway。
- 寄存器值的图表/趋势曲线（与 oscilloscope 的集成留待将来）。
- 自动扫描从站地址。
- 多主站共享同一连接的复杂调度——一个面板 = 一个独立 client。

## 用户需求决策记录

| 决策点 | 选择 |
|---|---|
| 传输变体 | RTU + TCP + ASCII 三种全支持 |
| 协议层实现 | 引入第三方库 `modbus-serial` |
| 窗口栏形态 | 新增 `modbus` 面板类型，主站 + 多区块寄存器视图 |
| 轮询 | 手动 + 可选每区块自动轮询 |
| 连接复用 | 独立连接（modbus 面板自己打开一个 client，不复用 `ports` 表句柄） |
| 功能码 | FC1/2/3/4（读）+ FC5/6/15/16（写） |
| 脚本节点粒度 | 两个节点（读/写），节点内选择功能码 |
| 脚本连接管理 | 复用面板已打开的 Modbus 连接（沙箱直连 `modbusClients` 注册表） |
| 架构方案 | 方案 A 主进程中心化（镜像现有 `ports` 表模式） |
| CSV 映射 | 支持区块配置的导入/导出（非实时值快照），导入为追加语义 |

## 第 1 节：整体架构（方案 A：主进程中心化）

与现有 `ports` 表模式同构。主进程持有 `modbusClients` 注册表，`modbus-serial` 的 client 实例、轮询定时器、CRC/MBAP 解码都在主进程完成；主进程通过 `modbus:data` 事件把**已解码的寄存器/线圈值数组**推给渲染进程。脚本沙箱直接获得 `modbusRead`/`modbusWrite` 函数，像 `sendToSerial` 一样命中同一注册表，无 IPC 往返。

```
┌─────────────────────── Electron Main ───────────────────────┐
│                                                              │
│  modbusClients: Map<panelId, ModbusClientEntry>              │
│    ├─ client: modbus-serial 实例                              │
│    ├─ variant: 'rtu' | 'tcp' | 'ascii'                       │
│    ├─ polls: Map<blockId, { block, timer }>                  │
│    ├─ status: 'closed'|'opening'|'open'|'error'              │
│    └─ lastError?: string                                      │
│                                                              │
│  IPC channels:                                               │
│    modbus:open / modbus:close / modbus:read (手动) /         │
│    modbus:write / modbus:setPolls / modbus:status            │
│    事件: modbus:data (解码后的值) / modbus:event (open/err)  │
│                                                              │
│  脚本沙箱新增函数:                                            │
│    modbusRead(panelId, fc, slaveId, addr, qty)               │
│    modbusWrite(panelId, fc, slaveId, addr, values)           │
│    (命中同一 modbusClients 表)                                │
└──────────────────────────────────────────────────────────────┘
          │ modbus:data broadcast            ▲ scripts.run() in vm
          ▼                                  │ sandbox calls
┌──── Renderer (Modbus 面板) ───┐    ┌──── Script Editor ────┐
│  PanelType = 'modbus'          │    │  modbus-read 节点     │
│  ├─ 连接配置 (变体/参数)        │    │  modbus-write 节点    │
│  ├─ 轮询区块列表 (多区块)       │    │  codegen → modbusRead/│
│  ├─ 寄存器表格 (每区块一个)     │    │   Write(...)          │
│  └─ 手动读写工具栏              │    └───────────────────────┘
└────────────────────────────────┘
```

**核心原则**：

1. **镜像 `ports` 模式**——主进程持有 `modbusClients` 注册表，与 `ports` 平行存在但独立。
2. **一个面板 = 一个 client**——每个 Modbus 面板打开自己的 `modbus-serial` client（独立连接）。
3. **轮询在主进程**——定时器存活不依赖渲染进程，面板隐藏/弹出时仍刷新。
4. **脚本直连**——沙箱函数直接命中 `modbusClients`，与 `sendToSerial` 命中 `ports` 完全对称，无 IPC 往返。

## 第 2 节：Modbus 面板的数据模型与 UI

### 2.1 类型扩展（`shared/types.ts`）

```ts
export type PanelType = 'serial' | 'tcp' | 'modbus'        // 新增 'modbus'

export type ModbusVariant = 'rtu' | 'tcp' | 'ascii'

// Modbus 连接参数（独立于 SerialOpenOptions，因为 modbus-serial 自己管连接）
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

// 一个轮询/显示区块
export interface ModbusBlock {
  id: string                      // uuid
  title?: string                  // 用户备注，如"温度区"
  slaveId: number                 // 1-247
  functionCode: 1 | 2 | 3 | 4     // 只读区块用 FC1-4
  startAddress: number            // 0-65535
  quantity: number                // 读取数量
  pollEnabled: boolean            // 是否自动轮询
  pollIntervalMs: number          // 轮询间隔，默认 1000
  // float32 用 4 字节序覆盖 Modbus 设备全部常见排列，每 2 寄存器 → 1 个浮点值
  displayFormat: 'signed' | 'unsigned' | 'hex' | 'binary'
    | 'float32'         // big-endian, ABCD（标准顺序）
    | 'float32-swapped' // 字交换, CDAB（多数 PLC 常见）
    | 'float32-byte'    // 字节交换, BADC
    | 'float32-word-byte' // 字+字节交换, DCBA
}

// 写操作（手动）—— FC5/6/15/16
export type ModbusWriteTarget = {
  slaveId: number
  functionCode: 5 | 6 | 15 | 16
  startAddress: number
  values: number[]                // 寄存器值(FC6/16传1个,FC16传多个) 或线圈(0/1)
}

// 主进程 → 渲染进程的解码结果事件
export interface ModbusBlockUpdate {
  panelId: string
  blockId: string
  values: number[]                // 寄存器 或 线圈(0/1) 解码后的数组
  ts: number
  error?: string                  // 解码/超时错误
}

export interface ModbusEvent {
  id: string
  type: 'open' | 'close' | 'error'
  message?: string
}
```

### 2.2 `window.api` 扩展（`ModbusAPI`）

```ts
export interface ModbusAPI {
  open(panelId, options: ModbusConnectOptions): Promise<{ ok: boolean; message?: string }>
  close(panelId): Promise<void>
  read(panelId, slaveId, fc: 1|2|3|4, addr, qty): Promise<{ values: number[]; error?: string }>
  write(panelId, target: ModbusWriteTarget): Promise<{ ok: boolean; error?: string }>
  setPolls(panelId, blocks: ModbusBlock[]): Promise<void>
  status(panelId): Promise<'closed' | 'opening' | 'open' | 'error'>
  onData(cb: (u: ModbusBlockUpdate) => void): () => void    // modbus:data
  onEvent(cb: (e: ModbusEvent) => void): () => void         // modbus:event
}
```

### 2.3 面板 UI 布局

Modbus 面板复用 `FloatingPane` 的外壳（拖拽/缩放/弹出/置顶），但主体内容用专用的 `ModbusPanelBody`，不是 `DataDisplay + SendBar`：

```
┌─ FloatingPane (header: 标题 | 连接状态徽章 | 打开/关闭 | 置顶 | 弹出 | 隐藏) ─┐
│                                                                              │
│  ┌─ 连接条 (未连接时展开, 已连接时收起) ──────────────────────────────────┐  │
│  │ 变体: [RTU ▾]  串口:[COM3▾] 波特:[9600]  /  主机:___ 端口:502        │  │
│  │ [连接]   状态: ● 已连接 / ○ 未连接 / ⚠ 错误: timeout                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─ 工具栏 ─────────────────────────────────────────────────────────────┐  │
│  │ [+ 新增区块] [手动读写…] [全部立即刷新] [暂停所有轮询]                │  │
│  │ [导入映射] [导出映射]                                                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─ 区块表格 (可滚动, 每个区块一张表) ───────────────────────────────────┐  │
│  │ ▼ 温度区  从站:1 FC3 起始:0 数量:8 [▶轮询1s] [刷新] [编辑] [删除]    │  │
│  │  地址    值        格式          上次更新          状态               │  │
│  │  40001   23.5      float32-sw    14:23:01.123      ✓                 │  │
│  │  40003   24.1      float32-sw    14:23:01.123      ✓                 │  │
│  │  ...                                                                  │  │
│  │  ├─ 区块2 (收起)  从站:2 FC1 起始:0 数量:16 ...                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─ 手动读写抽屉 (点[手动读写…]展开) ────────────────────────────────────┐  │
│  │ 操作: [读 ▾] 从站:[1] 功能码:[FC3 保持寄存器 ▾] 起始:[0] 数量:[8]    │  │
│  │       [执行]  结果: [23, 52428, ...]  或  写: 值 [___] [执行]        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**关键交互**：

- **多区块表格**：每个 `ModbusBlock` 渲染为一张可折叠表。轮询开启时主进程定时推送 `ModbusBlockUpdate`，表格对应行刷新。
- **点击单元格写值**（FC6/FC5 场景）：双击寄存器单元格 → 弹出小输入框 → 写单个值。
- **地址显示**：按功能码自动加 Modbus 地址前缀（FC1→0x, FC2→1x, FC4→3x, FC3→4x），如 `40001`。
- **格式列**：按 `displayFormat` 渲染（signed/unsigned/hex/binary/float32）。float32 会消费 2 个连续寄存器。
- **状态列**：✓ 成功 / ⚠ 错误（鼠标悬停显示 `error` 文本）/ ○ 未读取。

### 2.4 CSV 寄存器映射导入/导出

CSV 的对象是**区块配置**（`ModbusBlock[]`），不是实时值快照——用户可保存一套寄存器映射模板复用。

**导出格式**（一个文件 = 一个面板的全部区块）：

```csv
title,slaveId,functionCode,startAddress,quantity,pollEnabled,pollIntervalMs,displayFormat
温度区,1,3,0,8,true,1000,float32-swapped
阀门状态,1,1,100,16,true,500,unsigned
电流,2,3,0,4,true,2000,float32
手动区,1,4,10,10,false,1000,signed
```

**导入行为**：

- 列名严格匹配上述 header（缺少的列用默认值，如 `pollEnabled` 缺失则 `false`）。
- `id` 不导入——导入时重新生成 uuid。
- 导入是**追加**到现有区块列表（不是替换），避免误删现有配置；导入后用户可手动删旧区块。
- 校验：`slaveId` 1-247、`functionCode` ∈ {1,2,3,4}、`quantity` 1-2000（Modbus 单次读上限），非法行跳过并在 UI 提示跳过行数。

**UI 入口**：工具栏的 `[导入映射]` / `[导出映射]` 按钮。导出用面板名作为默认文件名。CSV 的解析与序列化做成纯函数（`src/features/modbus-panel/csv.ts`），便于单元测试。

### 2.5 与现有面板架构的集成点

| 现有概念 | Modbus 面板处理 |
|---|---|
| `Panel.type` | 新增 `'modbus'` 分支 |
| `FloatingPane` | 复用外壳；内部按 `type` 分支：`serial/tcp` → 现有 `DataDisplay+SendBar`，`modbus` → 新 `ModbusPanelBody` |
| `useSerialDataBus` | 不接管 modbus 面板的数据——modbus 有独立的 `useModbusDataBus` 监听 `modbus:data`，按 `(panelId, blockId)` 路由到对应区块。值缓存（最近一次 `values` + `ts` + `error`）保存在渲染进程的 modbus store（`modbus-panel/store.ts`），不持久化 |
| `PanelChunk`/`chunks`/`viewMode` | modbus 面板不用这些（无原始字节流展示） |
| `PaneList`（左侧面板列表） | modbus 面板正常出现在列表，图标/标签区分 |
| `NewPanelDialog` | 新增"Modbus"选项卡 |
| 持久化 (`panels.json`) | modbus 面板保存 `type:'modbus'` + 连接参数 + 区块配置；不保存实时值 |
| 弹出窗口 (`panel.html`/popout) | modbus 面板支持弹出，复用现有 popout 机制 |

## 第 3 节：主进程 Modbus 服务 + 脚本节点

### 3.1 主进程 Modbus 服务（`electron/main.ts`）

新增与 `ports` 平行的注册表：

```ts
interface ModbusClientEntry {
  panelId: string
  variant: ModbusVariant
  client: any                 // modbus-serial 实例
  connectOptions: ModbusConnectOptions
  polls: Map<string, { block: ModbusBlock; timer: NodeJS.Timeout | null }>
  status: 'closed' | 'opening' | 'open' | 'error'
  lastError?: string
}

const modbusClients = new Map<string, ModbusClientEntry>()

// 打开连接（镜像 ensureSerialOpen 的结构）
async function ensureModbusOpen(panelId, opts: ModbusConnectOptions): Promise<{ ok: boolean; message?: string }> {
  // 已存在则先关
  // 按 variant 选择 client 工厂：
  //   rtu/ascii → modbus-serial 自己 open 一个新 SerialPort（独立连接，不复用 ports 表）
  //   tcp       → connectTCP(host, port)
  // 连接成功后 status='open'，发 'modbus:event' {type:'open'}
  // 失败则 status='error'，发 'modbus:event' {type:'error', message}
}

async function closeModbus(panelId) {
  // 清所有 poll timers → client.close() → 从表删除 → 发 'modbus:event' {type:'close'}
}
```

**RTU/ASCII 的 serialport 句柄**：`modbus-serial` 的 RTU/ASCII 模式自管一个底层 `serialport` 实例。由于选了"独立连接"，让它自己创建并管理，不复用 `ports` 表。Modbus 面板的串口与原始串口面板互不干扰——但物理上同一 COM 口不能被两者同时打开（OS 级约束，UI 在打开失败时提示"端口被占用"）。`modbus-serial` 全权负责 CRC/ASCII 帧的拼装与解析、超时、重试。

### 3.2 轮询机制

```ts
function applyPolls(panelId, blocks: ModbusBlock[]) {
  const entry = modbusClients.get(panelId); if (!entry) return
  // 清除所有现有 timers
  for (const p of entry.polls.values()) { clearInterval(p.timer); p.timer = null }
  entry.polls.clear()
  // 为每个 block 建立条目；pollEnabled=true 的立即读一次 + 启动 interval
  for (const block of blocks) {
    const doRead = async () => {
      try {
        const values = await readOnce(entry, block)
        sendAll('modbus:data', { panelId, blockId: block.id, values, ts: Date.now() })
      } catch (e) {
        sendAll('modbus:data', { panelId, blockId: block.id, values: [], ts: Date.now(), error: String(e) })
      }
    }
    const timer = block.pollEnabled ? setInterval(doRead, Math.max(50, block.pollIntervalMs)) : null
    entry.polls.set(block.id, { block, timer })
    if (block.pollEnabled) doRead()  // 立即首次读
  }
}

// 单次读（核心，脚本沙箱也复用）
async function readOnce(entry: ModbusClientEntry, block: { slaveId, functionCode, startAddress, quantity }): Promise<number[]> {
  const c = entry.client
  c.setID(block.slaveId)
  c.setTimeout(2000)   // 默认 2s，可配置
  switch (block.functionCode) {
    case 1: { const r = await c.readCoils(block.startAddress, block.quantity); return r.array.map(b => b ? 1 : 0) }
    case 2: { const r = await c.readDiscreteInputs(block.startAddress, block.quantity); return r.array.map(b => b ? 1 : 0) }
    case 3: { const r = await c.readHoldingRegisters(block.startAddress, block.quantity); return Array.from(r.array) }
    case 4: { const r = await c.readInputRegisters(block.startAddress, block.quantity); return Array.from(r.array) }
  }
}
```

**轮询健壮性**：

- modbus-serial 自带并发排队（同一 client 上的请求串行化），轮询与手动读/写不会交叉损坏帧。
- 单次读失败（超时/CRC 错）只标记该区块 `error`，不影响其他区块。
- 轮询定时器用 `setInterval`，存活不依赖渲染进程——面板隐藏/弹出时仍刷新，面板恢复时一次性推送最新 `lastValues`。

### 3.3 IPC 通道（`electron/main.ts` + `preload.ts`）

```ts
// main.ts —— ipcMain.handle 注册（镜像 serial:* 组）
ipcMain.handle('modbus:open',    (_e, panelId, opts) => ensureModbusOpen(panelId, opts))
ipcMain.handle('modbus:close',   (_e, panelId) => closeModbus(panelId))
ipcMain.handle('modbus:read',    (_e, panelId, slaveId, fc, addr, qty) => /* readOnce 包装 */)
ipcMain.handle('modbus:write',   (_e, panelId, target) => writeOnce(...))
ipcMain.handle('modbus:setPolls',(_e, panelId, blocks) => applyPolls(panelId, blocks))
ipcMain.handle('modbus:status',  (_e, panelId) => modbusClients.get(panelId)?.status ?? 'closed')

// preload.ts —— contextBridge（镜像 serial 域）
modbus: {
  open: (panelId, opts) => ipcRenderer.invoke('modbus:open', panelId, opts),
  // ...
  onData: (cb) => { const h = (_e, u: ModbusBlockUpdate) => cb(u); ipcRenderer.on('modbus:data', h); return () => ipcRenderer.off('modbus:data', h) },
  onEvent: (cb) => { /* 同上, 'modbus:event' */ }
}
```

### 3.4 脚本沙箱函数（`electron/main.ts` 的 vm sandbox）

沙箱新增两个函数，**直接命中 `modbusClients` 注册表**（与 `sendToSerial` 命中 `ports` 完全对称，零 IPC 往返）：

```ts
// sandbox 对象新增（main.ts ~1667 行附近）
modbusRead: async (panelId: string, fc: number, slaveId: number, addr: number, qty: number) => {
  const entry = modbusClients.get(panelId)
  if (!entry) throw new Error(`Modbus 面板未连接: ${panelId}`)
  return readOnce(entry, { slaveId, functionCode: fc, startAddress: addr, quantity: qty })
},
modbusWrite: async (panelId: string, fc: number, slaveId: number, addr: number, values: number[]) => {
  const entry = modbusClients.get(panelId)
  if (!entry) throw new Error(`Modbus 面板未连接: ${panelId}`)
  return writeOnce(entry, { slaveId, functionCode: fc, startAddress: addr, values })
},
```

**脚本生命周期**：无需像串口那样注册 watcher——Modbus 是请求/响应模型，脚本节点主动调用 `modbusRead/Write` 即可，不需要"监听数据流"。沙箱清理时（`scripts:run` 的 `finally`）无需特殊处理 modbus。

### 3.5 Rete 节点设计

新增一个 `modbus` 节点分类（`NodeCategory` 加 `'modbus'`），含两个节点：

**节点 1：`modbus-read`（Modbus 读取）**

```ts
// nodes/definitions/modbus.ts
'modbus-read': def('modbus-read', 'modbus', 'Modbus读取', [], [dataOut()], [
  panelControl({ source: 'modbus-panels', label: 'Modbus面板' }),  // 新 source
  selectControl('functionCode', '功能码', [
    { label: 'FC1 读线圈',     value: '1' },
    { label: 'FC2 读离散输入', value: '2' },
    { label: 'FC3 读保持寄存器',value: '3' },
    { label: 'FC4 读输入寄存器',value: '4' },
  ], '3'),
  numberControl('slaveId', '从站地址', 1),
  numberControl('startAddress', '起始地址', 0),
  numberControl('quantity', '数量', 1),
]),
```

**节点 2：`modbus-write`（Modbus 写入）**

```ts
'modbus-write': def('modbus-write', 'modbus', 'Modbus写入', [dataIn()], [dataOut()], [
  panelControl({ source: 'modbus-panels', label: 'Modbus面板' }),
  selectControl('functionCode', '功能码', [
    { label: 'FC5 写单线圈',     value: '5' },
    { label: 'FC6 写单寄存器',   value: '6' },
    { label: 'FC15 写多线圈',    value: '15' },
    { label: 'FC16 写多寄存器',  value: '16' },
  ], '6'),
  numberControl('slaveId', '从站地址', 1),
  numberControl('startAddress', '起始地址', 0),
  textControl('values', '值(逗号分隔)'),   // 或接 dataIn
]),
```

**codegen emitter**（`codegen/emit/modbus.ts`）：

```ts
// modbus-read
emitNodeByKey['modbus-read'] = (node, ctx) => {
  const d = node.data
  return `var _out_${node.id} = await modbusRead(${JSON.stringify(d.panel)}, ${d.functionCode}, ${d.slaveId}, ${d.startAddress}, ${d.quantity});`
}

// modbus-write —— 读入端可来自上游节点或配置的 values
emitNodeByKey['modbus-write'] = (node, ctx) => {
  const d = node.data
  const inputVar = getInputVar(node, 'in', ctx) ?? JSON.stringify(parseValues(d.values))
  return `var _out_${node.id} = await modbusWrite(${JSON.stringify(d.panel)}, ${d.functionCode}, ${d.slaveId}, ${d.startAddress}, ${inputVar});`
}
```

**生成的代码示例**（读温度并判断阈值 → 写线圈）：

```js
var _out_read = await modbusRead("panel-modbus-1", 3, 1, 0, 4);
var _out_temp = transformFloat32(_out_read, 'swapped');   // 复用现有 transform 节点
var _out_cmp = _out_temp > 50;
if (_out_cmp) {
  await modbusWrite("panel-modbus-1", 5, 1, 100, [1]);
}
```

### 3.6 共享类型与配置解析的小改动

- `NodeCategory` 联合类型加 `'modbus'`（`shared/types.ts` ~109-118）。
- `ControlSpec.source` 加 `'modbus-panels'`（`shared/types.ts` ~135）。
- `nodes/categories.ts` 加 modbus 分类元数据（颜色，如工业橙）。
- 新增 `nodes/definitions/modbus.ts` + `codegen/emit/modbus.ts`。
- `codegen/registry.ts` 注册 modbus 分发。
- `codegen/index.ts` 的"连续监听根节点"列表**不**包含 modbus 节点（modbus 是同步请求/响应，不是监听器）——这与 `output-serial` 一样属于普通节点。

## 第 4 节：错误处理、测试策略、实现顺序

### 4.1 错误处理

Modbus 比 raw serial 更需要细致的错误处理，因为它是请求/响应模型，失败模式多样：

| 错误场景 | 处理 |
|---|---|
| 连接失败（端口占用/不存在、TCP 拒绝） | `ensureModbusOpen` 返回 `{ok:false, message}`，面板状态徽章显示 `⚠ 错误：端口被占用`，不进入 `modbusClients` 表 |
| 连接中途断开 | `client` 的 `close`/`error` 回调 → `status='error'`，发 `modbus:event`，面板徽章变红；轮询 timers 清空（不再重试，由用户手动重连） |
| 单次读超时（从站无响应） | `readOnce` reject → 该区块 `ModbusBlockUpdate.error='timeout'`，状态列 ⚠；其他区块与后续轮询不受影响 |
| CRC/帧错误（modbus-serial 抛出） | 同超时，归入区块级错误 |
| 非法功能码/地址（从站返回异常码） | modbus-serial 抛出含 `err.modbusExceptionCode`；翻译成可读消息：`从站异常：非法功能码(01)` / `非法地址(02)` / `非法值(03)` / `从站故障(04)`。区块状态列显示 |
| 写入失败 | `writeOnce` reject → 手动读写抽屉显示错误；若来自脚本，抛入沙箱被 `try/catch` 捕获并打到 `scripts:log` |
| 轮询间隔过小（<50ms） | `applyPolls` 用 `Math.max(50, intervalMs)` 兜底，避免打满总线 |
| 物理端口被原始串口面板占用 | `ensureModbusOpen` 报错"端口被占用"——OS 级约束，UI 提示用户关闭冲突面板 |
| 面板关闭/应用退出 | `closeModbus` 在面板 `close` 时调用；`app:flush-requested`（现有退出钩子）时遍历所有 modbus client 关闭，避免句柄泄漏 |

**关键原则**：连接级错误影响整个面板（徽章变红、轮询停）；请求级错误只影响单次/单区块（其他区块继续）。这与现有串口面板的"事件 vs 数据"分流一致。

### 4.2 测试策略

#### 单元测试（Vitest，`test/`）

1. **Modbus CSV 解析/序列化**（`test/modbus-csv.test.ts`）——纯函数，覆盖率最高、最容易测。验证：header 解析、缺列默认值、非法行跳过、往返一致性。
2. **Modbus 地址/格式格式化**（`test/modbus-format.test.ts`）——`FC→地址前缀`（40001 等）、`displayFormat` 解码（float32-swapped 的字节序、signed/unsigned、hex/binary）。
3. **轮询区块的校验**（`test/modbus-block.test.ts`）——`slaveId` 1-247、`quantity` 上限、`functionCode` 合法性。
4. **codegen：modbus 节点 emit**（`test/modbus-codegen.test.ts`）——给定 Rete 节点数据，断言生成的 JS 字符串。镜像现有 script-editor codegen 测试模式。
5. **类型契约**：扩展 `test/script-editor-popout-ipc.test.ts` 或新建 `test/modbus-ipc.test.ts`——验证 `ModbusAPI` 形状与 `window.api.modbus` 一致。

#### 主进程服务（较难单测，因依赖真实串口/TCP）

`modbusClients` 逻辑用**依赖注入**隔离 `modbus-serial`：`ensureModbusOpen`/`readOnce` 接收一个可注入的 client 工厂。测试时传入 mock client（`{setID, setTimeout, readHoldingRegisters: stub.resolves({array:[...]})}` 等），验证轮询触发、错误翻译、timers 清理。避免真实硬件依赖。

#### E2E（Playwright Electron，`e2e/`）

这是 AGENTS.md 的硬性要求。Modbus 面板的 E2E 用 **TCP 变体 + 内置 mock Modbus TCP 从站**（在测试夹具里用 Node 起一个小 TCP server，实现最小 MBAP 响应）：

1. **`e2e/modbus-panel-basic.spec.ts`**：新建 Modbus(TCP) 面板 → 连接 mock 从站 → 状态徽章变绿 → 添加区块（FC3, slave=1, addr=0, qty=4）→ 表格出现 4 行值 → 手动读写抽屉执行一次读 → 结果区显示值数组 → 区块状态列在从站断开时变 ⚠。
2. **`e2e/modbus-panel-poll.spec.ts`**：启用轮询 → 等待 2 个周期 → 验证 `ts` 更新过（值刷新）→ 暂停所有轮询 → `ts` 不再更新。
3. **`e2e/modbus-panel-csv.spec.ts`**：配置几个区块 → 导出 CSV → 删除所有区块 → 导入 CSV → 区块恢复。
4. **`e2e/modbus-script-node.spec.ts`**：在脚本编辑器放一个 `modbus-read` 节点（panel=mock 从站面板, FC3）→ 接 `output-log` → 运行 → 日志面板显示读到的寄存器值。

复用 `e2e/fixtures.ts` 的 app 启动/隔离 userData。mock 从站放 `e2e/helpers/`，与现有 TCP echo server 同结构。

### 4.3 文件改动清单

**新增**：

- `shared/types.ts` 内追加 Modbus 类型段（`ModbusVariant`/`ModbusConnectOptions`/`ModbusBlock`/`ModbusBlockUpdate`/`ModbusWriteTarget`/`ModbusEvent`/`ModbusAPI`，`PanelType`/`NodeCategory`/`ControlSpec.source` 扩展）。
- `src/features/modbus-panel/`（新特性目录）：
  - `types.ts`（域内类型，含 `ModbusPanel` 扩展 `Panel`）
  - `store.ts`（modbus 面板的 zustand store：连接状态、区块、值缓存，独立 store，避免污染串口面板 store）
  - `useModbusDataBus.ts`（监听 `modbus:data`，按 `(panelId,blockId)` 路由）
  - `csv.ts`（纯函数：解析/序列化区块映射）
  - `format.ts`（地址前缀 + displayFormat 解码纯函数）
  - `ModbusPanelBody.tsx`（面板主体：连接条 + 工具栏 + 区块表格 + 手动读写抽屉）
  - `components/ModbusBlockTable.tsx`、`ModbusConnectBar.tsx`、`ModbusManualDrawer.tsx`
- `electron/main.ts` 内新增：`modbusClients` 表、`ensureModbusOpen`/`closeModbus`/`readOnce`/`writeOnce`/`applyPolls`、`ipcMain.handle('modbus:*')`、沙箱 `modbusRead`/`modbusWrite`。
- `electron/preload.ts`：`modbus` 域。
- `src/features/script-editor/nodes/definitions/modbus.ts`。
- `src/features/script-editor/nodes/categories.ts` 加 modbus 分类。
- `src/features/script-editor/codegen/emit/modbus.ts`。
- `src/features/script-editor/codegen/registry.ts` 注册。
- 测试：`test/modbus-csv.test.ts`、`test/modbus-format.test.ts`、`test/modbus-codegen.test.ts`、`test/modbus-block.test.ts`、`test/modbus-ipc.test.ts`。
- E2E：`e2e/modbus-panel-basic.spec.ts`、`e2e/modbus-panel-poll.spec.ts`、`e2e/modbus-panel-csv.spec.ts`、`e2e/modbus-script-node.spec.ts`、`e2e/helpers/mock-modbus-slave.ts`。

**修改**：

- `package.json`：加 `modbus-serial` 依赖。
- `src/features/serial-panel/components/FloatingPane.tsx`：`type==='modbus'` 分支渲染 `ModbusPanelBody`。
- `src/features/serial-panel/components/PaneList.tsx`、`NewPanelDialog.tsx`：支持 modbus 面板项。
- `src/features/serial-panel/store.ts`：`Panel` 联合类型加 modbus 形态、持久化。
- `src/features/serial-panel/persistence` 相关：保存/恢复 modbus 面板配置。
- `electron/main.ts` `app:flush-requested` 钩子：关闭所有 modbus client。
- `shared/types.ts` `ControlSpec.source` 联合加 `'modbus-panels'`。

### 4.4 实现顺序（建议分 4 个 PR / 阶段）

每个阶段独立可测、可合并：

**阶段 1 — 协议层 + 主进程服务（无 UI）**

- 加 `modbus-serial` 依赖。
- `shared/types.ts` Modbus 类型段。
- `electron/main.ts`：`modbusClients` + `ensureModbusOpen`/`closeModbus`/`readOnce`/`writeOnce`/`applyPolls` + `modbus:*` IPC + preload `modbus` 域。
- 单测：mock client 验证 read/write/轮询/错误翻译。
- **验收**：单测通过；可在 DevTools 手动调 `window.api.modbus.*` 验证连接（mock 从站）。

**阶段 2 — Modbus 面板 UI（TCP 先行）**

- `modbus-panel` 特性目录 + `ModbusPanelBody` + 区块表格 + 手动读写抽屉。
- `FloatingPane`/`PaneList`/`NewPanelDialog` 接入。
- CSV 导入/导出。
- 先做 TCP 变体（E2E 易 mock），RTU/ASCII 走同一 UI。
- E2E：`modbus-panel-basic`/`-poll`/`-csv`。
- **验收**：TCP Modbus 面板全流程可用，E2E 绿。

**阶段 3 — RTU/ASCII 变体 + 寄存器格式化**

- 主进程 `ensureModbusOpen` 的 RTU/ASCII 分支（modbus-serial 自管 serialport）。
- `format.ts` 的 displayFormat 解码（float32-swapped 等）。
- E2E：RTU 变体用一对虚拟串口（com0com/socat）或限制为手动验证（OS 依赖，文档说明）。
- **验收**：三种变体连接均可用。

**阶段 4 — 脚本编辑器节点**

- `nodes/definitions/modbus.ts` + `codegen/emit/modbus.ts` + registry + categories。
- 沙箱 `modbusRead`/`modbusWrite`（阶段 1 已加，此处仅接通 codegen）。
- E2E：`modbus-script-node`。
- **验收**：脚本图能读寄存器并经 transform/log 节点输出。

### 4.5 风险与缓解

| 风险 | 缓解 |
|---|---|
| `modbus-serial` 与 `serialport@12` 版本兼容 | 阶段 1 先验证；`modbus-serial` 较新版本支持 serialport v12。若冲突，用 `npm rebuild` 或锁定版本 |
| modbus-serial 的 RTU 在 Electron 主进程的 native serialport | 与现有 `serialport@12` 同环境，应无新风险；`npm run rebuild` 后验证 |
| 轮询定时器泄漏（面板关闭未清理） | `closeModbus` 强制清 timers；加测试断言关闭后表为空 |
| modbus-serial 单连接的并发排队与脚本并发调用冲突 | modbus-serial 内部串行化；阶段 4 E2E 验证脚本读 vs 面板轮询不互损 |
| mock 从站 E2E 复杂度 | `e2e/helpers/mock-modbus-slave.ts` 只实现最小 MBAP（事务回显 + FC3 固定数据），足够覆盖 |

## 参考资料

- `modbus-serial`（yaacov/node-modbus-serial）：RTU/TCP/ASCII 主站库，Node-RED 底层引擎。https://github.com/yaacov/node-modbus-serial
- 现有串口架构参考：`electron/main.ts` 的 `ports` 表、`ensureSerialOpen`、`sendAll('serial:data')`。
- 现有脚本沙箱参考：`electron/main.ts` ~1275-1667 的 sandbox 对象（`sendToSerial`/`listenSerialPackets` 等）。
- 现有 codegen 参考：`src/features/script-editor/codegen/emit/*.ts`。
