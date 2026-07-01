import type { ReteGraphNode } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { data, getInputVar, jsLiteral, jsString, outVar, valueAsString } from '@/features/script-editor/codegen/emit/shared'

const binaryOps: Record<string, string> = {
  'compare-eq': '==',
  'compare-neq': '!=',
  'compare-gt': '>',
  'compare-gte': '>=',
  'compare-lt': '<',
  'compare-lte': '<='
}

export function emitCompare(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
  const variable = outVar(node)
  ctx.varMap.set(String(node.id), variable)
  return `${indent}var ${variable} = ${compareExpression(ctx, node)};\n`
}

function rightOperand(ctx: EmitContext, node: ReteGraphNode, literalKey = 'operand'): string {
  const connected = getInputVar(ctx, node, 'right', '')
  if (connected) return connected
  return jsLiteral(data(node)[literalKey])
}

function compareExpression(ctx: EmitContext, node: ReteGraphNode): string {
  const config = data(node)
  const left = getInputVar(ctx, node, 'left', '_last_recv')

  if (binaryOps[node.key]) return `${left} ${binaryOps[node.key]} ${rightOperand(ctx, node)}`
  if (node.key === 'compare-in') return `String(${left}).includes(String(${rightOperand(ctx, node)}))`
  if (node.key === 'compare-not-in') return `!String(${left}).includes(String(${rightOperand(ctx, node)}))`
  if (node.key === 'compare-match') {
    const pattern = getInputVar(ctx, node, 'right', jsString(valueAsString(config.pattern)))
    return `new RegExp(${pattern}, ${jsString(valueAsString(config.flags))}).test(String(${left}))`
  }
  if (node.key === 'compare-boundary') {
    const method = config.mode === 'endsWith' ? 'endsWith' : 'startsWith'
    return `String(${left}).${method}(String(${rightOperand(ctx, node)}))`
  }

  return 'false'
}
