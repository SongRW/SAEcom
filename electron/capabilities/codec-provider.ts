import type { CapabilityProvider, RunContext } from '../core/capability-registry'
import {
  bytesToNumber,
  checksum,
  chunkString,
  convertEncoding,
  crc8,
  crc16,
  crc16ccitt,
  crc32,
  swapBytes,
  aesEncrypt,
  aesDecrypt
} from '../scriptSandbox'

/**
 * CodecCapabilityProvider —— 纯函数编码/校验/换算能力。
 *
 * 对照搬移自 main.ts sandbox 对象字面量中以下 key：
 *   textToHex / hexToText / btoa / atob（原为沙箱内联实现，保留内联，零变化）/
 *   convertEncoding / swapBytes / chunkString / bytesToNumber（来自 scriptSandbox）/
 *   convertBase（内联）/ crc8 / crc16 / crc16ccitt / crc32 / checksum（来自 scriptSandbox）/
 *   aesEncrypt / aesDecrypt（来自 scriptSandbox，基于 node:crypto）
 *
 * 纯函数、无 rc/IO 依赖（apis 忽略 rc）。行为逐行对照搬移，零变化。
 */
export class CodecCapabilityProvider implements CapabilityProvider {
  readonly id = 'codec'

  apis(_rc: RunContext): Record<string, any> {
    return {
      textToHex: (s: string) => {
        let hex = ''
        for (let i = 0; i < s.length; i++) {
          hex += s.charCodeAt(i).toString(16).padStart(2, '0')
        }
        return hex.toUpperCase()
      },
      hexToText: (h: string) => {
        let text = ''
        const cleanHex = h.replace(/\s/g, '')
        for (let i = 0; i < cleanHex.length; i += 2) {
          text += String.fromCharCode(parseInt(cleanHex.substr(i, 2), 16))
        }
        return text
      },
      btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
      atob: (b: string) => Buffer.from(b, 'base64').toString('binary'),
      convertEncoding,
      swapBytes,
      chunkString,
      bytesToNumber,
      crc8,
      crc16,
      crc16ccitt,
      crc32,
      checksum,
      aesEncrypt,
      aesDecrypt,

      convertBase: (value: string, from: string, to: string) => {
        const baseMap: Record<string, number> = { '二进制': 2, '八进制': 8, '十进制': 10, '十六进制': 16 }
        const fromBase = baseMap[from] || parseInt(from) || 10
        const toBase = baseMap[to] || parseInt(to) || 10

        let cleanValue = String(value).trim()
        if (fromBase === 16) cleanValue = cleanValue.replace(/^0x/i, '')
        if (fromBase === 2) cleanValue = cleanValue.replace(/^0b/i, '')

        const decimal = parseInt(cleanValue, fromBase)
        if (isNaN(decimal)) return 'NaN'

        let result = decimal.toString(toBase)
        if (toBase === 16) result = result.toUpperCase()
        if (toBase === 2 && result.length < 8) result = result.padStart(8, '0')
        if (toBase === 16 && result.length < 2) result = result.padStart(2, '0')

        return result
      }
    }
  }
}
