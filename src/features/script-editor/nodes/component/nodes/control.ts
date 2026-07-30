import type { ControlSpec, ReteGraphNode, SocketSpec } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { emitControl } from '@/features/script-editor/codegen/emit/control'
import { AbstractNodeComponent } from '@/features/script-editor/nodes/component/AbstractNodeComponent'
import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

abstract class ControlBase extends AbstractNodeComponent {
  readonly category = 'control' as const

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitControl(ctx, node, indent)
  }
}

export class ControlIfNode extends ControlBase {
  readonly key = 'control-if'
  readonly name = '条件判断'
  readonly description = '按布尔条件分支执行'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [{ key: 'condition', socket: 'boolSocket', label: '条件' }],
      outputs: [b.flowOut('true', '真'), b.flowOut('false', '假')]
    }
  }

  controls(): ControlSpec[] {
    return []
  }

  sandboxApis(): string[] {
    return ['checkStop']
  }
}

export class ControlLoopNode extends ControlBase {
  readonly key = 'control-loop'
  readonly name = '循环执行'
  readonly description = '按次数/条件循环执行后续节点'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.numberControl('count', '循环次数', 0),
      b.selectControl('type', '循环类型', ['次数循环', '无限循环', '条件循环', '遍历循环'], '次数循环')
    ]
  }

  sandboxApis(): string[] {
    return ['checkStop', 'sleep']
  }
}

export class ControlDelayNode extends ControlBase {
  readonly key = 'control-delay'
  readonly name = '延时等待'
  readonly description = '延时指定毫秒后继续'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [b.numberControl('ms', '延时(ms)', 1000)]
  }

  sandboxApis(): string[] {
    return ['sleep', 'checkStop']
  }
}

export class ControlWaitNode extends ControlBase {
  readonly key = 'control-wait'
  readonly name = '等待接收'
  readonly description = '等待匹配的一帧数据'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.numberControl('timeout', '超时(ms)', 5000),
      b.textControl('match', '匹配内容')
    ]
  }

  sandboxApis(): string[] {
    return ['waitOnePacket', 'checkStop']
  }
}

export class ControlTimeoutNode extends ControlBase {
  readonly key = 'control-timeout'
  readonly name = '超时控制'
  readonly description = '带超时分支的流程控制'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [b.dataIn()],
      outputs: [b.flowOut('normal', '正常'), b.flowOut('timeout', '超时')]
    }
  }

  controls(): ControlSpec[] {
    return [b.numberControl('timeout', '超时(ms)', 3000)]
  }

  sandboxApis(): string[] {
    return ['checkStop', 'sleep']
  }
}
