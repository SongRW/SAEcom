import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

export const CONTROL_NODES = {
  'control-if': b.def('control-if', 'control', '条件判断', [{ key: 'condition', socket: 'boolSocket', label: '条件' }], [
    b.flowOut('true', '真'),
    b.flowOut('false', '假')
  ]),
  'control-loop': b.def('control-loop', 'control', '循环执行', [b.dataIn()], [b.dataOut()], [
    b.numberControl('count', '循环次数', 0),
    b.selectControl('type', '循环类型', ['次数循环', '无限循环', '条件循环'], '次数循环')
  ]),
  'control-delay': b.def('control-delay', 'control', '延时等待', [b.dataIn()], [b.dataOut()], [
    b.numberControl('ms', '延时(ms)', 1000)
  ]),
  'control-wait': b.def('control-wait', 'control', '等待接收', [], [b.dataOut()], [
    b.numberControl('timeout', '超时(ms)', 5000),
    b.textControl('match', '匹配内容')
  ]),
  'control-timeout': b.def('control-timeout', 'control', '超时控制', [b.dataIn()], [
    b.flowOut('normal', '正常'),
    b.flowOut('timeout', '超时')
  ], [
    b.numberControl('timeout', '超时(ms)', 3000)
  ])
}
