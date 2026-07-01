import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

// 注：input-serial / input-tcp / input-tcp-server 为持续监听节点（见 codegen 的
// continuousListenExpression），天然长连接、无"等一帧超时"概念，故不再提供 timeout 控件。

export const INPUT_NODES = {
  'input-serial': b.def('input-serial', 'input', '接收串口', [], [b.dataOut()], [
    ...b.serialConfigControls(true)
  ]),
  'input-tcp': b.def('input-tcp', 'input', '接收TCP', [], [b.dataOut()], [
    b.textControl('host', '主机', '127.0.0.1'),
    b.numberControl('port', '端口', 8080)
  ]),
  'input-tcp-server': b.def('input-tcp-server', 'input', 'TCP服务器接收', [], [b.dataOut()], [
    b.numberControl('port', '监听端口', 9000)
  ]),
  'input-manual': b.def('input-manual', 'input', '手动输入', [], [b.dataOut()], [
    b.textControl('content', '输入内容', '', true),
    b.selectControl('mode', '格式', ['text', 'hex'], 'text')
  ]),
  'input-file': b.def('input-file', 'input', '读取文件', [], [b.dataOut()], [
    b.textControl('path', '文件路径', '', true),
    b.selectControl('encoding', '编码', ['utf8', 'gbk', 'binary'], 'utf8')
  ]),
  'input-timer': b.def('input-timer', 'input', '定时触发', [], [b.triggerOut()], [
    b.numberControl('interval', '间隔(ms)', 1000),
    b.selectControl('repeat', '重复', ['单次', '循环'], '单次')
  ])
}
