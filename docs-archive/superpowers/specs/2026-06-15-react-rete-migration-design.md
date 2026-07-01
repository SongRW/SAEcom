# SAEcom React + Rete.js 迁移设计

**日期**: 2026-06-15
**分支**: develop_srw
**状态**: 设计已确认，待写实现计划

---

## 1. 背景与目标

SAEcom（串口助手）当前是基于 Electron + 裸 JavaScript 单文件的项目。核心痛点：

- `renderer.js` 6218 行、`styles.css` 4076 行，巨型单文件难以维护
- 可视化脚本编辑器基于 Drawflow，存在架构脆弱性（codegen 按中文名匹配、sandbox API 缺失、控制节点未实现等 bug）
- 无构建工具、无类型系统、无组件化，难以扩展

**本次目标**：全量迁移到 electron-vite + React + TypeScript，脚本编辑器用 Rete.js 重写。

由于全量迁移范围过大（9 个子系统、~8000 行 JS），本 spec 涵盖 **Phase 0 + 1 + 2**（构建底座 + 脚本编辑器 + 串口面板）。Phase 3+（命令系统、设置、示波器、文件传输、关于/特效）各自成独立 spec。

### 全量迁移路线图

```
Phase 0 · 构建底座（前置，所有后续依赖）
  ├─ electron-vite + React + TypeScript
  ├─ 主进程 TS 迁移，preload 类型化
  └─ 主题 token 统一

Phase 1 · 脚本编辑器（本次 spec）★ 核心痛点
  ├─ Rete.js 画布 + 节点重建（49 个）
  ├─ code-generator 重写（按 key 派发）
  └─ 沙箱 API 补齐

Phase 2 · 串口面板系统（本次 spec）
  ├─ 面板布局/拖拽/缩放/弹出/停靠
  └─ 数据显示虚拟化

Phase 3 · 命令系统 + 左侧侧栏（后续 spec）
Phase 4 · 设置/示波器/文件传输/关于（后续 spec）
Phase 5 · 删除 legacy + 全量回归（后续 spec）
```

---

## 2. 已确认的技术决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 范围 | Phase 0 + 1 + 2 | 覆盖构建底座 + 两大核心子系统 |
| 构建工具 | electron-vite（alex8088） | 2025 最成熟，原生支持 main/preload/renderer 三进程 |
| 语言 | TypeScript（strict） | 节点定义/IPC 契约/codegen 需类型保障 |
| 渲染框架 | React 18 | 组件化，多入口支持弹出窗口 |
| 状态管理 | Zustand | 轻量，精细订阅避免高频数据流重渲染，可在 React 树外访问 |
| 样式 | shadcn/ui + Tailwind CSS | 高质量组件库省大量手写，桌面 UI 现代化 |
| 画布 | Rete.js v2 + React 渲染插件 | 类型化 socket，模块化插件 |
| 执行架构 | 方案 B：Rete 做编辑器 + 重写 codegen（按 key 派发）+ 修沙箱 | 根治脆弱性，保留命令式控制流 |
| 迁移策略 | 双轨并存，每 Phase 可运行可回滚 | 不阻塞开发，渐进切换 |
| IPC | 类型化契约（shared/types.ts），preload TS 重写 | 结构性收益，不破坏现有行为 |
| 旧脚本兼容 | **不做** Drawflow→Rete 转换 | 用户确认，简化实现 |
| socket 强类型 | 弱类型（dataSocket 兼容），仅 boolSocket/flowSocket/triggerSocket 强约束 | 避免过度设计 |

---

## 3. Phase 0 — 构建底座

### 3.1 目标目录结构

```
SAEcom/
├─ electron/                    # 主进程（TS）
│   ├─ main.ts                  # ← main.js 迁移
│   ├─ preload.ts               # ← preload.js 迁移（类型化）
│   └─ services/                # IPC handlers 按域拆分
│       ├─ serial.ts            #   串口/TCP/共享/虚拟口
│       ├─ scripts.ts           #   脚本运行 + sandbox API
│       ├─ config.ts            #   面板/命令持久化
│       ├─ panel.ts             #   弹出窗口管理
│       └─ window.ts            #   窗口/全屏/主题
├─ src/                         # 渲染进程（React + TS）
│   ├─ main.tsx                 # createRoot 入口
│   ├─ App.tsx                  # 路由/布局壳
│   ├─ features/
│   │   ├─ panels/              # Phase 2：串口面板系统
│   │   ├─ script-editor/       # Phase 1：Rete 脚本编辑器
│   │   └─ commands/            # Phase 3（后续 spec）
│   ├─ shared/
│   │   ├─ ipc/                 # IPC 客户端（类型化 wrapper）
│   │   └─ theme/               # 设计 token + tailwind 配置
│   └─ components/              # 通用组件（shadcn）
├─ shared/                      # 主/渲染共享类型
│   └─ types.ts                 # IPC 通道类型、节点定义类型
├─ index.html
├─ panel.html
├─ electron.vite.config.ts
├─ tsconfig.json
├─ tailwind.config.ts
└─ package.json
```

### 3.2 electron-vite 工程结构

`electron.vite.config.ts` 三入口：

```ts
export default defineConfig({
  main:    { build: { rollupOptions: { input: 'electron/main.ts' } } },
  preload: { build: { rollupOptions: { input: 'electron/preload.ts' } } },
  renderer: {
    root: 'src',
    build: { rollupOptions: { input: { main: 'index.html', panel: 'panel.html' } } }
  }
})
```

- **`electron/main.ts`** ← 迁移自 `main.js`（1334 行），按 `services/` 拆分 IPC handler
- **`electron/preload.ts`** ← 迁移自 `preload.js`，加类型；仍是 `contextBridge.exposeInMainWorld('api', ...)`
- **渲染进程两个入口**：`index.html`（主窗）和 `panel.html`（弹出窗口），各自 `createRoot`

### 3.3 开发/生产双模式

| | dev | prod |
|---|---|---|
| 主进程 | electron-vite 编译到内存 | 打包进 asar |
| preload | 编译到 `.vite/preload.mjs` | 打包进 asar |
| 渲染进程 | Vite dev server + HMR，`loadURL('http://localhost:5173')` | 打包成本地文件 `loadFile` |

通过 `app.isPackaged` 判断走哪条路。

### 3.4 IPC 类型化契约

**`shared/types.ts`** 定义 `window.api` 的完整类型：

```ts
export interface SerialAPI {
  list: () => Promise<SerialPortInfo[]>;
  open: (path: string, options: SerialOpenOptions) => Promise<OpenResult>;
  write: (id: string, data: string, mode: WriteMode, append: Append, encoding: string) => Promise<WriteResult>;
  close: (id: string) => Promise<void>;
  onData: (cb: (p: { id: string; bytes: Uint8Array; ts: number }) => void) => void;
  onEvent: (cb: (e: SerialEvent) => void) => void;
}
// TCPAPI, PanelAPI, ScriptsAPI, ConfigAPI, CommandsAPI, FileAPI, LoggerAPI,
// ShellAPI, AppAPI, ChangelogAPI, ThemeAPI, VirtualPortAPI 同理

export interface WindowAPI {
  serial: SerialAPI;
  tcp: TCPAPI;
  panel: PanelAPI;
  scripts: ScriptsAPI;
  config: ConfigAPI;
  // ... 全部现有通道
}
```

`electron/preload.ts` 实现该接口。`src/shared/ipc/` 提供 `useIPC()` hook 包装 `window.api`。

**所有现有 IPC 通道原样保留，只加类型——不破坏任何现有行为。**

### 3.5 shadcn/ui + Tailwind 初始化

- `tailwind.config.ts`：配置 content 路径、暗色模式（`class` 策略）
- 主题 token：将现有 `:root` CSS 变量（颜色值）映射到 shadcn 的 HSL 变量名（`--background` `--foreground` `--primary` 等）
- 暗色模式：shadcn 用 `.dark` class，现有 `.theme-dark` 逻辑对应（统一为 `.dark`）
- shadcn 组件按需初始化：`button` `dialog` `select` `input` `tabs` `switch` `slider` `tooltip` `context-menu` `dropdown-menu` `alert-dialog` `popover` 等

### 3.6 双轨并存机制（迁移期过渡）

Phase 0 结束时应用运行方式：

- `index.html` 同时挂载 React root（`<div id="root">`）和 legacy 区域
- `main.tsx` 渲染 `<App>`，内部用 `featureFlags` 决定渲染哪些子系统：
  ```tsx
  <App>
    {flags.useReactScriptEditor && <ScriptEditorDialog />}
    {flags.useReactPanels && <PanelContainer />}
    {/* 未迁移部分由 legacy renderer.js 接管 */}
  </App>
  ```
- `renderer.js` 暂时保留，Phase 1/2 完成后逐段删除

### 3.7 测试底座

- 现有 `test/code-generator.test.js`（18 用例）迁移为 **Vitest**
- Phase 0 先把测试跑起来，作为 codegen 重写的回归基线

### 3.8 Phase 0 验收标准

1. `npm run dev` 启动 electron-vite，HMR 生效，应用界面与现在视觉一致
2. `npm run build && npm run dist:win` 能打出可安装包
3. `window.api` 全部类型化，渲染进程 TS 无 `any`
4. 现有所有功能（串口/TCP/面板/命令/脚本）行为不变
5. `npm test`（Vitest）跑通 codegen 18 用例

---

## 4. Phase 1 — 脚本编辑器 Rete.js 重构

### 4.1 Rete.js 架构

脚本编辑器作为 React 组件挂载到 dialog。Rete 初始化在 `useEffect` 里完成（容器必须先渲染）。

**组件结构**：

```
ScriptEditorDialog (React)
├─ 工具栏：新建/保存/删除/运行/停止/缩放/最大化
├─ 左侧：节点分类面板（9 类 50 节点）
├─ 中间：Rete 画布
├─ 右侧：脚本列表（已保存的 .js 文件）
└─ 底部：可拖拽输出面板（console.log 输出）
```

**Rete 编辑器初始化**（`src/features/script-editor/rete/setup.ts`）：

```ts
const editor = new NodeEditor<Schemes>()
AreaPlugin.bind(area)
ConnectionPlugin.init(editor)
const render = new ReactRenderPlugin()
const selector = AreaExtensions.selector()
const arrange = new AutoArrangePlugin()
const dnd = new DndPlugin()
```

Rete 的 `NodeEditor` 本身就是图数据结构——节点、连接、位置都由它管理。不再手写序列化/坐标系/缩放/连线（Drawflow 那套全删）。

### 4.2 Socket 体系（4 种）

| Socket | 用途 | 典型节点 |
|---|---|---|
| `dataSocket` | 通用数据（弱类型，向下兼容） | 大多数节点 |
| `boolSocket` | 比较/逻辑结果 | compare/logical 节点输出，control-if 条件输入 |
| `flowSocket` | 控制流分支 | control-if true/false 出口 |
| `triggerSocket` | 触发信号 | input-timer, input-manual |

**关键约束**：`control-if` 的条件输入**只接受 `boolSocket`**，强制类型安全。

### 4.3 节点清单（50 个）

#### 4.3.1 现有 37 节点（保留，按 key 重建）

| 类别 | 节点 key | 名称 | in/out |
|---|---|---|---|
| **input** | input-serial | 接收串口 | 0/1 |
| | input-tcp | 接收TCP | 0/1 |
| | input-tcp-server | TCP服务器接收 | 0/1 |
| | input-manual | 手动输入 | 0/1 |
| | input-file | 读取文件 | 0/1 |
| | input-timer | 定时触发 | 0/1 |
| **transform** | transform-hex | HEX转换 | 1/1 |
| | transform-base64 | Base64编解码 | 1/1 |
| | transform-encoding | 编码转换 | 1/1 |
| | transform-byteorder | 字节序转换 | 1/1 |
| | transform-case | 大小写转换 | 1/1 |
| **split** | split-delimiter | 分隔符拆分 | 1/1 |
| | split-length | 按长度拆分 | 1/1 |
| | split-regex | 正则提取 | 1/1 |
| | split-substring | 截取子串 | 1/1 |
| | split-trimbytes | 去头尾字节 | 1/1 |
| **numeric** | numeric-base | 进制转换 | 1/1 |
| | numeric-join | 字节拼接数值 | 1/1 |
| | numeric-calc | 计算 | 2/1 |
| | numeric-crc | CRC校验 | 1/1 |
| | numeric-length | 计算长度 | 1/1 |
| **string** | string-concat | 字符串拼接 | 2/1 |
| | string-replace | 字符串替换 | 1/1 |
| | string-trim | 去除空白 | 1/1 |
| | string-find | 查找匹配 | 1/1 |
| | string-template | 格式化模板 | 3/1 |
| **control** | control-if | 条件判断 | 1bool/2flow |
| | control-loop | 循环执行 | 1/1 |
| | control-delay | 延时等待 | 1/1 |
| | control-wait | 等待接收 | 0/1 |
| | control-timeout | 超时控制 | 1/2flow |
| **output** | output-serial | 发送串口 | 1/0 |
| | output-tcp | 发送TCP | 1/0 |
| | output-tcp-server | TCP服务器发送 | 1/0 |
| | output-file | 写入文件 | 1/0 |
| | output-log | 日志输出 | 1/0 |
| | output-variable | 变量存储 | 1/0 |

#### 4.3.2 新增节点（13 个）

**compare 类（10 个）** — 输入 `dataSocket` × 2，输出 `boolSocket`。第二操作数：连了 socket 用连接值，没连用 control 字面量。

| 节点 key | 名称 | 运算 |
|---|---|---|
| compare-eq | 等于 | `==` |
| compare-neq | 不等于 | `!=` |
| compare-gt | 大于 | `>` |
| compare-gte | 大于等于 | `>=` |
| compare-lt | 小于 | `<` |
| compare-lte | 小于等于 | `<=` |
| compare-in | 包含 | `in`（子串/元素存在） |
| compare-not-in | 不包含 | `not in` |
| compare-match | 正则匹配 | `/pattern/.test(str)` |
| compare-boundary | 边界匹配 | startsWith/endsWith（配置项选前缀/后缀） |

**logical 类（3 个）** — 输入输出全 `boolSocket`。

| 节点 key | 名称 | 运算 |
|---|---|---|
| logical-and | 与 | `&&` |
| logical-or | 或 | `\|\|` |
| logical-not | 非 | `!` |

### 4.4 节点定义统一结构

消灭现有 node-definitions.js / code-generator.js 的双写问题。每节点定义统一为：

```ts
// shared/types.ts
interface NodeDef {
  key: string                  // 'transform-hex'
  category: NodeCategory       // 'transform'
  name: string                 // 'HEX转换'
  inputs: SocketSpec[]         // [{ key: 'in', socket: 'dataSocket' }]
  outputs: SocketSpec[]        // [{ key: 'out', socket: 'dataSocket' }]
  controls: ControlSpec[]      // 配置字段
}

interface NodeEmitter {
  (ctx: EmitContext): string   // 生成该节点的 JS 代码
}
```

### 4.5 code-generator 重写

保留现有拓扑排序 + 控制流内联的成熟思路（18 测试用例验证），重组结构：

```
src/features/script-editor/codegen/
├─ index.ts          # generateCode(graph, registry) → string
├─ topo.ts           # 拓扑排序（从 code-generator.js 迁移，保留循环检测）
├─ context.ts        # varMap、processedNodes、作用域管理
├─ emit/
│   ├─ shared.ts     # getInputVars, emitStopGuard 等公共工具
│   ├─ input.ts      # input-* 节点 emitter
│   ├─ transform.ts  # transform-*/split-*/numeric-*/string-*
│   ├─ control.ts    # control-* （补全 timeout/wait）
│   ├─ compare.ts    # compare-* （新增）
│   ├─ logical.ts    # logical-* （新增）
│   └─ output.ts     # output-*
└─ registry.ts       # NodeDef key → NodeEmitter 映射
```

**核心改进**：emitter 注册表按 **key 派发**，不再按中文名匹配。

**输入来源**：Rete 的 `editor.export()` 输出（`{id, name, position, inputs, outputs, data}`），替代 Drawflow 的 `{drawflow:{Home:{data}}}`。topo.ts 依赖图构建相应调整。

**补全控制节点**：
- `control-timeout`：生成 `Promise.race([子图, sleep(timeout).then(()=>{超时分支})])`
- `control-wait`：生成 `await waitOnePacket(timeout)`

### 4.6 沙箱 API 补齐

当前 `main.js` sandbox 缺失的 API（代码生成会引用但运行时 ReferenceError）：

| 缺失 API | 用途 | 实现 |
|---|---|---|
| `writeFile(path, data)` | output-file 节点 | `fs.writeFileSync` |
| `globalVars` | output-variable 节点 | sandbox 初始化为 `{}` |
| `convertEncoding(str, from, to)` | transform-encoding | iconv-lite |
| `swapBytes(hexStr)` | transform-byteorder | 字符串翻转 |
| `chunkString(str, len)` | split-length | 切片 |
| `bytesToNumber(bytes, endian)` | numeric-join | Buffer.readUInt* |
| `crc8(data)` | numeric-crc | CRC-8 标准实现 |
| `crc16ccitt(data)` | numeric-crc | CRC-16/CCITT |
| `crc32(data)` | numeric-crc | CRC-32 |
| `checksum(data)` | numeric-crc | 算术校验和 |
| `_last_recv` | 无连接时回退 | sandbox 初始化，随 waitOnePacket 更新 |

全部在 `electron/services/scripts.ts` 的 sandbox 构建处补齐。

### 4.7 持久化格式

不做旧脚本兼容。文件仍为 `.js`，格式：

```
/* VS_FLOW_START
<Rete export JSON>
VS_FLOW_END */
// Generated code:
(async function() { <code> })();
```

无版本检测分支，直接用 Rete 原生 export 格式。

### 4.8 节点 UI（参考 Dify 风格）

React 节点组件，借鉴 Dify workflow 节点交互模式：

- **紧凑卡片**：图标 + 标题 + 关键参数预览（如 input-serial 显示端口号）
- **内联控件**：简单配置（select/number）直接在节点上改
- **复杂配置**：点击展开按钮 → 浮层表单（shadcn Select/Input/Popover）
- **连接句柄**：输入左、输出右，颜色对应 socket 类型
- **节点状态**：hover 高亮、selected 边框、运行中脉冲动画
- **分类配色**：沿用现有类别颜色 + 新增 compare/logical 配色
- **错误节点**：必填项缺失时红色边框 + 角标
- **连接线**：hover 可选中删除

### 4.9 Phase 1 验收标准

1. 左侧面板可拖拽 9 类 50 节点到画布
2. 节点可配置、可连线（socket 类型约束）、可删除、可框选、可缩放
3. 保存/加载脚本（Rete 原生格式）
4. 运行脚本，输出显示在底部面板，可停止
5. 现有 18 个 codegen 测试用例全部通过（Vitest）
6. 新增 compare/logical 节点的 codegen 测试
7. 新增 control-timeout/control-wait 的 codegen 测试
8. 沙箱 API 全部补齐，所有节点真正可跑
9. 视觉风格 Dify-like，夜间模式正常

---

## 5. Phase 2 — 串口面板系统重构

### 5.1 现状痛点

当前面板逻辑全揉在 6218 行 `renderer.js` 里：状态散落全局变量、直接操作 DOM、IPC 回调混杂。

### 5.2 React 架构

**状态层（Zustand）**：

```ts
// src/features/panels/store.ts
interface PanelStore {
  panels: Record<string, Panel>
  layout: PanelLayout
  portList: PortInfo[]
  activePanelId: string | null
  // actions
  addPanel / removePanel / updatePanelData / setLayout
  movePanel / resizePanel / popout / dock / hide
}
```

面板收到的串口数据通过 IPC 进来 → store action 更新 `panels[id].history` → 订阅该面板的 `Panel` 组件重渲染。高频数据只触发目标面板重渲染。

**组件层**：

```
PanelContainer (布局容器)
├─ Sidebar (左侧端口列表，拖拽排序/重命名)
├─ PanelLayout (面板平铺区，allotment 分割)
│   └─ Panel (单个面板) × N
│       ├─ PanelHeader (标题/打开关闭/HEX切换/弹出/隐藏)
│       ├─ DataDisplay (文本/HEX显示，时间戳，编码，react-window 虚拟化)
│       └─ SendBox (发送框，hex/text，append 模式)
└─ PopoutWindow (弹出窗口，独立 BrowserWindow 内的 React)
```

### 5.3 弹出窗口设计

弹出窗口是独立 BrowserWindow，加载 `panel.html?id=xxx`。React 多入口方案：

```tsx
// src/main.tsx 根据 URL 参数决定渲染内容
const params = new URLSearchParams(location.search)
const panelId = params.get('id')
if (panelId) {
  root.render(<PopoutPanel panelId={panelId} />)  // 弹出窗口模式
} else {
  root.render(<App />)  // 主窗口模式
}
```

**状态同步**：
- 弹出窗口订阅同一 IPC 的 `serial:data`/`serial:event`（数据直接从主进程来）
- 初始 history 通过 IPC 拉取一次
- 停靠时把当前 history 回传主窗

弹出窗口不再是"次等公民"，直接订阅数据源，性能和主窗面板一致。

### 5.4 数据显示性能优化

- `DataDisplay` 用 **react-window** 虚拟化渲染，只渲染可见区域的 chunks
- 到达上限时从头部丢弃旧 chunks（保留现有"最大保留条数"行为）
- HEX/文本切换不重新解析——chunk 存时保留双格式（现状已如此）

### 5.5 拖拽与缩放

- 面板间平铺布局用 **allotment**（可拖拽分割条，类似 VS Code 面板）
- 单个面板的弹出/位置用自实现

### 5.6 与脚本系统的联动

脚本通过 IPC 调用主进程 serial write（现状不变）。脚本输出面板（Phase 1 底部）显示 `console.log` 结果，面板 DataDisplay 显示串口原始数据——两者独立，Phase 1/2 可独立验证。

### 5.7 Phase 2 验收标准

1. 左侧端口列表显示串口/TCP，可连接/断开/排序/重命名
2. 面板平铺布局，可拖拽改变大小和位置（allotment）
3. 单个面板：打开/关闭、HEX切换、时间戳、编码选择、发送框
4. 面板可弹出为独立窗口，独立窗口可停靠回主窗
5. 高频数据下不卡顿（react-window 虚拟化 + 上限丢弃）
6. 配置持久化（panels.json），重启恢复
7. 脚本对面板的操作（send 等）正常工作

---

## 6. 依赖清单（新增）

### 运行时依赖

| 包 | 用途 |
|---|---|
| react, react-dom | 渲染框架 |
| react-router-dom | 多页面路由 |
| zustand | 状态管理 |
| rete, @retejs/connection-plugin, @retejs/area-plugin, @retejs/render-utils, rete-react-plugin, @retejs/auto-arrange-plugin, @retejs/dnd-plugin | Rete.js v2 画布（不使用 @retejs/engine，执行走 codegen 方案 B） |
| allotment | 可拖拽分割布局 |
| react-window | 数据显示虚拟化 |
| tailwindcss | 原子 CSS |
| @radix-ui/* (via shadcn) | 无障碍组件 |
| iconv-lite | 编码转换（沙箱 API） |

### 开发依赖

| 包 | 用途 |
|---|---|
| electron-vite | 构建工具 |
| typescript | 类型系统 |
| vite | 渲染进程构建 |
| vitest | 测试框架 |
| @types/react, @types/react-dom, @types/node | 类型定义 |
| eslint, prettier | 代码规范（可选） |

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| electron-vite + serialport 原生模块 rebuild | 构建失败 | 保留 @electron/rebuild 流程，electron-vite 兼容 |
| Rete.js v2 API 变动 | 节点实现返工 | 锁定版本，以官方 examples 为准 |
| React 高频数据流性能 | 面板卡顿 | Zustand 精细订阅 + react-window 虚拟化 |
| 双轨并存期 IPC 冲突 | legacy 与 React 同时监听 IPC | featureFlags 严格隔离，同一时刻只一方接管 |
| Tailwind 迁移视觉回归 | UI 走样 | 色卡迁移进 tailwind.config，逐组件迁移并对比 |

---

## 8. 后续 Phase（各自独立 spec）

- **Phase 3**：命令系统（分组/编辑/拖拽排序/发送）+ 左侧端口侧栏完整迁移
- **Phase 4**：设置页、示波器、文件传输（XModem/YModem）、关于/更新日志/冬季特效
- **Phase 5**：删除 legacy renderer.js / panel.js / Drawflow，全量回归测试，打包验证
