import net from 'node:net'

/**
 * 本地 TCP echo server：收到什么字节就回写什么字节。
 * 用于 TCP 面板收发 E2E——应用通过真实 tcp:open/write IPC 连到本 server，
 * 发送的数据会被原样回弹，从而在面板 DataDisplay 区看到回显。
 *
 * 起在随机端口（port: 0），避免占用冲突。可选择记录所有收到的数据用于断言。
 */
export interface EchoServer {
  /** 实际监听端口（启动后填充）。 */
  port: number
  /** 累计收到的所有数据（文本拼接）。 */
  received: string
  /** 当前连接数。 */
  connections: number
  /** 关闭 server。 */
  close: () => Promise<void>
}

export async function startEchoServer(): Promise<EchoServer> {
  const state: EchoServer = {
    port: 0,
    received: '',
    connections: 0,
    close: async () => {}
  }

  const sockets = new Set<net.Socket>()

  const server = net.createServer((socket) => {
    sockets.add(socket)
    state.connections++
    socket.on('data', (buf) => {
      state.received += buf.toString('utf8')
      // echo：原样回写，模拟设备应答
      socket.write(buf)
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
        reject(new Error('echo server 监听失败'))
      }
    })
  })

  // close 必须先强制销毁所有活跃连接，否则 server.close() 会一直等待
  // 连接关闭才回调，导致测试用例 60s 超时（面板仍连着 echo server）。
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
