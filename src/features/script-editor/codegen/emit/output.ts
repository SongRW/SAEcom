import type { ReteGraphNode } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { incomingForInput, nodeId } from '@/features/script-editor/codegen/graph'
import { configRef, data, getInputVar, jsObjectLiteral, jsString, valueAsNumber, valueAsString } from '@/features/script-editor/codegen/emit/shared'

const BASE_SERIAL_OPTIONS = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none'
}

function appendMode(value: unknown): string {
  if (value === '无') return 'none'
  const mode = valueAsString(value, 'none')
  if (mode.toUpperCase() === 'CRLF') return 'CRLF'
  if (mode.toUpperCase() === 'CR') return 'CR'
  if (mode.toUpperCase() === 'LF') return 'LF'
  return mode
}

/** TCP 端口：优先取 port 输入连线（端口常量联动），无连线用控件值。
 *  input-manual 常量内联 content（避免作用域/声明顺序问题）。 */
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

export function emitOutput(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
  const config = data(node)
  const input = getInputVar(ctx, node)
  const ref = configRef(config)

  switch (node.key) {
    case 'output-serial':
      if (ref.kind === 'serial-port' && ref.portPath) {
        return `${indent}await sendToSerial(${jsString(ref.portPath)}, ${input}, ${jsString(valueAsString(config.mode, 'text'))}, ${jsString(appendMode(config.append))}, ${jsObjectLiteral(serialOptions(config, ref.serialOptions))});\n`
      }
      if (valueAsString(config.portPath)) {
        return `${indent}await sendToSerial(${jsString(valueAsString(config.portPath))}, ${input}, ${jsString(valueAsString(config.mode, 'text'))}, ${jsString(appendMode(config.append))}, ${jsObjectLiteral(serialOptions(config))});\n`
      }
      return `${indent}await send(${input}, ${jsString(valueAsString(config.mode, 'text'))}, ${jsString(appendMode(config.append))});\n`
    case 'output-panel':
      if (ref.kind === 'panel' && ref.panelId) {
        return `${indent}await sendToPanel(${jsString(ref.panelId)}, ${input}, ${jsString(valueAsString(config.mode, 'text'))}, ${jsString(appendMode(config.append))});\n`
      }
      if (valueAsString(config.panelId, '__current__') !== '__current__') {
        return `${indent}await sendToPanel(${jsString(valueAsString(config.panelId))}, ${input}, ${jsString(valueAsString(config.mode, 'text'))}, ${jsString(appendMode(config.append))});\n`
      }
      return `${indent}await send(${input}, ${jsString(valueAsString(config.mode, 'text'))}, ${jsString(appendMode(config.append))});\n`
    case 'output-tcp': {
      const host = ref.kind === 'tcp-endpoint' ? ref.host : config.host
      const port = ref.kind === 'tcp-endpoint' ? ref.port : config.port
      return `${indent}await sendTCP(${jsString(valueAsString(host, '127.0.0.1'))}, ${tcpPortExpr(ctx, node, valueAsNumber(port, 8080))}, ${input}, ${jsString(valueAsString(config.mode, 'text'))});\n`
    }
    case 'output-tcp-server': {
      const port = ref.kind === 'tcp-server' ? ref.port : config.port
      return `${indent}await broadcastTcpServer(${tcpPortExpr(ctx, node, valueAsNumber(port, 9000))}, ${input}, ${jsString(valueAsString(config.mode, 'text'))});\n`
    }
    case 'output-file': {
      const path = ref.kind === 'file' && ref.path ? ref.path : config.path
      return `${indent}await writeFile(${jsString(valueAsString(path))}, ${input}, ${jsString(config.mode === '覆盖' ? 'overwrite' : 'append')});\n`
    }
    case 'output-log':
      return `${indent}console.log(${jsString(`[${valueAsString(config.prefix)}] `)} + ${input});\n`
    case 'output-variable':
      return `${indent}globalVars.${valueAsString(config.name, 'result').replace(/[^\w$]/g, '_')} = ${input};\n`
    default:
      return `${indent}// 输出: ${node.key}\n`
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
