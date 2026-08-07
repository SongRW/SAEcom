import type {
  ControlSpec,
  JsonSchema,
  McpDynamicPorts,
  McpPortContract,
  McpPortInfo,
  McpToolDescriptor,
  NodeCategory,
  SocketSpec
} from '@shared/types'

/** 将节点 controls 投影为 MCP inputSchema.properties */
export function controlsToJsonSchemaProperties(controls: ControlSpec[]): Record<string, JsonSchema> {
  const properties: Record<string, JsonSchema> = {}
  for (const control of controls) {
    properties[control.key] = controlToJsonSchema(control)
  }
  return properties
}

export function controlToJsonSchema(control: ControlSpec): JsonSchema {
  const base: JsonSchema = {
    description: control.label
  }

  switch (control.type) {
    case 'number':
      return { ...base, type: 'number' }
    case 'boolean':
      return { ...base, type: 'boolean' }
    case 'select':
      if (control.options && control.options.length > 0) {
        return { ...base, type: 'string', enum: control.options }
      }
      if (control.source) {
        return {
          ...base,
          type: 'string',
          description: `${control.label}（运行时来源: ${control.source}）`
        }
      }
      return { ...base, type: 'string' }
    case 'text':
    default:
      if (control.source) {
        return {
          ...base,
          type: 'string',
          description: `${control.label}（运行时来源: ${control.source}）`
        }
      }
      return { ...base, type: 'string' }
  }
}

/** SocketSpec → McpPortInfo（投影端口 key + socket 类型 + label） */
function socketSpecToPortInfo(spec: SocketSpec): McpPortInfo {
  return { key: spec.key, socket: spec.socket, label: spec.label }
}

/**
 * 动态端口节点的派生规则说明（按节点 key 匹配，AI 据此设置 data 产生端口）。
 * concat 类（protocol-concat/string-concat/script-expr）：data.ports=N → 输入 a..z/in_N
 * bitfield（protocol-bitfield）：data.fields=[{id,name,bits}] → field_${id} 端口
 * keys（transform-object/namefields）：data.keys=[{id,name}] → key_${id} 输入
 */
const DYNAMIC_PORTS_DESC: Record<string, McpDynamicPorts> = {
  'protocol-concat': {
    kind: 'concat',
    description: '设置 data.ports=N（≥2）产生 N 个输入端口，key 为 a..z（前26个）、in_27/in_28...（之后）。连接 targetInput 须匹配这些 key。'
  },
  'string-concat': {
    kind: 'concat',
    description: '设置 data.ports=N（≥2）产生 N 个输入端口，key 为 a..z（前26个）、in_27...（之后）。'
  },
  'script-expr': {
    kind: 'concat',
    description: '表达式中引用的变量名 a/b/c... 对应输入端口。设置 data.ports=N 产生 N 个输入（a..z/in_N），data.expr 引用这些变量。'
  },
  'protocol-bitfield': {
    kind: 'bitfield',
    description: '设置 data.fields=[{id,name,bits}]（总 bits ≤32）+ data.mode。打包模式：每个 field 产生输入端口 field_${id}；解包模式：输入 hex，每个 field 产生输出端口 field_${id}。'
  },
  'transform-object': {
    kind: 'keys',
    description: '设置 data.keys=[{id,name}] 产生输入端口 key_${id}，输出为含这些字段的对象。'
  },
  'transform-namefields': {
    kind: 'keys',
    description: '设置 data.keys=[{id,name}]，将输入数组的各元素映射为命名字段对象。'
  }
}

export function buildMcpToolDescriptor(params: {
  key: string
  name: string
  description?: string
  category: NodeCategory
  controls: ControlSpec[]
  sandboxApis: string[]
  /** 节点端口（静态 inputs/outputs） */
  ports?: { inputs: SocketSpec[]; outputs: SocketSpec[] }
  /** 是否动态端口节点（dynamicPorts 标志） */
  isDynamic?: boolean
}): McpToolDescriptor {
  const required = params.controls.filter((c) => c.required).map((c) => c.key)

  // 端口契约：静态端口投影为 McpPortInfo；动态节点补 dynamic 规则说明
  let portContract: McpPortContract | undefined
  if (params.ports) {
    const dynamic = params.isDynamic ? DYNAMIC_PORTS_DESC[params.key] : undefined
    portContract = {
      inputs: params.ports.inputs.map(socketSpecToPortInfo),
      outputs: params.ports.outputs.map(socketSpecToPortInfo),
      dynamic
    }
  }

  return {
    name: params.key,
    description: params.description || params.name,
    inputSchema: {
      type: 'object',
      properties: controlsToJsonSchemaProperties(params.controls),
      required: required.length > 0 ? required : undefined,
      additionalProperties: false
    },
    ports: portContract,
    annotations: {
      category: params.category,
      sandboxApis: [...params.sandboxApis],
      nodeKey: params.key
    }
  }
}
