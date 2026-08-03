// shared/types.ts
// 类型化 IPC 契约 — 主进程与渲染进程共享的类型定义。
// preload.ts 实现这些接口，渲染进程通过 window.api 消费。

// ============ 基础类型 ============

export type WriteMode = 'text' | 'hex'
export type AppendMode = 'none' | 'LF' | 'CR' | 'CRLF'

export interface SerialPortInfo {
  path: string
  manufacturer?: string
  vendorId?: string
  productId?: string
  serialNumber?: string
  pnpId?: string
}

export interface SerialOpenOptions {
  baudRate: number
  dataBits?: number
  stopBits?: number
  parity?: string
  rtscts?: boolean
  xon?: boolean
  xoff?: boolean
  xany?: boolean
}

export interface WriteResult {
  ok: boolean
  error?: string
  bytes?: number
}

export interface DataPayload {
  id: string
  bytes: Uint8Array
  ts: number
}

export interface SerialEvent {
  id: string
  type: 'open' | 'close' | 'error'
  message?: string
}

export interface PanelConfig {
  id: string
  title?: string
  // 其余字段由 panels.json 实际内容决定，这里用宽松类型
  [key: string]: unknown
}

export type PanelConfigKind =
  | 'current-panel'
  | 'panel'
  | 'serial-port'
  | 'tcp-endpoint'
  | 'tcp-server'
  | 'file'
  | 'local'

export interface PanelConfigRef {
  kind: PanelConfigKind
  panelId?: string
  portPath?: string
  host?: string
  port?: number
  path?: string
  serialOptions?: SerialOpenOptions
  bufferMs?: number
  append?: AppendMode
  usesFallbackOptions?: boolean
}

export interface SerialPanelSummary {
  id: string
  name: string
  type: 'serial' | 'tcp' | 'modbus'
  open: boolean
  active: boolean
  hidden?: boolean
  options?: SerialOpenOptions
  bufferMs?: number
  append?: AppendMode
}

export interface ScriptRunContext {
  /**
   * 当前活动面板/串口 id，作为隐式 send()/waitOnePacket()/listenCurrentPackets()
   * 的默认目标。可空：不依赖面板的脚本（纯 TCP、显式 sendToSerial/sendToPanel、
   * sleep/log/计算等）无需先建面板即可运行。隐式 API 在 id 缺失时会给出
   * 清晰的运行期错误，而非静默挂起。
   */
  id?: string
}

export interface ScriptEndedPayload {
  runId: string
  ok: boolean
  error?: string
  logs: string[]
}

export interface ScriptLogPayload {
  runId: string
  line: string
}

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

// ============ 脚本编辑器图结构 ============

export type SocketKind = 'dataSocket' | 'boolSocket' | 'flowSocket' | 'triggerSocket'

export type NodeCategory =
  | 'input'
  | 'transform'
  | 'split'
  | 'numeric'
  | 'string'
  | 'compare'
  | 'logical'
  | 'control'
  | 'output'
  | 'modbus'
  | 'protocol'

export interface SocketSpec {
  key: string
  socket: SocketKind
  label?: string
}

export type ControlKind = 'text' | 'number' | 'select' | 'boolean'

export interface ControlSpec {
  key: string
  type: ControlKind
  label: string
  default?: unknown
  options?: string[]
  source?: 'serial-panels' | 'serial-ports' | 'modbus-panels'
  required?: boolean
}

export interface NodeDef {
  key: string
  category: NodeCategory
  name: string
  inputs: SocketSpec[]
  outputs: SocketSpec[]
  controls: ControlSpec[]
  icon?: string
  color?: string
  /** 节点说明（供配置面板 / MCP 工具描述复用） */
  description?: string
}

/** 精简 JSON Schema（MCP tools/list 用，非完整 draft 实现） */
export type JsonSchemaType = 'string' | 'number' | 'boolean' | 'object' | 'array'

export interface JsonSchema {
  type?: JsonSchemaType | JsonSchemaType[]
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  enum?: Array<string | number | boolean>
  items?: JsonSchema
  additionalProperties?: boolean
}

/**
 * 节点导出的 MCP Tool 描述（描述层；不绑定传输/Server）。
 * name 使用节点 key，便于 AI 与图结构对齐。
 */
export interface McpToolDescriptor {
  name: string
  description: string
  inputSchema: JsonSchema
  annotations?: {
    category: NodeCategory
    sandboxApis: string[]
    nodeKey: string
  }
}

export interface ReteGraphNode {
  id: string | number
  key: string
  label?: string
  position?: { x: number; y: number }
  data?: Record<string, unknown>
  inputs?: Record<string, unknown>
  outputs?: Record<string, unknown>
}

export interface ReteGraphConnection {
  id?: string | number
  source: string | number
  sourceOutput: string
  target: string | number
  targetInput: string
}

export interface ReteGraphExport {
  nodes: ReteGraphNode[] | Record<string, ReteGraphNode>
  connections?: ReteGraphConnection[] | Record<string, ReteGraphConnection>
}

// ============ API 域接口 ============

export interface SerialAPI {
  list: () => Promise<SerialPortInfo[]>
  open: (path: string, options: SerialOpenOptions) => Promise<{ ok: boolean; error?: string; id?: string; alreadyOpen?: boolean }>
  close: (id: string) => Promise<{ ok: boolean; error?: string }>
  write: (id: string, data: string, mode?: WriteMode, append?: AppendMode, encoding?: string) => Promise<WriteResult>
  onData: (cb: (p: DataPayload) => void) => () => void
  onEvent: (cb: (e: SerialEvent) => void) => () => void
}

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

export interface TcpAPI {
  open: (host: string, port: number, options: unknown) => Promise<{ ok: boolean; id?: string; error?: string; already?: boolean }>
  write: (id: string, data: string, mode?: WriteMode, append?: AppendMode, encoding?: string) => Promise<WriteResult>
  close: (id: string) => Promise<{ ok: boolean; error?: string }>
  onData: (cb: (p: DataPayload) => void) => () => void
  onEvent: (cb: (e: SerialEvent) => void) => () => void
}

export interface TcpServerAPI {
  start: (port: number, echo?: boolean) => Promise<{ ok: boolean; id?: string; port?: number; error?: string; echo?: boolean }>
  stop: (id: string) => Promise<{ ok: boolean; error?: string }>
  status: (id: string) => Promise<unknown>
  broadcast: (id: string, data: string, mode?: WriteMode, append?: AppendMode, encoding?: string) => Promise<WriteResult>
  onData: (cb: (p: { serverId: string; clientId: string; bytes: Uint8Array; ts: number }) => void) => () => void
  onEvent: (cb: (e: SerialEvent) => void) => () => void
}

/** TCP 共享返回值（对齐 electron/main.ts:562-581 tcpShare:* 的 resolve 结构） */
export interface TcpShareResult {
  ok: boolean
  /** 共享监听端口 */
  port: number
  /** 所有 LAN IPv4 地址拼成 ip:port */
  addrs: string[]
  /** 推荐地址（addrs[0]） */
  best?: string
}

/** TCP 共享状态查询返回（与 TcpShareResult 相比多了 active） */
export interface TcpShareStatus {
  ok: boolean
  active: boolean
  port?: number
  addrs?: string[]
  best?: string
}

export interface TcpShareAPI {
  start: (id: string, port: number) => Promise<TcpShareResult>
  stop: (id: string) => Promise<{ ok: boolean }>
  status: (id: string) => Promise<TcpShareStatus>
}

export interface WindowControlAPI {
  setFullscreen: (flag: boolean) => void
  toggleFullscreen: () => void
  focus: () => void
  setOscilloscopeTop: (flag: boolean) => void
  /** 进程平台（win32/darwin/linux），用于窗口栏按平台分支 */
  platform: () => Promise<'win32' | 'darwin' | 'linux'>
  /** 最小化当前发出请求的窗口 */
  minimize: () => void
  /** 当前窗口最大化/还原切换 */
  toggleMaximize: () => void
  /** 关闭当前窗口 */
  close: () => void
  /** 当前窗口是否已最大化 */
  isMaximized: () => Promise<boolean>
  /** 订阅最大化态变化（返回卸载函数） */
  onMaximizeChange: (cb: (max: boolean) => void) => () => void
}

export interface PanelAPI {
  popout: (id: string, title: string, historyStr: string, alwaysOnTop: boolean, isOpen: boolean, viewMode: string, optionsStr: string) => Promise<unknown>
  onFocusFromPopout: (cb: (p: { id: string }) => void) => () => void
  onDockRequest: (cb: (p: { id: string; html?: string }) => void) => () => void
  onHideRequest: (cb: (p: { id: string }) => void) => () => void
  requestHide: (id: string) => void
  onLoadContent: (cb: (p: { id: string; historyStr: string }) => void) => () => void
  requestDock: (id: string, html: string) => void
  getPanelPortIdFromArgs: () => string | null
  saveLog: (name: string, content: string) => Promise<unknown>
  setAlwaysOnTop: (id: string, onTop: boolean) => void
}

/** 弹出/dock 双向传图时承载的图快照 + 活动脚本名 */
export interface ScriptEditorGraphPayload {
  graphStr: string
  activeScriptName: string
}

/** 脚本编辑器弹出窗 IPC 契约 */
export interface ScriptEditorAPI {
  /**
   * 弹出为独立窗口（单例：已有则聚焦）。携带主窗当前图快照 + 活动脚本名，
   * 主进程缓存后于弹窗 did-finish-load 回灌，使弹窗不丢图（双向传图-去程）。
   */
  popout: (graphStr: string, activeScriptName: string) => Promise<{ ok: boolean; error?: string }>
  /**
   * 从弹出窗请求 dock 回主窗。携带弹窗内最新图快照，主窗据以恢复（双向传图-回程）。
   */
  requestDock: (graphStr: string, activeScriptName: string) => void
  /** 弹出窗挂载时监听主进程回灌的图快照（did-finish-load 触发） */
  onPopoutPayload: (cb: (payload: ScriptEditorGraphPayload) => void) => () => void
  /**
   * 主窗监听 dock 信号（携带弹窗带回的图快照 + 活动脚本名），据此恢复内嵌弹层图。
   */
  onDock: (cb: (payload: ScriptEditorGraphPayload) => void) => () => void
  /** renderer 自检是否在弹出窗内（main 经 additionalArguments 注入 --script-editor-popout） */
  isPopout: () => boolean
}

/** 脚本输出行（跨进程同步用；与 renderer store 的 OutputLine 同形） */
export interface ScriptOutputLine {
  text: string
  ts: number
}

/** 输出栏弹出窗初始/同步载荷 */
export interface ScriptOutputPayload {
  lines: ScriptOutputLine[]
  scriptName: string
}

/**
 * 脚本输出弹出窗 IPC。
 * 宿主（脚本编辑器）为 source of truth：运行日志仍由 host 收 scripts:log，
 * 再 sync 到弹出窗；弹出窗 clear 反向通知 host。
 */
export interface ScriptOutputAPI {
  /** 弹出独立输出窗（单例：已有则聚焦并刷新快照） */
  popout: (lines: ScriptOutputLine[], scriptName: string) => Promise<{ ok: boolean; error?: string }>
  /** host → 弹出窗：推送最新完整日志列表 */
  sync: (lines: ScriptOutputLine[], scriptName?: string) => void
  /** 弹出窗请求关闭（嵌回）；host 侧也可用来主动关窗 */
  requestClose: () => void
  /** 弹出窗请求清空：main 转给 host，host clearOutput 后再 sync([]) */
  requestClear: () => void
  /** 弹出窗：首包 + 二次聚焦刷新 */
  onPopoutPayload: (cb: (payload: ScriptOutputPayload) => void) => () => void
  /** 弹出窗：host 推送的实时同步 */
  onSync: (cb: (payload: ScriptOutputPayload) => void) => () => void
  /** host：弹出窗点了清空 */
  onClearRequest: (cb: () => void) => () => void
  /** host：弹出窗已关闭 */
  onClosed: (cb: () => void) => () => void
  /** 当前 renderer 是否是输出弹出窗 */
  isPopout: () => boolean
}

export interface ConfigAPI {
  load: () => Promise<PanelConfig[]>
  save: (panels: PanelConfig[]) => void
}

export interface CommandsAPI {
  load: () => Promise<unknown[]>
  save: (cmds: unknown[]) => void
  /** 同步落盘挂起的命令（退出前调用，返回后主进程才退出） */
  flush: () => Promise<void>
}

export interface FileAPI {
  readHex: (filePath: string) => Promise<unknown>
  /** 「导入文件」（发送文件用）专用：打开对话框。与日志保存(logger:pickFile)解耦 */
  pickOpen: () => Promise<string | null>
  /** 从拖放的 File 对象取真实磁盘路径（包 webUtils.getPathForFile，Electron 31 替代已移除的 File.path） */
  getPath: (file: File) => string
}

export interface LoggerAPI {
  append: (path: string, text: string) => Promise<unknown>
  pickFile: () => Promise<string | null>
}

export type ScriptImportResult =
  | { ok: true; name: string }
  | { ok: false; canceled?: boolean; error?: string }

export interface ScriptsAPI {
  dir: () => Promise<string>
  list: () => Promise<string[]>
  read: (name: string) => Promise<string>
  write: (name: string, content: string) => Promise<{ ok: boolean; error?: string }>
  delete: (name: string) => Promise<unknown>
  rename: (oldName: string, newName: string) => Promise<{ ok: boolean; error?: string }>
  exportScript: (name: string) => Promise<{ ok: boolean; canceled?: boolean; error?: string; filePath?: string }>
  importScript: () => Promise<ScriptImportResult>
  run: (code: string, ctx: ScriptRunContext) => Promise<{ runId: string }>
  stop: (runId: string) => Promise<unknown>
  onEnded: (cb: (p: ScriptEndedPayload) => void) => () => void
  onLog: (cb: (p: ScriptLogPayload) => void) => () => void
}

export interface ShellAPI {
  openExternal: (url: string) => void
}

export interface AppControlAPI {
  getVersion: () => Promise<string>
  checkUpdate: () => void
  /** 主进程退出前 flush 请求的监听。返回 unsubscribe。 */
  onFlushRequested: (cb: () => void) => () => void
}

export interface ChangelogAPI {
  open: () => void
  request: () => void
  onLoad: (cb: (text: string) => void) => () => void
}

export interface AboutInfo {
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  arch: string
}

export interface AboutAPI {
  open: () => void
  request: () => void
  onLoad: (cb: (info: AboutInfo) => void) => () => void
}

export interface ThemeAPI {
  set: (dark: boolean) => void
  onApply: (cb: (p: { dark: boolean }) => void) => () => void
}

// ============ 完整 window.api 类型 ============

export interface WindowAPI {
  serial: SerialAPI
  modbus: ModbusAPI
  tcp: TcpAPI
  tcpServer: TcpServerAPI
  tcpShare: TcpShareAPI
  window: WindowControlAPI
  panel: PanelAPI
  scriptEditor: ScriptEditorAPI
  scriptOutput: ScriptOutputAPI
  config: ConfigAPI
  commands: CommandsAPI
  file: FileAPI
  logger: LoggerAPI
  scripts: ScriptsAPI
  shell: ShellAPI
  app: AppControlAPI
  changelog: ChangelogAPI
  about: AboutAPI
  theme: ThemeAPI
}

declare global {
  interface Window {
    api: WindowAPI
  }
}
