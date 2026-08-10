/**
 * 协议知识文档构建测试（shared/protocol-knowledge-doc）。
 *
 * 锁定：
 * - protocolNameToId：ASCII 化（中文剥离）+ 兜底 UNNAMED + 截断
 * - renderProtocolKnowledgeMarkdown / renderProtocolGoldenMarkdown：frontmatter 合法
 * - buildProtocolKnowledgeDocs：FEAT+GOLD 同源生成，GOLD 依赖 FEAT，frontmatter 满足
 *   document-schema（last_reviewed / alternative_evidence 等必填字段齐全）
 */
import { describe, expect, it } from 'vitest'
import {
  buildProtocolKnowledgeDocs,
  protocolNameToId,
  renderProtocolGoldenMarkdown,
  renderProtocolKnowledgeMarkdown,
  type ProtocolGoldenDoc,
  type ProtocolKnowledgeDoc,
  type ProtocolKnowledgeWriteInput
} from '@shared/protocol-knowledge-doc'

const baseInput: ProtocolKnowledgeWriteInput = {
  name: 'SimpleProtocol',
  title: '简单定长协议',
  fieldTableMarkdown: '| magic | 常量 | AA55 |\n| deviceId | uint | 1 |',
  sampleFrameHex: 'AA5501018DFA',
  expectedValues: { magic: 'AA55', deviceId: 1, crc: '8DFA' },
  roundTripSummary: '往返验证通过（4 字段全部一致）',
  dsl: { name: 'SimpleProtocol', fields: [] },
  createdFrom: 'sess-test',
  createdAt: '2026-08-10'
}

describe('协议知识协议名称 → ID（ASCII 强制）', () => {
  it('纯 ASCII 名 → FEAT/GOLD 前缀', () => {
    expect(protocolNameToId('SimpleProtocol', 'FEAT')).toBe('FEAT-PROTOCOL-SIMPLEPROTOCOL')
    expect(protocolNameToId('TLV-Test', 'FEAT')).toBe('FEAT-PROTOCOL-TLV-TEST')
    expect(protocolNameToId('simple-proto', 'GOLD')).toBe('GOLD-PROTOCOL-SIMPLE-PROTO')
  })

  it('中文名剥离非 ASCII（知识 ID 不允许中文）', () => {
    expect(protocolNameToId('复杂协议v3', 'FEAT')).toBe('FEAT-PROTOCOL-V3')
    expect(protocolNameToId('设备信息', 'GOLD')).toBe('GOLD-PROTOCOL-UNNAMED')
  })

  it('空名兜底 UNNAMED', () => {
    expect(protocolNameToId('---', 'FEAT')).toBe('FEAT-PROTOCOL-UNNAMED')
  })

  it('超长名截断', () => {
    const long = 'A'.repeat(100)
    const id = protocolNameToId(long, 'FEAT')
    expect(id.length).toBeLessThan('FEAT-PROTOCOL-'.length + 41)
  })
})

describe('renderProtocolKnowledgeMarkdown', () => {
  it('产出 schema 要求的 frontmatter（含必填 last_reviewed / 基线数组）', () => {
    const doc: ProtocolKnowledgeDoc = {
      id: 'FEAT-PROTOCOL-TEST',
      kind: 'feature',
      title: '测试协议',
      status: 'draft',
      scope: ['script-editor', 'protocol'],
      parent: 'MOD-SCRIPT-EDITOR',
      appliesTo: ['shared/samples/test.js'],
      tags: ['protocol', 'tlv'],
      dependsOn: ['MOD-SCRIPT-EDITOR'],
      relatedTo: [],
      dsl: { name: 'test', fields: [] },
      docMarkdown: '# 测试协议\n\n字段表...',
      roundTripSummary: '往返验证通过（6 字段全部一致）',
      createdFrom: 'sess-test',
      createdAt: '2026-08-10'
    }
    const md = renderProtocolKnowledgeMarkdown(doc)
    // frontmatter 必填字段
    expect(md).toContain('id: FEAT-PROTOCOL-TEST')
    expect(md).toContain('kind: feature')
    expect(md).toContain('status: draft')
    expect(md).toContain('parent: MOD-SCRIPT-EDITOR')
    expect(md).toContain('applies_to:')
    expect(md).toContain('  - shared/samples/test.js')
    expect(md).toContain('depends_on:')
    expect(md).toContain('last_reviewed: 2026-08-10')
    expect(md).toContain('verification_baseline:')
    expect(md).toContain('  type: automated-test')
    expect(md).toContain('status: verified')
    expect(md).toContain('alternative_evidence: []')
    expect(md).toContain('residual_risk: []')
    // body
    expect(md).toContain('# 测试协议')
    expect(md).toContain('往返验证通过')
    expect(md).toContain('"name": "test"')
  })

  it('验证未通过时基线 status 为 planned（draft 允许）', () => {
    const doc: ProtocolKnowledgeDoc = {
      id: 'FEAT-PROTOCOL-TEST',
      kind: 'feature',
      title: '测试协议',
      status: 'draft',
      scope: ['script-editor', 'protocol'],
      parent: 'MOD-SCRIPT-EDITOR',
      appliesTo: ['shared/samples/test.js'],
      tags: ['protocol'],
      dependsOn: ['MOD-SCRIPT-EDITOR'],
      relatedTo: [],
      dsl: { name: 'test', fields: [] },
      docMarkdown: '字段表',
      roundTripSummary: '验证环境不可用，降级为 advisory',
      createdFrom: 'sess-test',
      createdAt: '2026-08-10'
    }
    const md = renderProtocolKnowledgeMarkdown(doc)
    expect(md).toContain('status: planned')
  })
})

describe('renderProtocolGoldenMarkdown', () => {
  it('产出黄金样本 frontmatter + 期望值表格', () => {
    const doc: ProtocolGoldenDoc = {
      id: 'GOLD-PROTOCOL-TEST',
      kind: 'golden-sample',
      title: '测试协议黄金样本',
      status: 'draft',
      scope: ['script-editor', 'protocol'],
      parent: 'FEAT-PROTOCOL-TEST',
      appliesTo: ['shared/samples/test.js'],
      tags: ['protocol', 'golden-sample'],
      dependsOn: ['FEAT-PROTOCOL-TEST'],
      sampleFrameHex: 'AA5501018DFA',
      expectedValues: { magic: 'AA55', cmd: 1, crc16: '8DFA' },
      verificationBaseline: {
        type: 'golden-sample',
        status: 'verified',
        rationale: '示例帧经 splitFrame 拆解，所有字段往返一致'
      },
      createdFrom: 'sess-test',
      createdAt: '2026-08-10'
    }
    const md = renderProtocolGoldenMarkdown(doc)
    expect(md).toContain('id: GOLD-PROTOCOL-TEST')
    expect(md).toContain('kind: golden-sample')
    expect(md).toContain('parent: FEAT-PROTOCOL-TEST')
    expect(md).toContain('  - FEAT-PROTOCOL-TEST')
    expect(md).toContain('AA5501018DFA')
    expect(md).toContain('| magic | AA55 |')
    expect(md).toContain('| cmd | 1 |')
    expect(md).toContain('status: verified')
  })
})

describe('buildProtocolKnowledgeDocs', () => {
  it('FEAT+GOLD 同源生成，ID 与依赖关系正确', () => {
    const { featId, goldId, featMarkdown, goldMarkdown } = buildProtocolKnowledgeDocs(baseInput)
    expect(featId).toBe('FEAT-PROTOCOL-SIMPLEPROTOCOL')
    expect(goldId).toBe('GOLD-PROTOCOL-SIMPLEPROTOCOL')
    // GOLD 依赖 FEAT（先写 FEAT 后写 GOLD 的创建顺序成立）
    expect(goldMarkdown).toContain(`parent: ${featId}`)
    expect(goldMarkdown).toContain(`  - ${featId}`)
    // FEAT 不反向引用 GOLD（related_to 校验要求引用的 ID 已存在）
    expect(featMarkdown).not.toContain(goldId)
    // 中文标题进入 title，ASCII 名进入 id
    expect(featMarkdown).toContain('title: 简单定长协议')
    // 示例帧 + 期望值进入 GOLD
    expect(goldMarkdown).toContain('AA5501018DFA')
    expect(goldMarkdown).toContain('| magic | AA55 |')
  })

  it('rationale 压缩换行（frontmatter 单行 scalar）', () => {
    const input: ProtocolKnowledgeWriteInput = {
      ...baseInput,
      roundTripSummary: '往返验证通过\n（多行摘要）'
    }
    const { featMarkdown } = buildProtocolKnowledgeDocs(input)
    expect(featMarkdown).toContain('rationale: 往返验证通过 （多行摘要）')
  })
})
