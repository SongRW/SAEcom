import type { ControlSpec, ReteGraphNode, SocketSpec } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { emitOutput } from '@/features/script-editor/codegen/emit/output'
import { AbstractNodeComponent } from '@/features/script-editor/nodes/component/AbstractNodeComponent'
import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

abstract class OutputBase extends AbstractNodeComponent {
  readonly category = 'output' as const

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitOutput(ctx, node, indent)
  }
}

export class OutputSerialNode extends OutputBase {
  readonly key = 'output-serial'
  readonly name = '发送串口'
  readonly description = '向串口发送数据：将输入按 data.mode(text/hex) 写入指定串口。输入 in(data)，无输出'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [] }
  }

  controls(): ControlSpec[] {
    return [
      ...b.serialConfigControls(false),
      b.selectControl('mode', '格式', ['text', 'hex'], 'text')
    ]
  }

  sandboxApis(): string[] {
    return ['sendToSerial']
  }
}

/** 发送面板：发到当前/指定面板（TCP/串口通用），与接收面板闭环 */
export class OutputPanelNode extends OutputBase {
  readonly key = 'output-panel'
  readonly name = '发送面板'
  readonly description = '向当前/指定面板发送数据（TCP/串口通用）'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [] }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('panelId', '面板', ['__current__'], '__current__'),
      b.selectControl('mode', '格式', ['text', 'hex'], 'text'),
      b.selectControl('append', '结尾', ['无', 'CRLF', 'CR', 'LF'], '无')
    ]
  }

  sandboxApis(): string[] {
    return ['sendToPanel', 'send']
  }
}

export class OutputTcpNode extends OutputBase {
  readonly key = 'output-tcp'
  readonly name = '发送TCP'
  readonly description = '向 TCP 主机发送数据'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [] }
  }

  controls(): ControlSpec[] {
    return [
      b.textControl('host', '主机', '127.0.0.1'),
      b.numberControl('port', '端口', 8080),
      b.selectControl('mode', '格式', ['text', 'hex'], 'text')
    ]
  }

  sandboxApis(): string[] {
    return ['sendTCP']
  }
}

export class OutputTcpServerNode extends OutputBase {
  readonly key = 'output-tcp-server'
  readonly name = 'TCP服务器发送'
  readonly description = '向已连接的 TCP 客户端广播发送'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [] }
  }

  controls(): ControlSpec[] {
    return [
      b.numberControl('port', '服务器端口', 9000),
      b.selectControl('mode', '格式', ['text', 'hex'], 'text')
    ]
  }

  sandboxApis(): string[] {
    return ['broadcastTcpServer']
  }
}

export class OutputFileNode extends OutputBase {
  readonly key = 'output-file'
  readonly name = '写入文件'
  readonly description = '将数据写入文件：输入内容按 data.mode(追加/覆盖) 写入 data.path。输入 in(data)，无输出'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [] }
  }

  controls(): ControlSpec[] {
    return [
      b.textControl('path', '文件路径'),
      b.selectControl('mode', '写入模式', ['追加', '覆盖'], '追加')
    ]
  }

  sandboxApis(): string[] {
    return ['writeFile']
  }
}

export class OutputLogNode extends OutputBase {
  readonly key = 'output-log'
  readonly name = '日志输出'
  readonly description = '输出日志到脚本控制台'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return {
      inputs: [
        b.dataIn(),
        { key: 'trigger', socket: 'flowSocket', label: '触发' }
      ],
      outputs: []
    }
  }

  controls(): ControlSpec[] {
    return [
      b.selectControl('level', '级别', ['info', 'warn', 'error', 'debug'], 'info'),
      b.textControl('prefix', '前缀')
    ]
  }

  sandboxApis(): string[] {
    return ['console']
  }
}

export class OutputVariableNode extends OutputBase {
  readonly key = 'output-variable'
  readonly name = '变量存储'
  readonly description = '将数据存入全局变量表'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [] }
  }

  controls(): ControlSpec[] {
    return [b.textControl('name', '变量名', 'result')]
  }

  sandboxApis(): string[] {
    return ['globalVars']
  }
}
