import type { ReteGraphConnection, ReteGraphNode } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import {
  normalizeReteGraph, nodeId
} from '@/features/script-editor/codegen/graph'
import { topologicalSort } from '@/features/script-editor/codegen/topo'
import { isContinuousRootKey, getNodeComponent } from '@/features/script-editor/nodes/definitions'
import { CompositeNodeComponent } from '@/features/script-editor/nodes/component/compositeComponent'
import { emitNodeByKey } from '@/features/script-editor/codegen/registry'
import type { CompositeComponentDescriptor } from '@/features/script-editor/nodes/component/compositeComponent'

/**
 * 拼装组件的 codegen：把子图内联进父图。
 *
 * 流程：
 * 1. normalize 子图为独立子 ctx（隔离的 varMap/processedNodes/...）。
 * 2. 把 composite 节点的每个外部输入连接变量，注入子图入口节点（inputBindings）：
 *    子 varMap[入口节点 id] = 父 ctx 中 composite 节点该输入端口的上游变量。
 * 3. 拓扑排序子图、逐节点 emit（复用 emitNodeByKey），产出子图代码体。
 * 4. 子图出口节点（outputBindings）产出变量回写到父 ctx varMap：
 *    key = `${outVar(compositeNode)}:${外部输出端口 key}`（复合 key，对齐多输出节点约定）。
 * 5. 整段以 IIFE 包裹塞进父图，确保变量作用域隔离。
 *
 * 环检测：展开前校验子图不含其他拼装组件（v1 深度上限 1），避免无限递归。
 */
export function emitComposite(
  parentCtx: EmitContext,
  descriptor: CompositeComponentDescriptor,
  compositeNode: ReteGraphNode,
  indent: string
): string {
  const sub = normalizeReteGraph(descriptor.subgraph)

  // ── 环检测：v1 禁止子图内含其他拼装组件（custom- 前缀但非自身）。
  // 注：JS 自定义组件（custom-）可复用，因其 emit 自包含；但拼装组件内嵌拼装组件会递归展开，
  // v1 限制深度=1 故禁止。用 isCompositeNode 判断需 import compositeComponent，这里用启发式：
  // 子图节点 key 若在父 registry 解析为 CompositeNodeComponent 则拒绝。
  const compositeChild = sub.nodes.find((n) => isCompositeKey(n.key, descriptor.key))
  if (compositeChild) {
    return `${indent}// [拼装组件 ${descriptor.key} 嵌套了另一个拼装组件 ${compositeChild.key}，v1 不支持递归拼装]\n`
  }

  // ── 构造子 ctx ──
  const subCtx: EmitContext = {
    graph: sub,
    registry: parentCtx.registry,
    varMap: new Map(parentCtx.varMap), // 继承父作用域可见变量（叶子就地 emit 场景）
    processedNodes: new Set(),
    blockedNodes: new Set(),
    inListenerClosure: false,
    emitNode: (node: ReteGraphNode, ind = '  ') => emitNodeByKey(subCtx, node, ind)
  }

  // ── 注入外部输入绑定：合成连接 + varMap 复合 key ──
  // 子图节点读取输入的唯一途径是 getInputVar（shared.ts:53），它只解析 incomingByNode。
  // 因此为每个 inputBinding 在子图内合成一条「外部输入」连接（source = composite 节点，
  // 视作子图外部），并把父 ctx 解析出的上游变量表达式写入 subCtx.varMap 的复合 key
  // `${compositeId}:${portKey}`，供 lookupSourceVar 命中（回归：注入只写不读）。
  const compositeId = nodeId(compositeNode.id)
  for (const binding of descriptor.inputBindings) {
    const inboundVar = resolveCompositeInputVar(parentCtx, compositeNode, binding.portKey)
    const entryId = nodeId(binding.nodeId)
    // 合成连接：targetInput 用绑定端口，使 getInputVar(ctx, entryNode, nodePortKey) 能解析
    const synthetic: ReteGraphConnection = {
      source: compositeId,
      sourceOutput: binding.portKey,
      target: entryId,
      targetInput: binding.nodePortKey
    }
    sub.incomingByNode.get(entryId)?.push(synthetic)
    sub.connections.push(synthetic)
    subCtx.varMap.set(`${compositeId}:${binding.portKey}`, inboundVar)
  }

  // ── 拓扑 emit 子图（跳过 continuous root 的 listener 包装——拼装组件 v1 不支持持续监听根）──
  let body = ''
  const continuousRootIds = new Set(
    sub.nodes.filter((n) => isContinuousRootKey(n.key)).map((n) => nodeId(n.id))
  )
  if (continuousRootIds.size > 0) {
    return `${indent}// [拼装组件 ${descriptor.key} 子图含持续监听根节点，v1 不支持]\n`
  }

  for (const id of topologicalSort(sub)) {
    if (subCtx.processedNodes.has(id)) continue
    const node = sub.nodeMap.get(id)
    if (!node) continue
    // 维护 processedNodes（与主 codegen emitNode 包装一致）：分支/循环逻辑依赖它
    // 判断来源是否已 emit；不维护会导致分支体被静默丢弃或叶子重复声明（回归）。
    subCtx.processedNodes.add(id)
    body += emitNodeByKey(subCtx, node, indent)
  }

  // ── 出口：IIFE 返回对象 + 父 varMap 映射到返回字段表达式 ──
  // 子图变量声明在 IIFE 函数作用域内，父图下游无法直接引用 _out_<exitId>；
  // 改为 IIFE return { [portKey]: exitVar }，父 varMap 记录 `_compositeOut_<id>.<portKey>`
  // 这一真实可引用表达式（回归：IIFE 隔离导致输出传播失效 / key 带 _out_ 前缀查不到）。
  const compositeOutBase = `_compositeOut_${nodeId(compositeNode.id).replace(/\W/g, '_')}`
  const returnFields: string[] = []
  for (const binding of descriptor.outputBindings) {
    const exitId = nodeId(binding.nodeId)
    const exitVar =
      subCtx.varMap.get(`${exitId}:${binding.nodePortKey}`) ?? subCtx.varMap.get(exitId)
    if (exitVar === undefined) continue
    returnFields.push(`${binding.portKey}: ${exitVar}`)
    parentCtx.varMap.set(`${compositeId}:${binding.portKey}`, `${compositeOutBase}.${binding.portKey}`)
  }
  // 单输出兼容：无 outputBindings 时回写裸 id = IIFE 整体（best-effort，对齐 lookupSourceVar 裸 id 回退）
  if (descriptor.outputBindings.length === 0 && descriptor.outputs.length <= 1) {
    const lastNode = sub.nodes[sub.nodes.length - 1]
    if (lastNode) {
      const lastVar = subCtx.varMap.get(nodeId(lastNode.id))
      if (lastVar !== undefined) {
        returnFields.push(`${descriptor.outputs[0]?.key ?? 'out'}: ${lastVar}`)
      }
    }
  }
  if (returnFields.length > 0) {
    parentCtx.varMap.set(compositeId, compositeOutBase)
  }

  // ── IIFE 包裹隔离作用域 + 返回出口变量 ──
  const returnClause = returnFields.length > 0
    ? `\n${indent}  return { ${returnFields.join(', ')} };`
    : ''
  return `${indent}const ${compositeOutBase} = await (async () => {${returnClause}\n${body}${indent}})();\n`
}

/** 解析 composite 节点某外部输入端口的上游变量（从父 ctx）。 */
function resolveCompositeInputVar(parentCtx: EmitContext, compositeNode: ReteGraphNode, portKey: string): string {
  // 查父图中连入 compositeNode 该输入端口的连接
  const inbound = (parentCtx.graph.incomingByNode.get(nodeId(compositeNode.id)) || [])
    .find((c) => c.targetInput === portKey)
  if (!inbound) return '_last_recv'
  const sourceId = nodeId(inbound.source)
  return parentCtx.varMap.get(`${sourceId}:${inbound.sourceOutput}`)
    ?? parentCtx.varMap.get(sourceId)
    ?? `_out_${sourceId.replace(/\W/g, '_')}`
}

/** v1：判断子图节点 key 是否为另一个拼装组件（避免递归展开）。
 *  查 registry：若解析为 CompositeNodeComponent 则为拼装组件。
 *  用 instanceof 而非 constructor.name（生产压缩会改写类名，字符串判断失效——回归修复）。 */
function isCompositeKey(nodeKey: string, currentKey: string): boolean {
  if (nodeKey === currentKey) return true // 自我引用
  const comp = getNodeComponent(nodeKey)
  return !!comp && comp instanceof CompositeNodeComponent
}
