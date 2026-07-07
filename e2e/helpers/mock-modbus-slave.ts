import net from 'node:net'

/**
 * 本地 Modbus TCP 从站（mock slave）。
 *
 * 用于 Modbus IPC E2E——应用通过 window.api.modbus.open（modbus:open IPC）经
 * modbus-serial 真实 client 连到本 server，发送的请求由本 server 按 Modbus TCP
 * (MBAP) 协议解析并应答，从而端到端验证主进程 modbusService 的 read/write/连接。
 *
 * 起在随机端口（port: 0），仅监听 127.0.0.1。结构对齐 e2e/helpers/tcp-echo.ts。
 *
 * 支持的功能码：
 *   FC1  Read Coils             → 返回 quantity 个线圈（来自 coils[]）
 *   FC2  Read Discrete Inputs   → 返回 quantity 个输入（来自 discrete[]）
 *   FC3  Read Holding Registers → 返回 quantity 个寄存器（来自 holding[]）
 *   FC4  Read Input Registers   → 返回 quantity 个寄存器（来自 inputRegs[]）
 *   FC5  Write Single Coil      → 回写，记录到 coils[]
 *   FC6  Write Single Register  → 回写，记录到 holding[]
 *   FC15 Write Multiple Coils   → 回写，记录到 coils[]
 *   FC16 Write Multiple Registers → 回写，记录到 holding[]
 *
 * 异常/未知功能码返回 Modbus Exception Response（FC|0x80 + 异常码 01）。
 */
export interface ModbusSlave {
  /** 实际监听端口（启动后填充）。 */
  port: number
  /** 当前连接数。 */
  connections: number
  /** 累计收到的 MBAP 事务数（每完整帧 +1）。 */
  transactions: number
  /** 保持寄存器区（FC3 读 / FC6、FC16 写）。索引=寄存器地址。 */
  holding: number[]
  /** 输入寄存器区（FC4 读）。 */
  inputRegs: number[]
  /** 线圈区（FC1 读 / FC5、FC15 写）。0/1。 */
  coils: number[]
  /** 离散输入区（FC2 读）。0/1。 */
  discrete: number[]
  /** 关闭 server。 */
  close: () => Promise<void>
}

export interface ModbusSlaveOptions {
  /** 各区初始容量（默认 100，按需寻址）。 */
  size?: number
  /** holding 寄存器初值（下标对齐地址）；默认 holding[i] = (i + 1) * 10。 */
  holdingInit?: number[]
}

export async function startModbusSlave(opts: ModbusSlaveOptions = {}): Promise<ModbusSlave> {
  const size = opts.size ?? 100
  const state: ModbusSlave = {
    port: 0,
    connections: 0,
    transactions: 0,
    holding: opts.holdingInit ?? Array.from({ length: size }, (_, i) => (i + 1) * 10),
    inputRegs: Array.from({ length: size }, (_, i) => (i + 1) * 100),
    coils: new Array(size).fill(0),
    discrete: new Array(size).fill(0),
    close: async () => {}
  }

  const sockets = new Set<net.Socket>()

  const server = net.createServer((socket) => {
    sockets.add(socket)
    state.connections++
    let buf = Buffer.alloc(0)

    socket.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk])
      // 持续尝试从 buf 头部解出完整 MBAP 帧
      while (buf.length >= 6) {
        // MBAP: txId(2) protoId(2) length(2)
        const length = buf.readUInt16BE(4)
        const frameLen = 6 + length // length 字段含 unitId(1) + PDU
        if (buf.length < frameLen) break // 帧不完整，等更多字节

        const txId = buf.readUInt16BE(0)
        const protoId = buf.readUInt16BE(2)
        const unitId = buf.readUInt8(6)
        const pdu = buf.subarray(7, frameLen) // 不含 unitId
        buf = buf.subarray(frameLen)

        if (protoId !== 0) continue // 非 Modbus 协议，丢弃
        state.transactions++
        const resp = handlePdu(pdu, state)
        // 回包 MBAP：同 txId、protoId=0、length=resp.length+1(unitId)、unitId、resp
        const mbap = Buffer.allocUnsafe(7)
        mbap.writeUInt16BE(txId, 0)
        mbap.writeUInt16BE(0, 2)
        mbap.writeUInt16BE(resp.length + 1, 4) // unitId + PDU
        mbap.writeUInt8(unitId, 6)
        socket.write(Buffer.concat([mbap, resp]))
      }
    })

    socket.on('close', () => {
      sockets.delete(socket)
      state.connections = Math.max(0, state.connections - 1)
    })
    socket.on('error', () => {
      sockets.delete(socket)
      /* 客户端异常断开，忽略，避免抛到 server */
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        state.port = addr.port
        resolve()
      } else {
        reject(new Error('modbus slave 监听失败'))
      }
    })
  })

  // close 必须先强制销毁所有活跃连接，否则 server.close() 会一直等待
  // 连接关闭才回调，导致测试用例 60s 超时（modbus-serial client 仍连着）。
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

/** 解析 PDU 并生成响应 PDU（不含 unitId）。 */
function handlePdu(pdu: Buffer, state: ModbusSlave): Buffer {
  if (pdu.length < 1) return exceptionResponse(0, 4) // 从站设备故障
  const fc = pdu.readUInt8(0)
  switch (fc) {
    case 1:
    case 2: {
      // 读线圈/离散输入：FC(1) + 起始(2) + 数量(2)
      if (pdu.length < 5) return exceptionResponse(fc, 4)
      const addr = pdu.readUInt16BE(1)
      const qty = pdu.readUInt16BE(3)
      const src = fc === 1 ? state.coils : state.discrete
      const bits: number[] = []
      for (let i = 0; i < qty; i++) bits.push(src[addr + i] ?? 0)
      const byteCount = Math.ceil(qty / 8)
      const data = Buffer.allocUnsafe(2 + byteCount) // FC(1) + byteCount(1) + 数据
      data.writeUInt8(fc, 0)
      data.writeUInt8(byteCount, 1)
      for (let i = 0; i < byteCount; i++) data.writeUInt8(0, 2 + i) // 先清零
      for (let i = 0; i < qty; i++) {
        if (bits[i]) data[2 + (i >> 3)] |= 1 << (i & 7)
      }
      return data
    }
    case 3:
    case 4: {
      // 读保持/输入寄存器：FC(1) + 起始(2) + 数量(2)
      if (pdu.length < 5) return exceptionResponse(fc, 4)
      const addr = pdu.readUInt16BE(1)
      const qty = pdu.readUInt16BE(3)
      const src = fc === 3 ? state.holding : state.inputRegs
      const byteCount = qty * 2
      const data = Buffer.allocUnsafe(2 + byteCount)
      data.writeUInt8(fc, 0)
      data.writeUInt8(byteCount, 1)
      for (let i = 0; i < qty; i++) data.writeUInt16BE(src[addr + i] ?? 0, 2 + i * 2)
      return data
    }
    case 5: {
      // 写单线圈：FC(1) + 地址(2) + 值(2: 0xFF00=ON / 0x0000=OFF)
      if (pdu.length < 5) return exceptionResponse(fc, 4)
      const addr = pdu.readUInt16BE(1)
      const on = pdu.readUInt16BE(3) === 0xff00
      state.coils[addr] = on ? 1 : 0
      return pdu.subarray(0, 5) // 回写请求（地址+值）作确认
    }
    case 6: {
      // 写单寄存器：FC(1) + 地址(2) + 值(2)
      if (pdu.length < 5) return exceptionResponse(fc, 4)
      const addr = pdu.readUInt16BE(1)
      const value = pdu.readUInt16BE(3)
      state.holding[addr] = value
      return pdu.subarray(0, 5) // 回写请求作确认
    }
    case 15: {
      // 写多线圈：FC(1) + 地址(2) + 数量(2) + 字节数(1) + 数据
      if (pdu.length < 7) return exceptionResponse(fc, 4)
      const addr = pdu.readUInt16BE(1)
      const qty = pdu.readUInt16BE(3)
      const byteCount = pdu.readUInt8(5)
      const dataBytes = pdu.subarray(6, 6 + byteCount)
      for (let i = 0; i < qty; i++) {
        state.coils[addr + i] = (dataBytes[i >> 3] >> (i & 7)) & 1
      }
      // 回写：FC + 地址 + 数量
      const resp = Buffer.allocUnsafe(5)
      resp.writeUInt8(fc, 0)
      resp.writeUInt16BE(addr, 1)
      resp.writeUInt16BE(qty, 3)
      return resp
    }
    case 16: {
      // 写多寄存器：FC(1) + 地址(2) + 数量(2) + 字节数(1) + 数据
      if (pdu.length < 7) return exceptionResponse(fc, 4)
      const addr = pdu.readUInt16BE(1)
      const qty = pdu.readUInt16BE(3)
      const byteCount = pdu.readUInt8(5)
      const dataBytes = pdu.subarray(6, 6 + byteCount)
      for (let i = 0; i < qty; i++) {
        state.holding[addr + i] = dataBytes.readUInt16BE(i * 2)
      }
      const resp = Buffer.allocUnsafe(5)
      resp.writeUInt8(fc, 0)
      resp.writeUInt16BE(addr, 1)
      resp.writeUInt16BE(qty, 3)
      return resp
    }
    default:
      return exceptionResponse(fc, 1) // 非法功能码
  }
}

/** 构造 Modbus 异常响应 PDU：FC|0x80 + 异常码。 */
function exceptionResponse(fc: number, code: number): Buffer {
  const buf = Buffer.allocUnsafe(2)
  buf.writeUInt8(fc | 0x80, 0)
  buf.writeUInt8(code, 1)
  return buf
}
