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
    // 循环体内：节点输出 = 当前序号（1-based），下游可连线用作序列号/索引
    ctx.varMap.set(String(node.id), variable)
    const body = emitBranch(ctx, node, 'out', `${indent}  `, ctx.branchVisited)
    // 遍历循环：输入接数组（如 split-delimiter 拆出的行），循环体里 _out = 当前元素
    // 必须在「无限循环」判断之前——遍历循环的 count 恒为 0，否则会被 count===0 吞掉
    if (config.type === '遍历循环') {
      const arrVar = `_arr_${variable}`
      // 跳过空元素（文件尾随换行产生的空行等），避免对空帧解析产生噪声日志
      return `${indent}var ${arrVar} = ${input};\n${indent}${arrVar} = Array.isArray(${arrVar}) ? ${arrVar} : [${arrVar}];\n${indent}for (var _i = 0; _i < ${arrVar}.length; _i++) {\n${indent}  var ${variable} = ${arrVar}[_i];\n${indent}  if (await checkStop()) break;\n${indent}  if (${variable} === null || ${variable} === undefined || String(${variable}).trim() === '') continue;\n${body}${indent}}\n`
    }
    if (config.type === '无限循环' || valueAsNumber(config.count, 1) === 0) {
      return `${indent}var ${variable} = 0;\n${indent}while (true) {\n${indent}  ${variable} = (${variable} || 0) + 1;\n${indent}  await sleep(10);\n${body}${indent}  if (await checkStop()) break;\n${indent}}\n`
    }
    const count = valueAsNumber(config.count, 1)
    return `${indent}for (let _i = 0; _i < ${count}; _i++) {\n${indent}  var ${variable} = _i + 1;\n${body}${indent}}\n`
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
