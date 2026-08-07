import type { ControlSpec, NodeCategory, ReteGraphNode, SocketSpec } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import {
  AbstractNodeComponent
} from '@/features/script-editor/nodes/component/AbstractNodeComponent'
import {
  configRef, data, getInputVar, getInputVars, jsObjectLiteral, jsString, outVar,
  valueAsNumber, valueAsString
} from '@/features/script-editor/codegen/emit/shared'

/**
 * 用户自定义 JS 组件描述符。
 *
 * 与内置节点同构（对齐 AbstractNodeComponent 契约）：
 * - key 强制 custom- 前缀，防与内置/插件冲突。
 * - emit 是用户写的 emit 函数源码（字符串），运行时经 new Function 编译，
 *   注入安全 helpers（getInputVar/jsString/... 与内置 emit 同一套）。
 * - sandboxApis 必须全在 SANDBOX_API_CATALOG 内（注册时校验，未知则拒绝）。
 *
 * 信任模型：与现有脚本一致——本地用户编写，emit 产出的 JS 进 vm 沙箱运行（白名单 API）。
 */
export interface UserComponentDescriptor {
  key: string
  name: string
  description?: string
  /** 数据流语义说明（面向 AI/MCP）：描述输入代表什么、输出代表什么、核心处理逻辑。
   *  填了则投影到 MCP description（让 AI 理解怎么连线）；不填则回退到 description。 */
  dataFlow?: string
  category?: NodeCategory
  inputs: SocketSpec[]
  outputs: SocketSpec[]
  controls: ControlSpec[]
  sandboxApis: string[]
  /** emit 函数体源码。签名：(ctx, node, indent, helpers) => string。 */
  emit: string
}

/** emit 函数运行时拿到的 helpers 包（与内置 emit 用的同一套，从 codegen/emit/shared 抽取）。 */
export interface EmitHelpers {
  getInputVar: typeof getInputVar
  getInputVars: typeof getInputVars
  jsString: typeof jsString
  jsObjectLiteral: typeof jsObjectLiteral
  jsLiteral: (value: unknown) => string
  valueAsString: typeof valueAsString
  valueAsNumber: typeof valueAsNumber
  outVar: typeof outVar
  data: typeof data
  configRef: typeof configRef
  indent: (level: number) => string
}

/** 构造 helpers 包（注入给用户 emit 函数）。 */
export function buildEmitHelpers(): EmitHelpers {
  return {
    getInputVar,
    getInputVars,
    jsString,
    jsObjectLiteral,
    // jsLiteral 未从 shared 导出（私有），这里提供一个等价实现
    jsLiteral: (value: unknown): string => {
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
      const text = String(value ?? '')
      if (/^-?\d+(\.\d+)?$/.test(text.trim())) return text.trim()
      if (text === 'true' || text === 'false') return text
      return jsString(text)
    },
    valueAsString,
    valueAsNumber,
    outVar,
    data,
    configRef,
    indent: (level: number) => '  '.repeat(Math.max(0, level))
  }
}

/** 校验 key 合法（custom- 前缀 + 合法字符）。供 validate.ts 与注册共用。 */
export function isValidUserComponentKey(key: string): boolean {
  return /^custom-[a-z0-9-]+$/.test(key)
}

/**
 * 用户组件节点类。包装 descriptor 为 AbstractNodeComponent，使调色板/画布/codegen/MCP 自动接入。
 */
export class UserNodeComponent extends AbstractNodeComponent {
  readonly key: string
  readonly category: NodeCategory
  readonly name: string
  readonly description?: string

  private readonly descriptor: UserComponentDescriptor
  /** 编译后的 emit 函数（惰性编译并缓存）。 */
  private emitFn: ((ctx: EmitContext, node: ReteGraphNode, indent: string, helpers: EmitHelpers) => string) | null = null
  private emitCompileError: string | null = null

  constructor(descriptor: UserComponentDescriptor) {
    super()
    this.descriptor = descriptor
    this.key = descriptor.key
    this.name = descriptor.name
    // MCP description：优先用 dataFlow（面向 AI 的数据流语义），拼上简介。
    // dataFlow 让 AI 理解输入/输出代表什么、怎么连线；不填则回退纯 description。
    this.description = descriptor.dataFlow
      ? `${descriptor.description || descriptor.name}。${descriptor.dataFlow}`
      : descriptor.description
    this.category = descriptor.category ?? 'custom'
  }

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: this.descriptor.inputs, outputs: this.descriptor.outputs }
  }

  controls(): ControlSpec[] {
    return this.descriptor.controls
  }

  sandboxApis(): string[] {
    return this.descriptor.sandboxApis
  }

  /**
   * 编译用户 emit 源码为函数。失败时记录错误；emit() 调用时若未编译成功则产出注释占位。
   * 编译在此处发生（编辑器进程/渲染层），信任模型同本地用户脚本。
   */
  private compileEmit(): void {
    if (this.emitFn || this.emitCompileError) return
    try {
      // new Function 在渲染层执行（仅本地用户编写）。函数体只产出 JS 字符串，不执行副作用。
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      const fn = new Function('ctx', 'node', 'indent', 'helpers', this.descriptor.emit) as
        (ctx: EmitContext, node: ReteGraphNode, indent: string, helpers: EmitHelpers) => string
      this.emitFn = fn
    } catch (e: any) {
      this.emitCompileError = String(e?.message || e)
    }
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    this.compileEmit()
    if (!this.emitFn) {
      // 编译失败：产出占位注释，不阻断 codegen（运行时该节点无效果）
      return `${indent}// [自定义组件 ${this.key} emit 编译失败: ${this.emitCompileError}]\n`
    }
    try {
      const result = this.emitFn(ctx, node, indent, buildEmitHelpers())
      return typeof result === 'string' ? result : `${indent}// [自定义组件 ${this.key} emit 返回非字符串]\n`
    } catch (e: any) {
      return `${indent}// [自定义组件 ${this.key} emit 运行错误: ${String(e?.message || e)}]\n`
    }
  }

  /** 上次编译错误（编辑器诊断面板用）。 */
  getEmitCompileError(): string | null {
    this.compileEmit()
    return this.emitCompileError
  }

  /** 原始描述符（编辑器/持久化用）。 */
  toDescriptor(): UserComponentDescriptor {
    return { ...this.descriptor }
  }
}
