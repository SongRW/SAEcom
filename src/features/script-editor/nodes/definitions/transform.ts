import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

export const TRANSFORM_NODES = {
  'transform-hex': b.def('transform-hex', 'transform', 'HEX转换', [b.dataIn()], [b.dataOut()], [
    b.selectControl('direction', '方向', ['HEX→文本', '文本→HEX'], 'HEX→文本'),
    b.selectControl('separator', '分隔符', ['空格', '无', '自定义'], '空格'),
    b.selectControl('encoding', '编码', ['utf8', 'gbk', 'ascii'], 'utf8')
  ]),
  'transform-base64': b.def('transform-base64', 'transform', 'Base64编解码', [b.dataIn()], [b.dataOut()], [
    b.selectControl('operation', '操作', ['编码', '解码'], '编码')
  ]),
  'transform-encoding': b.def('transform-encoding', 'transform', '编码转换', [b.dataIn()], [b.dataOut()], [
    b.selectControl('from', '源编码', ['utf8', 'gbk', 'ascii', 'iso8859-1'], 'utf8'),
    b.selectControl('to', '目标编码', ['utf8', 'gbk', 'ascii', 'iso8859-1'], 'gbk')
  ]),
  'transform-byteorder': b.def('transform-byteorder', 'transform', '字节序转换', [b.dataIn()], [b.dataOut()], [
    b.selectControl('type', '类型', ['大端→小端', '小端→大端'], '大端→小端'),
    b.selectControl('size', '数据长度', ['2字节', '4字节'], '2字节')
  ]),
  'transform-case': b.def('transform-case', 'transform', '大小写转换', [b.dataIn()], [b.dataOut()], [
    b.selectControl('case', '转换', ['转大写', '转小写'], '转大写')
  ]),
  'transform-object': b.def('transform-object', 'transform', '对象', [], [b.dataOut()], [])
}
