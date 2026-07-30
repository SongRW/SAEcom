import type { ControlSpec, ReteGraphNode, SocketSpec } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { emitTransform } from '@/features/script-editor/codegen/emit/transform'
import { AbstractNodeComponent } from '@/features/script-editor/nodes/component/AbstractNodeComponent'
import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

abstract class NumericBase extends AbstractNodeComponent {
  readonly category = 'numeric' as const

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitTransform(ctx, node, indent)
  }
}

export class NumericBaseNode extends NumericBase {
  readonly key = 'numeric-base'
  readonly name = '进制转换'
  readonly description = '数值进制转换'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('from', '源进制', ['十进制', '十六进制', '二进制', '八进制'], '十进制'),
      b.selectControl('to', '目标进制', ['十进制', '十六进制', '二进制', '八进制'], '十六进制')
    ]
  }

  sandboxApis(): string[] {
    return ['convertBase']
  }
}

export class NumericJoinNode extends NumericBase {
  readonly key = 'numeric-join'
  readonly name = '字节拼接数值'
  readonly description = '将字节序列解释为数值'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('type', '数值类型', ['uint16', 'int16', 'uint32', 'int32', 'float'], 'uint16'),
      b.selectControl('order', '字节序', ['大端', '小端'], '大端')
    ]
  }

  sandboxApis(): string[] {
    return ['bytesToNumber']
  }
}

export class NumericCalcNode extends NumericBase {
  readonly key = 'numeric-calc'
  readonly name = '计算'
  readonly description = '二元数值运算'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [b.dataIn('left', '左值'), b.dataIn('right', '右值')],
      outputs: [b.dataOut()]
    }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('operator', '运算', ['加', '减', '乘', '除', '取余', '异或', '与', '或'], '加'),
      b.textControl('operand2', '第二操作数')
    ]
  }

  sandboxApis(): string[] {
    return []
  }
}

export class NumericCrcNode extends NumericBase {
  readonly key = 'numeric-crc'
  readonly name = 'CRC校验'
  readonly description = '计算 CRC / 校验和'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('algorithm', '算法', ['CRC8', 'CRC16', 'CRC16-CCITT', 'CRC32', '校验和'], 'CRC16'),
      b.selectControl('outputFormat', '输出格式', ['HEX', '十进制', '二进制'], 'HEX'),
      b.selectControl('append', '追加到数据', ['是', '否'], '否')
    ]
  }

  sandboxApis(): string[] {
    return ['crc8', 'crc16', 'crc16ccitt', 'crc32', 'checksum']
  }
}

export class NumericLengthNode extends NumericBase {
  readonly key = 'numeric-length'
  readonly name = '计算长度'
  readonly description = '计算字符串/数组/字节长度'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('type', '类型', ['字符串长度', '数组元素数', '字节数'], '字符串长度')
    ]
  }

  sandboxApis(): string[] {
    return []
  }
}
