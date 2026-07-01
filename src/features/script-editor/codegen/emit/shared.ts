import type { PanelConfigRef, ReteGraphNode } from '@shared/types'
import { isPanelConfigRef } from '@/features/script-editor/panelConfig'
import { incomingForInput, nodeId, outgoingForOutput } from '@/features/script-editor/codegen/graph'
import type { EmitContext } from '@/features/script-editor/codegen/context'

export const outVar = (node: ReteGraphNode): string => `_out_${nodeId(node.id).replace(/\W/g, '_')}`

export function data(node: ReteGraphNode): Record<string, unknown> {
  return node.data || {}
}

export function configRef(config: Record<string, unknown>): PanelConfigRef {
  return isPanelConfigRef(config.configRef) ? config.configRef : { kind: 'local' }
}

export function valueAsString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null || value === '') return fallback
  return String(value)
}

export function valueAsNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function jsString(value: unknown): string {
  return JSON.stringify(String(value ?? ''))
}

export function jsLiteral(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const text = String(value ?? '')
  if (/^-?\d+(\.\d+)?$/.test(text.trim())) return text.trim()
  if (text === 'true' || text === 'false') return text
  return jsString(text)
}

export function getInputVar(ctx: EmitContext, node: ReteGraphNode, inputKey = 'in', fallback = '_last_recv'): string {
  const connection = incomingForInput(ctx.graph, node, inputKey)[0]
  if (!connection) return fallback
  return ctx.varMap.get(nodeId(connection.source)) || outVar(ctx.graph.nodeMap.get(nodeId(connection.source)) || { id: connection.source, key: '' })
}

export function getInputVars(ctx: EmitContext, node: ReteGraphNode): string[] {
  const connections = ctx.graph.incomingByNode.get(nodeId(node.id)) || []
  if (!connections.length) return ['_last_recv']
  return connections.map((connection) => ctx.varMap.get(nodeId(connection.source)) || `_out_${nodeId(connection.source).replace(/\W/g, '_')}`)
}

export function emitStopGuard(indent: string): string {
  return `${indent}if (await checkStop()) return;\n`
}

export function emitBranch(ctx: EmitContext, node: ReteGraphNode, outputKey: string, indent: string, visited = new Set<string>()): string {
  const branchAvailable = ctx.branchAvailable

  return outgoingForOutput(ctx.graph, node, outputKey)
    .map((connection) => {
      const child = ctx.graph.nodeMap.get(nodeId(connection.target))
      if (!child) return ''
      const childId = nodeId(child.id)
      if (visited.has(childId)) return ''
      const availableSources = branchAvailable || new Set(visited)
      availableSources.add(nodeId(node.id))
      if (!allIncomingSourcesAvailable(ctx, child, availableSources)) {
        ctx.blockedNodes.add(childId)
        return ''
      }

      const nextVisited = new Set(visited)
      nextVisited.add(childId)
      const previousVisited = ctx.branchVisited
      const previousAvailable = ctx.branchAvailable
      ctx.branchVisited = nextVisited
      if (branchAvailable) ctx.branchAvailable = branchAvailable
      try {
        let code = ctx.emitNode(child, indent)
        branchAvailable?.add(childId)
        if (shouldEmitChildBranches(ctx, child)) {
          const outputs = ctx.registry[child.key]?.outputs || []
          code += outputs.map((output) => emitBranch(ctx, child, output.key, indent, nextVisited)).join('')
        }
        return code
      } finally {
        ctx.branchVisited = previousVisited
        ctx.branchAvailable = previousAvailable
      }
    })
    .join('')
}

export function jsObjectLiteral(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}'
  return JSON.stringify(value)
}

function shouldEmitChildBranches(ctx: EmitContext, node: ReteGraphNode): boolean {
  if (node.key === 'control-if' || node.key === 'control-loop' || node.key === 'control-timeout') return false
  const outputs = ctx.registry[node.key]?.outputs || []
  return outputs.length > 0
}

function allIncomingSourcesAvailable(ctx: EmitContext, node: ReteGraphNode, availableSources: Set<string>): boolean {
  const id = nodeId(node.id)
  const connections = ctx.graph.incomingByNode.get(id) || []
  return connections.every((connection) => {
    const sourceId = nodeId(connection.source)
    return sourceId === id || availableSources.has(sourceId)
  })
}

export function delimiter(config: Record<string, unknown>): string {
  if (config.delimiter === '逗号') return ','
  if (config.delimiter === '空格') return ' '
  if (config.delimiter === '换行') return '\\n'
  if (config.delimiter === '制表符') return '\\t'
  return valueAsString(config.custom, ',')
}
