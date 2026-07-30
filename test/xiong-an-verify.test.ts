import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { generateCodeFromRete } from '../src/features/script-editor/codegen'
import { parseScriptFile } from '../src/features/script-editor/persistence'
import { NODE_DEFINITIONS } from '../src/features/script-editor/nodes/definitions'
import { NODE_COMPONENT_MAP } from '../src/features/script-editor/nodes/component/registry'
import type { ReteGraphExport } from '../shared/types'

const g1: ReteGraphExport = require('./xiong-an-graphs.json').protocol1
const g2: ReteGraphExport = require('./xiong-an-graphs.json').protocol2
const SAMPLES_DIR = path.join(__dirname, '../shared/samples')

/** Validate all connections port-match against node definitions (mirrors sample-scripts.test.ts). */
function validatePortMatch(graph: ReteGraphExport, label: string) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : Object.values(graph.nodes)
  const conns = Array.isArray(graph.connections) ? graph.connections : Object.values(graph.connections || {})
  const nodeMap = new Map(nodes.map((n) => [String(n.id), n]))
  const bad: string[] = []
  for (const cc of conns) {
    const src = nodeMap.get(String(cc.source))
    const tgt = nodeMap.get(String(cc.target))
    if (!src || !tgt) { bad.push(`dangling: ${JSON.stringify(cc)}`); continue }
    const srcDef = NODE_DEFINITIONS[src.key]
    const tgtDef = NODE_DEFINITIONS[tgt.key]
    const srcDynamic = NODE_COMPONENT_MAP[src.key]?.dynamicPorts
    const tgtDynamic = NODE_COMPONENT_MAP[tgt.key]?.dynamicPorts
    if (srcDef && !srcDynamic && !srcDef.outputs.some((o) => o.key === cc.sourceOutput)) {
      bad.push(`${src.key}(${src.id}).sourceOutput='${cc.sourceOutput}' 不在 outputs [${srcDef.outputs.map((o) => o.key).join(',')}]`)
    }
    if (tgtDef && !tgtDynamic && !tgtDef.inputs.some((i) => i.key === cc.targetInput)) {
      bad.push(`${tgt.key}(${tgt.id}).targetInput='${cc.targetInput}' 不在 inputs [${tgtDef.inputs.map((i) => i.key).join(',')}]`)
    }
  }
  expect(bad, `${label} 连线端口不匹配:\n${bad.join('\n')}`).toEqual([])
}

describe('雄安林草 新示例脚本文件', () => {
  const s1path = path.join(SAMPLES_DIR, '通用位置报送协议-可视化.js')
  const s2path = path.join(SAMPLES_DIR, '安全监测报警终端-可视化.js')

  it('通用位置报送协议脚本可解析且连线端口匹配', () => {
    expect(fs.existsSync(s1path)).toBe(true)
    const parsed = parseScriptFile(fs.readFileSync(s1path, 'utf-8'))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const nodes = Array.isArray(parsed.graph.nodes) ? parsed.graph.nodes : Object.values(parsed.graph.nodes)
    expect(nodes.length).toBeGreaterThan(20)
    // 文件输入 + 换行拆分 + 遍历循环 + 逐帧解析
    expect(nodes.some((n) => n.key === 'input-file')).toBe(true)
    expect(nodes.some((n) => n.key === 'split-delimiter')).toBe(true)
    expect(nodes.some((n) => n.key === 'control-loop')).toBe(true)
    expect(nodes.some((n) => n.key === 'protocol-slice')).toBe(true)
    expect(nodes.some((n) => n.key === 'output-log')).toBe(true)
    expect(nodes.some((n) => n.key === 'protocol-bitfield')).toBe(false)
    expect(nodes.some((n) => n.key === 'transform-object')).toBe(false)
    validatePortMatch(parsed.graph, '通用位置报送')
  })

  it('安全监测报警终端脚本可解析且连线端口匹配', () => {
    expect(fs.existsSync(s2path)).toBe(true)
    const parsed = parseScriptFile(fs.readFileSync(s2path, 'utf-8'))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const nodes = Array.isArray(parsed.graph.nodes) ? parsed.graph.nodes : Object.values(parsed.graph.nodes)
    expect(nodes.length).toBeGreaterThan(20)
    expect(nodes.some((n) => n.key === 'input-file')).toBe(true)
    expect(nodes.some((n) => n.key === 'split-delimiter')).toBe(true)
    expect(nodes.some((n) => n.key === 'control-loop')).toBe(true)
    expect(nodes.some((n) => n.key === 'protocol-slice')).toBe(true)
    expect(nodes.some((n) => n.key === 'output-log')).toBe(true)
    expect(nodes.some((n) => n.key === 'protocol-bitfield')).toBe(false)
    expect(nodes.some((n) => n.key === 'transform-object')).toBe(false)
    validatePortMatch(parsed.graph, '安全监测报警终端')
  })

  it('帧数据 txt 文件存在且每行一帧', () => {
    for (const f of ['位置报送帧.txt', '安全监测帧.txt']) {
      const p = path.join(SAMPLES_DIR, f)
      expect(fs.existsSync(p)).toBe(true)
      const lines = fs.readFileSync(p, 'utf-8').split('\n').map((l) => l.trim()).filter(Boolean)
      expect(lines.length).toBe(10)
      // 每行 42 hex 字符 = 21 字节
      for (const line of lines) {
        expect(line.length).toBe(42)
        expect(/^[0-9A-F]+$/.test(line)).toBe(true)
      }
    }
  })
})

/** Build a sandbox mimicking electron/main.ts scripts:run; readFile returns frames txt. */
function makeSandbox(framesTxt: string) {
  const logs: string[] = []
  const textToHex = (s: string) => { let h = ''; for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(2, '0'); return h.toUpperCase() }
  const hexToText = (h: string) => { let t = ''; const c = h.replace(/\s/g, ''); for (let i = 0; i < c.length; i += 2) t += String.fromCharCode(parseInt(c.substr(i, 2), 16)); return t }
  const convertBase = (value: string, from: string, to: string) => {
    const m: Record<string, number> = { '二进制': 2, '八进制': 8, '十进制': 10, '十六进制': 16 }
    const n = parseInt(String(value), m[from] || 10); if (isNaN(n)) return 'NaN'
    let r = n.toString(m[to] || 10); if (to === '十六进制') r = r.toUpperCase(); if (to === '二进制' && r.length < 8) r = r.padStart(8, '0'); if (to === '十六进制' && r.length < 2) r = r.padStart(2, '0'); return r
  }
  return {
    sandbox: {
      console: { log: (...a: unknown[]) => logs.push(a.map(String).join(' ')) },
      globalVars: {}, _last_recv: '', checkStop: async () => false, sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
      textToHex, hexToText, convertEncoding: (s: string) => s, convertBase,
      readFile: async () => framesTxt, writeFile: async () => ({ ok: true }),
      chunkString: (v: unknown, n = 2) => String(v).match(new RegExp(`.{1,${n}}`, 'g')) || [],
      send: async () => ({ ok: true }), sendToPanel: async () => ({ ok: true }), sendToSerial: async () => ({ ok: true }),
      sendTCP: async () => ({ ok: true }), broadcastTcpServer: async () => ({ ok: true }),
      waitOnePacket: async () => '[test]', waitPanelPacket: async () => '[test]', waitTcpServer: async () => '[test]',
      listenCurrentPackets: () => Promise.resolve(), listenPanelPackets: () => Promise.resolve(),
      listenSerialPackets: () => Promise.resolve(), listenTcpPackets: () => Promise.resolve(), listenTcpServerPackets: async () => {},
      swapBytes: (v: unknown) => v, bytesToNumber: () => 0, crc8: () => '', crc16: () => '', crc16ccitt: () => '', crc32: () => '', checksum: () => '',
      modbusRead: async () => [], modbusWrite: async () => ({ ok: true }),
    },
    logs,
  }
}

async function runCode(code: string, framesTxt: string) {
  const { sandbox, logs } = makeSandbox(framesTxt)
  await new vm.Script(`(async()=>{${code || ''}})()`).runInContext(vm.createContext(sandbox))
  return logs
}

// 帧数据（与 shared/samples/*.txt 一致）
const FRAMES1 = fs.readFileSync(path.join(SAMPLES_DIR, '位置报送帧.txt'), 'utf-8')
const FRAMES2 = fs.readFileSync(path.join(SAMPLES_DIR, '安全监测帧.txt'), 'utf-8')

describe('雄安林草 协议1 (通用位置报送/树木状态采集) 可视化脚本', () => {
  it('读文件→拆行→遍历解析全部10帧', async () => {
    const code = generateCodeFromRete(g1)
    expect(code).toContain('Array.isArray')   // 遍历循环 codegen
    expect(code).toContain('readFile')        // 文件输入
    expect(code).not.toContain('protocol-bitfield')

    const logs = await runCode(code, FRAMES1)
    // 10 帧 × 16 字段 = 160 行
    expect(logs.length).toBe(160)
    expect(logs.join('\n')).not.toContain('[object Object]')

    // 第一帧抽查（031A070802191813D8FF2D337C022F0000643A02A0）
    // 协议编号=3, 年=26, 纬度≈40.0735, 信号强度=-96
    const first16 = logs.slice(0, 16)
    expect(first16.some((l) => l.startsWith('[协议编号] 3'))).toBe(true)
    expect(first16.some((l) => l.startsWith('[年] 26'))).toBe(true)
    expect(first16.some((l) => l.startsWith('[纬度]') && l.includes('40.07'))).toBe(true)
    expect(first16.some((l) => l.startsWith('[信号强度] -96'))).toBe(true)
  })
})

describe('雄安林草 协议2 (安全监测报警终端) 可视化脚本', () => {
  it('读文件→拆行→遍历解析全部10帧', async () => {
    const code = generateCodeFromRete(g2)
    expect(code).toContain('Array.isArray')
    expect(code).toContain('readFile')

    const logs = await runCode(code, FRAMES2)
    expect(logs.length).toBe(160)
    expect(logs.join('\n')).not.toContain('[object Object]')

    // 第一帧（041A070603151013D9002D3379023C0000FFFFFF97）
    // 协议编号=4, 海拔=72, 定位状态=255(0xFF), 信号强度=-105
    const first16 = logs.slice(0, 16)
    expect(first16.some((l) => l.startsWith('[协议编号] 4'))).toBe(true)
    expect(first16.some((l) => l.startsWith('[海拔] 72'))).toBe(true)
    expect(first16.some((l) => l.startsWith('[定位状态] 255'))).toBe(true)
    expect(first16.some((l) => l.startsWith('[信号强度] -105'))).toBe(true)
  })
})
