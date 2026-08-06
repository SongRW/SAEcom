import type { NodeDef, ReteGraphNode } from '@shared/types'
import { NODE_DEFINITIONS, getNodeComponent } from '@/features/script-editor/nodes/definitions'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { emitCompare } from '@/features/script-editor/codegen/emit/compare'
import { emitControl } from '@/features/script-editor/codegen/emit/control'
import { emitInput } from '@/features/script-editor/codegen/emit/input'
import { emitLogical } from '@/features/script-editor/codegen/emit/logical'
import { emitModbus } from '@/features/script-editor/codegen/emit/modbus'
import { emitOutput } from '@/features/script-editor/codegen/emit/output'
import { emitProtocol } from '@/features/script-editor/codegen/emit/protocol'
import { emitStopGuard } from '@/features/script-editor/codegen/emit/shared'
import { emitTransform } from '@/features/script-editor/codegen/emit/transform'

export type NodeEmitter = (ctx: EmitContext, node: ReteGraphNode, indent: string) => string

export const DEFAULT_NODE_REGISTRY: Record<string, NodeDef> = NODE_DEFINITIONS

/**
 * 按节点组件类分发 codegen。
 * 若组件类不存在（测试注入的临时 NodeDef，如 output-panel），回退到 category emit。
 */
export function emitNodeByKey(ctx: EmitContext, node: ReteGraphNode, indent = '  '): string {
  const component = getNodeComponent(node.key)
  if (component) {
    return emitStopGuard(indent) + component.emit(ctx, node, indent)
  }

  const def = ctx.registry[node.key]
  if (!def) {
    // 未知节点（如自定义组件被删除后仍留在画布）：不静默跳过，产出一行注释便于排查
    return `${indent}// [节点 ${node.key} 未注册，已跳过（组件可能已被删除）]\n`
  }

  // 兼容：registry 注入但尚未注册为组件类的节点（测试 / 实验性节点）
  let code = emitStopGuard(indent)
  if (def.category === 'input') code += emitInput(ctx, node, indent)
  else if (def.category === 'compare') code += emitCompare(ctx, node, indent)
  else if (def.category === 'logical') code += emitLogical(ctx, node, indent)
  else if (def.category === 'control') code += emitControl(ctx, node, indent)
  else if (def.category === 'output') code += emitOutput(ctx, node, indent)
  else if (def.category === 'modbus') code += emitModbus(ctx, node, indent)
  else if (def.category === 'protocol') code += emitProtocol(ctx, node, indent)
  else code += emitTransform(ctx, node, indent)
  return code
}
