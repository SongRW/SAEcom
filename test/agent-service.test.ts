/**
 * AgentService 测试（electron/services/agent.service.ts）：
 * - parseDocument：txt/md/csv 文本解析、xlsx 往返、pdf（合法最小 PDF）、
 *   不存在/不支持/超大文件错误路径
 * - writeProtocolKnowledge：CLI 缺失降级；假 CLI 下验证
 *   query(开 trace) → stage → write --create ×2（FEAT 先于 GOLD）→ complete 的编排顺序
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { AgentService } from '../electron/services/agent.service'
import type { ProtocolKnowledgeWriteInput } from '@shared/protocol-knowledge-doc'

function makeService(): { service: AgentService; rootDir: string; userDataDir: string } {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'saecom-agent-'))
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'saecom-agent-ud-'))
  return { service: new AgentService(rootDir, userDataDir), rootDir, userDataDir }
}

function cleanup(rootDir: string, userDataDir?: string) {
  try { rmSync(rootDir, { recursive: true, force: true }) } catch { /* ignore */ }
  if (userDataDir) { try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* ignore */ } }
}

/** 构造带正确 xref 的最小合法 PDF（一页一行文本）。 */
function buildMinimalPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET\n`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out))
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefPos = Buffer.byteLength(out)
  out += 'xref\n0 6\n0000000000 65535 f \n'
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`
  return Buffer.from(out, 'latin1')
}

describe('AgentService.parseDocument', () => {
  it('txt/md 直接按 UTF-8 读取', async () => {
    const { service, rootDir, userDataDir } = makeService()
    try {
      const file = path.join(rootDir, '协议.txt')
      writeFileSync(file, '帧头：AA55\n字段表\n\n\n多行', 'utf8')
      const result = await service.parseDocument(file)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.text).toContain('帧头：AA55')
        expect(result.text).not.toContain('\n\n\n') // 压缩连续空行
      }
    } finally { cleanup(rootDir, userDataDir) }
  })

  it('csv 读取并保留表格行', async () => {
    const { service, rootDir, userDataDir } = makeService()
    try {
      const file = path.join(rootDir, 'fields.csv')
      writeFileSync(file, 'magic,2,hex\ncmd,1,uint\n', 'utf8')
      const result = await service.parseDocument(file)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.text).toContain('magic,2,hex')
    } finally { cleanup(rootDir, userDataDir) }
  })

  it('xlsx 读出单元格文本（写→读往返）', async () => {
    const { service, rootDir, userDataDir } = makeService()
    try {
      // 用 xlsx 自身写一个最小工作簿
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([
        ['字段', '长度', '类型'],
        ['magic', 2, 'hex'],
        ['cmd', 1, 'uint']
      ])
      XLSX.utils.book_append_sheet(wb, ws, '字段表')
      const file = path.join(rootDir, 'proto.xlsx')
      XLSX.writeFile(wb, file)
      const result = await service.parseDocument(file)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.text).toContain('magic')
        expect(result.text).toContain('字段表')
      }
    } finally { cleanup(rootDir, userDataDir) }
  })

  it('pdf 提取文本（最小合法 PDF）', async () => {
    const { service, rootDir, userDataDir } = makeService()
    try {
      const file = path.join(rootDir, 'proto.pdf')
      writeFileSync(file, buildMinimalPdf('Hello Protocol PDF'))
      const result = await service.parseDocument(file)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.text).toContain('Hello Protocol PDF')
    } finally { cleanup(rootDir, userDataDir) }
  })

  it('不存在的文件 / 不支持的扩展名 / 空文本都返回明确错误', async () => {
    const { service, rootDir, userDataDir } = makeService()
    try {
      const missing = await service.parseDocument(path.join(rootDir, 'nope.txt'))
      expect(missing.ok).toBe(false)
      if (!missing.ok) expect(missing.error).toContain('不存在')

      const bad = path.join(rootDir, 'proto.exe')
      writeFileSync(bad, 'data')
      const unsupported = await service.parseDocument(bad)
      expect(unsupported.ok).toBe(false)
      if (!unsupported.ok) expect(unsupported.error).toContain('不支持')

      const empty = path.join(rootDir, 'empty.txt')
      writeFileSync(empty, '   \n\n  ', 'utf8')
      const blank = await service.parseDocument(empty)
      expect(blank.ok).toBe(false)
    } finally { cleanup(rootDir, userDataDir) }
  })
})

describe('AgentService.writeProtocolKnowledge', () => {
  const input: ProtocolKnowledgeWriteInput = {
    name: 'SimpleProtocol',
    title: '简单定长协议',
    fieldTableMarkdown: '| magic | const | AA55 |\n| deviceId | uint | 1 |',
    sampleFrameHex: 'AA5501018DFA',
    expectedValues: { magic: 'AA55', deviceId: 1 },
    roundTripSummary: '往返验证通过（4 字段全部一致）',
    dsl: { name: 'SimpleProtocol', fields: [] },
    createdFrom: 'sess-test',
    createdAt: '2026-08-10'
  }

  it('CLI 不存在时优雅降级（不抛错）', () => {
    const { service } = makeService() // rootDir 无 .agents → CLI 缺失
    const result = service.writeProtocolKnowledge(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('知识库 CLI 不可用')
  })

  it('完整编排：query 开 trace → stage → write FEAT→GOLD → complete（假 CLI 记录调用序）', () => {
    const { service, rootDir, userDataDir } = makeService()
    try {
      // 假 CLI：记录调用序列到日志文件，query 返回固定 traceId
      const cliDir = path.join(rootDir, '.agents/skills/maintaining-repository-knowledge/scripts')
      const stageDir = path.join(rootDir, '.superpowers/knowledge/session-traces')
      const logFile = path.join(rootDir, 'cli-log.jsonl')
      process.env.FAKE_CLI_LOG = logFile
      const fakeCli = `
import { writeFileSync } from 'node:fs'
const a = process.argv.slice(2)
const log = process.env.FAKE_CLI_LOG
const rec = (m) => writeFileSync(log, JSON.stringify(m) + '\\n', { flag: 'a' })
if (a[0] === 'query') {
  rec({ mode: 'query' })
  console.log(JSON.stringify({ selectedSlices: [], diagnostics: { traceId: 'trace-fake-001', queryMilliseconds: 1, candidateCount: 0, lifecycleFilteredCount: 0 } }))
} else if (a[0] === 'write') {
  rec({ mode: 'write', file: a[a.indexOf('--file') + 1], input: a[a.indexOf('--input') + 1], traceId: a[a.indexOf('--trace-id') + 1], create: a.includes('--create') })
  console.log(JSON.stringify({ ok: true }))
} else if (a[0] === 'complete') {
  rec({ mode: 'complete', traceId: a[a.indexOf('--trace-id') + 1] })
  console.log(JSON.stringify({ ok: true }))
}
`
      mkdirSync(cliDir, { recursive: true })
      writeFileSync(path.join(cliDir, 'knowledge-retrieval.mjs'), fakeCli, 'utf8')

      const result = service.writeProtocolKnowledge(input)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.featId).toBe('FEAT-PROTOCOL-SIMPLEPROTOCOL')
      expect(result.goldId).toBe('GOLD-PROTOCOL-SIMPLEPROTOCOL')

      // staged 候选文件存在
      const staged = readdirSync(stageDir)
      expect(staged).toContain('candidate-FEAT-PROTOCOL-SIMPLEPROTOCOL.md')
      expect(staged).toContain('candidate-GOLD-PROTOCOL-SIMPLEPROTOCOL.md')
      // staged 内容含 frontmatter + 示例帧
      const featMd = readFileSync(path.join(stageDir, 'candidate-FEAT-PROTOCOL-SIMPLEPROTOCOL.md'), 'utf8')
      expect(featMd).toContain('id: FEAT-PROTOCOL-SIMPLEPROTOCOL')
      expect(featMd).toContain('last_reviewed:')
      const goldMd = readFileSync(path.join(stageDir, 'candidate-GOLD-PROTOCOL-SIMPLEPROTOCOL.md'), 'utf8')
      expect(goldMd).toContain('AA5501018DFA')

      // 调用序：query → write FEAT → write GOLD → complete，同一 traceId
      const calls = readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
      expect(calls.map((c) => c.mode)).toEqual(['query', 'write', 'write', 'complete'])
      expect(calls[1].file).toContain('FEAT-PROTOCOL-SIMPLEPROTOCOL')
      expect(calls[2].file).toContain('GOLD-PROTOCOL-SIMPLEPROTOCOL')
      expect(calls[1].traceId).toBe('trace-fake-001')
      expect(calls[2].traceId).toBe('trace-fake-001')
      expect(calls[3].traceId).toBe('trace-fake-001')
      expect(calls[1].create).toBe(true)
    } finally { cleanup(rootDir, userDataDir) }
  })

  it('write 失败时关闭已开 trace（不悬挂）', () => {
    const { service, rootDir, userDataDir } = makeService()
    try {
      const cliDir = path.join(rootDir, '.agents/skills/maintaining-repository-knowledge/scripts')
      const logFile = path.join(rootDir, 'cli-log.jsonl')
      process.env.FAKE_CLI_LOG = logFile
      const fakeCli = `
import { writeFileSync } from 'node:fs'
const a = process.argv.slice(2)
const rec = (m) => writeFileSync(process.env.FAKE_CLI_LOG, JSON.stringify(m) + '\\n', { flag: 'a' })
if (a[0] === 'query') {
  rec({ mode: 'query' })
  console.log(JSON.stringify({ selectedSlices: [], diagnostics: { traceId: 'trace-fake-002' } }))
} else if (a[0] === 'write') {
  rec({ mode: 'write', traceId: a[a.indexOf('--trace-id') + 1] })
  process.stderr.write('boom')
  process.exit(1)
} else if (a[0] === 'complete') {
  rec({ mode: 'complete', traceId: a[a.indexOf('--trace-id') + 1] })
  console.log(JSON.stringify({ ok: true }))
}
`
      mkdirSync(cliDir, { recursive: true })
      writeFileSync(path.join(cliDir, 'knowledge-retrieval.mjs'), fakeCli, 'utf8')
      const result = service.writeProtocolKnowledge(input)
      expect(result.ok).toBe(false)
      const calls = readFileSync(logFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
      // write 失败后仍补了一次 complete（trace 不悬挂）
      expect(calls.map((c) => c.mode)).toEqual(['query', 'write', 'complete'])
      expect(calls[2].traceId).toBe('trace-fake-002')
    } finally { cleanup(rootDir, userDataDir) }
  })
})
