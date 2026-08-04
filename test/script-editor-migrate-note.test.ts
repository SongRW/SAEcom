import { describe, expect, it } from 'vitest'
import { migrateNodeData } from '../src/features/script-editor/panelConfig'

/**
 * 备注字段（node.data.note）必须在 migrateNodeData 的所有分支中存活。
 *
 * 这里的 note 不是节点类型参数，而是用户为节点附加的通用说明（搜索/备注功能）。
 * migrateNodeData 在 importGraphState / addGraphNode / 重新落图时都会被调用，
 * 任一分支只挑选已知键而丢掉 note，都会导致用户备注在保存/重开后消失。
 */
describe('migrateNodeData preserves note', () => {
  it('preserves note for transform-object node', () => {
    const data = { note: '提取年份', keys: [{ id: 'k1', name: 'year' }] }
    const result = migrateNodeData('transform-object', data)
    expect(result.note).toBe('提取年份')
  })

  it('preserves note for protocol-bitfield node', () => {
    const data = { note: '协议位域', mode: '打包', fields: [{ id: 'f1', name: 'flag', bits: 1 }] }
    const result = migrateNodeData('protocol-bitfield', data)
    expect(result.note).toBe('协议位域')
  })

  it('preserves note for input-serial node', () => {
    const data = {
      note: '主串口',
      configRef: { kind: 'serial-port', portPath: 'COM1', serialOptions: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' } },
      portPath: 'COM1'
    }
    const result = migrateNodeData('input-serial', data)
    expect(result.note).toBe('主串口')
  })

  it('preserves note for a generic node with no special migration', () => {
    const data = { note: '通用备注', value: '42' }
    const result = migrateNodeData('compare-eq', data)
    expect(result.note).toBe('通用备注')
  })

  it('preserves note through round-trip export/import of the full graph', async () => {
    const { exportGraphState, importGraphState } = await import('../src/features/script-editor/rete/graphState')
    const graph = importGraphState({
      nodes: [
        {
          id: 'src',
          key: 'input-manual',
          position: { x: 0, y: 0 },
          data: { content: 'hi', note: '入口备注' },
          label: '输入'
        },
        {
          id: 'obj',
          key: 'transform-object',
          position: { x: 240, y: 0 },
          data: { keys: [{ id: 'k1', name: 'value' }], note: '对象提取备注' },
          label: '对象'
        },
        {
          id: 'bf',
          key: 'protocol-bitfield',
          position: { x: 480, y: 0 },
          data: { mode: '解包', fields: [{ id: 'f1', name: '状态', bits: 8 }], note: '位域备注' },
          label: '位域'
        }
      ],
      connections: []
    })
    const reimported = importGraphState(exportGraphState(graph))
    const byId = new Map(reimported.nodes.map((n) => [n.id, n]))
    expect(byId.get('src')?.data.note).toBe('入口备注')
    expect(byId.get('obj')?.data.note).toBe('对象提取备注')
    expect(byId.get('bf')?.data.note).toBe('位域备注')
  })
})
