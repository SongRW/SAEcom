import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

export const LOGICAL_NODES = {
  'logical-and': b.def('logical-and', 'logical', '与', [b.boolIn('left', '左值'), b.boolIn('right', '右值')], [b.boolOut()]),
  'logical-or': b.def('logical-or', 'logical', '或', [b.boolIn('left', '左值'), b.boolIn('right', '右值')], [b.boolOut()]),
  'logical-not': b.def('logical-not', 'logical', '非', [b.boolIn()], [b.boolOut()])
}
