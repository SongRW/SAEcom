import type { ControlSpec, ReteGraphNode, SocketSpec } from '@shared/types'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { emitModbus } from '@/features/script-editor/codegen/emit/modbus'
import { AbstractNodeComponent } from '@/features/script-editor/nodes/component/AbstractNodeComponent'
import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

export class ModbusReadNode extends AbstractNodeComponent {
  readonly key = 'modbus-read'
  readonly category = 'modbus' as const
  readonly name = 'Modbus读取'
  readonly description = '从指定 Modbus 面板读取线圈/离散输入/保持寄存器/输入寄存器'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.modbusPanelControl(),
      b.selectControl('functionCode', '功能码', ['1', '2', '3', '4'], '3'),
      b.numberControl('slaveId', '从站地址', 1),
      b.numberControl('startAddress', '起始地址', 0),
      b.numberControl('quantity', '数量', 1)
    ]
  }

  sandboxApis(): string[] {
    return ['modbusRead']
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitModbus(ctx, node, indent)
  }
}

export class ModbusWriteNode extends AbstractNodeComponent {
  readonly key = 'modbus-write'
  readonly category = 'modbus' as const
  readonly name = 'Modbus写入'
  readonly description = '向指定 Modbus 面板写入线圈/寄存器'

  ports(): { inputs: SocketSpec[]; outputs: SocketSpec[] } {
    return { inputs: [b.dataIn()], outputs: [b.dataOut()] }
  }

  controls(): ControlSpec[] {
    return [
      b.modbusPanelControl(),
      b.selectControl('functionCode', '功能码', ['5', '6', '15', '16'], '6'),
      b.numberControl('slaveId', '从站地址', 1),
      b.numberControl('startAddress', '起始地址', 0),
      b.textControl('values', '值(逗号分隔)')
    ]
  }

  sandboxApis(): string[] {
    return ['modbusWrite']
  }

  emit(ctx: EmitContext, node: ReteGraphNode, indent: string): string {
    return emitModbus(ctx, node, indent)
  }
}
