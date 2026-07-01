import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

export const STRING_NODES = {
  'string-concat': b.def('string-concat', 'string', '字符串拼接', [b.dataIn('left', '左值'), b.dataIn('right', '右值')], [b.dataOut()], [
    b.textControl('separator', '分隔符')
  ]),
  'string-replace': b.def('string-replace', 'string', '字符串替换', [b.dataIn()], [b.dataOut()], [
    b.textControl('search', '查找'),
    b.textControl('replace', '替换为'),
    b.selectControl('all', '替换全部', ['是', '否'], '是')
  ]),
  'string-trim': b.def('string-trim', 'string', '去除空白', [b.dataIn()], [b.dataOut()], [
    b.selectControl('position', '位置', ['两端', '左侧', '右侧', '全部'], '两端')
  ]),
  'string-find': b.def('string-find', 'string', '查找匹配', [b.dataIn()], [b.dataOut()], [
    b.textControl('search', '查找内容'),
    b.selectControl('return', '返回', ['是否找到', '位置索引', '匹配次数'], '是否找到')
  ]),
  'string-template': b.def('string-template', 'string', '格式化模板', [
    b.dataIn('value1', '值1'),
    b.dataIn('value2', '值2'),
    b.dataIn('value3', '值3')
  ], [b.dataOut()], [
    b.textControl('template', '模板', '设备{1}: 值{2}, 状态{3}')
  ])
}
