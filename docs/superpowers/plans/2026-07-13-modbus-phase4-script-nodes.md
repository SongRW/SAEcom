# Modbus 支持 — 阶段 4：脚本编辑器 modbus-read/modbus-write 节点 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在脚本编辑器（Rete 节点图）新增 `modbus-read` 和 `modbus-write` 两个节点，复用面板已打开的 Modbus 连接，支持 FC1-4 读与 FC5/6/15/16 写。生成的代码调用沙箱函数 `modbusRead`/`modbusWrite`，后者直接命中主进程 `modbusClients` 注册表（零 IPC 往返）。

**Architecture:** 新增 `modbus` 节点分类（`NodeCategory` 加 `'modbus'`）。节点定义用 `def()` + 新 `modbusPanelControl()` 工厂（`source: 'modbus-panels'`）。Codegen 新建 `emit/modbus.ts`，读节点产出值（`outVar` + `ctx.varMap`），写节点消费上游输入。沙箱新增 `modbusRead`/`modbusWrite` 两个函数，调 `readOnce`/`writeOnce`（来自 `modbusService.ts`）。面板桥接新增 `getModbusPanelSummaries`，让节点配置面板能下拉选 modbus 面板。

**Tech Stack:** TypeScript / Rete.js / Electron vm sandbox / Vitest / Playwright

**Spec:** `docs/superpowers/specs/2026-07-06-modbus-support-design.md`（第 3.4-3.6 节）

**阶段 1/2/3 已就绪：** `electron/modbusService.ts`（`readOnce`/`writeOnce`/`modbusClients`）、`shared/types.ts`（`ControlSpec.source` 已含 `'modbus-panels'`、`ModbusBlock`/`ModbusWriteTarget` 类型）。

**modbus 节点不是连续监听器**——是同步请求/响应，进拓扑排序的正常 emit 循环，不进 `isContinuousInputNode`（见探索 §7 确认）。

---

## 文件结构

| 文件 | 责任 | 操作 |
|---|---|---|
| `shared/types.ts` | `NodeCategory` 加 `'modbus'`；`SerialPanelSummary.type` 加 `'modbus'` | 修改（第 163-172、80 行） |
| `src/features/script-editor/nodes/categories.ts` | 加 modbus 分类元数据 | 修改 |
| `src/features/script-editor/nodes/definitions/_shared.ts` | 加 `modbusPanelControl()` 工厂 | 修改 |
| `src/features/script-editor/nodes/definitions/modbus.ts` | modbus-read / modbus-write 节点定义 | **新建** |
| `src/features/script-editor/nodes/definitions.ts` | 聚合 `...MODBUS_NODES` | 修改 |
| `src/features/script-editor/codegen/emit/modbus.ts` | modbus 节点 codegen emitter | **新建** |
| `src/features/script-editor/codegen/registry.ts` | 加 `category === 'modbus'` 分发 | 修改 |
| `electron/main.ts` | 沙箱加 `modbusRead`/`modbusWrite` 函数 | 修改（沙箱对象内，~第 1473 行后） |
| `src/features/serial-panel/activeBridge.ts` | 加 `getModbusPanelSummaries` 桥接 | 修改 |
| `src/app/mainwindow.tsx` | 安装 modbus 桥接（若需） | 修改 |
| `src/features/script-editor/components/NodeConfigPanel.tsx` | `optionsForControl` 加 `'modbus-panels'` 分支 | 修改 |
| `src/features/script-editor/viewModel.ts` | `buildModbusPanelOptions` + `controlSupportsRefresh` 加 modbus | 修改 |
| `src/features/script-editor/ScriptEditorDialog.tsx` | 传 modbusPanelOptions 给 NodeConfigPanel | 修改 |
| `test/modbus-codegen.test.ts` | codegen 单测 | **新建** |
| `e2e/modbus-script-node.spec.ts` | 脚本节点 E2E | **新建** |

---

## Task 1: 类型 + 分类 + 节点定义

**Files:**
- Modify: `shared/types.ts`
- Modify: `src/features/script-editor/nodes/categories.ts`
- Modify: `src/features/script-editor/nodes/definitions/_shared.ts`
- Create: `src/features/script-editor/nodes/definitions/modbus.ts`
- Modify: `src/features/script-editor/nodes/definitions.ts`

- [ ] **Step 1: `shared/types.ts` — NodeCategory 加 'modbus'**

第 163-172 行 `NodeCategory` 联合，末尾加 `| 'modbus'`。

- [ ] **Step 2: `categories.ts` — 加 modbus 分类元数据**

加一行（颜色用工业橙，与 spec 一致）：
```ts
  modbus: { key: 'modbus', name: 'Modbus', color: '#d97706' },
```

- [ ] **Step 3: `_shared.ts` — 加 modbusPanelControl()**

在 `serialPortControl()`（第 36-42 行）之后加：
```ts
export function modbusPanelControl(): ControlSpec {
  return { key: 'panel', type: 'select', label: 'Modbus面板', default: '', source: 'modbus-panels' }
}
```

- [ ] **Step 4: 新建 `nodes/definitions/modbus.ts`**

```ts
import * as b from './_shared'

export const MODBUS_NODES: Record<string, ReturnType<typeof b.def>> = {
  'modbus-read': b.def('modbus-read', 'modbus', 'Modbus读取', [], [b.dataOut()], [
    b.modbusPanelControl(),
    b.selectControl('functionCode', '功能码', ['1', '2', '3', '4'], '3'),
    b.numberControl('slaveId', '从站地址', 1),
    b.numberControl('startAddress', '起始地址', 0),
    b.numberControl('quantity', '数量', 1),
  ]),
  'modbus-write': b.def('modbus-write', 'modbus', 'Modbus写入', [b.dataIn()], [b.dataOut()], [
    b.modbusPanelControl(),
    b.selectControl('functionCode', '功能码', ['5', '6', '15', '16'], '6'),
    b.numberControl('slaveId', '从站地址', 1),
    b.numberControl('startAddress', '起始地址', 0),
    b.textControl('values', '值(逗号分隔)'),
  ]),
}
```

注意：`selectControl` 的 options 参数类型——检查 `_shared.ts` 里 `selectControl` 签名是 `options: string[]` 还是 `{label,value}[]`，按实际签名调整。如果 `numberControl` 签名是 `(key, label, default?)`，确认第三参数。

- [ ] **Step 5: `definitions.ts` — 聚合 MODBUS_NODES**

import 加 `import { MODBUS_NODES } from './definitions/modbus'`，`NODE_DEFINITIONS` 展开列表加 `...MODBUS_NODES`。

- [ ] **Step 6: typecheck + 提交**

```bash
npm run typecheck
git add shared/types.ts src/features/script-editor/nodes/categories.ts src/features/script-editor/nodes/definitions/_shared.ts src/features/script-editor/nodes/definitions/modbus.ts src/features/script-editor/nodes/definitions.ts
git commit -m "feat(modbus-nodes): add modbus node category and read/write definitions"
```

---

## Task 2: Codegen emitter + registry

**Files:**
- Create: `src/features/script-editor/codegen/emit/modbus.ts`
- Modify: `src/features/script-editor/codegen/registry.ts`
- Create: `test/modbus-codegen.test.ts`

- [ ] **Step 1: 写 codegen 单测（TDD）**

新建 `test/modbus-codegen.test.ts`。参考既有 codegen 测试（如 `test/rete-codegen.test.ts`）的模式构建 mock node/context。核心断言：给定 modbus-read 节点数据，emit 出的 JS 含 `await modbusRead("panelId", 3, 1, 0, 1)`。

```ts
import { describe, it, expect } from 'vitest'
import { emitModbus } from '../src/features/script-editor/codegen/emit/modbus'

// 参考 rete-codegen.test.ts 的 mock context 构造
function mockCtx() {
  return {
    graph: { nodes: [], connections: [], incomingByNode: new Map(), outgoingByNode: new Map() },
    registry: { emitNodeByKey: () => '' },
    varMap: new Map(),
    processed: new Set(),
    blocked: new Set(),
    emitNode: () => '',
  } as any
}

describe('emitModbus', () => {
  it('modbus-read 产出 modbusRead 调用并注册输出变量', () => {
    const node = { id: 'n1', key: 'modbus-read', data: { panel: 'panel-1', functionCode: '3', slaveId: 2, startAddress: 0, quantity: 4 } } as any
    const ctx = mockCtx()
    const code = emitModbus(ctx, node, 0)
    expect(code).toContain('modbusRead(')
    expect(code).toContain('"panel-1"')
    expect(code).toContain('await modbusRead("panel-1", 3, 2, 0, 4)')
    expect(code).toMatch(/var _out_n1/)
  })

  it('modbus-write 用上游输入或配置 values', () => {
    const node = { id: 'n2', key: 'modbus-write', data: { panel: 'panel-1', functionCode: '6', slaveId: 1, startAddress: 5, values: '42' } } as any
    const ctx = mockCtx()
    // 无上游连接 → 用 config.values
    const code = emitModbus(ctx, node, 0)
    expect(code).toContain('modbusWrite(')
    expect(code).toContain('await modbusWrite("panel-1", 6, 1, 5,')
    expect(code).toMatch(/\[42\]/) // values 解析为数组
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

`npx vitest run test/modbus-codegen.test.ts` → FAIL（模块不存在）。

- [ ] **Step 3: 实现 emit/modbus.ts**

参照 `emit/output.ts` 和 `emit/input.ts`（outVar 模式）。新建 `src/features/script-editor/codegen/emit/modbus.ts`：

```ts
import type { EmitContext } from '../context'
import type { ReteGraphNode } from '@shared/types'
import { outVar, getInputVar, data } from './shared'

export function emitModbus(ctx: EmitContext, node: ReteGraphNode, indent: number): string {
  const pad = ' '.repeat(indent)
  const config = data(node)
  const panel = String(config.panel ?? '')
  const fc = Number(config.functionCode ?? 3)
  const slaveId = Number(config.slaveId ?? 1)
  const addr = Number(config.startAddress ?? 0)

  if (node.key === 'modbus-read') {
    const qty = Number(config.quantity ?? 1)
    const out = outVar(node)
    ctx.varMap.set(String(node.id), out)
    return `${pad}var ${out} = await modbusRead(${JSON.stringify(panel)}, ${fc}, ${slaveId}, ${addr}, ${qty});\n`
  }

  // modbus-write
  const inputVar = getInputVar(ctx, node, 'in', undefined)
  const fcNum = Number(config.functionCode ?? 6)
  let valuesExpr: string
  if (inputVar) {
    valuesExpr = inputVar
  } else {
    const parsed = parseValues(String(config.values ?? ''))
    valuesExpr = JSON.stringify(parsed)
  }
  const out = outVar(node)
  ctx.varMap.set(String(node.id), out)
  return `${pad}var ${out} = await modbusWrite(${JSON.stringify(panel)}, ${fcNum}, ${slaveId}, ${addr}, ${valuesExpr});\n`
}

function parseValues(s: string): number[] {
  return s.split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x))
}
```

注意：`getInputVar` 的签名参照 `emit/shared.ts`——它的参数顺序可能是 `(ctx, node, inputKey, fallback)`。读 `shared.ts` 确认后调整。`outVar(node)` 返回 `_out_<id>`。

- [ ] **Step 4: registry.ts 加 modbus 分发**

`registry.ts` 的 `emitNodeByKey`（第 16-30 行），在现有 `category ===` 分支里加：
```ts
else if (def.category === 'modbus') code += emitModbus(ctx, node, indent)
```
import `{ emitModbus } from './emit/modbus'`。

- [ ] **Step 5: 跑测试确认通过**

`npx vitest run test/modbus-codegen.test.ts` → PASS。

- [ ] **Step 6: typecheck + 提交**

```bash
npm run typecheck
git add src/features/script-editor/codegen/emit/modbus.ts src/features/script-editor/codegen/registry.ts test/modbus-codegen.test.ts
git commit -m "feat(modbus-nodes): add codegen emitter for modbus-read/write"
```

---

## Task 3: 沙箱 modbusRead/modbusWrite 函数

**Files:**
- Modify: `electron/main.ts`（沙箱对象内）

- [ ] **Step 1: 加沙箱函数**

在 `electron/main.ts` 沙箱对象内（`sendToSerial` 之后，~第 1473 行后）加两个函数。参照 `sendToSerial` 的模式（`token.aborted` 守卫 + `ctx.id === 'test'` 短路 + throw on error）：

```ts
    modbusRead: async (panelId: string, fc: number, slaveId: number, addr: number, qty: number) => {
      if (token.aborted) throw new Error('ABORTED')
      const entry = modbusClients.get(panelId)
      if (!entry) throw new Error(`Modbus 面板未连接: ${panelId}`)
      return readOnce(entry, { slaveId, functionCode: fc as 1|2|3|4, startAddress: addr, quantity: qty })
    },
    modbusWrite: async (panelId: string, fc: number, slaveId: number, addr: number, values: number[]) => {
      if (token.aborted) throw new Error('ABORTED')
      const entry = modbusClients.get(panelId)
      if (!entry) throw new Error(`Modbus 面板未连接: ${panelId}`)
      await writeOnce(entry, { slaveId, functionCode: fc as 5|6|15|16, startAddress: addr, values })
      return { ok: true }
    },
```

确认 `modbusClients`、`readOnce`、`writeOnce` 已在第 25-27 行的 import 里（阶段 1/3 加过）。

- [ ] **Step 2: typecheck + build + 提交**

```bash
npm run typecheck && npm run build
```
注意：`electron/main.ts` 有工作区 scriptEditor 改动。**只 add 这一个文件时需隔离**。用与阶段 1 Task 7 相同的策略：编辑 + 验证，提交由控制器用补丁隔离（沙箱区域 hunks 与 scriptEditor 改动是否重叠需检查）。

```bash
git add electron/main.ts   # 由控制器隔离提交
git commit -m "feat(modbus-nodes): add modbusRead/modbusWrite sandbox functions"
```

---

## Task 4: 面板桥接 + NodeConfigPanel + viewModel（让面板下拉生效）

让节点的 "Modbus面板" 控件能下拉列出已打开的 modbus 面板。

**Files:**
- Modify: `src/features/serial-panel/activeBridge.ts`
- Modify: `src/app/mainwindow.tsx`（安装桥接，若需）
- Modify: `shared/types.ts`（`SerialPanelSummary.type` 加 `'modbus'`）
- Modify: `src/features/script-editor/viewModel.ts`
- Modify: `src/features/script-editor/components/NodeConfigPanel.tsx`
- Modify: `src/features/script-editor/ScriptEditorDialog.tsx`

- [ ] **Step 1: `shared/types.ts` — SerialPanelSummary.type 加 'modbus'**

第 80 行 `type: 'serial' | 'tcp'` → `type: 'serial' | 'tcp' | 'modbus'`。

- [ ] **Step 2: `activeBridge.ts` — getModbusPanelSummaries**

参照 `getSerialPanelSummaries()`（第 23 行），加一个过滤 `type === 'modbus'` 的版本：
```ts
export function getModbusPanelSummaries(): SerialPanelSummary[] {
  const s = usePanelsStore.getState()
  return s.listOrder
    .map((id) => s.panels[id])
    .filter((p) => p && p.type === 'modbus')
    .map((p) => ({
      id: p.id, name: displayName(p), type: 'modbus' as const,
      open: p.open, active: s.activeId === p.id, hidden: p.hidden,
    }))
}
```
在 `installActiveBridge()` 里挂到 `window.getModbusPanelSummaries`。

- [ ] **Step 3: `viewModel.ts` — buildModbusPanelOptions + controlSupportsRefresh**

参照 `buildSerialPanelOptions`（第 141-159 行）加 `buildModbusPanelOptions(panels)`。
`controlSupportsRefresh`（第 171-173 行）加 `'modbus-panels'`。

- [ ] **Step 4: `NodeConfigPanel.tsx` — optionsForControl 加 modbus-panels 分支**

`optionsForControl`（第 221-229 行）加参数 `modbusPanelOptions` 和分支：
```ts
if (control.source === 'modbus-panels') return modbusPanelOptions
```
同步处理 `refreshing` 标志（第 197 行）和 refresh handler（第 292+ 行）。

- [ ] **Step 5: `ScriptEditorDialog.tsx` — 传 modbusPanelOptions**

加 state `modbusPanels` + `refreshModbusPanels`（读 `window.getModbusPanelSummaries()`），把 `modbusPanelOptions` 传给 NodeConfigPanel。

- [ ] **Step 6: typecheck + build + 提交**

```bash
npm run typecheck && npm run build
git add shared/types.ts src/features/serial-panel/activeBridge.ts src/features/script-editor/viewModel.ts src/features/script-editor/components/NodeConfigPanel.tsx src/features/script-editor/ScriptEditorDialog.tsx src/app/mainwindow.tsx
git commit -m "feat(modbus-nodes): populate modbus panel options in node config"
```

---

## Task 5: E2E — modbus 脚本节点

**Files:**
- Create: `e2e/modbus-script-node.spec.ts`

- [ ] **Step 1: 写 E2E**

复用 `startModbusSlave`。流程：
1. 创建 modbus TCP 面板 + 连接到 mock 从站（用既有 UI 流程或 evaluate）
2. 打开脚本编辑器（脚本 page → 打开脚本编辑器）
3. 在画布放一个 `modbus-read` 节点，配置 panel=刚创建的面板、FC3、slave=1、addr=0、qty=4
4. 接一个 `output-log` 节点到 modbus-read 的输出
5. 运行脚本
6. 断言日志面板出现读到的寄存器值（如 `10,20,30,40`）

注意：在画布上程序化添加节点 + 配置 + 连线可能很难通过 UI 点击完成。**混合策略**：用 `page.evaluate` 直接调用 codegen 生成代码 + `window.api.scripts.run` 执行，绕过画布交互。或：如果画布有 add-node API（Rete），用它程序化构建图。

最可靠：用 `page.evaluate` 构造生成的 JS 代码字符串（`var _out = await modbusRead("panel-id", 3, 1, 0, 4); console.log(_out);`），调 `window.api.scripts.run(code, { id: panelId })`，监听 `scripts:log` 事件断言输出含寄存器值。这直接测沙箱函数，绕过画布 UI（画布 UI 由既有 codegen 测试覆盖）。

- [ ] **Step 2: 跑 + 提交**

```bash
npm run build && npx playwright test e2e/modbus-script-node.spec.ts
git add e2e/modbus-script-node.spec.ts
git commit -m "test(modbus-nodes): e2e for modbusRead sandbox function via script run"
```

---

## 阶段 4 完成标准

- [ ] `NodeCategory` 含 `'modbus'`，画布节点面板出现 Modbus 分类
- [ ] `modbus-read`/`modbus-write` 节点可拖入画布、配置参数
- [ ] "Modbus面板" 控件下拉列出已打开的 modbus 面板
- [ ] codegen 生成 `modbusRead`/`modbusWrite` 调用代码
- [ ] 沙箱 `modbusRead`/`modbusWrite` 命中 `modbusClients` 注册表
- [ ] 脚本能读寄存器并经 output-log 输出
- [ ] codegen 单测 + E2E 通过
- [ ] `npm run typecheck` + `npm run build` 通过
