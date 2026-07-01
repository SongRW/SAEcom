import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

export const OUTPUT_NODES = {
  'output-serial': b.def('output-serial', 'output', '发送串口', [b.dataIn()], [], [
    ...b.serialConfigControls(false),
    b.selectControl('mode', '格式', ['text', 'hex'], 'text')
  ]),
  'output-tcp': b.def('output-tcp', 'output', '发送TCP', [b.dataIn()], [], [
    b.textControl('host', '主机', '127.0.0.1'),
    b.numberControl('port', '端口', 8080),
    b.selectControl('mode', '格式', ['text', 'hex'], 'text')
  ]),
  'output-tcp-server': b.def('output-tcp-server', 'output', 'TCP服务器发送', [b.dataIn()], [], [
    b.numberControl('port', '服务器端口', 9000),
    b.selectControl('mode', '格式', ['text', 'hex'], 'text')
  ]),
  'output-file': b.def('output-file', 'output', '写入文件', [b.dataIn()], [], [
    b.textControl('path', '文件路径'),
    b.selectControl('mode', '写入模式', ['追加', '覆盖'], '追加')
  ]),
  'output-log': b.def('output-log', 'output', '日志输出', [b.dataIn()], [], [
    b.selectControl('level', '级别', ['info', 'warn', 'error', 'debug'], 'info'),
    b.textControl('prefix', '前缀')
  ]),
  'output-variable': b.def('output-variable', 'output', '变量存储', [b.dataIn()], [], [
    b.textControl('name', '变量名', 'result')
  ])
}
