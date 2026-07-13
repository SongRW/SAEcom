import type { NodeDef } from '@shared/types'

// 节点定义聚合入口。
// 实际定义按类别拆分在 ./definitions/ 下（与 codegen/emit/ 的拆分粒度对齐），
// 这里仅负责合并所有类别并导出稳定 API（NODE_CATEGORIES / NODE_DEFINITIONS / getNodeDefinition）。

export { NODE_CATEGORIES } from '@/features/script-editor/nodes/categories'

import { COMPARE_NODES } from '@/features/script-editor/nodes/definitions/compare'
import { CONTROL_NODES } from '@/features/script-editor/nodes/definitions/control'
import { INPUT_NODES } from '@/features/script-editor/nodes/definitions/input'
import { LOGICAL_NODES } from '@/features/script-editor/nodes/definitions/logical'
import { MODBUS_NODES } from '@/features/script-editor/nodes/definitions/modbus'
import { NUMERIC_NODES } from '@/features/script-editor/nodes/definitions/numeric'
import { OUTPUT_NODES } from '@/features/script-editor/nodes/definitions/output'
import { SPLIT_NODES } from '@/features/script-editor/nodes/definitions/split'
import { STRING_NODES } from '@/features/script-editor/nodes/definitions/string'
import { TRANSFORM_NODES } from '@/features/script-editor/nodes/definitions/transform'

export const NODE_DEFINITIONS: Record<string, NodeDef> = {
  ...INPUT_NODES,
  ...TRANSFORM_NODES,
  ...SPLIT_NODES,
  ...NUMERIC_NODES,
  ...STRING_NODES,
  ...COMPARE_NODES,
  ...LOGICAL_NODES,
  ...CONTROL_NODES,
  ...OUTPUT_NODES,
  ...MODBUS_NODES
}

export const getNodeDefinition = (key: string): NodeDef | undefined => NODE_DEFINITIONS[key]
