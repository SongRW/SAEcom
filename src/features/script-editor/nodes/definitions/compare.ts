import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

export const COMPARE_NODES = {
  'compare-eq': b.def('compare-eq', 'compare', '等于', [b.dataIn('left', '左值'), b.dataIn('right', '右值')], [b.boolOut()], [
    b.textControl('operand', '比较值')
  ]),
  'compare-neq': b.def('compare-neq', 'compare', '不等于', [b.dataIn('left', '左值'), b.dataIn('right', '右值')], [b.boolOut()], [
    b.textControl('operand', '比较值')
  ]),
  'compare-gt': b.def('compare-gt', 'compare', '大于', [b.dataIn('left', '左值'), b.dataIn('right', '右值')], [b.boolOut()], [
    b.textControl('operand', '比较值')
  ]),
  'compare-gte': b.def('compare-gte', 'compare', '大于等于', [b.dataIn('left', '左值'), b.dataIn('right', '右值')], [b.boolOut()], [
    b.textControl('operand', '比较值')
  ]),
  'compare-lt': b.def('compare-lt', 'compare', '小于', [b.dataIn('left', '左值'), b.dataIn('right', '右值')], [b.boolOut()], [
    b.textControl('operand', '比较值')
  ]),
  'compare-lte': b.def('compare-lte', 'compare', '小于等于', [b.dataIn('left', '左值'), b.dataIn('right', '右值')], [b.boolOut()], [
    b.textControl('operand', '比较值')
  ]),
  'compare-in': b.def('compare-in', 'compare', '包含', [b.dataIn('left', '左值'), b.dataIn('right', '右值')], [b.boolOut()], [
    b.textControl('operand', '比较值')
  ]),
  'compare-not-in': b.def('compare-not-in', 'compare', '不包含', [b.dataIn('left', '左值'), b.dataIn('right', '右值')], [b.boolOut()], [
    b.textControl('operand', '比较值')
  ]),
  'compare-match': b.def('compare-match', 'compare', '正则匹配', [b.dataIn('left', '输入'), b.dataIn('right', '模式')], [b.boolOut()], [
    b.textControl('pattern', '正则'),
    b.textControl('flags', '标志')
  ]),
  'compare-boundary': b.def('compare-boundary', 'compare', '边界匹配', [b.dataIn('left', '输入'), b.dataIn('right', '边界值')], [b.boolOut()], [
    b.selectControl('mode', '模式', ['startsWith', 'endsWith'], 'startsWith'),
    b.textControl('operand', '边界值')
  ])
}
