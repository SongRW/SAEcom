let iconv: any = null
try { iconv = require('iconv-lite') } catch { iconv = null }

export interface SandboxState {
  _last_recv: string
  globalVars: Record<string, unknown>
}

export function createSandboxState(): SandboxState {
  return {
    _last_recv: '',
    globalVars: {}
  }
}

export function updateLastRecv(state: SandboxState, value: unknown): string {
  const text = String(value ?? '')
  state._last_recv = text
  return text
}

/**
 * 编码转换约定（脚本协议拼包常用）：
 * - utf8：JS 字符串（Unicode 文本）
 * - latin1/binary：字节容器（每 char 一字节 0..255），TCP 收包/HEX 还原后常用
 * - gbk 等：源为「该编码的字节容器」；目标为「该编码的字节容器」
 *
 * 例：
 *   convertEncoding('中文', 'utf8', 'gbk') → gbk 字节串
 *   convertEncoding(gbkBytes, 'gbk', 'utf8') → '中文'
 *   convertEncoding(utf8BytesAsLatin1, 'latin1', 'utf8') → 按 UTF-8 解码文本
 */
export function convertEncoding(value: unknown, from = 'utf8', to = 'utf8'): string {
  const source = normalizeEncoding(from)
  const target = normalizeEncoding(to)
  const text = String(value ?? '')

  if (source === target) return text

  const unicode = decodeToUnicode(text, source)
  if (unicode == null) return text
  return encodeFromUnicode(unicode, target) ?? text
}

function isByteContainerEncoding(encoding: string): boolean {
  return encoding === 'latin1' || encoding === 'binary' || encoding === 'iso88591'
}

function decodeToUnicode(text: string, encoding: string): string | null {
  if (encoding === 'utf8') return text
  if (isByteContainerEncoding(encoding)) {
    // 字节袋 → 按 UTF-8 解释（协议里 UTF-8 变长字段经 latin1 传输的典型路径）
    return Buffer.from(text, 'binary').toString('utf8')
  }
  if (iconv && iconv.encodingExists(encoding)) {
    // gbk 等：输入已是该编码的字节容器
    return iconv.decode(Buffer.from(text, 'binary'), encoding)
  }
  return null
}

function encodeFromUnicode(unicode: string, encoding: string): string | null {
  if (encoding === 'utf8') return unicode
  if (isByteContainerEncoding(encoding)) {
    return Buffer.from(unicode, 'utf8').toString('binary')
  }
  if (iconv && iconv.encodingExists(encoding)) {
    // 目标 gbk 等：返回字节容器，便于 textToHex 拼帧
    return iconv.encode(unicode, encoding).toString('binary')
  }
  return null
}

export function swapBytes(value: unknown, byteSize = 2): string {
  const clean = String(value ?? '').replace(/[\s,]/g, '')
  const groupLength = Math.max(1, Number(byteSize) || 2) * 2
  const groups = clean.match(new RegExp(`.{1,${groupLength}}`, 'g')) || []

  return groups.map((group) => {
    const bytes = group.match(/.{1,2}/g) || []
    return bytes.reverse().join('')
  }).join('').toUpperCase()
}

export function chunkString(value: unknown, length = 2): string[] {
  const text = String(value ?? '')
  const size = Math.max(1, Number(length) || 1)
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks
}

export function bytesToNumber(value: unknown, type = 'uint16', endian = '大端'): number {
  const buffer = toBuffer(value)
  const little = endian === '小端' || /^le$/i.test(String(endian))
  const normalized = String(type || 'uint16').toLowerCase()

  if (normalized === 'int16') return little ? buffer.readInt16LE(0) : buffer.readInt16BE(0)
  if (normalized === 'uint32') return little ? buffer.readUInt32LE(0) : buffer.readUInt32BE(0)
  if (normalized === 'int32') return little ? buffer.readInt32LE(0) : buffer.readInt32BE(0)
  if (normalized === 'float') return little ? buffer.readFloatLE(0) : buffer.readFloatBE(0)
  return little ? buffer.readUInt16LE(0) : buffer.readUInt16BE(0)
}

export function checksum(data: unknown): string {
  const sum = [...toBuffer(data)].reduce((acc, byte) => (acc + byte) & 0xff, 0)
  return toHex(sum, 2)
}

export function crc8(data: unknown): string {
  let crc = 0x00
  for (const byte of toBuffer(data)) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x80) ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff
    }
  }
  return toHex(crc, 2)
}

export function crc16(data: unknown): string {
  let crc = 0xffff
  for (const byte of toBuffer(data)) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) ? (crc >> 1) ^ 0xa001 : crc >> 1
    }
  }
  return toHex(crc, 4)
}

export function crc16ccitt(data: unknown): string {
  let crc = 0xffff
  for (const byte of toBuffer(data)) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return toHex(crc, 4)
}

export function crc32(data: unknown): string {
  let crc = 0xffffffff
  for (const byte of toBuffer(data)) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return toHex((crc ^ 0xffffffff) >>> 0, 8)
}

function normalizeEncoding(encoding: string): string {
  const lowered = String(encoding || 'utf8').toLowerCase().replace(/-/g, '')
  if (lowered === 'utf8' || lowered === 'utf8mb4') return 'utf8'
  if (lowered === 'latin1' || lowered === 'binary' || lowered === 'iso88591') return 'latin1'
  if (lowered === 'gb2312' || lowered === 'gbk' || lowered === 'gb18030') return 'gbk'
  return lowered
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (Array.isArray(value)) return Buffer.from(value)

  const text = String(value ?? '')
  const cleanHex = text.replace(/[\s,]/g, '')
  if (cleanHex.length >= 2 && cleanHex.length % 2 === 0 && /^[0-9a-f]+$/i.test(cleanHex)) {
    return Buffer.from(cleanHex.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)))
  }

  return Buffer.from(text, 'utf8')
}

function toHex(value: number, width: number): string {
  return (value >>> 0).toString(16).toUpperCase().padStart(width, '0').slice(-width)
}
