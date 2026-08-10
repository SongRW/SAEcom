/**
 * 三步 Pipeline 编排：协议文档 → 工具拆分验证 → DSL→graph 转换。
 *
 * 设计意图：
 * - 把「协议描述 → 可运行脚本」拆成三个独立、可测、可替换的步骤。
 * - 每步是纯函数，有独立测试。Vitest 内用确定性规则函数模拟「subagent 决策」。
 * - PipelineContext.llmCall 可选注入：为 undefined 时走确定性规则；注入后可对接真 MCP tool-call。
 *
 * 三步：
 *   ① generateProtocolDoc(dsl) → ProtocolDoc（字段表 + 依赖图）
 *   ② validateProtocolFrame(doc) → { validatedLayout }（示例帧拆分验证）
 *   ③ dslToGraph(dsl) → ReteGraphExport（运行时偏移链，含 cursor 累加节点）
 *
 * 注：第三步目前直接用 dslToGraph（已重写为运行时偏移链版）。
 * validatedLayout 的信息已在 generateDoc 阶段固化到 graph 生成逻辑中（offsetMode/dynamicLengthFrom），
 * 第三步消费这些标注生成 cursor 链。未来可让第三步显式消费 validatedLayout 进一步对齐。
 */

import type { ProtocolDsl } from '@shared/protocol-dsl'
import type { ProtocolDoc } from '@shared/protocol-doc'
import { protocolDocToMarkdown } from '@shared/protocol-doc'
import type { ReteGraphExport } from '@shared/types'
import { generateProtocolDoc } from '@/features/script-editor/dsl/generateDoc'
import { validateProtocolFrame, type ValidationResult, type ValidatedLayout } from '@/features/script-editor/dsl/validateFrame'
import { dslToGraph } from '@/features/script-editor/dsl/toGraph'

/**
 * Pipeline 上下文。llmCall 为可选的 LLM 调用回调（未来对接 MCP 时注入）。
 * 当前确定性模式下 llmCall = undefined，三步均走规则函数。
 */
export interface PipelineContext {
  /**
   * 可选 LLM 调用回调。若注入，每步会生成 prompt + tool schema 调用此回调。
   * 当前未实现真调用（确定性模式优先），保留接口供未来扩展。
   */
  llmCall?: (prompt: string, tools: PipelineTool[]) => Promise<unknown>
  /** 是否跳过第二步验证（无示例帧时仍生成图） */
  skipValidation?: boolean
}

/** Pipeline 工具描述（供 llmCall 用，当前确定性模式忽略）。 */
export interface PipelineTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** Pipeline 执行结果。 */
export interface PipelineResult {
  /** 第一步产出的协议文档 */
  doc: ProtocolDoc
  /** 第二步验证结果（skipValidation=true 时为 null） */
  validation: ValidationResult | null
  /** 验证后的固化布局（第三步用） */
  validatedLayout: ValidatedLayout | null
  /** 第三步产出的 graph */
  graph: ReteGraphExport
  /** 从 graph 生成的代码 */
  code: string
  /** 渲染后的协议文档 Markdown（人类可读） */
  docMarkdown: string
}

/**
 * 运行三步 pipeline。
 *
 * @param dsl 协议 DSL
 * @param ctx pipeline 上下文（可选 llmCall、skipValidation）
 * @param codegen 可选的 codegen 函数（注入以避免循环依赖；默认用 generateCodeFromRete）
 * @returns pipeline 执行结果
 */
export function runPipeline(
  dsl: ProtocolDsl,
  ctx?: PipelineContext,
  codegen?: (graph: ReteGraphExport) => string
): PipelineResult {
  // 第一步：协议文档生成（确定性规则函数；llmCall 注入时此处可换成 LLM 调用）
  const doc = generateProtocolDoc(dsl)

  // 第二步：工具拆分验证
  let validation: ValidationResult | null = null
  let validatedLayout: ValidatedLayout | null = null
  if (!ctx?.skipValidation) {
    validation = validateProtocolFrame(doc)
    validatedLayout = validation.validatedLayout
  }

  // 第三步：DSL → graph（运行时偏移链版 dslToGraph）
  const graph = dslToGraph(dsl)

  // 生成代码（codegen 注入避免循环依赖）
  const code = codegen ? codegen(graph) : ''

  // 协议文档 Markdown 渲染
  const docMarkdown = protocolDocToMarkdown(doc)

  return {
    doc,
    validation,
    validatedLayout,
    graph,
    code,
    docMarkdown
  }
}

/**
 * 为第一步生成 LLM prompt（未来 MCP 对接用）。
 * 当前确定性模式不调用，但保留供调试/文档。
 */
export function buildDocGenerationPrompt(dsl: ProtocolDsl): string {
  return [
    '请把以下协议 DSL 转换成结构化协议文档，标注每个字段的：',
    '- 偏移方式（静态/动态）',
    '- 宽度（固定字节数 或 动态来源字段）',
    '- 字节序、编码',
    '- 前序依赖（如 length-prefix → body, tlv-len → value）',
    '',
    'DSL:',
    '```json',
    JSON.stringify(dsl, null, 2),
    '```'
  ].join('\n')
}

/**
 * 为第二步生成 LLM prompt + 工具（未来 MCP 对接用）。
 */
export function buildValidationTools(): PipelineTool[] {
  return [
    {
      name: 'splitFrame',
      description: '按布局表拆解 HEX 帧，返回每字段的实际值。用于验证协议布局正确性。',
      inputSchema: {
        type: 'object',
        properties: {
          hex: { type: 'string', description: 'HEX 字符串（大写无空格）' },
          layout: {
            type: 'array',
            description: '字段布局表（按帧顺序）',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                startByte: { type: 'number' },
                lengthBytes: { type: 'number' },
                parse: { type: 'string', enum: ['hex', 'uint', 'text', 'bits'] }
              }
            }
          }
        },
        required: ['hex', 'layout']
      }
    }
  ]
}
