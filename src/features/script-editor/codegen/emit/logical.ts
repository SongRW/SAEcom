import type { ReteGraphNode } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { getInputVar, outVar } from '@/features/script-editor/codegen/emit/shared'

export function emitLogical(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
  const variable = outVar(node)
  ctx.varMap.set(String(node.id), variable)

  if (node.key === 'logical-not') {
    return `${indent}var ${variable} = !${getInputVar(ctx, node, 'in', 'false')};\n`
  }

  const left = getInputVar(ctx, node, 'left', 'false')
  const right = getInputVar(ctx, node, 'right', 'false')
  const op = node.key === 'logical-or' ? '||' : '&&'
  return `${indent}var ${variable} = ${left} ${op} ${right};\n`
}
