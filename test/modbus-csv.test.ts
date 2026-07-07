import { describe, it, expect } from 'vitest'
import { serializeBlocksCsv, parseBlocksCsv } from '../src/features/modbus-panel/csv'
import type { ModbusBlock } from '@shared/types'

const sample: ModbusBlock[] = [
  { id: 'b1', title: '温度区', slaveId: 1, functionCode: 3, startAddress: 0, quantity: 8, pollEnabled: true, pollIntervalMs: 1000, displayFormat: 'float32-swapped' },
  { id: 'b2', slaveId: 2, functionCode: 1, startAddress: 100, quantity: 16, pollEnabled: false, pollIntervalMs: 500, displayFormat: 'unsigned' },
]

describe('serializeBlocksCsv', () => {
  it('生成带 header 的 CSV，id 不导出', () => {
    const csv = serializeBlocksCsv(sample)
    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('title,slaveId,functionCode,startAddress,quantity,pollEnabled,pollIntervalMs,displayFormat')
    expect(lines[1]).toBe('温度区,1,3,0,8,true,1000,float32-swapped')
    expect(lines[2]).toBe(',2,1,100,16,false,500,unsigned')
    expect(csv).not.toContain('b1')
  })
})

describe('parseBlocksCsv', () => {
  it('解析并重新生成 id（追加语义）', () => {
    const csv = serializeBlocksCsv(sample)
    const parsed = parseBlocksCsv(csv)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].title).toBe('温度区')
    expect(parsed[0].id).not.toBe('b1')
    expect(parsed[0].slaveId).toBe(1)
    expect(parsed[0].pollEnabled).toBe(true)
    expect(parsed[1].title).toBeUndefined()
    expect(parsed[1].functionCode).toBe(1)
  })

  it('缺列用默认值（pollEnabled 缺失为 false）', () => {
    const csv = 'slaveId,functionCode,startAddress,quantity,displayFormat\n1,3,0,4,signed'
    const parsed = parseBlocksCsv(csv)
    expect(parsed[0].pollEnabled).toBe(false)
    expect(parsed[0].pollIntervalMs).toBe(1000)
  })

  it('非法行跳过（slaveId 越界、fc 非法）', () => {
    const csv = [
      'title,slaveId,functionCode,startAddress,quantity,pollEnabled,pollIntervalMs,displayFormat',
      'ok,1,3,0,4,true,1000,signed',
      'bad-slave,300,3,0,4,true,1000,signed',
      'bad-fc,1,7,0,4,true,1000,signed',
      'bad-qty,1,3,0,99999,true,1000,signed',
    ].join('\n')
    const parsed = parseBlocksCsv(csv)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].title).toBe('ok')
  })

  it('往返一致（序列化→解析→序列化，忽略 id）', () => {
    const csv1 = serializeBlocksCsv(sample)
    const reparsed = parseBlocksCsv(csv1)
    const csv2 = serializeBlocksCsv(reparsed)
    expect(csv2).toBe(csv1)
  })
})
