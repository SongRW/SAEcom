import type { ControlSpec, ReteGraphNode, SocketSpec } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { emitCompare } from '@/features/script-editor/codegen/emit/compare'
import { AbstractNodeComponent } from '@/features/script-editor/nodes/component/AbstractNodeComponent'
import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

abstract class CompareBinaryNode extends AbstractNodeComponent {
  readonly category = 'compare' as const

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [b.dataIn('left', '左值'), b.dataIn('right', '右值')],
      outputs: [b.boolOut()]
    }
  }

  controls(): ControlSpec[] {
    return [b.textControl('operand', '比较值')]
  }

  sandboxApis(): string[] {
    return []
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitCompare(ctx, node, indent)
  }
}

export class CompareEqNode extends CompareBinaryNode {
  readonly key = 'compare-eq'
  readonly name = '等于'
  readonly description = '判断两值是否相等'
}

export class CompareNeqNode extends CompareBinaryNode {
  readonly key = 'compare-neq'
  readonly name = '不等于'
  readonly description = '判断两值是否不相等'
}

export class CompareGtNode extends CompareBinaryNode {
  readonly key = 'compare-gt'
  readonly name = '大于'
  readonly description = '判断左值是否大于右值'
}

export class CompareGteNode extends CompareBinaryNode {
  readonly key = 'compare-gte'
  readonly name = '大于等于'
  readonly description = '判断左值是否大于等于右值'
}

export class CompareLtNode extends CompareBinaryNode {
  readonly key = 'compare-lt'
  readonly name = '小于'
  readonly description = '判断左值是否小于右值'
}

export class CompareLteNode extends CompareBinaryNode {
  readonly key = 'compare-lte'
  readonly name = '小于等于'
  readonly description = '判断左值是否小于等于右值'
}

export class CompareInNode extends CompareBinaryNode {
  readonly key = 'compare-in'
  readonly name = '包含'
  readonly description = '判断是否包含指定内容'
}

export class CompareNotInNode extends CompareBinaryNode {
  readonly key = 'compare-not-in'
  readonly name = '不包含'
  readonly description = '判断是否不包含指定内容'
}

export class CompareMatchNode extends AbstractNodeComponent {
  readonly key = 'compare-match'
  readonly category = 'compare' as const
  readonly name = '正则匹配'
  readonly description = '按正则表达式匹配'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [b.dataIn('left', '输入'), b.dataIn('right', '模式')],
      outputs: [b.boolOut()]
    }
  }

  controls(): ControlSpec[] {
    return [
      b.textControl('pattern', '正则'),
      b.textControl('flags', '标志')
    ]
  }

  sandboxApis(): string[] {
    return []
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitCompare(ctx, node, indent)
  }
}

export class CompareBoundaryNode extends AbstractNodeComponent {
  readonly key = 'compare-boundary'
  readonly category = 'compare' as const
  readonly name = '边界匹配'
  readonly description = '判断字符串前缀/后缀'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [b.dataIn('left', '输入'), b.dataIn('right', '边界值')],
      outputs: [b.boolOut()]
    }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('mode', '模式', ['startsWith', 'endsWith'], 'startsWith'),
      b.textControl('operand', '边界值')
    ]
  }

  sandboxApis(): string[] {
    return []
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitCompare(ctx, node, indent)
  }
}
