import type { ReteGraphNode } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { data, emitBranch, getInputVar, outVar, valueAsNumber } from '@/features/script-editor/codegen/emit/shared'

export function emitControl(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
  const config = data(node)
  const variable = outVar(node)

  if (node.key === 'control-delay') {
    const input = getInputVar(ctx, node)
    ctx.varMap.set(String(node.id), input)
    return `${indent}await sleep(${valueAsNumber(config.ms, 1000)});\n`
  }

  if (node.key === 'control-wait') {
    ctx.varMap.set(String(node.id), variable)
    return `${indent}var ${variable} = await waitOnePacket(${valueAsNumber(config.timeout, 5000)});\n`
  }

  if (node.key === 'control-loop') {
    const input = getInputVar(ctx, node)
    ctx.varMap.set(String(node.id), input)
    const body = emitBranch(ctx, node, 'out', `${indent}  `, ctx.branchVisited)
    if (config.type === '无限循环' || valueAsNumber(config.count, 1) === 0) {
      return `${indent}while (true) {\n${indent}  await sleep(10);\n${body}${indent}  if (await checkStop()) break;\n${indent}}\n`
    }
    return `${indent}for (let _i = 0; _i < ${valueAsNumber(config.count, 1)}; _i++) {\n${body}${indent}}\n`
  }

  if (node.key === 'control-if') {
    const condition = getInputVar(ctx, node, 'condition', 'false')
    const trueCode = emitBranch(ctx, node, 'true', `${indent}  `, ctx.branchVisited)
    const falseCode = emitBranch(ctx, node, 'false', `${indent}  `, ctx.branchVisited)
    return `${indent}if (${condition}) {\n${trueCode}${indent}} else {\n${falseCode}${indent}}\n`
  }

  if (node.key === 'control-timeout') {
    const input = getInputVar(ctx, node)
    ctx.varMap.set(String(node.id), input)
    const normalCode = emitBranch(ctx, node, 'normal', `${indent}  `, ctx.branchVisited)
    const timeoutCode = emitBranch(ctx, node, 'timeout', `${indent}  `, ctx.branchVisited)
    const timeout = valueAsNumber(config.timeout, 3000)
    return `${indent}try {\n${indent}  await Promise.race([\n${indent}    Promise.resolve(${input}),\n${indent}    sleep(${timeout}).then(() => { throw new Error('TIMEOUT') })\n${indent}  ]);\n${normalCode}${indent}} catch (e) {\n${indent}  if (e.message !== 'TIMEOUT') throw e;\n${timeoutCode}${indent}}\n`
  }

  return `${indent}// 控制: ${node.key}\n`
}
