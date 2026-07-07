// 地址前缀 + displayFormat 解码纯函数（无副作用，便于单测）

/** Modbus 地址显示：FC→前缀 + 地址+1（Modbus 地址从 1 开始，0-based 协议地址需 +1） */
export function modbusAddressLabel(functionCode: 1 | 2 | 3 | 4, address: number): string {
  const prefix = functionCode === 1 ? 0
    : functionCode === 2 ? 1
    : functionCode === 4 ? 3
    : 4 // FC3
  return String(prefix * 10000 + address + 1).padStart(5, '0')
}

/** 单寄存器格式化（signed/unsigned/hex/binary） */
export function formatCellDisplay(values: number[], format: 'signed' | 'unsigned' | 'hex' | 'binary'): string {
  const v = values[0] ?? 0
  const u16 = v & 0xffff
  switch (format) {
    case 'unsigned': return String(u16)
    case 'signed': return String(u16 >= 0x8000 ? u16 - 0x10000 : u16)
    case 'hex': return u16.toString(16).toUpperCase().padStart(4, '0')
    case 'binary': return u16.toString(2).padStart(16, '0')
  }
}

/** float32 解码：消费 2 个寄存器，按 4 种字节序 */
export function decodeRegisterValue(values: number[], format: 'float32' | 'float32-swapped' | 'float32-byte' | 'float32-word-byte'): string {
  if (values.length < 2) return '—'
  const a = values[0] & 0xffff
  const b = values[1] & 0xffff
  const aHi = (a >> 8) & 0xff, aLo = a & 0xff
  const bHi = (b >> 8) & 0xff, bLo = b & 0xff
  let bytes: number[]
  switch (format) {
    case 'float32':         bytes = [aHi, aLo, bHi, bLo]; break           // ABCD
    case 'float32-swapped': bytes = [bHi, bLo, aHi, aLo]; break           // CDAB
    case 'float32-byte':    bytes = [aLo, aHi, bLo, bHi]; break           // BADC
    case 'float32-word-byte': bytes = [bLo, bHi, aLo, aHi]; break         // DCBA
  }
  const buf = new ArrayBuffer(4)
  const view = new DataView(buf)
  bytes.forEach((byte, i) => view.setUint8(i, byte))
  const num = view.getFloat32(0, false)
  return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(6)))
}
