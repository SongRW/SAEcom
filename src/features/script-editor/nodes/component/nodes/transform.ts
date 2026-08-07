import type { ControlSpec, ReteGraphNode, SocketSpec } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { emitTransform } from '@/features/script-editor/codegen/emit/transform'
import { AbstractNodeComponent } from '@/features/script-editor/nodes/component/AbstractNodeComponent'
import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

abstract class TransformBase extends AbstractNodeComponent {
  readonly category = 'transform' as const

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitTransform(ctx, node, indent)
  }
}

export class TransformHexNode extends TransformBase {
  readonly key = 'transform-hex'
  readonly name = 'HEX转换'
  readonly description = '文本与 HEX 互转'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('direction', '方向', ['HEX→文本', '文本→HEX'], 'HEX→文本'),
      b.selectControl('separator', '分隔符', ['空格', '无', '自定义'], '空格'),
      b.selectControl('encoding', '编码', ['utf8', 'gbk', 'ascii'], 'utf8')
    ]
  }

  sandboxApis(): string[] {
    return ['hexToText', 'textToHex']
  }
}

export class TransformBase64Node extends TransformBase {
  readonly key = 'transform-base64'
  readonly name = 'Base64编解码'
  readonly description = 'Base64 编码或解码'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [b.selectControl('operation', '操作', ['编码', '解码'], '编码')]
  }

  sandboxApis(): string[] {
    return ['btoa', 'atob']
  }
}

export class TransformEncodingNode extends TransformBase {
  readonly key = 'transform-encoding'
  readonly name = '编码转换'
  readonly description = '字符编码转换：将输入从 data.from 编码转为 data.to 编码的字节容器。输入 in(data)，输出 out(data)'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('from', '源编码', ['utf8', 'gbk', 'ascii', 'iso8859-1'], 'utf8'),
      b.selectControl('to', '目标编码', ['utf8', 'gbk', 'ascii', 'iso8859-1'], 'gbk')
    ]
  }

  sandboxApis(): string[] {
    return ['convertEncoding']
  }
}

export class TransformByteorderNode extends TransformBase {
  readonly key = 'transform-byteorder'
  readonly name = '字节序转换'
  readonly description = '大小端字节序转换'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('type', '类型', ['大端→小端', '小端→大端'], '大端→小端'),
      b.selectControl('size', '数据长度', ['2字节', '4字节'], '2字节')
    ]
  }

  sandboxApis(): string[] {
    return ['swapBytes']
  }
}

export class TransformCaseNode extends TransformBase {
  readonly key = 'transform-case'
  readonly name = '大小写转换'
  readonly description = '字符串大小写转换'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [b.selectControl('case', '转换', ['转大写', '转小写'], '转大写')]
  }

  sandboxApis(): string[] {
    return []
  }
}

export class TransformObjectNode extends TransformBase {
  readonly key = 'transform-object'
  readonly name = '对象'
  readonly description = '动态键列表对象节点'
  readonly dynamicPorts = true

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return []
  }

  sandboxApis(): string[] {
    return []
  }
}

export class TransformNamefieldsNode extends TransformBase {
  readonly key = 'transform-namefields'
  readonly name = '字段命名'
  readonly description = '将数组项映射为带名字段对象'
  readonly dynamicPorts = true

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return []
  }

  sandboxApis(): string[] {
    return []
  }
}
