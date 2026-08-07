import type { ControlSpec, ReteGraphNode, SocketSpec } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { emitLogical } from '@/features/script-editor/codegen/emit/logical'
import { AbstractNodeComponent } from '@/features/script-editor/nodes/component/AbstractNodeComponent'
import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

abstract class LogicalBase extends AbstractNodeComponent {
  readonly category = 'logical' as const

  controls(): ControlSpec[] {
    return []
  }

  sandboxApis(): string[] {
    return []
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitLogical(ctx, node, indent)
  }
}

export class LogicalAndNode extends LogicalBase {
  readonly key = 'logical-and'
  readonly name = '与'
  readonly description = '布尔与运算：两个 bool 输入全为 true 时输出 true。输入 left/right(boolSocket)，输出 result(boolSocket)'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [b.boolIn('left', '左值'), b.boolIn('right', '右值')],
      outputs: [b.boolOut()]
    }
  }
}

export class LogicalOrNode extends LogicalBase {
  readonly key = 'logical-or'
  readonly name = '或'
  readonly description = '布尔或运算：两个 bool 输入任一为 true 时输出 true。输入 left/right(boolSocket)，输出 result(boolSocket)'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [b.boolIn('left', '左值'), b.boolIn('right', '右值')],
      outputs: [b.boolOut()]
    }
  }
}

export class LogicalNotNode extends LogicalBase {
  readonly key = 'logical-not'
  readonly name = '非'
  readonly description = '布尔非运算：输入 bool 取反。输入 in(boolSocket)，输出 result(boolSocket)'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [b.boolIn()],
      outputs: [b.boolOut()]
    }
  }
}
