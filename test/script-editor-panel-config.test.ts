import { describe, expect, it } from 'vitest'
import type { SerialPanelSummary } from '../shared/types'
import {
  BASE_SERIAL_OPTIONS,
  createDefaultNodeData,
  fallbackSerialSummary,
  inheritedSerialSummary,
  migrateNodeData,
  resolvePanelConfigRef,
  serialNodeSummary,
  validateNodeConfig
} from '../src/features/script-editor/panelConfig'

const panels: SerialPanelSummary[] = [
  {
    id: 'COM3',
    name: '主串口',
    type: 'serial',
    open: true,
    active: true,
    options: { baudRate: 9600, dataBits: 7, stopBits: 2, parity: 'even' }
  },
  {
    id: 'tcp://127.0.0.1:502',
    name: 'PLC',
    type: 'tcp',
    open: false,
    active: false
  }
]

describe('script editor panel config', () => {
  it('creates direct serial defaults for serial receive nodes', () => {
    expect(createDefaultNodeData('input-serial', panels)).toEqual({
      portPath: 'COM3',
      baudRate: 9600,
      dataBits: 7,
      stopBits: 2,
      parity: 'even',
      bufferMs: 50,
      append: 'CRLF',
      configRef: {
        kind: 'serial-port',
        portPath: 'COM3',
        serialOptions: { baudRate: 9600, dataBits: 7, stopBits: 2, parity: 'even' }
      }
    })
  })

  it('falls back to base serial options when no serial panel is active', () => {
    expect(createDefaultNodeData('input-serial', [])).toEqual({
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      bufferMs: 50,
      append: 'CRLF',
      configRef: {
        kind: 'serial-port',
        serialOptions: BASE_SERIAL_OPTIONS,
        usesFallbackOptions: true
      }
    })
  })

  it('uses the first serial panel when the active panel is not serial', () => {
    expect(createDefaultNodeData('input-serial', [
      {
        id: 'COM7',
        name: 'Inactive serial',
        type: 'serial',
        open: true,
        active: false,
        options: { baudRate: 38400 }
      },
      {
        id: 'tcp://127.0.0.1:502',
        name: 'PLC',
        type: 'tcp',
        open: true,
        active: true
      }
    ])).toEqual({
      portPath: 'COM7',
      baudRate: 38400,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      bufferMs: 50,
      append: 'CRLF',
      configRef: {
        kind: 'serial-port',
        portPath: 'COM7',
        serialOptions: { baudRate: 38400, dataBits: 8, stopBits: 1, parity: 'none' }
      }
    })
  })

  it('inherits all panel serial options while filling base serial fields', () => {
    expect(createDefaultNodeData('input-serial', [
      {
        id: 'COM5',
        name: 'Flagged serial',
        type: 'serial',
        open: true,
        active: true,
        options: { baudRate: 57600, rtscts: true, xon: true, xoff: false, xany: true }
      }
    ])).toEqual({
      portPath: 'COM5',
      baudRate: 57600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      bufferMs: 50,
      append: 'CRLF',
      configRef: {
        kind: 'serial-port',
        portPath: 'COM5',
        serialOptions: {
          baudRate: 57600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          rtscts: true,
          xon: true,
          xoff: false,
          xany: true
        }
      }
    })
  })

  it('migrates legacy panel and port fields into config refs', () => {
    expect(migrateNodeData('input-panel', { panelId: 'COM3', timeout: 1200 })).toEqual({
      panelId: 'COM3',
      timeout: 1200,
      configRef: { kind: 'panel', panelId: 'COM3' }
    })

    expect(migrateNodeData('input-panel', { panelId: '__current__', timeout: 800 })).toEqual({
      panelId: '__current__',
      timeout: 800,
      configRef: { kind: 'current-panel' }
    })

    expect(migrateNodeData('output-serial', { portPath: 'COM9', mode: 'hex' })).toEqual({
      portPath: 'COM9',
      mode: 'hex',
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      append: 'CRLF',
      configRef: {
        kind: 'serial-port',
        portPath: 'COM9',
        serialOptions: BASE_SERIAL_OPTIONS,
        usesFallbackOptions: true
      }
    })
  })

  it('migrates legacy serial panel bindings into direct serial settings', () => {
    expect(migrateNodeData('input-serial', {
      panelId: 'COM6',
      timeout: 1200,
      configRef: {
        kind: 'panel',
        panelId: 'COM6',
        serialOptions: { baudRate: 38400, dataBits: 7, stopBits: 2, parity: 'odd' }
      }
    })).toEqual({
      panelId: 'COM6',
      portPath: 'COM6',
      timeout: 1200,
      baudRate: 38400,
      dataBits: 7,
      stopBits: 2,
      parity: 'odd',
      bufferMs: 50,
      append: 'CRLF',
      configRef: {
        kind: 'serial-port',
        portPath: 'COM6',
        serialOptions: { baudRate: 38400, dataBits: 7, stopBits: 2, parity: 'odd' }
      }
    })

    expect(migrateNodeData('output-serial', {
      panelId: 'COM8',
      mode: 'hex',
      append: 'LF',
      configRef: {
        kind: 'panel',
        panelId: 'COM8',
        serialOptions: { baudRate: 57600, dataBits: 8, stopBits: 1, parity: 'none' }
      }
    })).toEqual({
      panelId: 'COM8',
      portPath: 'COM8',
      mode: 'hex',
      append: 'LF',
      baudRate: 57600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      configRef: {
        kind: 'serial-port',
        portPath: 'COM8',
        serialOptions: { baudRate: 57600, dataBits: 8, stopBits: 1, parity: 'none' }
      }
    })
  })

  it('preserves valid existing config refs during migration', () => {
    expect(migrateNodeData('input-panel', { configRef: { kind: 'current-panel' } })).toEqual({
      configRef: { kind: 'current-panel' }
    })

    expect(migrateNodeData('input-manual', { configRef: { kind: 'local' } })).toEqual({
      configRef: { kind: 'local' }
    })

    expect(migrateNodeData('output-serial', {
      configRef: {
        kind: 'serial-port',
        portPath: 'COM9',
        serialOptions: BASE_SERIAL_OPTIONS,
        usesFallbackOptions: true
      }
    })).toEqual({
      portPath: 'COM9',
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      append: 'CRLF',
      configRef: {
        kind: 'serial-port',
        portPath: 'COM9',
        serialOptions: BASE_SERIAL_OPTIONS,
        usesFallbackOptions: true
      }
    })

    expect(migrateNodeData('input-file', { configRef: { kind: 'file' } })).toEqual({
      configRef: { kind: 'file' }
    })

    expect(migrateNodeData('input-file', { configRef: { kind: 'file', path: 'data.txt' } })).toEqual({
      configRef: { kind: 'file', path: 'data.txt' }
    })
  })

  it('replaces invalid existing config refs with defaults during migration', () => {
    expect(migrateNodeData('input-panel', { label: 'legacy', configRef: { kind: 'bogus' } })).toEqual({
      label: 'legacy',
      configRef: { kind: 'current-panel' }
    })

    expect(migrateNodeData('input-panel', { label: 'legacy', configRef: { kind: 'panel' } })).toEqual({
      label: 'legacy',
      configRef: { kind: 'current-panel' }
    })

    expect(migrateNodeData('input-tcp', {
      label: 'legacy',
      configRef: { kind: 'tcp-endpoint', host: '127.0.0.1', port: 'bad' }
    })).toEqual({
      label: 'legacy',
      configRef: { kind: 'tcp-endpoint', host: '127.0.0.1', port: 8080 }
    })

    expect(migrateNodeData('output-serial', {
      label: 'legacy',
      configRef: { kind: 'serial-port', serialOptions: 'bad' }
    })).toEqual({
      label: 'legacy',
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      append: 'CRLF',
      configRef: {
        kind: 'serial-port',
        serialOptions: BASE_SERIAL_OPTIONS,
        usesFallbackOptions: true
      }
    })

    expect(migrateNodeData('input-tcp', {
      label: 'legacy',
      configRef: { kind: 'tcp-endpoint', host: '', port: 502 }
    })).toEqual({
      label: 'legacy',
      configRef: { kind: 'tcp-endpoint', host: '127.0.0.1', port: 8080 }
    })

    expect(migrateNodeData('input-tcp-server', {
      label: 'legacy',
      configRef: { kind: 'tcp-server', port: Number.NaN }
    })).toEqual({
      label: 'legacy',
      configRef: { kind: 'tcp-server', port: 9000 }
    })

    expect(migrateNodeData('input-file', {
      label: 'legacy',
      configRef: { kind: 'file', path: 42 }
    })).toEqual({
      label: 'legacy',
      configRef: { kind: 'file' }
    })
  })

  it('resolves current panel refs against runtime panel summaries', () => {
    expect(resolvePanelConfigRef({ kind: 'current-panel' }, panels)).toEqual({
      kind: 'serial-port',
      portPath: 'COM3',
      serialOptions: { baudRate: 9600, dataBits: 7, stopBits: 2, parity: 'even' }
    })
  })

  it('validates typed input and output config requirements', () => {
    expect(validateNodeConfig('input-serial', { configRef: { kind: 'serial-port' } })).toEqual([
      '接收串口：未选择串口'
    ])
    expect(validateNodeConfig('input-serial', {
      configRef: { kind: 'serial-port' },
      portPath: 'COM3'
    })).toEqual([])
    expect(validateNodeConfig('input-tcp', { configRef: { kind: 'tcp-endpoint', host: '', port: 502 } })).toEqual([
      '接收TCP：主机不能为空'
    ])
    expect(validateNodeConfig('input-tcp', {
      configRef: { kind: 'tcp-endpoint', host: '127.0.0.1', port: 8080 },
      host: '',
      port: 8080
    })).toEqual([
      '接收TCP：主机不能为空'
    ])
    expect(validateNodeConfig('output-file', { configRef: { kind: 'file' }, path: '' })).toEqual([
      '写入文件：文件路径不能为空'
    ])
    expect(validateNodeConfig('output-file', {
      configRef: { kind: 'file', path: 'result.log' }
    })).toEqual([])
    expect(validateNodeConfig('output-variable', { configRef: { kind: 'local' }, name: 'result' })).toEqual([])
  })

  it('formats inherited and fallback serial summaries', () => {
    expect(inheritedSerialSummary({ baudRate: 9600, dataBits: 7, stopBits: 2, parity: 'even' })).toEqual([
      ['波特率', '9600'],
      ['数据位', '7'],
      ['停止位', '2'],
      ['校验位', 'even']
    ])
    expect(fallbackSerialSummary()).toEqual([
      ['波特率', '115200'],
      ['数据位', '8'],
      ['停止位', '1'],
      ['校验位', 'none']
    ])
  })

  it('shows only port and baud rate in node summary', () => {
    const serialData = {
      portPath: 'COM3',
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      bufferMs: 80,
      append: 'LF'
    }

    expect(serialNodeSummary('input-serial', serialData)).toEqual([
      ['串口', 'COM3'],
      ['波特率', '9600']
    ])
    expect(serialNodeSummary('output-serial', serialData)).toEqual([
      ['串口', 'COM3'],
      ['波特率', '9600']
    ])
  })
})
