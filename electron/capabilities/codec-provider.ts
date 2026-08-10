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
import { textToHex, hexToText, convertBase } from '../../shared/protocol-tools'

/**
 * CodecCapabilityProvider —— 纯函数编码/校验/换算能力。
 *
 * textToHex / hexToText / convertBase 现从 protocol-tools（可独立 import 的基座）re-export，
 * 行为与原闭包实现逐行一致（已由 protocol-tools.test.ts 覆盖 latin1 往返、大小端、进制边界）。
 * 其余能力（convertEncoding / swapBytes / chunkString / bytesToNumber / crc* / checksum /
 * aes* / btoa / atob）仍直接来自 scriptSandbox 或内联。
 *
 * 纯函数、无 rc/IO 依赖（apis 忽略 rc）。
 */
export class CodecCapabilityProvider implements CapabilityProvider {
  readonly id = 'codec'

  apis(_rc: RunContext): Record<string, any> {
    return {
      textToHex,
      hexToText,
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
      convertBase
    }
  }
}
