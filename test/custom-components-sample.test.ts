/**
 * 3 个示例自定义组件（转时间 / 转经纬度 / AES 加密）端到端验证。
 *
 * 验证链路：descriptor JSON → validate → UserNodeComponent → emit 编译 →
 * 产出的代码在模拟 vm 沙箱里执行 → 结果正确。
 *
 * 这条链路正是「完全依赖组件库」的核心：算法逻辑只能经组件 emit 产出，
 * 不在脚本里直接实现。测试用 Node vm 模拟运行时沙箱（注入白名单 API）。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { UserNodeComponent } from '@/features/script-editor/nodes/component/userComponent'
import {
  validateUserDescriptor,
  validateCompositeDescriptor
} from '@/features/script-editor/nodes/component/validate'
import { CompositeNodeComponent } from '@/features/script-editor/nodes/component/compositeComponent'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { normalizeReteGraph } from '@/features/script-editor/codegen/graph'
import {
  aesEncrypt,
  aesDecrypt
} from '../electron/scriptSandbox'

const COMPONENTS_DIR = path.resolve(__dirname, '../shared/samples/components')

function loadDescriptor(file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(COMPONENTS_DIR, file), 'utf-8'))
}

function makeCtx(): EmitContext {
  const graph = normalizeReteGraph({ nodes: [], connections: [] })
  return {
    graph,
    registry: {},
    varMap: new Map(),
    processedNodes: new Set(),
    blockedNodes: new Set(),
    inListenerClosure: false,
    emitNode: () => ''
  }
}

/**
 * 在模拟沙箱里运行 emit 产出的代码。
 * sandbox 注入：输入变量 _last_recv（或指定）、白名单 API（aesEncrypt 等）、Date/Math。
 *
 * 注意：emit 产出 `var _out_x = ...` 声明。真实运行时整个脚本被包进
 * (async()=>{ ... })()，var 在该闭包内。这里为断言方便直接 runInContext
 * （不包额外函数），让 var 成为 sandbox 全局属性，便于断言 _out_x。
 */
function runInSandbox(code: string, input: string): Record<string, unknown> {
  const sandbox: Record<string, unknown> = {
    _last_recv: input,
    aesEncrypt,
    aesDecrypt,
    // Date/Math/JSON/parseInt 等标准内置由 vm context 自动提供
  }
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox)
  return sandbox
}

describe('示例自定义组件：转时间 custom-time-convert', () => {
  const desc = loadDescriptor('custom-time-convert.json')
  const validation = validateUserDescriptor(desc)
  const comp = new UserNodeComponent(validation.descriptor!)

  it('descriptor 校验通过', () => {
    expect(validation.ok, validation.errors.join('; ')).toBe(true)
  })

  it('epoch-to-iso：时间戳 → ISO 字串', () => {
    const ctx = makeCtx()
    const node = { id: 'n1', key: 'custom-time-convert', data: { mode: 'epoch-to-iso', fmt: 'YYYY-MM-DD HH:mm:ss' } }
    const code = comp.emit(ctx, node as any, '  ')
    expect(code).toContain('_out_n1')
    // 1700000000000 → 2023-11-14T22:13:20.000Z
    const out = runInSandbox(code, '1700000000000')
    expect(out._out_n1).toBe('2023-11-14T22:13:20.000Z')
  })

  it('iso-to-epoch：ISO 字串 → 毫秒', () => {
    const ctx = makeCtx()
    const node = { id: 'n2', key: 'custom-time-convert', data: { mode: 'iso-to-epoch' } }
    const code = comp.emit(ctx, node as any, '  ')
    const out = runInSandbox(code, '2023-11-14T22:13:20.000Z')
    expect(out._out_n2).toBe('1700000000000')
  })

  it('epoch-to-fmt：自定义格式', () => {
    const ctx = makeCtx()
    const node = { id: 'n3', key: 'custom-time-convert', data: { mode: 'epoch-to-fmt', fmt: 'YYYY-MM-DD' } }
    const code = comp.emit(ctx, node as any, '  ')
    const out = runInSandbox(code, '1700000000000')
    // 本地时区日期取决于跑测试的机器；只断言格式（10 位 YYYY-MM-DD）
    expect(String(out._out_n3)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('示例自定义组件：转经纬度 custom-geo-convert', () => {
  const desc = loadDescriptor('custom-geo-convert.json')
  const validation = validateUserDescriptor(desc)
  const comp = new UserNodeComponent(validation.descriptor!)

  it('descriptor 校验通过', () => {
    expect(validation.ok, validation.errors.join('; ')).toBe(true)
  })

  it('dec-to-dms：纬度 39.9042 → 度分秒 N', () => {
    const ctx = makeCtx()
    const node = { id: 'g1', key: 'custom-geo-convert', data: { mode: 'dec-to-dms', axis: 'lat' } }
    const code = comp.emit(ctx, node as any, '  ')
    const out = runInSandbox(code, '39.9042')
    // 39.9042° → 39°54'15.12"N（秒含小数，断言前缀即可）
    expect(String(out._out_g1)).toMatch(/^39°54/)
    expect(String(out._out_g1)).toContain('N')
  })

  it('dec-to-dms：经度 -116.4 → 度分秒 W', () => {
    const ctx = makeCtx()
    const node = { id: 'g2', key: 'custom-geo-convert', data: { mode: 'dec-to-dms', axis: 'lon' } }
    const code = comp.emit(ctx, node as any, '  ')
    const out = runInSandbox(code, '-116.4')
    expect(String(out._out_g2)).toMatch(/^116°/)
    expect(String(out._out_g2)).toContain('W')
  })

  it('dms-to-dec：度分秒 → 十进制', () => {
    const ctx = makeCtx()
    const node = { id: 'g3', key: 'custom-geo-convert', data: { mode: 'dms-to-dec', axis: 'lat' } }
    const code = comp.emit(ctx, node as any, '  ')
    // 输入 39.542512 → 39°54'15.12" 的逆向 ≈ 39.904200
    const out = runInSandbox(code, '395415.12')
    const dec = parseFloat(String(out._out_g3))
    expect(dec).toBeCloseTo(39.9042, 3)
  })
})

describe('示例自定义组件：AES 加密 custom-aes-crypto', () => {
  const desc = loadDescriptor('custom-aes-crypto.json')
  const validation = validateUserDescriptor(desc)
  const comp = new UserNodeComponent(validation.descriptor!)

  it('descriptor 校验通过 + sandboxApis 含 aesEncrypt/aesDecrypt', () => {
    expect(validation.ok, validation.errors.join('; ')).toBe(true)
    expect(validation.descriptor!.sandboxApis).toContain('aesEncrypt')
    expect(validation.descriptor!.sandboxApis).toContain('aesDecrypt')
  })

  it('encrypt 模式：产出代码调用 aesEncrypt', () => {
    const ctx = makeCtx()
    const node = { id: 'a1', key: 'custom-aes-crypto', data: { mode: 'encrypt', key: '000102030405060708090A0B0C0D0E0F', iv: '101112131415161718191A1B1C1D1E1F' } }
    const code = comp.emit(ctx, node as any, '  ')
    expect(code).toContain('aesEncrypt(')
    const out = runInSandbox(code, 'CAFE')
    // 加密结果是 16 字节（1 block 明文 + padding → 2 block 密文）
    expect(String(out._out_a1)).toMatch(/^[0-9A-F]{32,}$/)
  })

  it('decrypt 模式：产出代码调用 aesDecrypt', () => {
    const ctx = makeCtx()
    const node = { id: 'a2', key: 'custom-aes-crypto', data: { mode: 'decrypt', key: '000102030405060708090A0B0C0D0E0F', iv: '101112131415161718191A1B1C1D1E1F' } }
    const code = comp.emit(ctx, node as any, '  ')
    expect(code).toContain('aesDecrypt(')
  })

  it('加密→解密往返：经组件 emit 产出的代码闭环一致', () => {
    const key = '000102030405060708090A0B0C0D0E0F'
    const iv = '101112131415161718191A1B1C1D1E1F'
    const plain = 'DEADBEEFCAFEBABE'
    // 用 encrypt 组件加密
    const ctxE = makeCtx()
    const nodeE = { id: 'e', key: 'custom-aes-crypto', data: { mode: 'encrypt', key, iv } }
    const codeE = comp.emit(ctxE, nodeE as any, '  ')
    const encResult = runInSandbox(codeE, plain)
    const cipher = String(encResult._out_e)
    expect(cipher).not.toBe(plain)
    // 用 decrypt 组件解密
    const ctxD = makeCtx()
    const nodeD = { id: 'd', key: 'custom-aes-crypto', data: { mode: 'decrypt', key, iv } }
    const codeD = comp.emit(ctxD, nodeD as any, '  ')
    const decResult = runInSandbox(codeD, cipher)
    expect(decResult._out_d).toBe(plain)
  })
})

describe('示例自定义组件：编码转换链 custom-codec-chain（组合组件）', () => {
  const desc = loadDescriptor('custom-codec-chain.json')
  const validation = validateCompositeDescriptor(desc)

  it('descriptor 校验通过', () => {
    expect(validation.ok, validation.errors.map((e) => `[${e.field}] ${e.message}`).join('; ')).toBe(true)
    expect(validation.descriptor!.key).toBe('custom-codec-chain')
  })

  it('组合组件可构造（CompositeNodeComponent）', () => {
    expect(() => new CompositeNodeComponent(validation.descriptor!)).not.toThrow()
  })

  it('kind 为 composite（列表显示「组合」tag）', () => {
    // readListItem 判定逻辑：有 subgraph → kind='composite'
    expect(desc).toHaveProperty('subgraph')
    expect((desc as Record<string, unknown>).subgraph).toBeDefined()
  })

  it('子图含 2 个节点 + 1 条连线（双段编码转换链）', () => {
    const sub = (desc as { subgraph: { nodes: unknown[]; connections: unknown[] } }).subgraph
    expect(sub.nodes).toHaveLength(2)
    expect(sub.connections).toHaveLength(1)
  })

  it('输入/输出绑定都引用子图内存在的节点', () => {
    const d = desc as {
      subgraph: { nodes: Array<{ id: string }> }
      inputBindings: Array<{ nodeId: string; portKey: string }>
      outputBindings: Array<{ nodeId: string; portKey: string }>
    }
    const nodeIds = new Set(d.subgraph.nodes.map((n) => n.id))
    for (const b of d.inputBindings) expect(nodeIds.has(b.nodeId)).toBe(true)
    for (const b of d.outputBindings) expect(nodeIds.has(b.nodeId)).toBe(true)
  })
})
