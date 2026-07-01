/**
 * YModem 发送状态机。移植自 legacy renderer.js:5044 YModemSender。
 * write 函数注入（不直接依赖 window.api），便于测试和复用。
 * CRC 用 ./crc16。
 */
import { calcCRC16 } from '@/features/serial-panel/transfer/crc16'

// YModem 协议常量（renderer.js:5036-5042）
export const YM_SOH = 0x01
export const YM_STX = 0x02
export const YM_EOT = 0x04
export const YM_ACK = 0x06
export const YM_NAK = 0x15
export const YM_CAN = 0x18
export const YM_CNC = 0x43

/** 写入函数：把字节数组发到串口/TCP，返回 ok 布尔 */
export type Writer = (data: Uint8Array) => Promise<void>
/** 日志回调 */
export type TransferLogger = (msg: string) => void

export class YModemSender {
  id: string
  protocol: 'ymodem' | 'ymodem-g'
  logger: TransferLogger
  writer: Writer

  private resolveWait: ((b: number) => void) | null = null
  private rejectWait: ((e: Error) => void) | null = null
  private rxBuffer: number[] = []
  private targetBytes: number[] = []
  private timer: ReturnType<typeof setTimeout> | null = null

  /** 单包最大重试次数：超时达到上限即放弃，避免接收端掉线时无限重发导致 UI 永久卡在「发送中」。 */
  static readonly MAX_RETRIES = 10

  /**
   * 每次等待应答的超时（毫秒）。默认 60s 对齐真实串口接收；
   * 测试可通过构造参数注入小值，避免用 fake timers 驱动 60s。
   */
  private readonly waitTimeoutMs: number

  constructor(
    id: string,
    writer: Writer,
    protocol: 'ymodem' | 'ymodem-g' = 'ymodem',
    logger: TransferLogger = () => {},
    waitTimeoutMs = 60000
  ) {
    this.id = id
    this.protocol = protocol.toLowerCase() as 'ymodem' | 'ymodem-g'
    this.logger = logger
    this.writer = writer
    this.waitTimeoutMs = waitTimeoutMs
  }

  /** 接收字节（被 dataBus 的 activeTransfer 拦截调用） */
  onData(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i++) this.rxBuffer.push(bytes[i])
    if (this.resolveWait) this.checkWait()
  }

  private checkWait(): void {
    while (this.rxBuffer.length > 0) {
      if (!this.resolveWait) return
      const byte = this.rxBuffer.shift()!
      if (this.targetBytes.includes(byte)) {
        const resolver = this.resolveWait
        this.cleanupWait()
        resolver(byte)
        return
      }
    }
  }

  private waitFor(byteCodes: number | number[], timeoutMs = this.waitTimeoutMs): Promise<number> {
    return new Promise((resolve, reject) => {
      this.resolveWait = resolve
      this.rejectWait = reject
      this.targetBytes = Array.isArray(byteCodes) ? byteCodes : [byteCodes]
      this.checkWait()
      this.timer = setTimeout(() => {
        const targets = this.targetBytes.map((b) => '0x' + b.toString(16)).join(',')
        this.cleanupWait()
        reject(new Error(`等待超时 (期望: ${targets})`))
      }, timeoutMs)
    })
  }

  private cleanupWait(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.resolveWait = null
    this.rejectWait = null
    this.targetBytes = []
  }

  private async sendPacket(seq: number, data: Uint8Array, forceSize: number | null = null): Promise<void> {
    const size = forceSize || data.length
    const head = size === 1024 ? YM_STX : YM_SOH
    const seqByte = seq & 0xff
    const seqComp = (~seq) & 0xff
    const header = new Uint8Array([head, seqByte, seqComp])
    const crc = calcCRC16(data)
    const crcBytes = new Uint8Array([(crc >> 8) & 0xff, crc & 0xff])
    const packet = new Uint8Array(header.length + data.length + crcBytes.length)
    packet.set(header, 0)
    packet.set(data, header.length)
    packet.set(crcBytes, header.length + data.length)
    await this.writer(packet)
  }

  private async sendBlock0(name: string, size: number): Promise<void> {
    const payload = new Uint8Array(128)
    if (name) {
      const encoder = new TextEncoder()
      const nameBytes = encoder.encode(name)
      const maxLen = 100
      payload.set(nameBytes.length > maxLen ? nameBytes.slice(0, maxLen) : nameBytes, 0)
      let p = nameBytes.length + 1
      if (p < 120) {
        const sizeBytes = encoder.encode(size.toString() + ' ')
        payload.set(sizeBytes, p)
      }
    }
    await this.sendPacket(0, payload, 128)
  }

  /** 启动传输。fileBytes=文件原始字节，fileName=文件名 */
  async start(fileBytes: Uint8Array, fileName: string): Promise<void> {
    try {
      this.logger(`准备传输: ${fileName} (${fileBytes.length} 字节)`)
      await this.waitFor(YM_CNC, 60000)

      if (this.protocol === 'ymodem') {
        await this.sendBlock0(fileName, fileBytes.length)
        await this.waitFor(YM_ACK)
        await this.waitFor(YM_CNC)
      }

      let seq = 1
      let offset = 0
      const total = fileBytes.length
      this.logger('开始发送数据...')

      while (offset < total) {
        const size = 1024
        let chunk = fileBytes.slice(offset, offset + size)
        if (chunk.length < size) {
          const pad = new Uint8Array(size)
          pad.set(chunk)
          pad.fill(0x1a, chunk.length)
          chunk = pad
        }
        // 重试同一包直到收到 ACK；连续超时超过 MAX_RETRIES 即放弃（接收端可能已掉线），
        // 否则 while 会无限重发同一包，start() 永不结束，UI 永久卡在「发送中」。
        let retries = 0
        for (;;) {
          await this.sendPacket(seq, chunk)
          try {
            await this.waitFor(YM_ACK)
            offset += size
            const progress = Math.min(100, Math.round((offset / total) * 100))
            if (seq % 5 === 0 || offset >= total) this.logger(`进度: ${progress}%`)
            seq++
            break // 成功，进入下一包
          } catch {
            retries++
            if (retries > YModemSender.MAX_RETRIES) {
              throw new Error(`包 ${seq} 连续 ${YModemSender.MAX_RETRIES} 次超时，放弃传输（接收端无响应）`)
            }
            this.logger(`包 ${seq} 超时，正在重试 (${retries}/${YModemSender.MAX_RETRIES})...`)
          }
        }
      }

      this.logger('发送结束信号...')
      await this.writer(new Uint8Array([YM_EOT]))
      try {
        const resp = await this.waitFor([YM_ACK, YM_NAK])
        if (resp === YM_NAK) {
          await this.writer(new Uint8Array([YM_EOT]))
          await this.waitFor(YM_ACK)
        }
      } catch {
        /* ignore */
      }

      if (this.protocol === 'ymodem') {
        await this.waitFor(YM_CNC)
        await this.sendBlock0('', 0)
        await this.waitFor(YM_ACK)
      }
      this.logger('传输完成！✅')
    } catch (err) {
      this.logger(`[Stop] 传输中止: ${(err as Error).message}`)
      try {
        await this.writer(new Uint8Array([YM_CAN, YM_CAN, YM_CAN, YM_CAN, YM_CAN]))
      } catch {
        /* ignore */
      }
    }
  }
}
