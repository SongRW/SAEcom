// 节点定义聚合入口。
// 实际节点由 AbstractNodeComponent 子类提供；此处导出稳定兼容 API。

export { NODE_CATEGORIES } from '@/features/script-editor/nodes/categories'

export {
  NODE_COMPONENTS,
  NODE_COMPONENT_MAP,
  NODE_DEFINITIONS,
  getNodeComponent,
  getNodeDefinition,
  listNodeMcpTools,
  getNodeMcpTool,
  collectUnknownSandboxApisForKeys,
  isContinuousRootKey,
  listAllNodeDefinitions,
  listAllNodeComponents,
  nodeRegistry
} from '@/features/script-editor/nodes/component/registry'
