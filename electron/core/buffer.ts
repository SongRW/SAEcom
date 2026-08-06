/**
 * 跨域共享：写缓冲构造。
 *
 * buildWriteBuffer 同时被串口（writeToSerial）与 TCP（tcp:write / tcpServer:broadcast）使用，
 * 抽到 core 避免 SerialService 与 TcpService 互相依赖或重复实现。
 * 行为逐行对照搬移自 main.ts:543-559，零变化。
 */

// iconv-lite 可选依赖：非 utf-8 编码（GBK 等）的写缓冲需要它。缺失时回退 utf-8。
let iconv: any = null
try { iconv = require('iconv-lite') } catch { iconv = null }

export function buildWriteBuffer(
  data: string,
  mode: string,
  append: string,
  encoding: string = 'utf-8'
): Buffer {
  let payload: string = data || ''
  if (append === 'CR') payload += '\r'
  else if (append === 'LF') payload += '\n'
  else if (append === 'CRLF') payload += '\r\n'
  if (mode === 'hex') {
    const clean = payload.replace(/[\s,]/g, '')
    if (clean.length % 2 !== 0) throw new Error('HEX长度必须为偶数')
    return Buffer.from(clean.match(/.{1,2}/g)!.map(h => parseInt(h, 16)))
  }
  if (mode === 'base64') return Buffer.from(payload, 'base64')
  const enc = (encoding || 'utf-8').toLowerCase()
  if (enc !== 'utf-8' && enc !== 'utf8' && iconv && iconv.encodingExists(enc)) {
    return iconv.encode(payload, enc)
  }
  return Buffer.from(payload, 'utf8')
}
