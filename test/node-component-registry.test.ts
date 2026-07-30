import { describe, expect, it } from 'vitest'
import {
  NODE_COMPONENTS,
  NODE_DEFINITIONS,
  collectUnknownSandboxApisForKeys,
  getNodeComponent,
  getNodeDefinition,
  getNodeMcpTool,
  listNodeMcpTools
} from '@/features/script-editor/nodes/definitions'
import { generateCodeFromRete } from '@/features/script-editor/codegen'
import type { ReteGraphExport } from '@shared/types'

describe('AbstractNodeComponent registry', () => {
  it('registers unique keys for all components', () => {
    const keys = NODE_COMPONENTS.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.length).toBeGreaterThan(40)
  })

  it('projects NodeDef compatible with legacy consumers', () => {
    const def = getNodeDefinition('modbus-read')
    expect(def).toBeTruthy()
    expect(def!.key).toBe('modbus-read')
    expect(def!.category).toBe('modbus')
    expect(def!.controls.some((c) => c.key === 'panel')).toBe(true)
    expect(NODE_DEFINITIONS['modbus-read']).toEqual(def)
  })

  it('declares sandbox APIs and rejects unknown ones via validateConfig', () => {
    const modbus = getNodeComponent('modbus-read')!
    expect(modbus.sandboxApis()).toContain('modbusRead')
    expect(modbus.validateConfig({})).toEqual([])
    expect(collectUnknownSandboxApisForKeys(['modbus-read', 'output-serial'])).toEqual([])
  })

  it('exports MCP tool descriptors for every node', () => {
    const tools = listNodeMcpTools()
    expect(tools.length).toBe(NODE_COMPONENTS.length)
    const modbusTool = getNodeMcpTool('modbus-read')
    expect(modbusTool).toBeTruthy()
    expect(modbusTool!.name).toBe('modbus-read')
    expect(modbusTool!.inputSchema.type).toBe('object')
    expect(modbusTool!.inputSchema.properties?.functionCode?.enum).toContain('3')
    expect(modbusTool!.annotations?.sandboxApis).toContain('modbusRead')
    expect(modbusTool!.annotations?.category).toBe('modbus')
  })

  it('keeps continuous-root metadata for listen nodes', () => {
    expect(getNodeComponent('input-serial')?.isContinuousRoot).toBe(true)
    expect(getNodeComponent('input-manual')?.isContinuousRoot).toBe(false)
    expect(getNodeComponent('transform-object')?.dynamicPorts).toBe(true)
  })

  it('codegens modbus-read via component emit path', () => {
    const graph: ReteGraphExport = {
      nodes: [
        {
          id: 1,
          key: 'modbus-read',
          data: {
            panel: 'modbus://tcp/127.0.0.1:502',
            functionCode: '3',
            slaveId: 1,
            startAddress: 0,
            quantity: 4
          }
        }
      ],
      connections: []
    }
    const code = generateCodeFromRete(graph)
    expect(code).toContain('modbusRead')
    expect(code).toContain('modbus://tcp/127.0.0.1:502')
  })
})
