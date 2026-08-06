import type {
  NodeCategory, ReteGraphExport, ReteGraphNode, SocketSpec
} from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import {
  AbstractNodeComponent
} from '@/features/script-editor/nodes/component/AbstractNodeComponent'
import { emitComposite } from '@/features/script-editor/codegen/emit/composite'

/**
 * 拼装组件（子图内联）：用户用多个内置/自定义组件在子画布搭图，
 * 声明对外输入/输出端口并绑定到子图节点，作为一个复合节点被引用。
 *
 * codegen 时不产出自定义代码，而是把子图内联进父图（emit/composite.ts）：
 * 把 composite 节点的输入连接变量注入子图入口节点的 varMap，
 * 子图出口节点产出变量回写到父 ctx 的 varMap，整段以 IIFE 包裹隔离作用域。
 *
 * 环检测：展开前 DAG 校验，禁止自我引用/循环；v1 深度上限 1（拼装组件内部仅用内置/JS 组件，不再嵌套拼装）。
 */
export interface PortBinding {
  /** 外部端口 key。 */
  portKey: string
  /** 子图节点 id。 */
  nodeId: string
  /** 子图节点上的输入/输出端口 key。 */
  nodePortKey: string
}

export interface CompositeComponentDescriptor {
  key: string
  name: string
  description?: string
  category?: NodeCategory
  /** 对外暴露的输入端口。 */
  inputs: SocketSpec[]
  /** 对外暴露的输出端口。 */
  outputs: SocketSpec[]
  /** 内部子图（由子编辑器画布产出）。 */
  subgraph: ReteGraphExport
  /** 外部输入端口 → 子图入口节点的某输入端口。 */
  inputBindings: PortBinding[]
  /** 子图出口节点的某输出端口 → 外部输出端口。 */
  outputBindings: PortBinding[]
}

/** 校验 key 合法（与 JS 组件一致，custom- 前缀）。 */
export function isValidCompositeKey(key: string): boolean {
  return /^custom-[a-z0-9-]+$/.test(key)
}

/**
 * 拼装组件节点类。emit 委托给 codegen/emit/composite.ts 的 emitComposite。
 */
export class CompositeNodeComponent extends AbstractNodeComponent {
  readonly key: string
  readonly category: NodeCategory
  readonly name: string
  readonly description?: string

  private readonly descriptor: CompositeComponentDescriptor

  constructor(descriptor: CompositeComponentDescriptor) {
    super()
    this.descriptor = descriptor
    this.key = descriptor.key
    this.name = descriptor.name
    this.description = descriptor.description
    this.category = descriptor.category ?? 'custom'
  }

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: this.descriptor.inputs, outputs: this.descriptor.outputs }
  }

  controls(): never[] {
    // 拼装组件的配置在子图内部各节点上，对外不暴露 control。
    return []
  }

  sandboxApis(): string[] {
    // 拼装组件本身不声明 sandbox API——子图内各节点各自声明，codegen 汇总时各自校验。
    return []
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitComposite(ctx, this.descriptor, node, indent)
  }

  toDescriptor(): CompositeComponentDescriptor {
    // 深拷贝避免外部改动污染注册表
    return JSON.parse(JSON.stringify(this.descriptor)) as CompositeComponentDescriptor
  }

  /** 子图（供环检测/codegen 用）。 */
  getSubgraph(): ReteGraphExport {
    return this.descriptor.subgraph
  }
}
