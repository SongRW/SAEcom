import type { ControlSpec, ReteGraphNode, SocketSpec } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { emitInput } from '@/features/script-editor/codegen/emit/input'
import { AbstractNodeComponent } from '@/features/script-editor/nodes/component/AbstractNodeComponent'
import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

export class InputSerialNode extends AbstractNodeComponent {
  readonly key = 'input-serial'
  readonly category = 'input' as const
  readonly name = '接收串口'
  readonly description = '持续监听指定串口数据帧'
  readonly isContinuousRoot = true

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return b.serialConfigControls(true)
  }

  sandboxApis(): string[] {
    return ['listenSerialPackets', 'checkStop']
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    // 持续监听节点在 generateCodeFromRete 入口处理；此处不应被调用
    return emitInput(ctx, node, indent)
  }
}

/** 接收面板：监听当前/指定面板（TCP/串口通用），支持 TCP 收发闭环 */
export class InputPanelNode extends AbstractNodeComponent {
  readonly key = 'input-panel'
  readonly category = 'input' as const
  readonly name = '接收面板'
  readonly description = '持续监听当前/指定面板数据帧（TCP/串口通用）'
  readonly isContinuousRoot = true

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('panelId', '面板', ['__current__'], '__current__')
    ]
  }

  sandboxApis(): string[] {
    return ['listenCurrentPackets', 'listenPanelPackets', 'checkStop']
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    // 持续监听节点在 generateCodeFromRete 入口处理；此处不应被调用
    return emitInput(ctx, node, indent)
  }
}

export class InputTcpNode extends AbstractNodeComponent {
  readonly key = 'input-tcp'
  readonly category = 'input' as const
  readonly name = '接收TCP'
  readonly description = '持续监听 TCP 客户端连接数据'
  readonly isContinuousRoot = true

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.textControl('host', '主机', '127.0.0.1'),
      b.numberControl('port', '端口', 8080)
    ]
  }

  sandboxApis(): string[] {
    return ['listenTcpPackets', 'checkStop']
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitInput(ctx, node, indent)
  }
}

export class InputTcpServerNode extends AbstractNodeComponent {
  readonly key = 'input-tcp-server'
  readonly category = 'input' as const
  readonly name = 'TCP服务器接收'
  readonly description = '持续监听 TCP 服务器端口数据'
  readonly isContinuousRoot = true

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [b.numberControl('port', '监听端口', 9000)]
  }

  sandboxApis(): string[] {
    return ['listenTcpServerPackets', 'checkStop']
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitInput(ctx, node, indent)
  }
}

export class InputManualNode extends AbstractNodeComponent {
  readonly key = 'input-manual'
  readonly category = 'input' as const
  readonly name = '手动输入'
  readonly description = '使用固定文本/HEX 作为数据源'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.textControl('content', '输入内容', '', true),
      b.selectControl('mode', '格式', ['text', 'hex'], 'text')
    ]
  }

  sandboxApis(): string[] {
    return []
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitInput(ctx, node, indent)
  }
}

export class InputFileNode extends AbstractNodeComponent {
  readonly key = 'input-file'
  readonly category = 'input' as const
  readonly name = '读取文件'
  readonly description = '从文件读取内容'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.textControl('path', '文件路径', '', true),
      b.selectControl('encoding', '编码', ['utf8', 'gbk', 'binary'], 'utf8')
    ]
  }

  sandboxApis(): string[] {
    return ['readFile']
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitInput(ctx, node, indent)
  }
}

export class InputTimerNode extends AbstractNodeComponent {
  readonly key = 'input-timer'
  readonly category = 'input' as const
  readonly name = '定时触发'
  readonly description = '按间隔触发后续流程'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [], outputs: [b.triggerOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.numberControl('interval', '间隔(ms)', 1000),
      b.selectControl('repeat', '重复', ['单次', '循环'], '单次')
    ]
  }

  sandboxApis(): string[] {
    return ['sleep']
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitInput(ctx, node, indent)
  }
}
