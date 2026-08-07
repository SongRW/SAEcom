import type { ControlSpec, ReteGraphNode, SocketSpec } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { emitTransform } from '@/features/script-editor/codegen/emit/transform'
import { AbstractNodeComponent } from '@/features/script-editor/nodes/component/AbstractNodeComponent'
import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

abstract class SplitBase extends AbstractNodeComponent {
  readonly category = 'split' as const

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  sandboxApis(): string[] {
    return []
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitTransform(ctx, node, indent)
  }
}

export class SplitDelimiterNode extends SplitBase {
  readonly key = 'split-delimiter'
  readonly name = '分隔符拆分'
  readonly description = '按分隔符拆分字符串'

  controls(): ControlSpec[] {
    return [
      b.selectControl('delimiter', '分隔符', ['逗号', '空格', '换行', '制表符', '自定义'], '逗号'),
      b.textControl('custom', '自定义分隔'),
      b.textControl('index', '提取索引', '全部')
    ]
  }
}

export class SplitLengthNode extends SplitBase {
  readonly key = 'split-length'
  readonly name = '按长度拆分'
  readonly description = '按固定长度拆分：将输入字符串按 data.length 切分为数组（或取指定索引元素）。输入 in(data)，输出 out(data)'

  controls(): ControlSpec[] {
    return [b.numberControl('length', '每段长度', 2)]
  }

  sandboxApis(): string[] {
    return ['chunkString']
  }
}

export class SplitRegexNode extends SplitBase {
  readonly key = 'split-regex'
  readonly name = '正则提取'
  readonly description = '按正则表达式提取'

  controls(): ControlSpec[] {
    return [
      b.textControl('pattern', '正则表达式'),
      b.textControl('flags', '标志', 'g')
    ]
  }
}

export class SplitSubstringNode extends SplitBase {
  readonly key = 'split-substring'
  readonly name = '截取子串'
  readonly description = '截取字符串子区间'

  controls(): ControlSpec[] {
    return [
      b.numberControl('start', '起始位置', 0),
      b.textControl('end', '结束位置', '末尾')
    ]
  }
}

export class SplitTrimbytesNode extends SplitBase {
  readonly key = 'split-trimbytes'
  readonly name = '去头尾字节'
  readonly description = '去掉头部/尾部指定字节数'

  controls(): ControlSpec[] {
    return [
      b.numberControl('head', '去掉头部', 0),
      b.numberControl('tail', '去掉尾部', 0)
    ]
  }
}
