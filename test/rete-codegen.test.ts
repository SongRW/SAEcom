import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { generateCodeFromRete } from '../src/features/script-editor/codegen'
import { NODE_CATEGORIES, NODE_DEFINITIONS } from '../src/features/script-editor/nodes/definitions'
import type { NodeDef, ReteGraphExport } from '../shared/types'

function graph(nodes: ReteGraphExport['nodes'], connections: ReteGraphExport['connections'] = []): ReteGraphExport {
  return { nodes, connections }
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

function between(text: string, start: string, end: string): string {
  const startIndex = text.indexOf(start)
  if (startIndex < 0) return ''
  const endIndex = text.indexOf(end, startIndex + start.length)
  if (endIndex < 0) return text.slice(startIndex)
  return text.slice(startIndex, endIndex)
}

const registryWithOutputPanel: Record<string, NodeDef> = {
  ...NODE_DEFINITIONS,
  'output-panel': {
    key: 'output-panel',
    category: 'output',
    name: '发送面板',
    inputs: [{ key: 'in', socket: 'dataSocket', label: '输入' }],
    outputs: [],
    controls: []
  }
}

describe('Rete script editor codegen', () => {
  it('defines the complete Phase 1 registry', () => {
    expect(Object.keys(NODE_DEFINITIONS)).toHaveLength(50)
    expect(Object.keys(NODE_CATEGORIES)).toEqual([
      'input',
      'transform',
      'split',
      'numeric',
      'string',
      'compare',
      'logical',
      'control',
      'output'
    ])
  })

  it('uses a bool socket for control-if conditions', () => {
    const controlIf = NODE_DEFINITIONS['control-if']

    expect(controlIf.inputs).toEqual([{ key: 'condition', socket: 'boolSocket', label: '条件' }])
    expect(controlIf.outputs.map((output) => output.socket)).toEqual(['flowSocket', 'flowSocket'])
  })

  it('uses direct serial port controls with serial parameters', () => {
    expect(NODE_DEFINITIONS['input-serial'].controls[0]).toMatchObject({
      key: 'portPath',
      type: 'select',
      source: 'serial-ports',
      default: ''
    })
    expect(NODE_DEFINITIONS['input-serial'].controls.map((control) => control.key)).toEqual([
      'portPath',
      'baudRate',
      'dataBits',
      'stopBits',
      'parity',
      'bufferMs',
      'append'
    ])
    expect(NODE_DEFINITIONS['output-serial'].controls[0]).toMatchObject({
      key: 'portPath',
      type: 'select',
      source: 'serial-ports',
      default: ''
    })
    expect(NODE_DEFINITIONS['output-serial'].controls.map((control) => control.key)).toEqual([
      'portPath',
      'baudRate',
      'dataBits',
      'stopBits',
      'parity',
      'append',
      'mode'
    ])
  })

  it('generates continuous direct serial receive listeners for legacy panel-bound serial input roots', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-serial', data: { configRef: { kind: 'panel', panelId: 'panel-a' } } },
      { id: '2', key: 'output-log', data: { prefix: 'RX' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' }
    ]), registryWithOutputPanel)

    expect(code).toContain('listenSerialPackets("panel-a", {"baudRate":115200,"dataBits":8,"stopBits":1,"parity":"none"}, {"bufferMs":50,"append":"CRLF"})(async (_out_1) => {')
    expect(code).toContain('console.log("[RX] " + _out_1)')
    expect(code).not.toContain('listenPanelPackets("panel-a")')
    expect(code).not.toContain('await waitPanelPacket("panel-a"')
  })

  it('uses legacy panelId for input-panel continuous listeners', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-panel', data: { panelId: 'panel-a' } },
      { id: '2', key: 'output-log', data: { prefix: 'RX' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' }
    ]))

    expect(code).toContain('listenPanelPackets("panel-a")(async (_out_1) => {')
    expect(code).toContain('console.log("[RX] " + _out_1)')
    expect(code).not.toContain('listenCurrentPackets()(async (_out_1)')
  })

  it('honors current-panel config refs over stale input-panel legacy panelId', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-panel', data: { configRef: { kind: 'current-panel' }, panelId: 'stale-panel' } },
      { id: '2', key: 'output-log', data: { prefix: 'RX' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' }
    ]))

    expect(code).toContain('listenCurrentPackets()(async (_out_1) => {')
    expect(code).not.toContain('listenPanelPackets("stale-panel")')
  })

  it('generates continuous serial port receive listeners for serial-port config refs', () => {
    const code = generateCodeFromRete(graph([
      {
        id: '1',
        key: 'input-serial',
        data: {
          configRef: {
            kind: 'serial-port',
            portPath: 'COM7',
            serialOptions: { baudRate: 57600, dataBits: 7, stopBits: 2, parity: 'even' }
          }
        }
      },
      { id: '2', key: 'output-log', data: { prefix: 'RX' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' }
    ]))

    expect(code).toContain('listenSerialPackets("COM7", {"baudRate":57600,"dataBits":7,"stopBits":2,"parity":"even"}, {"bufferMs":50,"append":"CRLF"})(async (_out_1) => {')
    expect(code).toContain('console.log("[RX] " + _out_1)')
  })

  it('passes receive buffer and line ending options to serial listeners', () => {
    const code = generateCodeFromRete(graph([
      {
        id: '1',
        key: 'input-serial',
        data: {
          portPath: 'COM9',
          baudRate: 38400,
          dataBits: 7,
          stopBits: 2,
          parity: 'odd',
          bufferMs: 120,
          append: 'LF',
          configRef: {
            kind: 'serial-port',
            portPath: 'COM9',
            serialOptions: { baudRate: 38400, dataBits: 7, stopBits: 2, parity: 'odd' }
          }
        }
      },
      { id: '2', key: 'output-log', data: { prefix: 'RX' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' }
    ]))

    expect(code).toContain('listenSerialPackets("COM9", {"baudRate":38400,"dataBits":7,"stopBits":2,"parity":"odd"}, {"bufferMs":120,"append":"LF"})(async (_out_1) => {')
  })

  it('generates continuous TCP client receive listeners for endpoint config refs', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-tcp', data: { configRef: { kind: 'tcp-endpoint', host: '127.0.0.1', port: 8080 } } },
      { id: '2', key: 'output-log', data: { prefix: 'RX' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' }
    ]))

    expect(code).toContain('listenTcpPackets("127.0.0.1", 8080)(async (_out_1) => {')
    expect(code).toContain('console.log("[RX] " + _out_1)')
  })

  it('generates continuous TCP server receive listeners for server config refs', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-tcp-server', data: { configRef: { kind: 'tcp-server', port: 19000 } } },
      { id: '2', key: 'output-log', data: { prefix: 'RX' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' }
    ]))

    expect(code).toContain('listenTcpServerPackets(19000)(async (_out_1) => {')
    expect(code).toContain('console.log("[RX] " + _out_1)')
  })

  it('registers multiple continuous roots before awaiting them', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-serial', data: { configRef: { kind: 'panel', panelId: 'panel-a' } } },
      { id: '2', key: 'output-log', data: { prefix: 'SER' } },
      { id: '3', key: 'input-tcp', data: { configRef: { kind: 'tcp-endpoint', host: '127.0.0.1', port: 8080 } } },
      { id: '4', key: 'output-log', data: { prefix: 'TCP' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' },
      { source: '3', sourceOutput: 'out', target: '4', targetInput: 'in' }
    ]))

    expect(code).toContain('const _listeners = []')
    expect(occurrences(code, '_listeners.push(')).toBe(2)
    expect(code).toContain('_listeners.push(listenSerialPackets("panel-a", {"baudRate":115200,"dataBits":8,"stopBits":1,"parity":"none"}, {"bufferMs":50,"append":"CRLF"})(async (_out_1) => {')
    expect(code).toContain('_listeners.push(listenTcpPackets("127.0.0.1", 8080)(async (_out_3) => {')
    expect(code).toContain('await Promise.all(_listeners)')
    expect(code).not.toContain('await listenPanelPackets("panel-a")')
    expect(code).not.toContain('await listenTcpPackets("127.0.0.1", 8080)')
  })

  it('runs independent one-shot roots before waiting for continuous listeners', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-serial', data: { configRef: { kind: 'panel', panelId: 'panel-a' } } },
      { id: '2', key: 'output-log', data: { prefix: 'RX' } },
      { id: '3', key: 'input-manual', data: { content: 'manual-payload' } },
      { id: '4', key: 'output-log', data: { prefix: 'MAN' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' },
      { source: '3', sourceOutput: 'out', target: '4', targetInput: 'in' }
    ]))

    const listenerIndex = code.indexOf('_listeners.push(listenSerialPackets("panel-a"')
    const manualVarIndex = code.indexOf('var _out_3 = "manual-payload"')
    const manualLogIndex = code.indexOf('console.log("[MAN] " + _out_3)')
    const awaitListenersIndex = code.indexOf('await Promise.all(_listeners)')

    expect(listenerIndex).toBeGreaterThan(-1)
    expect(manualVarIndex).toBeGreaterThan(listenerIndex)
    expect(manualLogIndex).toBeGreaterThan(manualVarIndex)
    expect(awaitListenersIndex).toBeGreaterThan(manualLogIndex)
  })

  it('does not inline continuous joins that depend on another listener callback', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-serial', data: { configRef: { kind: 'panel', panelId: 'panel-a' } } },
      { id: '2', key: 'input-tcp', data: { configRef: { kind: 'tcp-endpoint', host: '127.0.0.1', port: 8080 } } },
      { id: '3', key: 'string-concat', data: { separator: '|' } },
      { id: '4', key: 'output-log', data: { prefix: 'JOIN' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '3', targetInput: 'left' },
      { source: '2', sourceOutput: 'out', target: '3', targetInput: 'right' },
      { source: '3', sourceOutput: 'out', target: '4', targetInput: 'in' }
    ]))

    const firstCallback = between(code, '_listeners.push(listenSerialPackets("panel-a", {"baudRate":115200,"dataBits":8,"stopBits":1,"parity":"none"}, {"bufferMs":50,"append":"CRLF"})(async (_out_1) => {', '  }));')
    const secondCallback = between(code, '_listeners.push(listenTcpPackets("127.0.0.1", 8080)(async (_out_2) => {', '  }));')

    expect(code).not.toContain('var _out_3 = _out_1 + "|" + _out_2')
    expect(code).not.toContain('console.log("[JOIN] " + _out_3)')
    expect(firstCallback).not.toContain('_out_2')
    expect(secondCallback).not.toContain('_out_1')
  })

  it('does not inline continuous joins that depend on one-shot roots', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-serial', data: { configRef: { kind: 'panel', panelId: 'panel-a' } } },
      { id: '2', key: 'input-manual', data: { content: 'manual' } },
      { id: '3', key: 'string-concat', data: { separator: '|' } },
      { id: '4', key: 'output-log', data: { prefix: 'JOIN' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '3', targetInput: 'left' },
      { source: '2', sourceOutput: 'out', target: '3', targetInput: 'right' },
      { source: '3', sourceOutput: 'out', target: '4', targetInput: 'in' }
    ]))

    const listenerCallback = between(code, '_listeners.push(listenSerialPackets("panel-a", {"baudRate":115200,"dataBits":8,"stopBits":1,"parity":"none"}, {"bufferMs":50,"append":"CRLF"})(async (_out_1) => {', '  }));')

    expect(code).not.toContain('var _out_3 = _out_1 + "|" + _out_2')
    expect(code).not.toContain('console.log("[JOIN] " + _out_3)')
    expect(listenerCallback).not.toContain('_out_2')
    expect(code).toContain('var _out_2 = "manual"')
  })

  it('inlines joins when all fan-out sources come from the same continuous root', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-serial', data: { configRef: { kind: 'panel', panelId: 'panel-a' } } },
      { id: '2', key: 'transform-case', data: { case: '转大写' } },
      { id: '3', key: 'string-replace', data: { search: 'A', replace: 'B', all: '是' } },
      { id: '4', key: 'string-concat', data: { separator: '|' } },
      { id: '5', key: 'output-log', data: { prefix: 'JOIN' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' },
      { source: '1', sourceOutput: 'out', target: '3', targetInput: 'in' },
      { source: '2', sourceOutput: 'out', target: '4', targetInput: 'left' },
      { source: '3', sourceOutput: 'out', target: '4', targetInput: 'right' },
      { source: '4', sourceOutput: 'out', target: '5', targetInput: 'in' }
    ]))

    const listenerCallback = between(code, '_listeners.push(listenSerialPackets("panel-a", {"baudRate":115200,"dataBits":8,"stopBits":1,"parity":"none"}, {"bufferMs":50,"append":"CRLF"})(async (_out_1) => {', '  }));')

    expect(listenerCallback).toContain('var _out_2 = _out_1.toUpperCase()')
    expect(listenerCallback).toContain('var _out_3 = _out_1.replaceAll("A", "B")')
    expect(listenerCallback).toContain('var _out_4 = _out_2 + "|" + _out_3')
    expect(listenerCallback).toContain('console.log("[JOIN] " + _out_4)')
    expect(code).not.toContain('var _out_4 = _out_2 + "|" + _out_3\n  if (await checkStop())')
  })

  it('keeps manual input as one-shot generated code', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-manual', data: { content: 'payload' } },
      { id: '2', key: 'output-log', data: { prefix: 'RX' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' }
    ]), registryWithOutputPanel)

    expect(code).toContain('var _out_1 = "payload"')
    expect(code).toContain('console.log("[RX] " + _out_1)')
    expect(code).not.toContain('listenPanelPackets')
    expect(code).not.toContain('listenSerialPackets')
    expect(code).not.toContain('listenTcpPackets')
    expect(code).not.toContain('listenTcpServerPackets')
  })

  it('keeps continuous receive descendants inside the listener branch', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-serial', data: { configRef: { kind: 'panel', panelId: 'panel-a' } } },
      { id: '2', key: 'transform-case', data: { case: '转大写' } },
      { id: '3', key: 'output-log', data: { prefix: 'RX' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' },
      { source: '2', sourceOutput: 'out', target: '3', targetInput: 'in' }
    ]))

    expect(code).toContain('listenSerialPackets("panel-a", {"baudRate":115200,"dataBits":8,"stopBits":1,"parity":"none"}, {"bufferMs":50,"append":"CRLF"})(async (_out_1) => {\n    if (await checkStop()) return;\n    if (await checkStop()) return;\n    var _out_2 = _out_1.toUpperCase();\n    if (await checkStop()) return;\n    console.log("[RX] " + _out_2);\n  })')
  })

  it('emits a shared control branch target for each branch path', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-serial', data: { configRef: { kind: 'panel', panelId: 'panel-a' } } },
      { id: '2', key: 'compare-in', data: { operand: 'OK' } },
      { id: '3', key: 'control-if' },
      { id: '4', key: 'output-log', data: { prefix: 'JOIN' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'left' },
      { source: '2', sourceOutput: 'result', target: '3', targetInput: 'condition' },
      { source: '3', sourceOutput: 'true', target: '4', targetInput: 'in' },
      { source: '3', sourceOutput: 'false', target: '4', targetInput: 'in' }
    ]))

    expect(code).toContain('if (_out_2) {')
    expect(occurrences(code, 'console.log("[JOIN] " + _out_3);')).toBe(2)
  })

  it('prevents recursive control branch emission cycles', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-serial', data: { configRef: { kind: 'panel', panelId: 'panel-a' } } },
      { id: '2', key: 'compare-in', data: { operand: 'OK' } },
      { id: '3', key: 'control-if' },
      { id: '4', key: 'output-log', data: { prefix: 'DONE' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'left' },
      { source: '2', sourceOutput: 'result', target: '3', targetInput: 'condition' },
      { source: '3', sourceOutput: 'true', target: '3', targetInput: 'condition' },
      { source: '3', sourceOutput: 'false', target: '4', targetInput: 'in' }
    ]))

    expect(occurrences(code, 'if (_out_2) {')).toBe(1)
    expect(code).toContain('console.log("[DONE] " + _out_3);')
  })

  it('generates direct serial output calls from legacy serial panel config refs', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-manual', data: { content: 'payload' } },
      { id: '2', key: 'output-serial', data: { configRef: { kind: 'panel', panelId: 'COM3' }, mode: 'hex', append: 'CRLF' } },
      { id: '3', key: 'output-tcp', data: { configRef: { kind: 'tcp-endpoint', host: '127.0.0.1', port: 502 }, mode: 'text' } },
      { id: '4', key: 'output-file', data: { path: 'C:/tmp/out.log', mode: '覆盖' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' },
      { source: '1', sourceOutput: 'out', target: '3', targetInput: 'in' },
      { source: '1', sourceOutput: 'out', target: '4', targetInput: 'in' }
    ]), registryWithOutputPanel)

    expect(code).toContain('await sendToSerial("COM3", _out_1, "hex", "CRLF", {"baudRate":115200,"dataBits":8,"stopBits":1,"parity":"none"})')
    expect(code).not.toContain('sendToPanel("COM3"')
    expect(code).toContain('await sendTCP("127.0.0.1", 502, _out_1, "text")')
    expect(code).toContain('await writeFile("C:/tmp/out.log", _out_1, "overwrite")')
  })

  it('prefers output config refs over conflicting legacy fields', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-manual', data: { content: 'payload' } },
      {
        id: '2',
        key: 'output-panel',
        data: {
          configRef: { kind: 'panel', panelId: 'COM3' },
          panelId: 'COM9',
          mode: 'text',
          append: '无'
        }
      },
      {
        id: '3',
        key: 'output-tcp',
        data: {
          configRef: { kind: 'tcp-endpoint', host: '10.0.0.8', port: 1502 },
          host: '127.0.0.1',
          port: 502,
          mode: 'hex'
        }
      },
      {
        id: '4',
        key: 'output-file',
        data: {
          configRef: { kind: 'file', path: 'D:/panel-first.log' },
          path: 'C:/legacy.log',
          mode: '追加'
        }
      }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' },
      { source: '1', sourceOutput: 'out', target: '3', targetInput: 'in' },
      { source: '1', sourceOutput: 'out', target: '4', targetInput: 'in' }
    ]), registryWithOutputPanel)

    expect(code).toContain('await sendToPanel("COM3", _out_1, "text", "none")')
    expect(code).not.toContain('COM9')
    expect(code).toContain('await sendTCP("10.0.0.8", 1502, _out_1, "hex")')
    expect(code).not.toContain('127.0.0.1", 502')
    expect(code).toContain('await writeFile("D:/panel-first.log", _out_1, "append")')
    expect(code).not.toContain('C:/legacy.log')
  })

  it('generates output calls for all config ref output targets', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-manual', data: { content: 'payload' } },
      { id: '2', key: 'output-panel', data: { configRef: { kind: 'panel', panelId: 'Panel-A' }, mode: 'text', append: 'LF' } },
      {
        id: '3',
        key: 'output-serial',
        data: {
          configRef: {
            kind: 'serial-port',
            portPath: 'COM7',
            serialOptions: { baudRate: 38400, dataBits: 7, stopBits: 2, parity: 'odd' }
          },
          mode: 'hex',
          append: 'CRLF'
        }
      },
      { id: '4', key: 'output-tcp-server', data: { configRef: { kind: 'tcp-server', port: 19000 }, mode: 'text' } },
      { id: '5', key: 'output-file', data: { configRef: { kind: 'file', path: 'D:/tmp/from-ref.log' }, mode: '覆盖' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' },
      { source: '1', sourceOutput: 'out', target: '3', targetInput: 'in' },
      { source: '1', sourceOutput: 'out', target: '4', targetInput: 'in' },
      { source: '1', sourceOutput: 'out', target: '5', targetInput: 'in' }
    ]), registryWithOutputPanel)

    expect(code).toContain('await sendToPanel("Panel-A", _out_1, "text", "LF")')
    expect(code).toContain('await sendToSerial("COM7", _out_1, "hex", "CRLF", {"baudRate":38400,"dataBits":7,"stopBits":2,"parity":"odd"})')
    expect(code).toContain('await broadcastTcpServer(19000, _out_1, "text")')
    expect(code).toContain('await writeFile("D:/tmp/from-ref.log", _out_1, "overwrite")')
  })

  it('keeps legacy tcp output host and port fallbacks', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-manual', data: { content: 'payload' } },
      { id: '2', key: 'output-tcp', data: { host: '192.168.1.10', port: 7000, mode: 'text' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' }
    ]))

    expect(code).toContain('await sendTCP("192.168.1.10", 7000, _out_1, "text")')
  })

  it('provides a sandbox helper for serial-port output codegen', () => {
    const main = fs.readFileSync(path.resolve(__dirname, '../electron/main.ts'), 'utf-8')

    expect(main).toContain('sendToSerial:')
    expect(main).toContain('function normalizeSerialOpenOptions(options: any = {}): any')
    expect(main).toContain('async function ensureSerialOpen(portPath: string, options: any = {}): Promise<any>')
    expect(main).toContain('await ensureSerialOpen(portPath, options)')
  })

  it('provides sandbox helpers for continuous receive codegen', () => {
    const main = fs.readFileSync(path.resolve(__dirname, '../electron/main.ts'), 'utf-8')

    expect(main).toContain('listenCurrentPackets:')
    expect(main).toContain('listenPanelPackets:')
    expect(main).toContain('listenSerialPackets:')
    expect(main).toContain('await ensureSerialOpen(portPath, options)')
    expect(main).toContain('listenTcpPackets:')
    expect(main).toContain('listenTcpServerPackets:')
    expect(main).toContain('waitTcpServerPacket')
  })

  it('queues TCP server packets and keeps startup errors out of continuous payloads', () => {
    const main = fs.readFileSync(path.resolve(__dirname, '../electron/main.ts'), 'utf-8')

    expect(main).toContain('const tcpServerDataBuffer = new Map<string, string[]>()')
    expect(main).toContain('const TCP_SERVER_DATA_QUEUE_LIMIT = 256')
    expect(main).toContain('function pushTcpServerData(serverId: string, data: string): void')
    expect(main).toContain('function shiftTcpServerData(serverId: string): string | undefined')
    expect(main).toContain('while (queue.length > TCP_SERVER_DATA_QUEUE_LIMIT) queue.shift()')
    expect(main).toContain('tcpServerDataBuffer.delete(id)')
    expect(occurrences(main, 'tcpServerDataBuffer.set(')).toBe(1)
    expect(main).toContain("if (!result.ok) throw new Error('服务器启动失败: ' + result.error)")
    expect(main).toContain("err?.message?.startsWith('服务器启动失败: ')")
  })

  it('uses unique watcher ids for concurrent script listeners on the same target', () => {
    const main = fs.readFileSync(path.resolve(__dirname, '../electron/main.ts'), 'utf-8')

    expect(main).toContain('let listenerIndex = 0')
    expect(main).toContain('const watcherId = `${runId}:${++listenerIndex}`')
    expect(main).toContain('addScriptWatcher(targetId, watcherId, onDataHandler)')
    expect(main).toContain('removeScriptWatcherExact(watcherId)')
    expect(main).toContain('removeScriptWatcher(runId)')
    expect(main).toContain('id.startsWith(`${runIdOrWatcherId}:`)')
  })

  it('cleans up one-shot script waits by exact watcher id only', () => {
    const main = fs.readFileSync(path.resolve(__dirname, '../electron/main.ts'), 'utf-8')
    const waitOnePacketBody = between(main, 'waitOnePacket: (timeout: number = 5000) => new Promise<string>((resolve, reject) => {', '    waitPanelPacket:')
    const waitPanelPacketBody = between(main, 'waitPanelPacket: (panelId: string, timeout: number = 5000) => new Promise<string>((resolve, reject) => {', '    send: async')

    expect(main).toContain('function removeScriptWatcherExact(watcherId: string): void')
    expect(waitOnePacketBody).toContain('const watcherId = `${runId}:wait:${++listenerIndex}`')
    expect(waitOnePacketBody).toContain('addScriptWatcher(ctx.id, watcherId, onDataHandler)')
    expect(waitOnePacketBody).toContain('removeScriptWatcherExact(watcherId)')
    expect(waitOnePacketBody).not.toContain('removeScriptWatcher(runId)')
    expect(waitPanelPacketBody).toContain('const watcherId = `${runId}:wait:${++listenerIndex}`')
    expect(waitPanelPacketBody).toContain('addScriptWatcher(targetId, watcherId, onDataHandler)')
    expect(waitPanelPacketBody).toContain('removeScriptWatcherExact(watcherId)')
    expect(waitPanelPacketBody).not.toContain('removeScriptWatcher(runId)')
  })

  it('fans out TCP server packets to continuous listeners without consuming the queue', () => {
    const main = fs.readFileSync(path.resolve(__dirname, '../electron/main.ts'), 'utf-8')
    const listenerBody = between(main, 'listenTcpServerPackets: (port: number) => async (handler: (value: string) => Promise<void> | void) => {', '\n    },\n\n    broadcastTcpServer:')

    expect(main).toContain('const tcpServerWatchers = new Map<string, Map<string, (value: string) => Promise<void> | void>>()')
    expect(main).toContain('function notifyTcpServerWatchers(serverId: string, data: string): void')
    expect(occurrences(main, 'notifyTcpServerWatchers(serverId, dataText)')).toBe(2)
    expect(main).toContain('tcpServerWatchers.delete(id)')
    expect(listenerBody).toContain('const watcherId = `${runId}:tcpServer:${++listenerIndex}`')
    expect(listenerBody).toContain('addTcpServerWatcher(serverId, watcherId, onDataHandler)')
    expect(listenerBody).toContain('removeTcpServerWatcher(serverId, watcherId)')
    expect(listenerBody).not.toContain('waitTcpServerPacket(')
  })
  it('reuses in-flight TCP server startup for same-port continuous listeners', () => {
    const main = fs.readFileSync(path.resolve(__dirname, '../electron/main.ts'), 'utf-8')
    const ensureBody = between(main, 'const ensureTcpServer = (port: number, serverId = `tcpServer:${port}`): Promise<any> => {', '\n\n  const waitTcpServerPacket')

    expect(main).toContain('const tcpServerStarts = new Map<string, Promise<any>>()')
    expect(ensureBody).toContain('const pending = tcpServerStarts.get(serverId)')
    expect(ensureBody).toContain('if (pending) return pending')
    expect(ensureBody).toContain('tcpServerStarts.set(serverId, startPromise)')
    expect(ensureBody).toContain('tcpServerStarts.delete(serverId)')
  })

  it('generates compare and logical code by node key', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-manual', label: 'renamed input', data: { content: '42' } },
      { id: '2', key: 'compare-gte', label: 'not the Chinese name', data: { operand: '40' } },
      { id: '3', key: 'logical-not', label: 'custom label' },
      { id: '4', key: 'output-log', data: { prefix: 'Bool' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'left' },
      { source: '2', sourceOutput: 'result', target: '3', targetInput: 'in' },
      { source: '3', sourceOutput: 'result', target: '4', targetInput: 'in' }
    ]))

    expect(code).toContain('var _out_2 = _out_1 >= 40')
    expect(code).toContain('var _out_3 = !_out_2')
    expect(code).toContain('console.log("[Bool] " + _out_3)')
  })

  it('uses a connected right operand before a literal compare operand', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-manual', data: { content: 'A' } },
      { id: '2', key: 'input-manual', data: { content: 'B' } },
      { id: '3', key: 'compare-neq', data: { operand: 'ignored' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '3', targetInput: 'left' },
      { source: '2', sourceOutput: 'out', target: '3', targetInput: 'right' }
    ]))

    expect(code).toContain('var _out_3 = _out_1 != _out_2')
    expect(code).not.toContain('ignored')
  })

  it('generates control-wait as a waitOnePacket output', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'control-wait', data: { timeout: 1200 } },
      { id: '2', key: 'output-log', data: { prefix: 'Wait' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' }
    ]))

    expect(code).toContain('var _out_1 = await waitOnePacket(1200)')
    expect(code).toContain('console.log("[Wait] " + _out_1)')
  })

  it('generates control-timeout with normal and timeout branches', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-manual', data: { content: 'payload' } },
      { id: '2', key: 'control-timeout', data: { timeout: 3000 } },
      { id: '3', key: 'output-log', data: { prefix: 'OK' } },
      { id: '4', key: 'output-log', data: { prefix: 'TO' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' },
      { source: '2', sourceOutput: 'normal', target: '3', targetInput: 'in' },
      { source: '2', sourceOutput: 'timeout', target: '4', targetInput: 'in' }
    ]))

    expect(code).toContain('await Promise.race')
    expect(code).toContain('sleep(3000)')
    expect(code).toContain('[OK]')
    expect(code).toContain('[TO]')
  })
})
