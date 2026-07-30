import net from 'node:net'
import iconv from 'iconv-lite'

/**
 * 复杂二进制协议 mock 设备（TCP）—— v2 加长版。
 *
 * 线格式：原始二进制帧（客户端用 sendToPanel(..., 'hex') 写入）。
 *
 * ── 通用帧布局（大端，除非标注）────────────────────────────────
 *   magic       u16   = AA55
 *   version     u8    = 02
 *   msgType     u8    = 01 REQ | 02 ACK | 03 EVENT | 04 NACK
 *   seq         u16   序号
 *   flags       u8    bit0=has_tlv  bit1=has_float  bit2=has_trailer  bit3=fragment_test
 *   bitfield    u16   = 6bit | 2bit | 1bit | 7bit
 *   sw_hex      u8    0x01 / 0x00
 *   sw_bin      u8    0 / 1
 *   dec_u16     u16   十进制定长
 *   int32_be    i32   有符号大端
 *   int32_le    i32   有符号小端（同值，字节序对照）
 *   float_be    f32   仅 flags.has_float 时存在，否则跳过 4B
 *   fixed_hex   4B    定长 16 进制载荷
 *   ascii_len   u8    + ascii 字节（字符流）
 *   gbk_len     u16   + gbk 变长
 *   utf8_len    u8    + utf8 变长
 *   tlv_count   u8    仅 flags.has_tlv；随后 N 组 (type u8, len u8, value[len])
 *   trailer_len u8    仅 flags.has_trailer；随后 trailer 字节（可含 mixed binary）
 *   crc16       u16   对 magic..trailer 的 Modbus CRC16（小端写出）
 *   crc8        u8    对 magic..crc16 的 crc8
 *
 * 服务端行为：
 * - 合法 REQ → 回 ACK（开关翻转、dec+1、seq 原样、附固定回显串 + 回显 TLVs）
 * - flags.fragment_test → ACK 拆成 2 次 socket.write（半包）
 * - 每个合法 REQ 后再 push 2 帧 EVENT（与 ACK 可能粘在同一 TCP 段或紧随其后）
 * - CRC 错误 → NACK（msgType=04），不 push EVENT
 */

export type MsgType = 0x01 | 0x02 | 0x03 | 0x04

export interface TlvField {
  type: number
  value: Buffer
}

export interface ProtocolFrame {
  magic: number
  version: number
  msgType: number
  seq: number
  flags: number
  bit6: number
  bit2: number
  bit1: number
  bit7: number
  bitfield: number
  swHex: number
  swBin: number
  decU16: number
  int32Be: number
  int32Le: number
  floatBe: number | null
  fixedHex: string
  ascii: string
  gbkText: string
  utf8Text: string
  tlvs: Array<{ type: number; hex: string; text?: string }>
  trailerHex: string
  crc16: string
  crc8: string
  raw: Buffer
}

export interface ComplexProtocolServer {
  port: number
  requests: ProtocolFrame[]
  nacks: ProtocolFrame[]
  rawChunks: Buffer[]
  /** 服务端写出的原始 chunk（用于断言半包） */
  writtenChunks: Buffer[]
  close: () => Promise<void>
}

export const PROTO = {
  MAGIC: 0xaa55,
  VERSION: 0x02,
  MSG_REQ: 0x01 as MsgType,
  MSG_ACK: 0x02 as MsgType,
  MSG_EVENT: 0x03 as MsgType,
  MSG_NACK: 0x04 as MsgType,
  FLAG_TLV: 0x01,
  FLAG_FLOAT: 0x02,
  FLAG_TRAILER: 0x04,
  FLAG_FRAGMENT: 0x08,
  RESP_UTF8: '应答UTF8加长测试αβ',
  RESP_GBK: '应答GBK测完整中文',
  RESP_ASCII: 'ACK-OK-LONG',
  RESP_FIXED_HEX: 'CAFEBABE',
  EVENT_ASCII: 'EVT',
  EVENT_UTF8: '事件推送'
} as const

export function packBitfield(bit6: number, bit2: number, bit1: number, bit7: number): number {
  return ((bit6 & 0x3f) << 10) | ((bit2 & 0x03) << 8) | ((bit1 & 0x01) << 7) | (bit7 & 0x7f)
}

export function unpackBitfield(value: number): { bit6: number; bit2: number; bit1: number; bit7: number } {
  return {
    bit6: (value >>> 10) & 0x3f,
    bit2: (value >>> 8) & 0x03,
    bit1: (value >>> 7) & 0x01,
    bit7: value & 0x7f
  }
}

export function crc8(data: Buffer): number {
  let crc = 0x00
  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x80) ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff
    }
  }
  return crc & 0xff
}

/** Modbus RTU CRC16，返回 0..0xFFFF（低字节在前写出）。 */
export function crc16modbus(data: Buffer): number {
  let crc = 0xffff
  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) ? (crc >> 1) ^ 0xa001 : crc >> 1
    }
  }
  return crc & 0xffff
}

export interface BuildFrameInput {
  msgType?: number
  seq?: number
  flags?: number
  bit6: number
  bit2: number
  bit1: number
  bit7: number
  swHex: number
  swBin: number
  decU16: number
  int32?: number
  floatBe?: number | null
  fixedHex: string
  ascii: string
  gbkText: string
  utf8Text: string
  tlvs?: Array<{ type: number; value: Buffer | string; encoding?: 'utf8' | 'gbk' | 'hex' | 'binary' }>
  trailerHex?: string
  version?: number
  /** 测试用：故意写错 crc8 */
  corruptCrc8?: boolean
  /** 测试用：故意写错 crc16 */
  corruptCrc16?: boolean
}

function encodeTlvValue(
  value: Buffer | string,
  encoding: 'utf8' | 'gbk' | 'hex' | 'binary' = 'utf8'
): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (encoding === 'hex') return Buffer.from(String(value).replace(/\s/g, ''), 'hex')
  if (encoding === 'binary') return Buffer.from(String(value), 'binary')
  if (encoding === 'gbk') return iconv.encode(String(value), 'gbk')
  return Buffer.from(String(value), 'utf8')
}

export function buildFrame(fields: BuildFrameInput): Buffer {
  const flags = fields.flags ?? (
    (fields.tlvs && fields.tlvs.length ? PROTO.FLAG_TLV : 0)
    | (fields.floatBe != null ? PROTO.FLAG_FLOAT : 0)
    | (fields.trailerHex ? PROTO.FLAG_TRAILER : 0)
  )
  const bitfield = packBitfield(fields.bit6, fields.bit2, fields.bit1, fields.bit7)
  const fixed = Buffer.from(fields.fixedHex.replace(/\s/g, ''), 'hex')
  if (fixed.length !== 4) throw new Error(`fixedHex 必须 4 字节，收到 ${fixed.length}`)

  const asciiBuf = Buffer.from(fields.ascii, 'utf8')
  const gbkBuf = iconv.encode(fields.gbkText, 'gbk')
  const utf8Buf = Buffer.from(fields.utf8Text, 'utf8')
  if (asciiBuf.length > 255) throw new Error('ascii 过长')
  if (utf8Buf.length > 255) throw new Error('utf8 过长')
  if (gbkBuf.length > 0xffff) throw new Error('gbk 过长')

  const tlvs = (fields.tlvs || []).map((t) => ({
    type: t.type & 0xff,
    value: encodeTlvValue(t.value, t.encoding)
  }))
  for (const t of tlvs) {
    if (t.value.length > 255) throw new Error(`TLV type=${t.type} 过长`)
  }
  const trailer = fields.trailerHex
    ? Buffer.from(fields.trailerHex.replace(/\s/g, ''), 'hex')
    : Buffer.alloc(0)
  if (trailer.length > 255) throw new Error('trailer 过长')

  const hasFloat = (flags & PROTO.FLAG_FLOAT) !== 0
  const hasTlv = (flags & PROTO.FLAG_TLV) !== 0
  const hasTrailer = (flags & PROTO.FLAG_TRAILER) !== 0
  const int32 = fields.int32 ?? 0

  let tlvBytes = 0
  if (hasTlv) {
    tlvBytes = 1
    for (const t of tlvs) tlvBytes += 2 + t.value.length
  }
  const floatBytes = hasFloat ? 4 : 0
  const trailerBytes = hasTrailer ? 1 + trailer.length : 0

  // magic2+ver1+msg1+seq2+flags1+bit2+sw1+sw1+dec2+i32be4+i32le4+float?+fixed4
  // +ascii +gbk +utf8 +tlv? +trailer? +crc16_2 +crc8_1
  const coreLen =
    2 + 1 + 1 + 2 + 1 + 2 + 1 + 1 + 2 + 4 + 4
    + floatBytes + 4
    + 1 + asciiBuf.length
    + 2 + gbkBuf.length
    + 1 + utf8Buf.length
    + tlvBytes
    + trailerBytes

  const body = Buffer.alloc(coreLen)
  let o = 0
  body.writeUInt16BE(PROTO.MAGIC, o); o += 2
  body.writeUInt8(fields.version ?? PROTO.VERSION, o); o += 1
  body.writeUInt8(fields.msgType ?? PROTO.MSG_REQ, o); o += 1
  body.writeUInt16BE((fields.seq ?? 1) & 0xffff, o); o += 2
  body.writeUInt8(flags & 0xff, o); o += 1
  body.writeUInt16BE(bitfield, o); o += 2
  body.writeUInt8(fields.swHex & 0xff, o); o += 1
  body.writeUInt8(fields.swBin & 0xff, o); o += 1
  body.writeUInt16BE(fields.decU16 & 0xffff, o); o += 2
  body.writeInt32BE(int32 | 0, o); o += 4
  body.writeInt32LE(int32 | 0, o); o += 4
  if (hasFloat) {
    body.writeFloatBE(Number(fields.floatBe ?? 0), o); o += 4
  }
  fixed.copy(body, o); o += 4
  body.writeUInt8(asciiBuf.length, o); o += 1
  asciiBuf.copy(body, o); o += asciiBuf.length
  body.writeUInt16BE(gbkBuf.length, o); o += 2
  gbkBuf.copy(body, o); o += gbkBuf.length
  body.writeUInt8(utf8Buf.length, o); o += 1
  utf8Buf.copy(body, o); o += utf8Buf.length

  if (hasTlv) {
    body.writeUInt8(tlvs.length, o); o += 1
    for (const t of tlvs) {
      body.writeUInt8(t.type, o); o += 1
      body.writeUInt8(t.value.length, o); o += 1
      t.value.copy(body, o); o += t.value.length
    }
  }
  if (hasTrailer) {
    body.writeUInt8(trailer.length, o); o += 1
    trailer.copy(body, o); o += trailer.length
  }

  if (o !== coreLen) throw new Error(`frame size mismatch o=${o} core=${coreLen}`)

  let c16 = crc16modbus(body)
  if (fields.corruptCrc16) c16 ^= 0xffff
  const withCrc16 = Buffer.alloc(body.length + 2)
  body.copy(withCrc16, 0)
  withCrc16.writeUInt16LE(c16, body.length)

  let c8 = crc8(withCrc16)
  if (fields.corruptCrc8) c8 ^= 0xff
  const frame = Buffer.alloc(withCrc16.length + 1)
  withCrc16.copy(frame, 0)
  frame.writeUInt8(c8, withCrc16.length)
  return frame
}

export function parseFrame(buf: Buffer): ProtocolFrame | null {
  if (buf.length < 30) return null
  let o = 0
  const magic = buf.readUInt16BE(o); o += 2
  if (magic !== PROTO.MAGIC) return null
  const version = buf.readUInt8(o); o += 1
  const msgType = buf.readUInt8(o); o += 1
  const seq = buf.readUInt16BE(o); o += 2
  const flags = buf.readUInt8(o); o += 1
  const bitfield = buf.readUInt16BE(o); o += 2
  const bits = unpackBitfield(bitfield)
  const swHex = buf.readUInt8(o); o += 1
  const swBin = buf.readUInt8(o); o += 1
  const decU16 = buf.readUInt16BE(o); o += 2
  if (o + 8 > buf.length) return null
  const int32Be = buf.readInt32BE(o); o += 4
  const int32Le = buf.readInt32LE(o); o += 4

  let floatBe: number | null = null
  if (flags & PROTO.FLAG_FLOAT) {
    if (o + 4 > buf.length) return null
    floatBe = buf.readFloatBE(o); o += 4
  }
  if (o + 4 > buf.length) return null
  const fixedHex = buf.subarray(o, o + 4).toString('hex').toUpperCase(); o += 4

  if (o + 1 > buf.length) return null
  const asciiLen = buf.readUInt8(o); o += 1
  if (o + asciiLen + 2 > buf.length) return null
  const ascii = buf.subarray(o, o + asciiLen).toString('utf8'); o += asciiLen

  const gbkLen = buf.readUInt16BE(o); o += 2
  if (o + gbkLen + 1 > buf.length) return null
  const gbkText = iconv.decode(buf.subarray(o, o + gbkLen), 'gbk'); o += gbkLen

  const utf8Len = buf.readUInt8(o); o += 1
  if (o + utf8Len > buf.length) return null
  const utf8Text = buf.subarray(o, o + utf8Len).toString('utf8'); o += utf8Len

  const tlvs: ProtocolFrame['tlvs'] = []
  if (flags & PROTO.FLAG_TLV) {
    if (o + 1 > buf.length) return null
    const count = buf.readUInt8(o); o += 1
    for (let i = 0; i < count; i++) {
      if (o + 2 > buf.length) return null
      const type = buf.readUInt8(o); o += 1
      const len = buf.readUInt8(o); o += 1
      if (o + len > buf.length) return null
      const value = buf.subarray(o, o + len); o += len
      const hex = value.toString('hex').toUpperCase()
      let text: string | undefined
      try { text = value.toString('utf8') } catch { /* ignore */ }
      tlvs.push({ type, hex, text })
    }
  }

  let trailerHex = ''
  if (flags & PROTO.FLAG_TRAILER) {
    if (o + 1 > buf.length) return null
    const tlen = buf.readUInt8(o); o += 1
    if (o + tlen > buf.length) return null
    trailerHex = buf.subarray(o, o + tlen).toString('hex').toUpperCase(); o += tlen
  }

  if (o + 3 > buf.length) return null
  const crc16Val = buf.readUInt16LE(o)
  const crc16Hex = crc16Val.toString(16).toUpperCase().padStart(4, '0')
  const bodyForCrc16 = buf.subarray(0, o)
  o += 2
  const crc8Val = buf.readUInt8(o)
  const withCrc16 = buf.subarray(0, o)
  o += 1

  if (crc16modbus(bodyForCrc16) !== crc16Val) return null
  if (crc8(withCrc16) !== crc8Val) return null

  return {
    magic,
    version,
    msgType,
    seq,
    flags,
    ...bits,
    bitfield,
    swHex,
    swBin,
    decU16,
    int32Be,
    int32Le,
    floatBe,
    fixedHex,
    ascii,
    gbkText,
    utf8Text,
    tlvs,
    trailerHex,
    crc16: crc16Hex,
    crc8: crc8Val.toString(16).toUpperCase().padStart(2, '0'),
    raw: buf.subarray(0, o)
  }
}

/** 从流缓冲尽量切完整帧（变长，靠 flags + length 字段）。 */
export function tryExtractFrame(buffer: Buffer): { frame: ProtocolFrame; rest: Buffer } | null {
  for (let i = 0; i < buffer.length - 1; i++) {
    if (buffer[i] !== 0xaa || buffer[i + 1] !== 0x55) continue
    const slice = buffer.subarray(i)
    if (slice.length < 30) return null

    let o = 2 + 1 + 1 + 2 + 1 + 2 + 1 + 1 + 2 + 4 + 4 // through int32le
    if (slice.length < o + 1) return null
    const flags = slice.readUInt8(2 + 1 + 1 + 2) // after magic,ver,msg,seq
    if (flags & PROTO.FLAG_FLOAT) o += 4
    o += 4 // fixed
    if (slice.length < o + 1) return null
    const asciiLen = slice.readUInt8(o); o += 1 + asciiLen
    if (slice.length < o + 2) return null
    const gbkLen = slice.readUInt16BE(o); o += 2 + gbkLen
    if (slice.length < o + 1) return null
    const utf8Len = slice.readUInt8(o); o += 1 + utf8Len
    if (flags & PROTO.FLAG_TLV) {
      if (slice.length < o + 1) return null
      const count = slice.readUInt8(o); o += 1
      for (let t = 0; t < count; t++) {
        if (slice.length < o + 2) return null
        const len = slice.readUInt8(o + 1)
        o += 2 + len
      }
    }
    if (flags & PROTO.FLAG_TRAILER) {
      if (slice.length < o + 1) return null
      const tlen = slice.readUInt8(o); o += 1 + tlen
    }
    o += 3 // crc16 + crc8
    if (slice.length < o) return null

    const candidate = slice.subarray(0, o)
    const parsed = parseFrame(candidate)
    if (!parsed) {
      // magic 碰巧匹配但校验失败：跳过该字节继续找
      continue
    }
    return { frame: parsed, rest: buffer.subarray(i + o) }
  }
  return null
}

export function extractAllFrames(buffer: Buffer): { frames: ProtocolFrame[]; rest: Buffer } {
  const frames: ProtocolFrame[] = []
  let rest = buffer
  for (;;) {
    const one = tryExtractFrame(rest)
    if (!one) break
    frames.push(one.frame)
    rest = Buffer.from(one.rest)
  }
  return { frames, rest }
}

export function buildAck(req: ProtocolFrame): Buffer {
  return buildFrame({
    msgType: PROTO.MSG_ACK,
    seq: req.seq,
    flags: PROTO.FLAG_TLV | PROTO.FLAG_FLOAT | PROTO.FLAG_TRAILER
      | (req.flags & PROTO.FLAG_FRAGMENT),
    bit6: req.bit6,
    bit2: req.bit2,
    bit1: req.bit1,
    bit7: req.bit7,
    swHex: req.swHex ? 0x00 : 0x01,
    swBin: req.swBin ? 0 : 1,
    decU16: (req.decU16 + 1) & 0xffff,
    int32: (req.int32Be + 1) | 0,
    floatBe: req.floatBe != null ? req.floatBe * 2 : 3.5,
    fixedHex: PROTO.RESP_FIXED_HEX,
    ascii: PROTO.RESP_ASCII,
    gbkText: PROTO.RESP_GBK,
    utf8Text: PROTO.RESP_UTF8,
    tlvs: [
      { type: 0x01, value: `echo-seq-${req.seq}`, encoding: 'utf8' },
      { type: 0x02, value: 'DEAD', encoding: 'hex' },
      { type: 0x10, value: '回显TLV', encoding: 'gbk' }
    ],
    trailerHex: '0F1E2D3C'
  })
}

export function buildNack(seq: number, reason: string): Buffer {
  return buildFrame({
    msgType: PROTO.MSG_NACK,
    seq,
    flags: PROTO.FLAG_TLV,
    bit6: 0,
    bit2: 0,
    bit1: 0,
    bit7: 0,
    swHex: 0,
    swBin: 0,
    decU16: 0,
    int32: 0,
    fixedHex: '00000000',
    ascii: 'NACK',
    gbkText: '失败',
    utf8Text: reason,
    tlvs: [{ type: 0x7f, value: reason, encoding: 'utf8' }]
  })
}

export function buildEvent(seq: number, index: number): Buffer {
  return buildFrame({
    msgType: PROTO.MSG_EVENT,
    seq,
    flags: PROTO.FLAG_TLV,
    bit6: index & 0x3f,
    bit2: 1,
    bit1: index & 1,
    bit7: 7,
    swHex: 0,
    swBin: 0,
    decU16: 1000 + index,
    int32: index,
    fixedHex: 'EEFF0011',
    ascii: `${PROTO.EVENT_ASCII}${index}`,
    gbkText: `事件${index}`,
    utf8Text: `${PROTO.EVENT_UTF8}#${index}`,
    tlvs: [
      { type: 0x20, value: Buffer.from([index & 0xff, seq & 0xff, (seq >> 8) & 0xff]) }
    ]
  })
}

function writeMaybeFragmented(
  socket: net.Socket,
  buf: Buffer,
  fragment: boolean,
  onWrite: (chunk: Buffer) => void
): void {
  if (!fragment || buf.length < 8) {
    onWrite(buf)
    socket.write(buf)
    return
  }
  const mid = Math.max(3, Math.floor(buf.length / 2))
  const a = buf.subarray(0, mid)
  const b = buf.subarray(mid)
  onWrite(Buffer.from(a))
  socket.write(a)
  // 轻微延迟制造半包窗口（仍在同一次事件循环稍后）
  setImmediate(() => {
    onWrite(Buffer.from(b))
    try { socket.write(b) } catch { /* ignore */ }
  })
}

export async function startComplexProtocolServer(): Promise<ComplexProtocolServer> {
  const state: ComplexProtocolServer = {
    port: 0,
    requests: [],
    nacks: [],
    rawChunks: [],
    writtenChunks: [],
    close: async () => {}
  }

  const sockets = new Set<net.Socket>()

  const server = net.createServer((socket) => {
    sockets.add(socket)
    let pending = Buffer.alloc(0)

    const trackWrite = (chunk: Buffer) => {
      state.writtenChunks.push(Buffer.from(chunk))
    }

    socket.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      state.rawChunks.push(Buffer.from(buf))
      pending = Buffer.concat([pending, buf])

      for (;;) {
        // 先尝试完整合法帧
        const extracted = tryExtractFrame(pending)
        if (!extracted) {
          // 可能是损坏帧：若已有 magic 且缓冲足够长却一直 parse 失败，尝试跳过 1 字节防卡死
          if (pending.length > 4096) {
            const idx = pending.indexOf(Buffer.from([0xaa, 0x55]), 1)
            pending = idx > 0 ? pending.subarray(idx) : pending.subarray(1)
            continue
          }
          break
        }

        const frame = extracted.frame
        pending = Buffer.from(extracted.rest)

        if (frame.msgType === PROTO.MSG_REQ) {
          state.requests.push(frame)
          const fragment = (frame.flags & PROTO.FLAG_FRAGMENT) !== 0
          const ack = buildAck(frame)
          writeMaybeFragmented(socket, ack, fragment, trackWrite)

          // 粘包：紧接着推 2 个 EVENT（若半包模式，EVENT 等 ACK 后半段发出后再发，避免打乱）
          const pushEvents = () => {
            try {
              const e0 = buildEvent(frame.seq, 0)
              const e1 = buildEvent(frame.seq, 1)
              // 故意粘成一次 write，锻炼客户端流式拆帧
              const sticky = Buffer.concat([e0, e1])
              trackWrite(sticky)
              socket.write(sticky)
            } catch { /* ignore */ }
          }
          if (fragment) setTimeout(pushEvents, 15)
          else pushEvents()
        }
      }

      // 额外：检测「看起来像完整长度但 CRC 坏」的请求 → NACK
      // tryExtractFrame 对坏 CRC 会跳过；这里用宽松长度探测
      // （简化：若 pending 以 magic 开头且长度够一帧最小值，尝试 force parse body lengths）
      if (pending.length >= 30 && pending[0] === 0xaa && pending[1] === 0x55) {
        const probe = tryProbeCorrupt(pending)
        if (probe) {
          state.nacks.push(probe.meta as ProtocolFrame)
          const nack = buildNack(probe.seq, 'bad-crc')
          trackWrite(nack)
          try { socket.write(nack) } catch { /* ignore */ }
          pending = Buffer.from(probe.rest)
        }
      }
    })

    socket.on('close', () => { sockets.delete(socket) })
    socket.on('error', () => { sockets.delete(socket) })
  })

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        state.port = addr.port
        resolve()
      } else {
        reject(new Error('complex protocol server 监听失败'))
      }
    })
  })

  state.close = () =>
    new Promise<void>((resolve) => {
      for (const s of sockets) {
        try { s.destroy() } catch { /* ignore */ }
      }
      sockets.clear()
      server.close(() => resolve())
    })

  return state
}

/** 探测损坏帧：长度字段完整但 CRC 失败时消费掉并返回 seq。 */
function tryProbeCorrupt(buffer: Buffer): { seq: number; rest: Buffer; meta: Partial<ProtocolFrame> } | null {
  if (buffer.length < 30) return null
  if (buffer[0] !== 0xaa || buffer[1] !== 0x55) return null
  try {
    let o = 2 + 1 + 1
    const seq = buffer.readUInt16BE(o); o += 2
    const flags = buffer.readUInt8(o); o += 1
    o += 2 + 1 + 1 + 2 + 4 + 4 // bitfield..int32le
    if (flags & PROTO.FLAG_FLOAT) o += 4
    o += 4
    if (buffer.length < o + 1) return null
    const asciiLen = buffer.readUInt8(o); o += 1 + asciiLen
    if (buffer.length < o + 2) return null
    const gbkLen = buffer.readUInt16BE(o); o += 2 + gbkLen
    if (buffer.length < o + 1) return null
    const utf8Len = buffer.readUInt8(o); o += 1 + utf8Len
    if (flags & PROTO.FLAG_TLV) {
      if (buffer.length < o + 1) return null
      const count = buffer.readUInt8(o); o += 1
      for (let i = 0; i < count; i++) {
        if (buffer.length < o + 2) return null
        const len = buffer.readUInt8(o + 1)
        o += 2 + len
      }
    }
    if (flags & PROTO.FLAG_TRAILER) {
      if (buffer.length < o + 1) return null
      o += 1 + buffer.readUInt8(o)
    }
    o += 3
    if (buffer.length < o) return null
    const candidate = buffer.subarray(0, o)
    if (parseFrame(candidate)) return null // 其实是好帧，交给正常路径
    return {
      seq,
      rest: buffer.subarray(o),
      meta: { seq, msgType: PROTO.MSG_REQ, raw: candidate } as Partial<ProtocolFrame>
    }
  } catch {
    return null
  }
}
