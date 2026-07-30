import type { ControlSpec, ReteGraphNode, SocketSpec } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { emitProtocol } from '@/features/script-editor/codegen/emit/protocol'
import { AbstractNodeComponent } from '@/features/script-editor/nodes/component/AbstractNodeComponent'
import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

abstract class ProtocolBase extends AbstractNodeComponent {
  readonly category = 'protocol' as const

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitProtocol(ctx, node, indent)
  }
}

/** 常量 → HEX（hex/十进制/二进制/文本编码） */
export class ProtocolConstNode extends ProtocolBase {
  readonly key = 'protocol-const'
  readonly name = '协议常量'
  readonly description = '把常量编码为协议 HEX 字段'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn('content', '内容(可接输入)')], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('mode', '模式', ['hex', 'decimal', 'binary', 'text'], 'hex'),
      b.textControl('content', '内容(无连线时用)', ''),
      b.numberControl('width', '字节宽(十/二进制)', 2),
      b.selectControl('encoding', '文本编码', ['utf8', 'gbk', 'latin1'], 'utf8')
    ]
  }

  sandboxApis(): string[] {
    return ['convertBase', 'convertEncoding', 'textToHex']
  }
}

/** 位域打包/解包（通用模式，用户配置位段表驱动；默认中性：单 8 位字段） */
export class ProtocolBitfieldNode extends ProtocolBase {
  readonly key = 'protocol-bitfield'
  readonly name = '位域'
  readonly description = '按可配置位段表打包为 HEX / 从 HEX 解包多个字段'
  readonly dynamicPorts = true

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    // 静态骨架：mode=打包时的默认形状（空 in + 1 out）。
    // 实际 field_* 端口由 setup.ts 按用户配置的 fields + mode 动态生成。
    return { inputs: [], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    // 位段表 control 由 setup.ts 注入（BitfieldControl）。
    return [
      b.selectControl('mode', '模式', ['打包', '解包'], '打包')
    ]
  }

  sandboxApis(): string[] {
    return ['convertBase']
  }
}

/** 多路 HEX 顺序拼接 */
export class ProtocolConcatNode extends ProtocolBase {
  readonly key = 'protocol-concat'
  readonly name = 'HEX拼接'
  readonly description = '按顺序拼接最多 6 段 HEX'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [
        b.dataIn('a', 'A'),
        b.dataIn('b', 'B'),
        b.dataIn('c', 'C'),
        b.dataIn('d', 'D'),
        b.dataIn('e', 'E'),
        b.dataIn('f', 'F')
      ],
      outputs: [b.dataOut()]
    }
  }

  controls(): ControlSpec[] {
    return []
  }

  sandboxApis(): string[] {
    return []
  }
}

/** 变长字段：长度前缀 + 本体 */
export class ProtocolLenPrefixNode extends ProtocolBase {
  readonly key = 'protocol-len-prefix'
  readonly name = '长度前缀'
  readonly description = '为 HEX 本体添加 u8/u16 长度前缀'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [b.dataIn('body', '本体HEX')],
      outputs: [b.dataOut()]
    }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('width', '长度宽度', ['u8', 'u16'], 'u8')
    ]
  }

  sandboxApis(): string[] {
    return ['convertBase']
  }
}

/** CRC / 校验，可追加 */
export class ProtocolCrcNode extends ProtocolBase {
  readonly key = 'protocol-crc'
  readonly name = '协议CRC'
  readonly description = '计算 CRC 并可追加到数据末尾'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [b.dataIn('body', '数据HEX')],
      outputs: [b.dataOut()]
    }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('algorithm', '算法', ['CRC8', 'CRC16', 'CRC32', '校验和'], 'CRC16'),
      b.selectControl('endian', 'CRC16字节序', ['小端', '大端'], '小端'),
      b.selectControl('append', '追加到数据', ['是', '否'], '是')
    ]
  }

  sandboxApis(): string[] {
    return ['crc8', 'crc16', 'crc32', 'checksum']
  }
}

/** 按字节偏移/长度截取 HEX；start/length 可接上游输入（动态拆帧） */
export class ProtocolSliceNode extends ProtocolBase {
  readonly key = 'protocol-slice'
  readonly name = 'HEX截取'
  readonly description = '按字节偏移/长度截取 HEX（start/length 可接上游）'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [
        b.dataIn('hex', 'HEX'),
        b.dataIn('start', '起始字节'),
        b.dataIn('length', '字节数')
      ],
      outputs: [b.dataOut()]
    }
  }

  controls(): ControlSpec[] {
    return [
      b.numberControl('start', '起始字节', 0),
      b.numberControl('length', '字节数', 2)
    ]
  }

  sandboxApis(): string[] {
    return []
  }
}

/** HEX 无符号整数解析 */
export class ProtocolParseUNode extends ProtocolBase {
  readonly key = 'protocol-parse-u'
  readonly name = 'HEX解析整数'
  readonly description = '把 HEX 字段解析为十进制整数'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [b.dataIn('hex', 'HEX')],
      outputs: [b.dataOut()]
    }
  }

  controls(): ControlSpec[] {
    return [
      b.numberControl('width', '字节宽', 2),
      b.selectControl('endian', '字节序', ['大端', '小端'], '大端')
    ]
  }

  sandboxApis(): string[] {
    return ['convertBase']
  }
}

/** HEX → 文本（utf8/gbk） */
export class ProtocolDecodeTextNode extends ProtocolBase {
  readonly key = 'protocol-decode-text'
  readonly name = 'HEX解码文本'
  readonly description = '把 HEX 字段按编码解码为文本'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [b.dataIn('hex', 'HEX')],
      outputs: [b.dataOut()]
    }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('encoding', '编码', ['utf8', 'gbk', 'latin1'], 'utf8')
    ]
  }

  sandboxApis(): string[] {
    return ['hexToText', 'convertEncoding']
  }
}
