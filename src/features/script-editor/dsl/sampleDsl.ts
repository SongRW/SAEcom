/**
 * 协议生成向导 —— 预设模板。
 *
 * 供 docToDsl 的「模板填充」路径和向导「选模板后微调」入口使用。
 * 三套覆盖最常见的协议形态：简单定长 / TLV / 多消息。
 */
import type { ProtocolDsl } from '@shared/protocol-dsl'

/** 简单定长协议：magic + deviceId + payload + crc16。
 *  注意：字段名不要用 'seq'——'seq' 在 dslToGraph 里会触发循环序号绑定
 *  （loop.out → seq.content），组包侧值被循环索引覆盖，往返验证会报不一致。
 *  这里用 'deviceId' 作为固定值字段示例。 */
export const SIMPLE_PROTOCOL_DSL: ProtocolDsl = {
  name: 'SimpleProtocol',
  fields: [
    { kind: 'const', name: 'magic', value: 'AA55', mode: 'hex' },
    { kind: 'uint', name: 'deviceId', width: 1, value: 1 },
    { kind: 'text', name: 'payload', value: 'hello', encoding: 'utf8' },
    { kind: 'crc', name: 'crc', algorithm: 'CRC16', endian: 'big', append: true }
  ],
  transport: { mode: 'tcp-loopback', port: 9000 },
  loop: { count: 1 },
  receiveLog: 'console',
  verifyOnRecv: true
}

/** TLV 协议：magic + msgType + TLV 条目 + crc16。 */
export const TLV_PROTOCOL_DSL: ProtocolDsl = {
  name: 'TlvProtocol',
  fields: [
    { kind: 'const', name: 'magic', value: 'AA55', mode: 'hex' },
    { kind: 'uint', name: 'msgType', width: 1, value: 1 },
    { kind: 'tlv', name: 'data', entries: [
      { type: 0x10, value: '设备A', mode: 'text' },
      { type: 0x11, value: '01', mode: 'hex' }
    ]},
    { kind: 'crc', name: 'crc', algorithm: 'CRC16', endian: 'little', append: true }
  ],
  transport: { mode: 'tcp-loopback', port: 9001 },
  loop: { count: 1 },
  receiveLog: 'console',
  verifyOnRecv: true
}

/** 多消息协议：REQ/ACK 两种消息类型 + 交互流。 */
export const MULTI_MESSAGE_DSL: ProtocolDsl = {
  name: 'MultiMessageProtocol',
  messages: [
    {
      msgType: 'REQ',
      typeId: 0x01,
      fields: [
        { kind: 'const', name: 'magic', value: 'AA55', mode: 'hex' },
        { kind: 'uint', name: 'msgType', width: 1, value: 0x01 },
        { kind: 'uint', name: 'seq', width: 2, endian: 'big', value: 1 },
        { kind: 'text', name: 'cmd', value: 'READ', encoding: 'utf8' },
        { kind: 'crc', name: 'crc', algorithm: 'CRC16', endian: 'big', append: true }
      ]
    },
    {
      msgType: 'ACK',
      typeId: 0x02,
      fields: [
        { kind: 'const', name: 'magic', value: 'AA55', mode: 'hex' },
        { kind: 'uint', name: 'msgType', width: 1, value: 0x02 },
        { kind: 'uint', name: 'seq', width: 2, endian: 'big', value: 1 },
        { kind: 'uint', name: 'status', width: 1, value: 0 },
        { kind: 'crc', name: 'crc', algorithm: 'CRC16', endian: 'big', append: true }
      ]
    }
  ],
  interactions: [
    { send: 'REQ', expectAck: 'ACK', onAck: 'continue', timeout: 5000 }
  ],
  transport: { mode: 'tcp-loopback', port: 9002 },
  loop: { count: 1 },
  receiveLog: 'console',
  verifyOnRecv: true
}

/** 模板列表（供向导下拉选择）。 */
export const PROTOCOL_TEMPLATES: Array<{ key: string; label: string; dsl: ProtocolDsl }> = [
  { key: 'simple', label: '简单定长协议', dsl: SIMPLE_PROTOCOL_DSL },
  { key: 'tlv', label: 'TLV 协议', dsl: TLV_PROTOCOL_DSL },
  { key: 'multi', label: '多消息协议（REQ/ACK）', dsl: MULTI_MESSAGE_DSL }
]
