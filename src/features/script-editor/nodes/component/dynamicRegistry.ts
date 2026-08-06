import type { McpToolDescriptor, NodeDef } from '@shared/types'
import type { AbstractNodeComponent } from '@/features/script-editor/nodes/component/AbstractNodeComponent'

/**
 * 动态节点注册表：内置冻结 + 用户/插件可热加载。
 *
 * 设计约束（零回归）：
 * - 内置节点经构造时一次性灌入，之后只读（冻结语义）。
 * - 用户/插件节点可经 registerUser / reloadUser 动态增删。
 * - 合并查找：用户 key 可覆盖同名内置 key（记为 override 并警告，便于排查）。
 * - 所有现有 registry.ts 的「查询」导出（getNodeComponent / getNodeDefinition /
 *   listNodeMcpTools / getNodeMcpTool / isContinuousRootKey /
 *   collectUnknownSandboxApisForKeys）委托本单例，使调色板/画布/codegen/MCP 自动含用户组件。
 *
 * 后续组（6-8）的 Monaco 编辑器、自定义面板、Python 插件都经 reloadUser 注入。
 */
export class NodeRegistry {
  private readonly builtIn = new Map<string, AbstractNodeComponent>()
  private readonly user = new Map<string, AbstractNodeComponent>()
  /** 被用户覆盖的内置 key（用于诊断/警告） */
  private readonly overriddenBuiltInKeys = new Set<string>()

  /** 灌入内置节点（仅装配时调用一次）。重复灌入抛错，防误用。 */
  registerBuiltIn(components: AbstractNodeComponent[]): void {
    if (this.builtIn.size > 0) {
      throw new Error('NodeRegistry.registerBuiltIn: 内置节点已灌入，不可重复')
    }
    for (const c of components) this.builtIn.set(c.key, c)
  }

  /** 注册单个用户/插件节点。同名内置 key 被覆盖时记警告。 */
  registerUser(component: AbstractNodeComponent): void {
    if (this.builtIn.has(component.key) && !this.overriddenBuiltInKeys.has(component.key)) {
      this.overriddenBuiltInKeys.add(component.key)
      console.warn(`[NodeRegistry] 用户组件 '${component.key}' 覆盖了同名内置组件`)
    }
    this.user.set(component.key, component)
  }

  /** 注销单个用户/插件节点（不影响内置）。 */
  unregisterUser(key: string): void {
    this.user.delete(key)
  }

  /** 整批替换用户/插件节点（用于从磁盘重新加载）。 */
  reloadUser(components: AbstractNodeComponent[]): void {
    this.user.clear()
    this.overriddenBuiltInKeys.clear()
    for (const c of components) this.registerUser(c)
  }

  /** 合并查找：用户优先于内置。 */
  get(key: string): AbstractNodeComponent | undefined {
    return this.user.get(key) ?? this.builtIn.get(key)
  }

  /** 仅内置（冻结导出 NODE_COMPONENTS 等用）。 */
  getBuiltIn(key: string): AbstractNodeComponent | undefined {
    return this.builtIn.get(key)
  }

  /** 全量（内置 + 用户）。用户覆盖时只取用户那份（不重复）。 */
  all(): AbstractNodeComponent[] {
    const seen = new Set<string>()
    const out: AbstractNodeComponent[] = []
    // 用户优先遍历，保证覆盖语义下不重复
    for (const [key, c] of this.user) {
      if (!seen.has(key)) { seen.add(key); out.push(c) }
    }
    for (const [key, c] of this.builtIn) {
      if (!seen.has(key)) { seen.add(key); out.push(c) }
    }
    return out
  }

  /** 全量投影为 NodeDef（调色板/画布/codegen 用）。 */
  definitions(): Record<string, NodeDef> {
    const out: Record<string, NodeDef> = {}
    // 内置先填，用户覆盖后填（保证用户版胜出）
    for (const [key, c] of this.builtIn) out[key] = c.toNodeDef()
    for (const [key, c] of this.user) out[key] = c.toNodeDef()
    return out
  }

  /** 全量 MCP Tool 描述（AI 可发现；用户组件和内置同路径产出）。 */
  mcpTools(): McpToolDescriptor[] {
    return this.all().map((c) => c.toMcpTool())
  }

  isContinuousRoot(key: string): boolean {
    return this.get(key)?.isContinuousRoot === true
  }

  /** 是否为用户/插件组件（非内置）。 */
  isUser(key: string): boolean {
    return this.user.has(key)
  }

  /** 被用户覆盖的内置 key 列表（诊断用）。 */
  overriddenBuiltIn(): string[] {
    return [...this.overriddenBuiltInKeys]
  }
}

/** 单例。registry.ts 装配时灌入内置节点。 */
export const nodeRegistry = new NodeRegistry()
