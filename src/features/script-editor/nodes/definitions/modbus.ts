import { nodeBuilders as b } from '@/features/script-editor/nodes/definitions/_shared'

export const MODBUS_NODES = {
  'modbus-read': b.def('modbus-read', 'modbus', 'Modbus读取', [], [b.dataOut()], [
    b.modbusPanelControl(),
    b.selectControl('functionCode', '功能码', ['1', '2', '3', '4'], '3'),
    b.numberControl('slaveId', '从站地址', 1),
    b.numberControl('startAddress', '起始地址', 0),
    b.numberControl('quantity', '数量', 1)
  ]),
  'modbus-write': b.def('modbus-write', 'modbus', 'Modbus写入', [b.dataIn()], [b.dataOut()], [
    b.modbusPanelControl(),
    b.selectControl('functionCode', '功能码', ['5', '6', '15', '16'], '6'),
    b.numberControl('slaveId', '从站地址', 1),
    b.numberControl('startAddress', '起始地址', 0),
    b.textControl('values', '值(逗号分隔)')
  ])
}
