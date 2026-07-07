# MQTT 支持 — 面板与脚本编辑器

- 日期:2026-07-06
- 状态:设计定稿,待实现
- 范围:为「窗口栏(面板)」与「脚本页(脚本编辑器)」新增 MQTT 传输支持

## 1. 目标与范围

为 SAEcom 的面板系统与脚本编辑器新增 MQTT 传输,达到「完整 MQTT 客户端」能力:

- 面板侧:一个面板 = 一个 broker 连接,支持多主题订阅,消息按主题汇聚到同一数据流
- 脚本侧:新增独立的 `input-mqtt`/`output-mqtt` 节点,运行期间长连接复用
- 传输层统一:借新增 MQTT 的契机,把 serial/tcp 的 IPC 与数据流收敛到统一 `connection:*` 接口(一刀切迁移,不留兼容层)

### 功能深度

- MQTT 协议版本:3.1.1(本次不做 MQTT 5.0 特性)
- QoS:0/1/2 全支持
- 认证:用户名 + 密码 + clientId + LWT(遗嘱)
- TLS:开关式,启用后用 `mqtts://` 且不验证证书(`rejectUnauthorized:false`,适配自签证书场景)
- 主题:支持通配符(`+`/`#`)透传给 broker
- 自动重连:面板侧可配置;脚本 sub 端默认 5s 重连

### 非目标(YAGNI)

- MQTT 5.0 特性(会话过期间隔、共享订阅、用户属性等)
- 完整证书选择(CA/客户端证书/私钥)——仅 TLS 开关
- 节点级凭证(username/password/clientId/LWT)——脚本节点用默认空凭证 + 自动 clientId
- 面板内多主题分屏/独立流——多主题消息汇聚同一流,靠前缀区分

## 2. 总体架构(方案 B:统一 Connection 抽象 + MQTT)

采用「先抽象统一 Connection 接口,再加 MQTT,一次完成」。统一的边界如下:

| 层 | 是否统一 | 说明 |
|---|---|---|
| 主进程 IPC | 统一 | serial/tcp/mqtt 的 open/send/close 收敛到 `connection:*`,data/event 统一通道 |
| 数据流(dataBus/store) | 统一 | 只注册一个 `connection.onData/onEvent`,按 meta 有无决定展示前缀 |
| chunk 模型 | 统一 | `meta?` 字段,serial/tcp 为空,MQTT 带 topic/qos |
| 配置 UI 表单 | 按 type 分化 | NewPanelDialog:serial/tcp/mqtt 三套表单(字段语义不同,无法合并) |
| 发送栏字段 | 按 type 分化 | mqtt 面板多出 topic+QoS 输入 |

务实边界:把真正重复的地方(传输打开/关闭/读写/事件)收敛,把本质不同的地方(配置字段)保留分化。

### 消息抽象模型

所有传输都建模成「带元数据的消息流」:serial/tcp 的一段字节就是一条 meta 为空的消息,MQTT 的一条 publish 就是 meta 含 topic/qos 的消息。

## 3. 类型模型(`shared/types.ts`)

### 3.1 扩展 PanelType

```ts
export type PanelType = 'serial' | 'tcp' | 'mqtt'
```

### 3.2 传输无关消息与事件类型

```ts
// 传输无关的入站消息(所有 onData 都产出这个)
export interface ConnectionMessage {
  id: string                              // 面板/连接 id
  ts: number                              // 接收时间戳
  bytes: Uint8Array                       // payload
  meta?: ConnectionMessageMeta            // 传输特有元数据
}

export interface ConnectionMessageMeta {
  // MQTT 专有(serial/tcp 时为 undefined)
  topic?: string
  qos?: number
  retain?: boolean
  dup?: boolean
}

// 传输无关的出站消息
// 面板发送栏、命令按钮、脚本(writeToSerial 等)统一传 text,主进程 buildWriteBuffer 处理
export interface OutgoingMessage {
  text: string                            // payload 文本(主进程按 mode/append/encoding 编码)
  mode?: 'text' | 'hex'
  append?: AppendMode
  encoding?: string
  // MQTT 专有(serial/tcp 忽略)
  topic?: string
  qos?: number
  retain?: boolean
}

export interface ConnectionEvent {
  id: string
  type: 'open' | 'close' | 'error' | 'reconnect'
  message?: string
}
```

### 3.3 统一连接 IPC 接口

```ts
export interface ConnectionAPI {
  open(id: string, kind: PanelType, options: ConnectionOptions): Promise<{ ok: boolean; id?: string; error?: string }>
  send(id: string, msg: OutgoingMessage): Promise<{ ok: boolean; bytes?: number; error?: string }>
  close(id: string): Promise<{ ok: boolean }>
  onData(cb: (msg: ConnectionMessage) => void): () => void
  onEvent(cb: (e: ConnectionEvent) => void): () => void
}
```

`ConnectionOptions` 为 discriminated union,运行时主进程按 `kind` 分派:

```ts
export type ConnectionOptions =
  | { kind: 'serial'; path: string; options: SerialOpenOptions }
  | { kind: 'tcp'; host: string; port: number; options: TcpOptions }
  | { kind: 'mqtt'; options: MqttOptions }
```

### 3.4 MqttOptions

```ts
export interface MqttOptions {
  host: string
  port: number
  tls: boolean                      // 决定 mqtt:// vs mqtts://
  clientId: string
  username?: string
  password?: string
  clean: boolean                    // 默认 true
  keepalive: number                 // 默认 60s
  // 面板级订阅:多主题,支持通配符
  topics: string[]
  qos: number                       // 0|1|2,订阅 QoS
  // LWT
  lwt?: { topic: string; payload: string; qos: number; retain: boolean }
  // 复用 TCP 现有语义
  autoReconnect: boolean
  reconnectMs: number               // 默认 5000
  timeoutMs: number                 // 连接超时,默认 5000
}
```

### 3.5 WindowAPI 扩展

`WindowAPI` 新增 `connection: ConnectionAPI`。旧 `serial`/`tcp`/`tcpServer`/`tcpShare` 的 write/open/close 部分迁移到 `connection`(tcpServer 的 broadcast、tcpShare、serial:list 保持独立,因为它们语义不匹配统一接口)。

> 迁移边界:`connection:*` 只统一「面向单个面板连接的 open/send/close + data/event」。tcpServer(广播给多客户端)、tcpShare(串口 LAN 中继)、serial:list(枚举端口)保持各自独立 IPC。

## 4. 主进程传输层(`electron/main.ts` + `electron/preload.ts`)

### 4.1 ConnectionHandle 契约

```ts
interface ConnectionHandle {
  start(): Promise<void>
  onData(cb: (bytes: Uint8Array, meta?: ConnectionMessageMeta) => void): void
  onEvent(cb: (e: ConnectionEvent) => void): void
  send(msg: OutgoingMessage): Promise<{ ok: boolean; bytes?: number; error?: string }>
  close(): Promise<void>
}

const connections = new Map<string, { kind: PanelType; handle: ConnectionHandle; opts: any }>()
```

三个实现:

- `SerialConnection`:包装现有 SerialPort 逻辑(复用 `buildWriteBuffer`、`normalizeSerialOpenOptions`、`ensureSerialOpen` 内部逻辑)
- `TcpConnection`:包装现有 `net.Socket` + 重连逻辑
- `MqttConnection`:新增,用 `mqtt.js`

### 4.2 统一 IPC(一刀切,替换旧 serial/tcp open/send/close)

```ts
ipcMain.handle('connection:open', async (e, { id, kind, options }) => {
  const handle = kind === 'serial' ? new SerialConnection(id, options)
                : kind === 'tcp'   ? new TcpConnection(id, options)
                :                    new MqttConnection(id, options)
  connections.set(id, { kind, handle, opts: options })
  return await handle.start().then(() => ({ ok: true, id }), (err) => ({ ok: false, error: String(err?.message || err) }))
})
ipcMain.handle('connection:send', async (_e, { id, msg }) => {
  const c = connections.get(id); if (!c) return { ok: false, error: 'NOT_OPEN' }
  return c.handle.send(msg)
})
ipcMain.handle('connection:close', async (_e, { id }) => {
  const c = connections.get(id); if (!c) return { ok: true }
  await c.handle.close(); connections.delete(id)
  return { ok: true }
})
```

**一刀切迁移**:同一改动里 `connection:*` 上线、旧 `serial:open`/`serial:write`/`serial:close`/`tcp:open`/`tcp:write`/`tcp:close` 删除、所有调用点(store、panel.tsx、SendBar、sendCommand、sandbox `writeToSerial`/`writeGeneric`)切换。中间不留半迁移状态。

**数据广播**:data/event 用 `sendAll`(遍历 `BrowserWindow.getAllWindows()`,参考现有 serial 模式 `main.ts:505`),让 popout 窗口也收到——同时修正 TCP 现有只发给 opener 的缺陷。

### 4.3 MqttConnection 实现

```ts
import mqtt from 'mqtt'

class MqttConnection implements ConnectionHandle {
  private client: mqtt.MqttClient
  private opts: MqttOptions
  private topics: string[]
  // ...dataCbs / eventCbs sets

  constructor(id: string, opts: MqttOptions) {
    this.opts = opts
    this.topics = opts.topics || []
    const url = buildMqttUrl(opts)   // opts.tls ? `mqtts://${host}:${port}` : `mqtt://${host}:${port}`
    this.client = mqtt.connect(url, {
      clientId: opts.clientId,
      username: opts.username,
      password: opts.password,
      clean: opts.clean ?? true,
      keepalive: opts.keepalive ?? 60,
      reconnectPeriod: opts.autoReconnect ? (opts.reconnectMs ?? 5000) : 0,
      connectTimeout: opts.timeoutMs ?? 5000,
      will: opts.lwt ? { topic: opts.lwt.topic, payload: opts.lwt.payload, qos: opts.lwt.qos, retain: opts.lwt.retain } : undefined,
      rejectUnauthorized: false       // TLS 开关不验证书
    })
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.once('connect', () => {
        if (this.topics.length) {
          this.client.subscribe(this.topics.map(t => ({ topic: t, qos: this.opts.qos ?? 0 })))
        }
        emitEvent({ type: 'open' }); resolve()
      })
      this.client.once('error', e => reject(e))
      this.client.on('message', (topic, payload, packet) => {
        emitData(payload, { topic, qos: packet.qos, retain: packet.retain, dup: packet.dup })
      })
      this.client.on('reconnect', () => emitEvent({ type: 'reconnect' }))
      this.client.on('close', () => emitEvent({ type: 'close' }))
      this.client.on('error', e => emitEvent({ type: 'error', message: e.message }))
    })
  }

  send(msg: OutgoingMessage) {
    const payload = buildWriteBuffer(msg.text ?? '', msg.mode ?? 'text', msg.append ?? 'none', msg.encoding ?? 'utf-8')
    return new Promise(resolve => {
      this.client.publish(msg.topic!, payload, { qos: msg.qos ?? 0, retain: msg.retain ?? false }, (err) => {
        resolve(err ? { ok: false, error: err.message } : { ok: true, bytes: payload.length })
      })
    })
  }

  close() { return new Promise(r => this.client.end(false, () => r())) }
}
```

`buildMqttUrl(opts)`:`opts.tls ? \`mqtts://${host}:${port}\` : \`mqtt://${host}:${port}\``

### 4.4 依赖

`npm i mqtt`(runtime 依赖)。`electron.vite.config.ts` 的 `externalizeDepsPlugin()` 会自动外部化到 Electron main bundle,与 `serialport` 一致。

### 4.5 preload 绑定

`electron/preload.ts` 新增 `connection` 块,绑定 `connection:open/send/close/onData/onEvent`,镜像现有 `tcp` 块结构。

## 5. 渲染层(面板侧)

### 5.1 Panel 类型扩展(`src/features/serial-panel/types.ts`)

```ts
export type PanelType = 'serial' | 'tcp' | 'mqtt'

export interface MqttOptions {
  host: string
  port: number
  tls: boolean
  clientId: string
  username?: string
  password?: string
  topics: string[]
  qos: number
  lwt?: { topic: string; payload: string; qos: number; retain: boolean }
  autoReconnect: boolean
  reconnectMs: number
  timeoutMs: number
  keepalive: number
}

export interface Panel {
  // ...现有字段不变
  type: PanelType
  options: SerialOptions
  mqttOptions?: MqttOptions          // mqtt 时(serial/tcp 时为 undefined)
  connState: 'connected' | 'disconnected' | 'reconnecting'   // 状态灯三态
}
```

### 5.2 面板 id 规约

`mqtt://${host}:${port}`(不含 topic,因为一个面板=一个 broker)。与 TCP 的 `tcp://host:port` 一致。`store.ts` id 前缀推断加 `'mqtt'` 臂;popout 的 `panel.tsx` 类型推断也加。

### 5.3 NewPanelDialog 新增 mqtt 模式

`mode` 扩展为 `'serial' | 'tcp' | 'mqtt'`,顶部加第三个按钮「MQTT」。mqtt 模式表单字段:

- Broker 主机(默认 `broker.hivemq.com`)
- 端口(默认 1883)
- TLS 开关(复选框,启用时端口默认改 8883)
- ClientID(默认 `saecom_${随机}`,可改)
- 用户名/密码(选填)
- 订阅主题(多行/逗号分隔,默认空,支持通配符)
- QoS 下拉(0/1/2)
- 自动重连复选框(默认开)
- LWT 折叠区:主题/消息/QoS/retain(选填)

### 5.4 发送栏扩展(`SendBar.tsx`)

发送栏组件保持 transport 无关,只构造 `OutgoingMessage`。MQTT 面板时额外渲染 topic+QoS 输入:

- 现有(serial/tcp):`[payload 输入][发送]`
- MQTT 面板:`[topic 输入][QoS 下拉][payload 输入][发送]`
- topic 默认填面板配置的**首个订阅主题**,用户可改
- QoS 与订阅 QoS 解耦,发送可独立选

发送逻辑统一为 `ipc.connection.send(id, msg)`,msg 含 topic/qos(MQTT)或不含(serial/tcp)。

### 5.5 数据区主题/QoS 显示

`DataDisplay` 渲染 chunk 时,若 `chunk.meta?.topic` 存在,在每条消息前加前缀:

```
[14:32:01] (sensor/room1/temp | Q1) 23.5
```

- serial/tcp 的 chunk 无 `meta`,显示与现在完全一致(零回归)
- MQTT 前缀 `(topic | Qn)` 用次要色/小字号,与 payload 视觉区分
- 发送回显(echo)的 chunk 带 topic meta,显示为 `(pub → topic | Qn)`

`PanelChunk` 扩展 `meta?: ConnectionMessageMeta` 字段(向后兼容,旧 chunk 无 meta)。

### 5.6 dataBus 收敛(`dataBus.ts`)

`useSerialDataBus` 从注册 serial + tcp 两套监听改为只注册一套 `connection.onData/onEvent`:

```ts
const offData = ipc.connection.onData(({ id, bytes, meta }) => {
  if (activeTransfer && activeTransfer.id === id) { activeTransfer.onData(bytes); return }
  appendWithBuffering(id, bytes, meta)
})
const offEvent = ipc.connection.onEvent((e) => {
  // 统一 open/close/error/reconnect
  // reconnect 事件 → setConnState('reconnecting') + appendSysLine('[重连中...]')
  // 文案按 type 分化:[已打开]/[已连接]/[MQTT 已连接]
})
```

`appendWithBuffering` 增加 `meta` 参数,写入 `chunk.meta`。

### 5.7 状态灯三态(`ConnectionBadge.tsx`)

`ConnectionBadge` 读 `panel.connState`:

- `connected` → 绿点 + "已连接"
- `disconnected` → 灰点 + "未连接"
- `reconnecting` → 黄点 + "重连中"(带脉冲动画)

serial/tcp:`open=true` → `connected`,`open=false` → `disconnected`(无 reconnecting)。mqtt:由 connect/reconnect/close 事件驱动。

### 5.8 其他迁移点

| 文件 | 改动 |
|---|---|
| `store.ts` togglePanelOpen | `connection.open/close` 统一调用,删除 type 分支 |
| `store.ts` load | id 前缀推断加 `mqtt://` |
| `store.ts` appendChunk | 签名扩展 meta 参数 |
| `panel.tsx` | 类型推断加 mqtt + 统一 `connection.*` |
| `PaneContextMenu.tsx` | 开关文案 MQTT 用「连接/断开」 |
| `ActivePanelConfigPanel.tsx` | MQTT 配置表单(展示 mqttOptions) |
| `activeBridge.ts` | options 透传 mqttOptions |
| `sendCommand.ts` routeWrite | 统一 `connection.send`(删除 type 分支) |

## 6. 脚本编辑器

### 6.1 新节点定义(`nodes/definitions/input.ts` + `output.ts`)

```ts
// input.ts
'input-mqtt': b.def('input-mqtt', 'input', '接收MQTT', [], [b.dataOut()], [
  b.textControl('broker', 'Broker', 'broker.hivemq.com'),
  b.numberControl('port', '端口', 1883),
  b.selectControl('tls', 'TLS', ['是', '否'], '否'),
  b.textControl('topic', '主题', 'sensor/+/temp'),
  b.selectControl('qos', 'QoS', ['0', '1', '2'], '0'),
  b.numberControl('bufferMs', '接收缓冲(ms)', 50),
  b.selectControl('append', '结尾', ['CRLF', '无', 'CR', 'LF'], 'CRLF')
]),

// output.ts
'output-mqtt': b.def('output-mqtt', 'output', '发送MQTT', [b.dataIn()], [], [
  b.textControl('broker', 'Broker', 'broker.hivemq.com'),
  b.numberControl('port', '端口', 1883),
  b.selectControl('tls', 'TLS', ['是', '否'], '否'),
  b.textControl('topic', '主题', 'device/cmd'),
  b.selectControl('qos', 'QoS', ['0', '1', '2'], '0'),
  b.selectControl('mode', '格式', ['text', 'hex'], 'text')
]),
```

节点配置只含核心连接字段(broker/port/tls/topic/qos),不含 username/password/clientId/LWT。脚本节点用默认空凭证 + 自动 clientId,适合测试 broker。这与 TCP 节点的简化程度一致。

> **必须注册到 NODE_DEFINITIONS**:避免重蹈 `input-panel`/`output-panel` 未注册导致被 `graphState.ts` 静默丢弃的覆辙。

### 6.2 PanelConfigRef 扩展(`shared/types.ts`)

```ts
export type PanelConfigKind =
  | 'current-panel' | 'panel' | 'serial-port'
  | 'tcp-endpoint' | 'tcp-server'
  | 'mqtt-endpoint'          // 新增
  | 'file' | 'local'

export interface PanelConfigRef {
  // ...现有字段
  broker?: string
  // port?: number            // 复用已有 port 字段
  tls?: boolean
  topic?: string
  qos?: number
}
```

### 6.3 panelConfig.ts 各函数加 mqtt 分支

| 函数 | mqtt 分支 |
|---|---|
| `PANEL_CONFIG_KINDS` | 加 `'mqtt-endpoint'` |
| `isMqttNode()` | 新增,判 `input-mqtt`/`output-mqtt` |
| `createPanelConfigRef` | `nodeKey.includes('mqtt')` → `{ kind:'mqtt-endpoint', broker:'broker.hivemq.com', port:1883, tls:false, topic:'...', qos:0 }` |
| `createDefaultNodeData` | mqtt 节点的 data = controls 默认值 + configRef |
| `migrateNodeData` | `nodeKey.includes('mqtt') && (data.broker||data.topic)` → 构建 mqtt-endpoint ref |
| `updateConfigRefForControl` | mqtt 节点改 broker/port/tls/topic/qos 任一 → 重建 ref |
| `isPanelConfigRef` | `case 'mqtt-endpoint': isNonEmptyString(value.broker) && isFiniteNumber(value.port)` |
| `validateNodeConfig` | mqtt 节点:broker 非空、port 非零、topic 非空 |
| `nodeLabel` | 加 `'input-mqtt':'接收MQTT','output-mqtt':'发送MQTT'` |

### 6.4 codegen(`codegen/emit/input.ts` + `output.ts`)

`isContinuousInputNode` 加 `'input-mqtt'`。

`continuousListenExpression` 加 case:

```ts
case 'input-mqtt': {
  const broker = ref.kind === 'mqtt-endpoint' ? ref.broker : config.broker
  const port = ref.kind === 'mqtt-endpoint' ? ref.port : config.port
  const tls = ref.kind === 'mqtt-endpoint' ? ref.tls : config.tls === '是'
  const topic = ref.kind === 'mqtt-endpoint' ? ref.topic : config.topic
  const qos = valueAsNumber(ref.kind === 'mqtt-endpoint' ? ref.qos : config.qos, 0)
  return `listenMqttPackets(${jsString(valueAsString(broker, 'broker.hivemq.com'))}, ${valueAsNumber(port, 1883)}, ${tls}, ${jsString(valueAsString(topic))}, ${qos}, ${jsObjectLiteral(mqttReceiveOptions(config))})`
}
```

`emitOutput` 加 case:

```ts
case 'output-mqtt': {
  const broker = ref.kind === 'mqtt-endpoint' ? ref.broker : config.broker
  const port = ref.kind === 'mqtt-endpoint' ? ref.port : config.port
  const tls = ref.kind === 'mqtt-endpoint' ? ref.tls : config.tls === '是'
  const topic = ref.kind === 'mqtt-endpoint' ? ref.topic : config.topic
  const qos = valueAsNumber(ref.kind === 'mqtt-endpoint' ? ref.qos : config.qos, 0)
  return `${indent}await sendToMqtt(${jsString(valueAsString(broker, 'broker.hivemq.com'))}, ${valueAsNumber(port, 1883)}, ${tls}, ${jsString(valueAsString(topic))}, ${input}, ${jsString(valueAsString(config.mode, 'text'))}, ${qos});\n`
}
```

生成代码示例:

```js
_listeners.push(listenMqttPackets("broker.hivemq.com", 1883, false, "sensor/+/temp", 0, {bufferMs:50, append:"CRLF"})(async (val) => { ... }))
await sendToMqtt("broker.hivemq.com", 1883, false, "device/cmd", val, "text", 0);
```

### 6.5 节点注册到类别

`nodes/definitions.ts` 聚合处,INPUT_NODES 与 OUTPUT_NODES 展开后已包含新节点。`categories.ts` 的 input/output 类别无需改动。

## 7. 脚本沙盒 MQTT 函数(`electron/main.ts`)

### 7.1 脚本级 MQTT 连接池(长连接复用)

```ts
// key = `${runId}|${brokerUrl}`(|sub 后缀),value = mqtt.MqttClient
const scriptMqttPool = new Map<string, mqtt.MqttClient>()

function closeScriptMqttForRun(runId: string): void {
  const prefix = `${runId}|`
  for (const [key, client] of scriptMqttPool) {
    if (key.startsWith(prefix)) {
      try { client.end(true) } catch {}
      scriptMqttPool.delete(key)
    }
  }
}
```

挂到 `scripts:run` 的 `finally` 块(`main.ts:1754`):

```ts
finally {
  runningScripts.delete(runId)
  removeScriptWatcher(runId)
  removeTcpServerWatchers(runId)
  closeScriptMqttForRun(runId)        // 新增
}
```

`scripts:stop` 不显式关连接——它设置 `token.aborted` + 触发 `abortHandlers`,脚本抛 ABORTED 后进入 finally,连接池由那里统一清理。与现有 TCP watcher 清理路径一致。

ctx 需新增 runId:

```ts
const ctx = { id: ctx?.id || 'test', runId }   // scripts:run 构建处(main.ts:1120 附近)
```

### 7.2 sendToMqtt(复用长连接)

```ts
sendToMqtt: async (broker, port, tls, topic, data, mode = 'text', qos = 0) => {
  if (token.aborted) throw new Error('ABORTED')
  if (ctx.id === 'test') return { ok: true, sent: data, broker, topic }

  const url = `${tls ? 'mqtts' : 'mqtt'}://${broker}:${port}`
  const poolKey = `${ctx.runId}|${url}`
  const payload = buildWriteBuffer(data, mode, 'none', 'utf-8')

  let client = scriptMqttPool.get(poolKey)
  if (!client || client.connected === false) {
    if (client) { try { client.end(true) } catch {} }
    client = mqtt.connect(url, {
      clientId: `saecom_script_${ctx.runId}_${Date.now()}`,
      connectTimeout: 5000,
      rejectUnauthorized: false,
      reconnectPeriod: 0            // pub 端不自动重连:断了就抛错让脚本感知
    })
    await onceConnect(client)
    scriptMqttPool.set(poolKey, client)
  }

  await oncePublish(client, topic, payload, { qos })
  return { ok: true, sent: data, bytes: payload.length }
}
```

pub 端 `reconnectPeriod: 0`——断了应让脚本知道。sub 端自动重连保活(见下)。

### 7.3 listenMqttPackets(复用长连接 + 自动重连)

```ts
listenMqttPackets: (broker, port, tls, topic, qos = 0, options = {}) => async (handler) => {
  if (token.aborted) return Promise.reject(new Error('ABORTED'))
  // test 模式:100ms 后喂模拟消息(类比 listenTcpPackets 的 test 分支)

  const url = `${tls ? 'mqtts' : 'mqtt'}://${broker}:${port}`
  const poolKey = `${ctx.runId}|${url}|sub`
  const listenOpts = normalizeScriptListenOptions(options)

  return new Promise((resolve, reject) => {
    let settled = false
    let client = scriptMqttPool.get(poolKey)
    const isNew = !client
    if (!client) {
      client = mqtt.connect(url, {
        clientId: `saecom_script_sub_${ctx.runId}_${Date.now()}`,
        connectTimeout: 5000,
        reconnectPeriod: 5000,       // sub 端自动重连保活
        rejectUnauthorized: false
      })
      scriptMqttPool.set(poolKey, client)
    }

    const cleanup = () => {
      token.abortHandlers.delete(stopNow)
      client.removeListener('message', onMessage)
      client.removeListener('error', onError)
    }
    const resolveOnce = () => { if (!settled) { settled = true; cleanup(); resolve() } }
    const rejectOnce = (e) => { if (!settled) { settled = true; cleanup(); reject(e) } }
    function stopNow() { resolveOnce() }
    token.abortHandlers.add(stopNow)

    const onMessage = async (_t, payload) => {
      try {
        const text = payload.toString('utf-8')
        const trimmed = trimScriptPacketEnding(text, listenOpts.append)
        await handler(updateLastRecv(sandboxState, trimmed))
        if (token.aborted) resolveOnce()
      } catch (err) { rejectOnce(err) }
    }
    const onError = (err) => rejectOnce(err)

    client.on('message', onMessage)
    client.on('error', onError)

    if (isNew) {
      client.once('connect', () => client.subscribe(topic, { qos }, (err) => { if (err) rejectOnce(err) }))
    } else {
      client.subscribe(topic, { qos }, (err) => { if (err) rejectOnce(err) })
    }
    client.on('close', () => { if (token.aborted) resolveOnce() })
  })
}
```

长连接复用关键点:

- **sub 与 pub 分池**:key 带 `|sub` 后缀。pub 端 `reconnectPeriod:0`、sub 端 `reconnectPeriod:5000`,行为不同不能共用。
- **message 监听器随 promise settle 解绑,但 client 不 end**:同 broker 的多个 listenMqttPackets(不同 topic)共用一个 client,各自订阅。
- **abortHandlers 只 resolve promise,不关连接**:连接清理延迟到 finally。

### 7.4 辅助函数

```ts
function onceConnect(client): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once('connect', () => resolve())
    client.once('error', e => reject(e))
  })
}
function oncePublish(client, topic, payload, opts): Promise<void> {
  return new Promise((resolve, reject) => {
    client.publish(topic, payload, opts, (err) => err ? reject(err) : resolve())
  })
}
```

## 8. 错误处理

### 8.1 面板侧

| 场景 | 行为 |
|---|---|
| 连接 broker 失败(超时/拒绝) | `connection:open` 返回 `{ok:false,error}` → `[错误] MQTT 连接失败:${msg}` + 状态灯 `disconnected` |
| 断线 + autoReconnect 开 | emit `reconnect` → 状态灯 `reconnecting` + `[重连中...]`;重连成功 emit `connect` → 状态灯 `connected` + `[已重连]` |
| 断线 + autoReconnect 关 | emit `close` → 状态灯 `disconnected` + `[已断开]` |
| 订阅失败 | mqtt.js subscribe 回调 err → emit `error` + `[错误] 订阅失败:${topic}` |
| 发布失败 | `connection:send` 返回 `{ok:false,error}` → 发送栏 `[错误] 发布失败:${msg}` |
| TLS 开但 broker 无 TLS | mqtt.js connect error → 按连接失败处理 |

### 8.2 脚本侧

| 场景 | 行为 |
|---|---|
| sendToMqtt 连接失败 | onceConnect reject → 抛错进脚本 → try/catch 可处理;未捕获则脚本终止 |
| listenMqttPackets 连接失败 | 同上,reject |
| sub 端被动断线 | mqtt.js 自动重连(5000ms),不中断 handler;重连成功自动重新订阅 |
| 脚本中止(scripts:stop) | token.aborted=true → 抛 ABORTED → finally → closeScriptMqttForRun |
| 连接池 client 脏(connected=false) | sendToMqtt 检测后 end 旧实例 + 重建 |

## 9. 测试策略

### 9.1 Vitest(逻辑层)

| 测试 | 文件 | 覆盖 |
|---|---|---|
| panelConfig mqtt 分支 | `test/panelConfig.test.ts`(扩展) | createPanelConfigRef/migrateNodeData/validateNodeConfig/isPanelConfigRef 的 mqtt-endpoint 路径 |
| codegen mqtt | `test/codegen-mqtt.test.ts`(新) | input-mqtt/output-mqtt 生成正确的 listenMqttPackets/sendToMqtt 调用 |
| buildMqttUrl | `test/mqtt-url.test.ts`(新) | tls 开关 → mqtts:// vs mqtt:// |

MQTT 主进程连接逻辑(MqttConnection/连接池)依赖真实 broker,不适合 Vitest 单测——放 E2E。

### 9.2 E2E(Playwright Electron,硬性门禁)

用 `aedes`(纯 JS MQTT broker)在 E2E 测试里起嵌入式 broker,类比现有 TCP echo server(`e2e/helpers/`)。

需 `npm i -D aedes`(devDependency,仅测试用,打包不包含)。

| Spec | 文件 | 覆盖 |
|---|---|---|
| MQTT 面板收发 | `e2e/mqtt-panel.spec.ts`(新) | 新建 MQTT 面板 → 连 broker → 订阅主题 → 发布消息 → 数据区显示带 topic 前缀的消息;发送栏 topic+QoS 发布 |
| MQTT 面板重连 | 同上扩展 | 断开 broker → 状态灯转黄"重连中" → 恢复 → 转绿"已连接" |
| 脚本 MQTT 节点 | `e2e/mqtt-script.spec.ts`(新) | input-mqtt 订阅 → output-mqtt 发布的数据流闭环;脚本停止后连接释放 |

aedes helper(`e2e/helpers/mqtt-broker.ts`):

```ts
import { createServer } from 'aedes'
export async function startMqttBroker(port = 1883) {
  const broker = createServer()
  await new Promise(r => broker.listen(port, r))
  return { broker, close: () => broker.close() }
}
```

### 9.3 验证命令

实现完成后运行:
- `npm test` — Vitest
- `npm run typecheck` — 类型检查
- `npm run test:e2e:build` — 构建 + E2E(硬性门禁)

## 10. 迁移与一刀切约束

### 一刀切迁移的原子性

`connection:*` 上线与旧 IPC 删除必须在同一改动里完成,中间不留半迁移状态:

1. 新增 `connection:*` IPC + preload 绑定
2. 删除 `serial:open/write/close`、`tcp:open/write/close` IPC 与 preload 绑定
3. 所有调用点一次性切换:store、panel.tsx、SendBar、sendCommand、sandbox writeToSerial/writeGeneric
4. 同一改动通过 typecheck + test + e2e

### 保持独立的 IPC

- `serial:list` — 端口枚举,语义不匹配统一接口
- `tcpServer:*` — 多客户端广播,语义不匹配
- `tcpShare:*` — 串口 LAN 中继,语义不匹配

这三个保持各自独立 IPC,不迁入 `connection:*`。

## 11. 文件清单

### 新增

- `e2e/helpers/mqtt-broker.ts` — aedes 嵌入式 broker
- `e2e/mqtt-panel.spec.ts` — MQTT 面板 E2E
- `e2e/mqtt-script.spec.ts` — 脚本 MQTT 节点 E2E
- `test/codegen-mqtt.test.ts` — codegen 单测
- `test/mqtt-url.test.ts` — buildMqttUrl 单测

### 主要修改

- `shared/types.ts` — PanelType、PanelConfigKind、ConnectionMessage/Meta/Event、OutgoingMessage、ConnectionAPI、MqttOptions、WindowAPI
- `electron/main.ts` — ConnectionHandle + 三实现、统一 connection:* IPC、删除旧 serial/tcp open/write/close、MqttConnection、脚本连接池、sendToMqtt/listenMqttPackets、closeScriptMqttForRun
- `electron/preload.ts` — connection 块,删除旧 serial/tcp open/write/close 绑定
- `src/features/serial-panel/types.ts` — PanelType、MqttOptions、Panel.connState/mqttOptions
- `src/features/serial-panel/store.ts` — togglePanelOpen/load/appendChunk 迁移
- `src/features/serial-panel/dataBus.ts` — 收敛到单一 connection.onData/onEvent
- `src/features/serial-panel/components/SendBar.tsx` — MQTT topic+QoS 输入 + 统一 connection.send
- `src/features/serial-panel/components/NewPanelDialog.tsx` — mqtt 模式
- `src/features/serial-panel/components/DataDisplay.tsx` — topic/QoS 前缀显示
- `src/features/main-window/components/ActivePanelConfigPanel.tsx` — MQTT 配置表单
- `src/features/main-window/components/ConnectionBadge.tsx` — 三态状态灯
- `src/features/main-window/components/BottomNav.tsx` — 如有 type 判断则加 mqtt 臂
- `src/features/script-editor/panelConfig.ts` — mqtt-endpoint 分支
- `src/features/script-editor/nodes/definitions/input.ts` — input-mqtt 节点
- `src/features/script-editor/nodes/definitions/output.ts` — output-mqtt 节点
- `src/features/script-editor/codegen/emit/input.ts` — input-mqtt case
- `src/features/script-editor/codegen/emit/output.ts` — output-mqtt case
- `src/features/commands/sendCommand.ts` — 统一 connection.send
- `src/app/panel.tsx` — 类型推断 + 统一 connection.*
- `src/shared/dev/mock-api.ts` — connection mock(web 预览 shim)
- `package.json` — `mqtt` 依赖 + `aedes` devDependency

### 可能涉及(需实现时确认)

- `src/features/serial-panel/components/PaneContextMenu.tsx` — 开关文案
- `src/features/serial-panel/activeBridge.ts` — options 透传
- `src/features/script-editor/components/NodeConfigPanel.tsx` — mqtt 控件渲染(若 control spec 驱动则无需改)
