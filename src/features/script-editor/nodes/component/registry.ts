import type { McpToolDescriptor, NodeDef } from '@shared/types'
import type { AbstractNodeComponent } from '@/features/script-editor/nodes/component/AbstractNodeComponent'
import { unknownSandboxApis } from '@/features/script-editor/nodes/component/sandboxCatalog'
import { nodeRegistry } from '@/features/script-editor/nodes/component/dynamicRegistry'

import {
  CompareBoundaryNode,
  CompareEqNode,
  CompareGtNode,
  CompareGteNode,
  CompareInNode,
  CompareLtNode,
  CompareLteNode,
  CompareMatchNode,
  CompareNeqNode,
  CompareNotInNode
} from '@/features/script-editor/nodes/component/nodes/compare'
import {
  ControlDelayNode,
  ControlIfNode,
  ControlLoopNode,
  ControlTimeoutNode,
  ControlWaitNode
} from '@/features/script-editor/nodes/component/nodes/control'
import {
  InputFileNode,
  InputManualNode,
  InputPanelNode,
  InputSerialNode,
  InputTcpNode,
  InputTcpServerNode,
  InputTimerNode
} from '@/features/script-editor/nodes/component/nodes/input'
import {
  LogicalAndNode,
  LogicalNotNode,
  LogicalOrNode
} from '@/features/script-editor/nodes/component/nodes/logical'
import {
  ModbusReadNode,
  ModbusWriteNode
} from '@/features/script-editor/nodes/component/nodes/modbus'
import {
  NumericBaseNode,
  NumericCalcNode,
  NumericCrcNode,
  NumericJoinNode,
  NumericLengthNode,
  ScriptExprNode
} from '@/features/script-editor/nodes/component/nodes/numeric'
import {
  OutputFileNode,
  OutputLogNode,
  OutputPanelNode,
  OutputSerialNode,
  OutputTcpNode,
  OutputTcpServerNode,
  OutputVariableNode
} from '@/features/script-editor/nodes/component/nodes/output'
import {
  SplitDelimiterNode,
  SplitLengthNode,
  SplitRegexNode,
  SplitSubstringNode,
  SplitTrimbytesNode
} from '@/features/script-editor/nodes/component/nodes/split'
import {
  StringConcatNode,
  StringFindNode,
  StringPadNode,
  StringReplaceNode,
  StringTemplateNode,
  StringTrimNode
} from '@/features/script-editor/nodes/component/nodes/string'
import {
  TransformBase64Node,
  TransformByteorderNode,
  TransformCaseNode,
  TransformEncodingNode,
  TransformHexNode,
  TransformNamefieldsNode,
  TransformObjectNode
} from '@/features/script-editor/nodes/component/nodes/transform'
import {
  ProtocolBitfieldNode,
  ProtocolConcatNode,
  ProtocolConstNode,
  ProtocolCrcNode,
  ProtocolDecodeTextNode,
  ProtocolLenPrefixNode,
  ProtocolParseUNode,
  ProtocolSliceNode
} from '@/features/script-editor/nodes/component/nodes/protocol'

/** 全部节点组件实例（单一注册源） */
export const NODE_COMPONENTS: AbstractNodeComponent[] = [
  // input
  new InputSerialNode(),
  new InputTcpNode(),
  new InputTcpServerNode(),
  new InputPanelNode(),
  new InputManualNode(),
  new InputFileNode(),
  new InputTimerNode(),
  // transform
  new TransformHexNode(),
  new TransformBase64Node(),
  new TransformEncodingNode(),
  new TransformByteorderNode(),
  new TransformCaseNode(),
  new TransformObjectNode(),
  new TransformNamefieldsNode(),
  // split
  new SplitDelimiterNode(),
  new SplitLengthNode(),
  new SplitRegexNode(),
  new SplitSubstringNode(),
  new SplitTrimbytesNode(),
  // numeric
  new NumericBaseNode(),
  new NumericJoinNode(),
  new NumericCalcNode(),
  new NumericCrcNode(),
  new NumericLengthNode(),
  new ScriptExprNode(),
  // string
  new StringConcatNode(),
  new StringReplaceNode(),
  new StringTrimNode(),
  new StringFindNode(),
  new StringTemplateNode(),
  new StringPadNode(),
  // compare
  new CompareEqNode(),
  new CompareNeqNode(),
  new CompareGtNode(),
  new CompareGteNode(),
  new CompareLtNode(),
  new CompareLteNode(),
  new CompareInNode(),
  new CompareNotInNode(),
  new CompareMatchNode(),
  new CompareBoundaryNode(),
  // logical
  new LogicalAndNode(),
  new LogicalOrNode(),
  new LogicalNotNode(),
  // control
  new ControlIfNode(),
  new ControlLoopNode(),
  new ControlDelayNode(),
  new ControlWaitNode(),
  new ControlTimeoutNode(),
  // output
  new OutputSerialNode(),
  new OutputPanelNode(),
  new OutputTcpNode(),
  new OutputTcpServerNode(),
  new OutputFileNode(),
  new OutputLogNode(),
  new OutputVariableNode(),
  // modbus
  new ModbusReadNode(),
  new ModbusWriteNode(),
  // protocol
  new ProtocolConstNode(),
  new ProtocolBitfieldNode(),
  new ProtocolConcatNode(),
  new ProtocolLenPrefixNode(),
  new ProtocolCrcNode(),
  new ProtocolSliceNode(),
  new ProtocolParseUNode(),
  new ProtocolDecodeTextNode()
]

export const NODE_COMPONENT_MAP: Record<string, AbstractNodeComponent> = Object.fromEntries(
  NODE_COMPONENTS.map((component) => [component.key, component])
)

/** 兼容旧 NodeDef 消费者 */
export const NODE_DEFINITIONS: Record<string, NodeDef> = Object.fromEntries(
  NODE_COMPONENTS.map((component) => [component.key, component.toNodeDef()])
)

// 装配动态注册表：灌入内置节点（一次性）。后续组经 nodeRegistry.registerUser 注入用户/插件组件。
nodeRegistry.registerBuiltIn(NODE_COMPONENTS)

/**
 * 动态查询（内置 + 用户/插件合并）。委托 nodeRegistry 单例。
 * 用户组件经 toNodeDef() 投影后，调色板/画布/codegen 自动含之。
 */
export function getNodeComponent(key: string): AbstractNodeComponent | undefined {
  return nodeRegistry.get(key)
}

export function getNodeDefinition(key: string): NodeDef | undefined {
  return nodeRegistry.definitions()[key]
}

/** 全部节点的 MCP Tool 描述（AI 可发现；用户组件经 toMcpTool() 同路径产出） */
export function listNodeMcpTools(): McpToolDescriptor[] {
  return nodeRegistry.mcpTools()
}

export function getNodeMcpTool(key: string): McpToolDescriptor | undefined {
  return nodeRegistry.get(key)?.toMcpTool()
}

/** 汇总图中节点 key 列表所需 sandbox API；返回未知 API 名 */
export function collectUnknownSandboxApisForKeys(keys: string[]): string[] {
  const apis = new Set<string>()
  for (const key of keys) {
    const component = nodeRegistry.get(key)
    if (!component) continue
    for (const api of component.sandboxApis()) apis.add(api)
  }
  return unknownSandboxApis([...apis])
}

export function isContinuousRootKey(key: string): boolean {
  return nodeRegistry.isContinuousRoot(key)
}

/** 全量节点定义（内置 + 用户/插件）。调色板/添加节点用此，而非冻结的 NODE_DEFINITIONS。 */
export function listAllNodeDefinitions(): NodeDef[] {
  return Object.values(nodeRegistry.definitions())
}

/** 全量节点组件（内置 + 用户/插件）。 */
export function listAllNodeComponents(): AbstractNodeComponent[] {
  return nodeRegistry.all()
}

/** 暴露单例供用户组件面板/插件装配时 reloadUser 用。 */
export { nodeRegistry } from '@/features/script-editor/nodes/component/dynamicRegistry'
