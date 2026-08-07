/**
 * 协议 DSL —— AI 友好的高层协议描述（AI 产出 → dslToGraph 转 graph JSON）。
 *
 * 设计原则：
 * - AI 只需描述「协议有哪些字段、怎么拼帧、怎么校验」，不需要懂节点 key/端口/连线
 * - 每种字段类型对应一个内置节点（const→protocol-const，crc→protocol-crc 等）
 * - 转换器负责节点创建、连线、布局、data 设置，保证 graph 契约正确
 *
 * 用法：AI 产出一个 ProtocolDsl 对象，调 dslToGraph(dsl) 得到 ReteGraphExport，
 * 再经 generateCodeFromRete 生成可运行代码，或直接加载到画布。
 */

/** 帧字段：组成协议帧的每个字段。kind 决定用哪个内置节点。 */
export type ProtocolField =
  | ConstField
  | UintField
  | TextField
  | BitfieldField
  | LengthPrefixField
  | CrcField
  | CustomField
  | TlvField
  | RepeatBlockField
  | OptionalField

/** 常量字段（magic/version 等固定字节）→ protocol-const */
export interface ConstField {
  kind: 'const'
  /** 字段名（生成节点 label） */
  name: string
  /** hex 值（如 'AA55'）或十进制/文本（由 mode 决定） */
  value: string
  /** 值的模式 */
  mode?: 'hex' | 'decimal' | 'binary' | 'text'
  /** 字节宽度（decimal/binary 模式补零到 width 字节） */
  width?: number
}

/** 无符号整数字段（序号/计数器等）→ protocol-const(decimal) 或 protocol-parse-u（解析时） */
export interface UintField {
  kind: 'uint'
  name: string
  /** 字节宽度：1=u8, 2=u16, 4=u32 */
  width: 1 | 2 | 4
  /** 字节序 */
  endian?: 'big' | 'little'
  /** 固定值（组包时）；不填则用上游连线值（如循环序号） */
  value?: number
}

/** 文本字段（ASCII/GBK 字符串）→ protocol-const(text) */
export interface TextField {
  kind: 'text'
  name: string
  /** 文本内容 */
  value: string
  /** 编码 */
  encoding?: 'utf8' | 'gbk' | 'latin1'
}

/** 位域字段（多 bit 打包）→ protocol-bitfield */
export interface BitfieldField {
  kind: 'bitfield'
  name: string
  /** 位域子字段（总 bits ≤ 32） */
  fields: Array<{ name: string; bits: number }>
}

/** 长度前缀字段 → protocol-len-prefix */
export interface LengthPrefixField {
  kind: 'length-prefix'
  name: string
  /** 长度宽度 */
  width?: 'u8' | 'u16'
}

/** CRC/校验字段 → protocol-crc */
export interface CrcField {
  kind: 'crc'
  name: string
  /** 校验算法 */
  algorithm?: 'CRC8' | 'CRC16' | 'CRC32' | '校验和'
  /** 字节序（CRC16 有效） */
  endian?: 'big' | 'little'
  /** 是否附加到帧尾 */
  append?: boolean
}

/** 自定义组件字段 → custom-* 节点（测自定义组件功能） */
export interface CustomField {
  kind: 'custom'
  name: string
  /** 自定义组件 key（如 'custom-aes-crypto'） */
  componentKey: string
  /** 组件配置（controls 的 data 值） */
  config?: Record<string, unknown>
}

/** 传输层描述（TCP 收发拓扑） */
export interface Transport {
  /** loopback：脚本自建服务端+客户端闭环；client：连外部服务端 */
  mode: 'tcp-loopback' | 'tcp-client'
  /** TCP 端口 */
  port: number
  /** 目标主机（tcp-client 模式） */
  host?: string
}

/** 循环描述（压力测试用） */
export interface LoopConfig {
  /** 循环次数 */
  count: number
}

/** 完整协议 DSL（AI 产出此对象） */
export interface ProtocolDsl {
  /** 协议名（生成脚本/节点 label 前缀） */
  name: string
  /** 组包字段（简单协议：按顺序拼成帧）。
   *  复杂协议用 messages 替代 fields（多消息类型）。两者互斥。 */
  fields?: ProtocolField[]
  /** 多消息类型（复杂协议：REQ/ACK/EVENT/NACK 等，每种不同字段集） */
  messages?: MessageSpec[]
  /** 交互流（多轮：发送→等ACK→条件分支） */
  interactions?: InteractionStep[]
  /** 传输层（不填则纯本地数据流，无 TCP） */
  transport?: Transport
  /** 循环（不填则单次执行） */
  loop?: LoopConfig
  /** 是否在接收侧做拆包校验（默认 true，有 transport 时生效） */
  verifyOnRecv?: boolean
}

// ═══════════════════════════════════════════════════════════
// 横向复杂度：多消息类型 + 嵌套结构 + 交互流
// ═══════════════════════════════════════════════════════════

/** 消息类型定义（复杂协议的每种帧结构） */
export interface MessageSpec {
  /** 消息类型标识（如 'REQ', 'ACK', 'EVENT'） */
  msgType: string
  /** 该消息类型的字段集（不含帧头公共字段，转换器自动加 magic/msgType/seq） */
  fields: ProtocolField[]
  /** 消息类型标识值（帧头 msgType 字段的数值，如 0x01=REQ, 0x02=ACK） */
  typeId?: number
}

/** 嵌套字段类型（在 ProtocolField 联合中扩展） */
export interface TlvField {
  kind: 'tlv'
  name: string
  /** TLV 条目：每个生成 type(u8) + length(u8) + value 三段 */
  entries: Array<{ type: number; value: string; mode?: 'hex' | 'text' }>
}

export interface RepeatBlockField {
  kind: 'repeat-block'
  name: string
  /** 决定重复次数的字段名（引用前序 parse 出的 count 值；组包侧用 count 固定值） */
  countField?: string
  /** 组包侧固定重复次数（不依赖前序字段） */
  count?: number
  /** 每个重复块的内部字段 */
  blockFields: ProtocolField[]
}

export interface OptionalField {
  kind: 'optional'
  name: string
  /** flags 中的哪一位控制此字段是否出现（0-7） */
  flagBit: number
  /** 实际字段（仅当 flagBit 为 1 时拼入） */
  field: ProtocolField
}

/** 交互步骤（多轮交互流） */
export interface InteractionStep {
  /** 发送的消息类型（引用 MessageSpec.msgType） */
  send: string
  /** 期望收到的 ACK 消息类型（不填=不等，单向发送） */
  expectAck?: string
  /** 收到 ACK 后的动作 */
  onAck?: 'continue' | 'retry' | 'abort'
  /** 重试次数（onAck=retry 时） */
  retryCount?: number
  /** 超时（ms，默认 5000） */
  timeout?: number
}
