import type {
  ControlSpec,
  McpToolDescriptor,
  NodeCategory,
  NodeDef,
  ReteGraphNode,
  SocketSpec
} from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { NODE_CATEGORIES } from '@/features/script-editor/nodes/categories'
import { buildMcpToolDescriptor } from '@/features/script-editor/nodes/component/mcp'
import { unknownSandboxApis } from '@/features/script-editor/nodes/component/sandboxCatalog'

/**
 * 脚本编辑器节点组件抽象父类。
 * 统一元数据 / 端口 / 配置 / codegen emit / sandbox 能力声明 / MCP tool 描述。
 */
export abstract class AbstractNodeComponent {
  abstract readonly key: string
  abstract readonly category: NodeCategory
  abstract readonly name: string

  readonly icon?: string
  readonly description?: string

  /** 持续监听型输入根节点（listen* 包装） */
  readonly isContinuousRoot: boolean = false
  /** 动态端口节点（如 transform-object / namefields） */
  readonly dynamicPorts: boolean = false

  /** 可选覆盖分类默认色 */
  protected readonly colorOverride?: string

  get color(): string {
    return this.colorOverride ?? NODE_CATEGORIES[this.category].color
  }

  abstract ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] }
  abstract controls(): ControlSpec[]

  /** 生成代码会调用的 sandbox API 名 */
  abstract sandboxApis(): string[]

  /** 生成该节点对应 JS */
  abstract emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string

  /** 兼容现有 NodeDef 消费者（调色板 / Rete / 配置面板） */
  toNodeDef(): NodeDef {
    const { inputs, outputs } = this.ports()
    return {
      key: this.key,
      category: this.category,
      name: this.name,
      inputs,
      outputs,
      controls: this.controls(),
      icon: this.icon,
      color: this.color,
      description: this.description
    }
  }

  /** 导出 MCP Tool 描述（描述层，不绑定传输） */
  toMcpTool(): McpToolDescriptor {
    return buildMcpToolDescriptor({
      key: this.key,
      name: this.name,
      description: this.description,
      category: this.category,
      controls: this.controls(),
      sandboxApis: this.sandboxApis()
    })
  }

  /** 校验配置；默认检查 required controls */
  validateConfig(data: Record<string, unknown> = {}): string[] {
    const errors: string[] = []
    for (const control of this.controls()) {
      if (!control.required) continue
      const value = data[control.key]
      if (value === undefined || value === null || value === '') {
        errors.push(`${control.label || control.key} 为必填`)
      }
    }
    const unknown = unknownSandboxApis(this.sandboxApis())
    if (unknown.length > 0) {
      errors.push(`未知 sandbox API: ${unknown.join(', ')}`)
    }
    return errors
  }
}
