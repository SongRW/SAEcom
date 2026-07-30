import type { ControlSpec, JsonSchema, McpToolDescriptor, NodeCategory } from '@shared/types'

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

export function buildMcpToolDescriptor(params: {
  key: string
  name: string
  description?: string
  category: NodeCategory
  controls: ControlSpec[]
  sandboxApis: string[]
}): McpToolDescriptor {
  const required = params.controls.filter((c) => c.required).map((c) => c.key)
  return {
    name: params.key,
    description: params.description || params.name,
    inputSchema: {
      type: 'object',
      properties: controlsToJsonSchemaProperties(params.controls),
      required: required.length > 0 ? required : undefined,
      additionalProperties: false
    },
    annotations: {
      category: params.category,
      sandboxApis: [...params.sandboxApis],
      nodeKey: params.key
    }
  }
}
