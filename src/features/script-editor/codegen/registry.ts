import type { NodeDef, ReteGraphNode } from '@shared/types'
import { NODE_DEFINITIONS } from '@/features/script-editor/nodes/definitions'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { emitCompare } from '@/features/script-editor/codegen/emit/compare'
import { emitControl } from '@/features/script-editor/codegen/emit/control'
import { emitInput } from '@/features/script-editor/codegen/emit/input'
import { emitLogical } from '@/features/script-editor/codegen/emit/logical'
import { emitModbus } from '@/features/script-editor/codegen/emit/modbus'
import { emitOutput } from '@/features/script-editor/codegen/emit/output'
import { emitStopGuard } from '@/features/script-editor/codegen/emit/shared'
import { emitTransform } from '@/features/script-editor/codegen/emit/transform'

export type NodeEmitter = (ctx: EmitContext, node: ReteGraphNode, indent: string) => string

export const DEFAULT_NODE_REGISTRY: Record<string, NodeDef> = NODE_DEFINITIONS

export function emitNodeByKey(ctx: EmitContext, node: ReteGraphNode, indent = '  '): string {
  const def = ctx.registry[node.key]
  if (!def) return ''

  let code = emitStopGuard(indent)

  if (def.category === 'input') code += emitInput(ctx, node, indent)
  else if (def.category === 'compare') code += emitCompare(ctx, node, indent)
  else if (def.category === 'logical') code += emitLogical(ctx, node, indent)
  else if (def.category === 'control') code += emitControl(ctx, node, indent)
  else if (def.category === 'output') code += emitOutput(ctx, node, indent)
  else if (def.category === 'modbus') code += emitModbus(ctx, node, indent)
  else code += emitTransform(ctx, node, indent)

  return code
}
