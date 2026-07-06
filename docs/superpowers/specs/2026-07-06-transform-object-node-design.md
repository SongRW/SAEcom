# transform-object 节点（对象类）设计

**日期**: 2026-07-06
**状态**: 待实现
**主题**: 脚本编辑器新增"对象类"节点，可创建一个对象，键（key）由用户自定义、值（value）来自输入 socket。

## 目标

为脚本编辑器增加一个新节点 `transform-object`，让用户能够可视化地组装一个 JS 对象：

- 节点产出 `dataSocket` 类型的对象值，下游节点可引用（如 `output-variable`、`string-concat`、`transform-*`）。
- 对象的每个键（key）的**名称由用户自定义**，支持任意字符（中文、空格、特殊字符）。
- 每个键的**值来自一个输入 socket**，连接到上游节点的输出。
- 键的数量**动态可增减**，无固定上限。

### 非目标

- 不支持"输入或常量二选一"——每个键的值只来自输入 socket（未连接则为 `null`）。
- 不把对象存入全局变量（`globalVars`）——它只是一个值生产节点。
- 不引入新的 `NodeCategory`——节点归入现有 `transform` 类别。

## 用户需求决策记录

| 决策点 | 选择 |
|---|---|
| 键数量 | 动态可增减（无上限） |
| 输出语义 | `dataSocket` 对象值（不入全局变量） |
| 值来源 | 直接组装输入 socket 的值 |
| key 名称规则 | 字符串键（任意字符），生成代码时用 `JSON.stringify` 包引号 |
| 控件渲染路径 | 路 1：真实 control 实例 + `customize.control` 钩子 |

## 架构与数据流

### 核心原则：`node.data.keys` 是单一事实来源，端口是其派生物

这是整个设计的关键。可行性核查发现 Rete 2 的 `addInput`/`removeInput` 有三个坑：

1. **不发渲染信号**——`addInput` 只改数据字典，画布上的 socket 不会自动出现，需强制刷新节点视图。
2. **重载丢失**——`importGraphState → addGraphNode → createClassicNodeFromDefinition` 从静态 `NodeDef.inputs` 重建端口，运行时加的端口不会持久化。
3. **不自动长高**——`calculateNodeHeight` 读静态 `NodeDef`，运行时加端口节点高度不变。

因此设计为：**key 列表存 `node.data.keys: KeyEntry[]`**（`KeyEntry = { id: string; name: string }`，JSON 原生持久化，已确认 write-back 桥透传数组），端口从它派生。

```
┌─────────────────────────────────────────────────────┐
│  node.data (单一事实来源)                            │
│    keys: KeyEntry[]        // 例:                   │
│      [{ id:'k1', name:'temp' },                     │
│       { id:'k2', name:'humid' }]                    │
└───────────────┬─────────────────────────────────────┘
                │ 派生 (创建/加载/增删时同步)
                ▼
┌─────────────────────────────────────────────────────┐
│  Rete Input 端口 (派生物，端口 key = key_<entryId>)  │
│    key_k1: dataSocket ◄── 上游节点输出               │
│    key_k2: dataSocket ◄── 上游节点输出               │
│  + key-list control 实例 (渲染 keys 列表 + 增删按钮) │
└───────────────┬─────────────────────────────────────┘
                │ codegen 读取
                ▼
┌─────────────────────────────────────────────────────┐
│  生成代码                                            │
│    var _out_1 = {                                    │
│      "temp": _out_0,        // jsString 包引号       │
│      "humid": _out_2                                │
│    };                                                │
│    ctx.varMap.set(id, "_out_1")  // 下游可引用       │
└─────────────────────────────────────────────────────┘
```

**节点归属**：`transform` 类别（codegen 的 catch-all，`emitNodeByKey` 已自动分发到 `emitTransform`）。
**节点 key**：`transform-object`。

### 端口 key 稳定性策略

端口 key 用 `key_<entryId>`（按 `KeyEntry` 的稳定 id），**不直接用 key 名称也不按位置**。这样改名不影响连接，删除任意一个键时其余键端口 key 不变、连接完全保留。（最终策略以 KeyListControl 章节的修正为准。）

## 节点定义

`src/features/script-editor/nodes/definitions/transform.ts` 新增：

```ts
'transform-object': b.def('transform-object', 'transform', '对象', [], [b.dataOut()], []),
```

- `inputs: []`——静态定义无输入端口（动态端口运行时派生）。
- `outputs: [dataOut('out', '输出')]`——固定一个 `dataSocket` 输出。
- `controls: []`——`key-list` 控件**不声明在 NodeDef.controls**（避免被通用默认值/校验逻辑误处理），运行时通过 `node.addControl('keys', control)` 单独挂载。

显示名：`对象`。

## key-list 控件（路 1：control 实例 + customize.control）

### Control 类

新文件 `src/features/script-editor/rete/KeyListControl.tsx`。

定义一个继承 `ClassicPreset.Control` 的 control 类（参照 `ClassicPreset.InputControl` 的结构）：

```ts
import { ClassicPreset } from 'rete'

export interface KeyEntry { id: string; name: string }

export class KeyListControl extends ClassicPreset.Control {
  keys: KeyEntry[]                  // 每个键有稳定 id（端口映射用）+ name
  constructor(
    initial: KeyEntry[],
    private change: (keys: KeyEntry[]) => void
  ) {
    super()
    this.keys = initial
  }
  getValue(): KeyEntry[] { return this.keys }
  setValue(keys: KeyEntry[]): void { this.keys = keys; this.change(keys) }
}
```

**键的稳定 id**：`KeyEntry.id` 是内部稳定标识（如 `nanoid()` 或自增），用于端口 key 映射（`key_<entryId>`）；`name` 是用户编辑的显示名。这样**改名不改 id、端口不动**，删除按 id 删除而非按位置（避免"前移"导致的连接错位——修正第三节的端口策略，详见下方"端口与删除语义"）。

> **端口 key 策略修正**（覆盖第二节的设计）：端口 key 用 `key_<entryId>`（按稳定 id），**不再按 index**。这样删除任意一个键时，其余键的端口 key 不变、连接完全保留，无需重排、无需刷新其余端口视图。比"按位置重排"更安全。

### React 组件

`KeyListControl.tsx` 同文件导出 React 组件 `<KeyListControlView>`。**必须自包含**——Rete 节点 body 在 `node.data` 变化时不重渲染，组件自己用 `useState` 管理本地视图，按钮点击本地更新 + 通过 control 实例回写。

```tsx
export function KeyListControlView({ data }: { data: KeyListControl }) {
  const [keys, setKeys] = useState(data.getValue())
  // 添加：push { id: newId(), name: '' } → setKeys → data.setValue(keys) → 触发端口增 + 视图刷新
  // 改名：update keys[i].name → setKeys → data.setValue （仅改名不触发端口变更/刷新）
  // 删除：filter by id → setKeys → data.setValue(keys) → 触发端口删 + 视图刷新
  return (/* 行式 UI + "+ 添加键" 按钮 */)
}
```

**UI 布局**（每行 = 一个 key 条目）：

```
┌─ transform-object 节点 body ────────────────────┐
│  ◯ key_<id>  [ temperature____ ]      [ × ]      │  ← 输入端口在左，名称框，删除按钮
│  ◯ key_<id>  [ humidity_______ ]      [ × ]      │
│              [ + 添加键 ]                        │
│  ◀ out (dataSocket)                              │  ← 固定输出端口
└──────────────────────────────────────────────────┘
```

### customize.control 注册

`rete/setup.ts` 在 `render.addPreset(ReactPresets.classic.setup({ customize: ... }))` 处加：

```ts
customize: {
  node: () => ScriptClassicNode,
  control: (context) => {
    if (context.data.payload instanceof KeyListControl) return KeyListControlView
    return undefined   // 其余走默认 InputControl 渲染
  }
}
```

同时在 `ScriptClassicNode`（`setup.ts:358`）的 controls 过滤处放行 `transform-object` 节点的 `keys` control，使其不被过滤掉。

### 端口增删与视图刷新

控件回写 `data.setValue(keys)` 时，回调里做三件事：

1. 更新 `node.data.keys`（通过 `node.onDataChange('keys', keys)`，走现有 write-back 桥）。
2. 同步端口：对比当前 `node.inputs` 与目标 `keys`，对差集调用 `node.addInput('key_<id>', new Input(dataSocket))` / `node.removeInput('key_<id>')`。
3. 强制节点视图刷新：移除节点 + 按 id/位置重新创建（最可靠）。**实现阶段先调研** Rete 是否有 `area.update('node', id)` / `node.update()` 等轻量 API，有则优先用，无则回退重建。
4. 重算节点高度：`node.height = 58 + Math.max(keys.length, 1) * 28 + 24`（从实时 keys 长度算）。

**改名**只走步骤 1（更新 `node.data.keys`），不触发端口变更、不刷新视图——名称框由组件本地 state 立即响应。

### 删除端口上的连接

删除一个键时，若其端口已有连接，需先断开（避免悬空连接）。调用 editor 的 `removeConnection` 或在重建节点时由 Rete 自动清理。

## codegen 生成

**重要修正**：`emitTransform` 的结构是 `outVar + ctx.varMap.set` 后调用 `expressionFor` 返回**纯表达式**（不含 `var` 前缀）。因此 `case 'transform-object'` 加在 `expressionFor` 里：

`src/features/script-editor/codegen/emit/transform.ts` 的 `expressionFor` switch 新增：

```ts
case 'transform-object': {
  const keys = Array.isArray(config.keys) ? (config.keys as { id: string; name: string }[]) : []
  const pairs = keys
    .map((entry) => {
      const trimmed = String(entry?.name ?? '').trim()
      if (!trimmed) return null                    // 空名键跳过
      const val = getInputVar(ctx, node, `key_${entry.id}`, 'null')  // 无连接 → null
      return `${jsString(trimmed)}: ${val}`
    })
    .filter(Boolean)
  return `{ ${pairs.join(', ')} }`
}
```

- `jsString(trimmed)`（`emit/shared.ts` 已有）用 `JSON.stringify` 包引号 → 任意字符键名安全。
- 无键时返回 `{ }`（合法空对象）。
- 空名键跳过；重复键名原样生成（JS 后者覆盖前者）。
- 端口 key 现为 `key_<entryId>`（配合上面的端口策略修正），codegen 取 `key_${entry.id}`。

`config` 即 `data(node)`（已在 `expressionFor` 顶部 `const config = data(node)` 取得）。

## 持久化闭环

key 列表的真相在 `node.data.keys`（数组 JSON 原生持久化）。需要在**加载路径**补派生重建：

`rete/setup.ts` 的 `createClassicNodeFromGraphNode`（约 line 130-148）末尾加：

```ts
if (graphNode.key === 'transform-object') {
  const entries = Array.isArray(graphNode.data?.keys) ? graphNode.data.keys as KeyEntry[] : []
  entries.forEach((entry) => {
    const portKey = `key_${entry.id}`
    if (!node.hasInput(portKey)) {
      node.addInput(portKey, new ClassicPreset.Input(socketInstances.dataSocket, String(entry.name || '')))
    }
  })
  node.height = 58 + Math.max(entries.length, 1) * 28 + 24
}
```

`exportReteEditorGraph` 已透传 `node.data`（含 `keys`），无需改。

## 默认值 / 迁移 / 校验

`src/features/script-editor/panelConfig.ts`：

```ts
// createDefaultNodeData
case 'transform-object': return { keys: [] }

// migrateNodeData（防御旧数据）
case 'transform-object': return { keys: Array.isArray(data.keys) ? data.keys : [] }

// validateNodeConfig
case 'transform-object': {
  const names = (data.keys as KeyEntry[]).map((e) => String(e.name ?? '').trim()).filter(Boolean)
  const dupes = names.filter((n, i) => names.indexOf(n) !== i)
  const warnings: string[] = []
  if (names.length === 0) warnings.push('对象没有任何有效键')
  if (dupes.length) warnings.push(`重复的键名: ${[...new Set(dupes)].join(', ')}`)
  return { ok: true, warnings }   // 软警告，不阻塞
}
```

## 测试

### 单元测试（Vitest）

`test/rete-codegen.test.ts`：

1. `Object.keys(NODE_DEFINITIONS)` 计数 `50` → **`51`**（line 38）。
2. 新增 `transform-object` codegen 用例：
   - 空 keys → `{ }`
   - 正常 keys（有连接）→ `{ "temp": _out_0, "humid": _out_2 }`
   - 含空名键 → 空名键被跳过
   - 无连接的端口 → value 为 `null`
   - 含中文/特殊字符键名 → 正确包引号 `{ "我的 key": _out_0 }`

`test/rete-setup.test.ts`：

3. `nodeCount === 50` → **`51`**（line 31）。

### E2E（Playwright Electron）

`e2e/script-editor.spec.ts` 扩展或新建 spec，覆盖：

1. 从节点面板拖入"对象"节点 → 节点出现在画布。
2. 点"+ 添加键"两次 → 出现两个输入端口 + 两个名称输入框。
3. 在名称框输入 `temperature` / `湿度`（中文）。
4. 连接上游节点输出到两个端口。
5. 删除一个键 → 对应端口与连接消失。
6. 保存脚本 → 重载窗口 → 键、端口、名称、连接均保留。
7. codegen 预览（若有）确认生成 `{ "temperature": ..., "湿度": ... }`。

## 文件清单

| 文件 | 改动 |
|---|---|
| `src/features/script-editor/nodes/definitions/transform.ts` | 新增 `'transform-object'` 定义 |
| `src/features/script-editor/codegen/emit/transform.ts` | `expressionFor` switch 加 `case 'transform-object'` |
| `src/features/script-editor/rete/KeyListControl.tsx`（**新文件**） | `KeyListControl` control 类 + `<KeyListControlView>` React 组件 |
| `src/features/script-editor/rete/setup.ts` | ① `createClassicNodeFromGraphNode` 加派生重建分支；② 注册 `customize.control` 钩子；③ `ScriptClassicNode` controls 过滤放行 `keys` control；④ 接线端口增删/视图刷新逻辑 |
| `src/features/script-editor/panelConfig.ts` | `createDefaultNodeData` + `migrateNodeData` + `validateNodeConfig` 三处分支 |
| `test/rete-codegen.test.ts` | 计数 `50`→`51`；新增 transform-object codegen 用例 |
| `test/rete-setup.test.ts` | `nodeCount === 50` → `51` |
| `e2e/script-editor.spec.ts`（扩展或新建） | 对象节点增删键/改名/连接/保存重载 E2E |

## 风险与待验证

1. **Rete 视图刷新机制**：`addInput` 不发渲染信号，强制刷新（重建节点 vs 轻量 API）的实现方式需在实现阶段验证。这是整个设计最不确定的部分，应优先做技术探针。
2. **删除端口连接清理**：需确认 Rete 在 `removeInput` 或节点重建时自动清理悬空连接，否则需手动 `removeConnection`。
3. **`customize.control` 与默认 InputControl 共存**：钩子对非 `KeyListControl` 返回 `undefined`/`null` 时，需确认 Rete 回退到默认 `Control` 渲染（验证 `rete-react-plugin` 的 dispatch 行为）。
4. **节点高度重算时机**：端口增删后是否需手动调 `node.height = ...`，或在重建时自动。CSS `minHeight` 与固定 height 的取舍。

## 开放问题（实现阶段决策）

- 键的稳定 id 生成方式：`nanoid()`（需引入依赖）vs 节点内自增计数器 vs `crypto.randomUUID()`。倾向自增计数器（无新依赖）。
- 视图刷新的轻量 API 是否可用：若 Rete 无 `node.update()`，重建策略对正在编辑的连接/焦点的影响。
