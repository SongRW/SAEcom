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
  /** 组包字段（按顺序拼成帧） */
  fields: ProtocolField[]
  /** 传输层（不填则纯本地数据流，无 TCP） */
  transport?: Transport
  /** 循环（不填则单次执行） */
  loop?: LoopConfig
  /** 是否在接收侧做拆包校验（默认 true，有 transport 时生效） */
  verifyOnRecv?: boolean
}
