import type { ControlSpec, ReteGraphNode, SocketSpec } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { emitTransform } from '@/features/script-editor/codegen/emit/transform'
import { AbstractNodeComponent } from '@/features/script-editor/nodes/component/AbstractNodeComponent'
import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

abstract class StringBase extends AbstractNodeComponent {
  readonly category = 'string' as const

  sandboxApis(): string[] {
    return []
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitTransform(ctx, node, indent)
  }
}

export class StringConcatNode extends StringBase {
  readonly key = 'string-concat'
  readonly name = '字符串拼接'
  readonly description = '拼接两个字符串'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [b.dataIn('left', '左值'), b.dataIn('right', '右值')],
      outputs: [b.dataOut()]
    }
  }

  controls(): ControlSpec[] {
    return [b.textControl('separator', '分隔符')]
  }
}

export class StringReplaceNode extends StringBase {
  readonly key = 'string-replace'
  readonly name = '字符串替换'
  readonly description = '查找并替换字符串'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.textControl('search', '查找'),
      b.textControl('replace', '替换为'),
      b.selectControl('all', '替换全部', ['是', '否'], '是')
    ]
  }
}

export class StringTrimNode extends StringBase {
  readonly key = 'string-trim'
  readonly name = '去除空白'
  readonly description = '去除字符串空白字符'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('position', '位置', ['两端', '左侧', '右侧', '全部'], '两端')
    ]
  }
}

export class StringFindNode extends StringBase {
  readonly key = 'string-find'
  readonly name = '查找匹配'
  readonly description = '在字符串中查找内容'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.textControl('search', '查找内容'),
      b.selectControl('return', '返回', ['是否找到', '位置索引', '匹配次数'], '是否找到')
    ]
  }
}

export class StringTemplateNode extends StringBase {
  readonly key = 'string-template'
  readonly name = '格式化模板'
  readonly description = '按模板格式化多个输入值'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [
        b.dataIn('value1', '值1'),
        b.dataIn('value2', '值2'),
        b.dataIn('value3', '值3')
      ],
      outputs: [b.dataOut()]
    }
  }

  controls(): ControlSpec[] {
    return [
      b.textControl('template', '模板', '设备{1}: 值{2}, 状态{3}')
    ]
  }
}
