import type { ReteGraphNode } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { incomingForInput, nodeId } from '@/features/script-editor/codegen/graph'
import { data, outVar } from '@/features/script-editor/codegen/emit/shared'

export function emitModbus(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
  const config = data(node)
  const panel = JSON.stringify(String(config.panel ?? ''))
  const fc = Number(config.functionCode ?? 3)
  const slaveId = Number(config.slaveId ?? 1)
  const addr = Number(config.startAddress ?? 0)
  const out = outVar(node)

  if (node.key === 'modbus-read') {
    const qty = Number(config.quantity ?? 1)
    ctx.varMap.set(nodeId(node.id), out)
    return `${indent}var ${out} = await modbusRead(${panel}, ${fc}, ${slaveId}, ${addr}, ${qty});\n`
  }

  // modbus-write: 有上游连接时使用上游变量，否则解析 config.values 为数组
  const incoming = incomingForInput(ctx.graph, node, 'in')
  let valuesExpr: string
  if (incoming.length > 0) {
    const sourceId = nodeId(incoming[0].source)
    valuesExpr = ctx.varMap.get(sourceId) ?? '_last_recv'
  } else {
    const parsed = String(config.values ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
    valuesExpr = JSON.stringify(parsed)
  }
  ctx.varMap.set(nodeId(node.id), out)
  return `${indent}var ${out} = await modbusWrite(${panel}, ${fc}, ${slaveId}, ${addr}, ${valuesExpr});\n`
}
