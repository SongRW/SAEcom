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

export function convertEncoding(value: unknown, from = 'utf8', to = 'utf8'): string {
  const source = normalizeEncoding(from)
  const target = normalizeEncoding(to)
  const text = String(value ?? '')

  if (!iconv || source === target) return text
  if (!iconv.encodingExists(source) || !iconv.encodingExists(target)) return text

  const sourceBuffer = Buffer.from(text, source === 'utf8' ? 'utf8' : 'binary')
  const decoded = iconv.decode(sourceBuffer, source)
  const encoded = iconv.encode(decoded, target)
  return target === 'utf8' ? encoded.toString('utf8') : encoded.toString('binary')
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
  return lowered === 'utf8' ? 'utf8' : lowered
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
