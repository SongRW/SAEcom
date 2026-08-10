import type { ReteGraphNode } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { incomingForInput, nodeId } from '@/features/script-editor/codegen/graph'
import { configRef, data, getInputVar, jsObjectLiteral, jsString, outVar, valueAsNumber, valueAsString } from '@/features/script-editor/codegen/emit/shared'

const BASE_SERIAL_OPTIONS = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none'
}

export function isContinuousInputNode(key: string): boolean {
  return key === 'input-panel' || key === 'input-serial' || key === 'input-tcp' || key === 'input-tcp-server'
}

/**
 * TCP 端口表达式：优先取 port 输入连线（端口常量联动），无连线用控件值。
 * listener 注册时端口常量（input-manual）尚未 emit，直接引用变量会 ReferenceError，
 * 因此对 input-manual 常量内联其 content 字面量；其他来源（计算链）用变量引用。
 */
function tcpPortExpr(ctx: EmitContext, node: ReteGraphNode, fallback: number): string {
  const conn = incomingForInput(ctx.graph, node, 'port')[0]
  if (!conn) return String(fallback)
  const srcNode = ctx.graph.nodeMap.get(nodeId(conn.source))
  if (srcNode?.key === 'input-manual') {
    const content = String(srcNode.data?.content ?? '').trim()
    const parsed = Number(content)
    if (Number.isFinite(parsed)) return String(parsed)
  }
  const connected = getInputVar(ctx, node, 'port', '')
  if (connected) return `Number(${connected})`
  return String(fallback)
}

export function continuousListenExpression(ctx: EmitContext, node: ReteGraphNode): string {
  const config = data(node)
  const ref = configRef(config)

  switch (node.key) {
    case 'input-panel':
      if (ref.kind === 'panel' && ref.panelId) return `listenPanelPackets(${jsString(ref.panelId)})`
      if (ref.kind === 'current-panel') return 'listenCurrentPackets()'
      if (valueAsString(config.panelId, '__current__') !== '__current__') {
        return `listenPanelPackets(${jsString(valueAsString(config.panelId))})`
      }
      return 'listenCurrentPackets()'
    case 'input-serial':
      if (ref.kind === 'serial-port' && ref.portPath) {
        return `listenSerialPackets(${jsString(ref.portPath)}, ${jsObjectLiteral(serialOptions(config, ref.serialOptions))}, ${jsObjectLiteral(serialReceiveOptions(config))})`
      }
      if (valueAsString(config.portPath)) {
        return `listenSerialPackets(${jsString(valueAsString(config.portPath))}, ${jsObjectLiteral(serialOptions(config))}, ${jsObjectLiteral(serialReceiveOptions(config))})`
      }
      return `listenSerialPackets("", ${jsObjectLiteral(serialOptions(config))}, ${jsObjectLiteral(serialReceiveOptions(config))})`
    case 'input-tcp': {
      const host = ref.kind === 'tcp-endpoint' ? ref.host : config.host
      const port = ref.kind === 'tcp-endpoint' ? ref.port : config.port
      // 端口常量联动：port 输入有连线时用连线值（渲染期动态决定）
      return `listenTcpPackets(${jsString(valueAsString(host, '127.0.0.1'))}, ${tcpPortExpr(ctx, node, valueAsNumber(port, 8080))})`
    }
    case 'input-tcp-server': {
      const port = ref.kind === 'tcp-server' ? ref.port : config.port
      return `listenTcpServerPackets(${tcpPortExpr(ctx, node, valueAsNumber(port, 9000))})`
    }
    default:
      return 'listenCurrentPackets()'
  }
}

export function emitInput(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
  const config = data(node)
  const variable = outVar(node)
  ctx.varMap.set(String(node.id), variable)

  switch (node.key) {
    // input-serial / input-tcp / input-tcp-server 为持续监听节点，在代码生成入口由
    // continuousListenExpression 处理，不会进入此函数，故此处无需分支。
    case 'input-manual':
      return `${indent}var ${variable} = ${jsString(valueAsString(config.content))};${config.mode === 'hex' ? ' // HEX' : ''}\n`
    case 'input-file':
      return `${indent}var ${variable} = await readFile(${jsString(valueAsString(config.path))}, ${jsString(valueAsString(config.encoding, 'utf8'))});\n`
    case 'input-timer':
      return `${indent}await sleep(${valueAsNumber(config.interval, 1000)});\n${indent}var ${variable} = null;\n`
    default:
      return `${indent}var ${variable} = null;\n`
  }
}

function serialOptions(config: Record<string, unknown>, refOptions?: unknown): Record<string, unknown> {
  const inherited = refOptions && typeof refOptions === 'object' && !Array.isArray(refOptions)
    ? refOptions as Record<string, unknown>
    : {}
  return {
    ...inherited,
    baudRate: valueAsNumber(config.baudRate ?? inherited.baudRate, BASE_SERIAL_OPTIONS.baudRate),
    dataBits: valueAsNumber(config.dataBits ?? inherited.dataBits, BASE_SERIAL_OPTIONS.dataBits),
    stopBits: valueAsNumber(config.stopBits ?? inherited.stopBits, BASE_SERIAL_OPTIONS.stopBits),
    parity: valueAsString(config.parity ?? inherited.parity, BASE_SERIAL_OPTIONS.parity)
  }
}

function serialReceiveOptions(config: Record<string, unknown>): Record<string, unknown> {
  return {
    bufferMs: valueAsNumber(config.bufferMs, 50),
    append: appendMode(config.append)
  }
}

function appendMode(value: unknown): string {
  if (value === '无' || value === 'none') return 'none'
  const mode = valueAsString(value, 'CRLF').toUpperCase()
  if (mode === 'CR') return 'CR'
  if (mode === 'LF') return 'LF'
  if (mode === 'CRLF') return 'CRLF'
  return 'CRLF'
}
