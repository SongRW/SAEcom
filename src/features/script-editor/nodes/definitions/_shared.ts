import type { ControlSpec, NodeCategory, NodeDef, SocketSpec } from '@shared/types'
import { NODE_CATEGORIES } from '@/features/script-editor/nodes/categories'

// socket 工厂
const dataIn = (key = 'in', label = '输入'): SocketSpec => ({ key, socket: 'dataSocket', label })
const dataOut = (key = 'out', label = '输出'): SocketSpec => ({ key, socket: 'dataSocket', label })
const boolIn = (key = 'in', label = '布尔'): SocketSpec => ({ key, socket: 'boolSocket', label })
const boolOut = (key = 'result', label = '结果'): SocketSpec => ({ key, socket: 'boolSocket', label })
const flowOut = (key: string, label: string): SocketSpec => ({ key, socket: 'flowSocket', label })
const triggerOut = (key = 'trigger', label = '触发'): SocketSpec => ({ key, socket: 'triggerSocket', label })

// control 工厂
const textControl = (key: string, label: string, defaultValue = '', required = false): ControlSpec => ({
  key,
  type: 'text',
  label,
  default: defaultValue,
  required
})

const numberControl = (key: string, label: string, defaultValue: number): ControlSpec => ({
  key,
  type: 'number',
  label,
  default: defaultValue
})

const selectControl = (key: string, label: string, options: string[], defaultValue = options[0]): ControlSpec => ({
  key,
  type: 'select',
  label,
  options,
  default: defaultValue
})

const serialPortControl = (): ControlSpec => ({
  key: 'portPath',
  type: 'select',
  label: '串口',
  default: '',
  source: 'serial-ports'
})

const serialConfigControls = (includeReceiveOptions = false): ControlSpec[] => [
  serialPortControl(),
  numberControl('baudRate', '波特率', 115200),
  selectControl('dataBits', '数据位', ['8', '7', '6', '5'], '8'),
  selectControl('stopBits', '停止位', ['1', '2'], '1'),
  selectControl('parity', '校验', ['none', 'even', 'odd', 'mark', 'space'], 'none'),
  ...(includeReceiveOptions
    ? [
        numberControl('bufferMs', '接收缓冲(ms)', 50),
        selectControl('append', '结尾', ['CRLF', '无', 'CR', 'LF'], 'CRLF')
      ]
    : [
        selectControl('append', '结尾', ['CRLF', '无', 'CR', 'LF'], 'CRLF')
      ])
]

// 节点构造器
const def = (
  key: string,
  category: NodeCategory,
  name: string,
  inputs: SocketSpec[],
  outputs: SocketSpec[],
  controls: ControlSpec[] = [],
  color = NODE_CATEGORIES[category].color
): NodeDef => ({ key, category, name, inputs, outputs, controls, color })

export const nodeBuilders = {
  dataIn,
  dataOut,
  boolIn,
  boolOut,
  flowOut,
  triggerOut,
  textControl,
  numberControl,
  selectControl,
  serialPortControl,
  serialConfigControls,
  def
}
