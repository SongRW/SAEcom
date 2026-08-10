/**
 * docToDsl 启发式 agent 测试。
 *
 * 锁定：
 * - extractHexConstants / detectWidth / detectEndian / detectCrc 纯函数
 * - parseFieldTable Markdown 表格解析
 * - docToDsl async generator 三条路径（字段表 / 模板 / 启发式）
 * - 歧义检测触发 branch_decision_needed
 * - abort 信号传播
 */
import { describe, it, expect } from 'vitest'
import {
  docToDsl,
  extractHexConstants,
  detectWidth,
  detectEndian,
  detectCrc,
  hasTlvDescription,
  parseFieldTable,
  extractProtocolTitle,
  isAsciiProtocolName,
  suggestAsciiProtocolName,
  buildLlmParseMessages,
  parseLlmDslOutput
} from '@/features/script-editor/protocol-gen/docToDsl'

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = []
  for await (const ev of gen) out.push(ev)
  return out
}

describe('docToDsl — 纯函数', () => {
  it('extractHexConstants 提取 hex 字面量', () => {
    expect(extractHexConstants('帧头 0xAA55')).toContain('AA55')
    expect(extractHexConstants('magic A5 然后 5A')).toEqual(expect.arrayContaining(['A5', '5A']))
    // 过滤单字符和过长
    expect(extractHexConstants('x 是单字符')).toEqual([])
  })

  it('detectWidth 识别 u8/u16/u32', () => {
    expect(detectWidth('u8 字段', 'len')).toBe(1)
    expect(detectWidth('2 字节', 'len')).toBe(2)
    expect(detectWidth('uint32', 'len')).toBe(4)
    expect(detectWidth('未知', 'len')).toBeUndefined()
  })

  it('detectEndian 识别大小端', () => {
    expect(detectEndian('小端 little-endian')).toBe('little')
    expect(detectEndian('大端 big-endian')).toBe('big')
    expect(detectEndian('未指定')).toBeUndefined()
  })

  it('detectCrc 识别 CRC 算法', () => {
    expect(detectCrc('CRC16-Modbus')).toEqual({ algorithm: 'CRC16', endian: 'big' })
    expect(detectCrc('CRC16 小端')).toEqual({ algorithm: 'CRC16', endian: 'little' })
    expect(detectCrc('CRC8')).toEqual({ algorithm: 'CRC8', endian: 'big' })
    expect(detectCrc('无校验')).toBeUndefined()
  })

  it('hasTlvDescription 识别 TLV 关键词', () => {
    expect(hasTlvDescription('采用 TLV 编码')).toBe(true)
    expect(hasTlvDescription('type-length-value 结构')).toBe(true)
    expect(hasTlvDescription('纯定长帧')).toBe(false)
  })

  it('parseFieldTable 解析三列表格', () => {
    const md = `
| 字段 | 长度 | 类型 |
| --- | --- | --- |
| magic | 2 | hex AA55 |
| seq | 1 | u8 |
| crc | 2 | CRC16 |
`
    const fields = parseFieldTable(md)
    expect(fields).not.toBeNull()
    expect(fields!).toHaveLength(3)
    expect(fields![0]).toMatchObject({ kind: 'const', name: 'magic' })
    expect(fields![1]).toMatchObject({ kind: 'uint', name: 'seq', width: 1 })
    expect(fields![2]).toMatchObject({ kind: 'crc', name: 'crc' })
  })

  it('parseFieldTable 无表格返回 null', () => {
    expect(parseFieldTable('纯自然语言描述协议')).toBeNull()
  })
})

describe('docToDsl — 路径 A：字段表', () => {
  it('识别字段表并 emit artifact_ready', async () => {
    const md = `
| 字段 | 长度 | 类型 |
| magic | 2 | hex AA55 |
| seq | 1 | u8 |
`
    const events = await collect(docToDsl(md))
    const types = events.map((e) => e.type)
    expect(types).toContain('tool_call')
    expect(types).toContain('field_detected')
    expect(types).toContain('artifact_ready')
    const artifact = events.find((e) => e.type === 'artifact_ready')!
    expect(artifact.type === 'artifact_ready' && artifact.dsl.fields).toHaveLength(2)
  })
})

describe('docToDsl — 路径 B：模板匹配', () => {
  it('TLV 关键词命中 TLV 模板', async () => {
    const events = await collect(docToDsl('这是一个 TLV 协议，含设备名'))
    const artifact = events.find((e) => e.type === 'artifact_ready')
    expect(artifact).toBeDefined()
    expect(artifact!.type === 'artifact_ready' && artifact!.dsl.name).toBe('TlvProtocol')
  })

  it('多消息关键词命中多消息模板', async () => {
    const events = await collect(docToDsl('REQ 和 ACK 交互流'))
    const artifact = events.find((e) => e.type === 'artifact_ready')
    expect(artifact).toBeDefined()
    expect(artifact!.type === 'artifact_ready' && artifact!.dsl.messages).toBeDefined()
  })
})

describe('docToDsl — 路径 C：启发式 + 歧义分叉', () => {
  it('TLV 描述 + hex 常量触发 branch_decision_needed', async () => {
    // 用「类型-长度-值」措辞触发 hasTlvDescription，但不命中 TEMPLATE_KEYWORDS 里的 'TLV'
    const events = await collect(docToDsl('帧头 AA55，采用类型-长度-值结构，T-data 字段'))
    const branch = events.find((e) => e.type === 'branch_decision_needed')
    expect(branch).toBeDefined()
    expect(branch!.type === 'branch_decision_needed' && branch!.interpretations).toHaveLength(2)
    const labels = branch!.type === 'branch_decision_needed'
      ? branch!.interpretations.map((i) => i.label)
      : []
    expect(labels).toEqual(expect.arrayContaining(['uint 解读', 'tlv 解读']))
  })

  it('无歧义时启发式拼装出 magic + seq + crc', async () => {
    const events = await collect(docToDsl('帧头 AA55，CRC16 校验'))
    const artifact = events.find((e) => e.type === 'artifact_ready')!
    expect(artifact).toBeDefined()
    const fields = artifact.type === 'artifact_ready' ? artifact.dsl.fields! : []
    const kinds = fields.map((f) => f.kind)
    expect(kinds).toEqual(expect.arrayContaining(['const', 'uint', 'crc']))
  })
})

describe('docToDsl — abort 传播', () => {
  it('signal 已 aborted 时立即 yield aborted', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const events = await collect(docToDsl('帧头 AA55', { signal: ctrl.signal }))
    expect(events.map((e) => e.type)).toContain('aborted')
    // 不应有 artifact_ready
    expect(events.some((e) => e.type === 'artifact_ready')).toBe(false)
  })
})

describe('docToDsl — llmCall seam', () => {
  it('llmCall 选项存在但不影响启发式路径', async () => {
    const llmCall = async (_prompt: string) => '模拟 LLM 返回'
    const events = await collect(docToDsl('帧头 AA55', { llmCall }))
    // 启发式路径仍正常产出（llmCall 一期不接线）
    expect(events.some((e) => e.type === 'artifact_ready')).toBe(true)
  })
})

describe('docToDsl — 协议名/标题提取（二期 ASCII 处理）', () => {
  it('extractProtocolTitle 从「协议名：」行提取标题', () => {
    expect(extractProtocolTitle('协议名：设备信息上报')).toBe('设备信息上报')
    expect(extractProtocolTitle('协议名称: SimpleProto')).toBe('SimpleProto')
    expect(extractProtocolTitle('名称：TLV-Test')).toBe('TLV-Test')
    expect(extractProtocolTitle('无标题的普通描述')).toBeNull()
  })

  it('isAsciiProtocolName 判定可作脚本/节点前缀的名称', () => {
    expect(isAsciiProtocolName('SimpleProtocol')).toBe(true)
    expect(isAsciiProtocolName('TLV-DEVICE-INFO')).toBe(true)
    expect(isAsciiProtocolName('设备信息')).toBe(false)
    expect(isAsciiProtocolName('1LeadingDigit')).toBe(false)
    expect(isAsciiProtocolName('Has Space')).toBe(false)
  })

  it('suggestAsciiProtocolName 按结构建议名称（中文名时）', () => {
    const tlv = { name: '设备信息', fields: [{ kind: 'tlv' as const, name: 'data', entries: [] }] }
    expect(suggestAsciiProtocolName(tlv)).toBe('TLV-PROTOCOL')
    const multi = { name: '中文多消息', messages: [{ msgType: 'REQ', fields: [] }, { msgType: 'ACK', fields: [] }] }
    expect(suggestAsciiProtocolName(multi)).toBe('MULTI-MESSAGE-PROTOCOL')
    const simple = { name: '简单协议', fields: [] }
    expect(suggestAsciiProtocolName(simple)).toBe('SIMPLE-PROTOCOL')
    // ASCII 名无需纠正
    expect(suggestAsciiProtocolName({ name: 'SimpleProtocol', fields: [] })).toBeNull()
  })

  it('文档含中文协议名时：中文进 title，name 保持模板名', async () => {
    const events = await collect(docToDsl('协议名：设备信息上报\n帧头 AA55，字段：cmd(2字节hex)、seq(1字节uint)'))
    const artifact = events.find((e) => e.type === 'artifact_ready')
    expect(artifact?.type).toBe('artifact_ready')
    if (artifact?.type !== 'artifact_ready') return
    expect(artifact.dsl.title).toBe('设备信息上报')
    expect(artifact.dsl.name).toBe('HeuristicProtocol')
  })

  it('文档含 ASCII 协议名时：直接作为 name', async () => {
    const events = await collect(docToDsl('协议名称：DeviceReport\n帧头 AA55，字段：cmd(2字节hex)、seq(1字节uint)'))
    const artifact = events.find((e) => e.type === 'artifact_ready')
    if (artifact?.type !== 'artifact_ready') return
    expect(artifact.dsl.name).toBe('DeviceReport')
    expect(artifact.dsl.title).toBeUndefined()
  })
})

describe('docToDsl — LLM 路径（二期真模型）', () => {
  it('buildLlmParseMessages 产出 system + user 两条消息', () => {
    const msgs = buildLlmParseMessages('帧头 AA55')
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[1].role).toBe('user')
    expect(msgs[1].content).toContain('AA55')
  })

  it('parseLlmDslOutput 剥围栏解析 JSON', () => {
    const dsl = parseLlmDslOutput('```json\n{"name":"LLMTlv","fields":[{"kind":"const","name":"magic","value":"AA55","mode":"hex"}]}\n```')
    expect(dsl?.name).toBe('LLMTlv')
    expect(dsl?.fields?.[0]?.kind).toBe('const')
  })

  it('parseLlmDslOutput 容忍前后废话（取首个平衡块）', () => {
    const dsl = parseLlmDslOutput('好的，这是结果：{"name":"X","fields":[{"kind":"uint","name":"a","width":1}]} 完毕')
    expect(dsl?.name).toBe('X')
  })

  it('parseLlmDslOutput 拒绝非法/缺结构输出', () => {
    expect(parseLlmDslOutput('不是 JSON')).toBeNull()
    expect(parseLlmDslOutput('{"name":123}')).toBeNull()
    expect(parseLlmDslOutput('{"name":"X","fields":[]}')).toBeNull() // 无字段无消息
    expect(parseLlmDslOutput('{"name":"X","fields":[{"kind":"uint"}]}')).toBeNull() // 缺 name
    expect(parseLlmDslOutput('')).toBeNull()
  })

  it('注入 llmCall 时模型输出直接成为产物（优先于启发式）', async () => {
    const events = await collect(docToDsl('帧头 AA55 之类描述', {
      llmCall: async () => JSON.stringify({
        name: 'LLMProto',
        fields: [
          { kind: 'const', name: 'magic', value: 'AA55', mode: 'hex' },
          { kind: 'uint', name: 'seq', width: 1 }
        ],
        transport: { mode: 'tcp-loopback', port: 9200 },
        loop: { count: 1 }
      })
    }))
    const artifact = events.find((e) => e.type === 'artifact_ready')
    expect(artifact?.type).toBe('artifact_ready')
    if (artifact?.type !== 'artifact_ready') return
    expect(artifact.dsl.name).toBe('LLMProto')
    expect(artifact.dsl.fields?.length).toBe(2)
    // 观测：tool_call/tool_result 可见
    expect(events.some((e) => e.type === 'tool_call' && e.tool === 'llmParse')).toBe(true)
    expect(events.some((e) => e.type === 'tool_result' && e.tool === 'llmParse')).toBe(true)
  })

  it('模型输出非法时降级启发式（不阻断）', async () => {
    const events = await collect(docToDsl('帧头 AA55 之类描述', {
      llmCall: async () => '抱歉，我无法解析'
    }))
    const artifact = events.find((e) => e.type === 'artifact_ready')
    expect(artifact?.type).toBe('artifact_ready')
    if (artifact?.type !== 'artifact_ready') return
    // 降级走启发式产物（HeuristicProtocol）
    expect(artifact.dsl.name).toBe('HeuristicProtocol')
    expect(events.some((e) => e.type === 'narrative' && e.text.includes('降级'))).toBe(true)
  })

  it('模型调用抛错时降级启发式', async () => {
    const events = await collect(docToDsl('帧头 AA55 之类描述', {
      llmCall: async () => { throw new Error('HTTP 401') }
    }))
    const artifact = events.find((e) => e.type === 'artifact_ready')
    expect(artifact?.type).toBe('artifact_ready')
    if (artifact?.type !== 'artifact_ready') return
    expect(artifact.dsl.name).toBe('HeuristicProtocol')
  })
})
