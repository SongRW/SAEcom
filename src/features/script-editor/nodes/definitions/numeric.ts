import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

export const NUMERIC_NODES = {
  'numeric-base': b.def('numeric-base', 'numeric', '进制转换', [b.dataIn()], [b.dataOut()], [
    b.selectControl('from', '源进制', ['十进制', '十六进制', '二进制', '八进制'], '十进制'),
    b.selectControl('to', '目标进制', ['十进制', '十六进制', '二进制', '八进制'], '十六进制')
  ]),
  'numeric-join': b.def('numeric-join', 'numeric', '字节拼接数值', [b.dataIn()], [b.dataOut()], [
    b.selectControl('type', '数值类型', ['uint16', 'int16', 'uint32', 'int32', 'float'], 'uint16'),
    b.selectControl('order', '字节序', ['大端', '小端'], '大端')
  ]),
  'numeric-calc': b.def('numeric-calc', 'numeric', '计算', [b.dataIn('left', '左值'), b.dataIn('right', '右值')], [b.dataOut()], [
    b.selectControl('operator', '运算', ['加', '减', '乘', '除', '取余', '异或', '与', '或'], '加'),
    b.textControl('operand2', '第二操作数')
  ]),
  'numeric-crc': b.def('numeric-crc', 'numeric', 'CRC校验', [b.dataIn()], [b.dataOut()], [
    b.selectControl('algorithm', '算法', ['CRC8', 'CRC16', 'CRC16-CCITT', 'CRC32', '校验和'], 'CRC16'),
    b.selectControl('outputFormat', '输出格式', ['HEX', '十进制', '二进制'], 'HEX'),
    b.selectControl('append', '追加到数据', ['是', '否'], '否')
  ]),
  'numeric-length': b.def('numeric-length', 'numeric', '计算长度', [b.dataIn()], [b.dataOut()], [
    b.selectControl('type', '类型', ['字符串长度', '数组元素数', '字节数'], '字符串长度')
  ])
}
