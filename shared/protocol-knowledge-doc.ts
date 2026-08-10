/**
 * 协议知识文档构建 —— main/renderer 共用的纯函数。
 *
 * 产出遵循 .agents/skills/maintaining-repository-knowledge/references/document-schema.md：
 * - FEAT-PROTOCOL-*：协议结构（字段表 + 往返验证摘要 + DSL 源）
 * - GOLD-PROTOCOL-*：黄金样本（示例帧 hex + 期望解析值 + 验证基线）
 *
 * 本模块零 Node/Electron 依赖，纯字符串拼装，可在 renderer 预览、main 落盘共用。
 */

/** 协议知识文档（FEAT-PROTOCOL-*）的 frontmatter + body。 */
export interface ProtocolKnowledgeDoc {
  id: string                   // FEAT-PROTOCOL-<NAME>
  kind: 'feature'
  title: string                // 协议名
  status: 'draft' | 'proposed' | 'active'
  scope: string[]              // ['script-editor', 'protocol']
  parent: string               // MOD-SCRIPT-EDITOR
  appliesTo: string[]          // graph JSON 路径、test 路径
  tags: string[]               // ['protocol', 'tlv', ...]
  dependsOn: string[]          // 依赖的其他知识 ID
  relatedTo: string[]          // 关联知识
  /** 协议 DSL（机器可读源） */
  dsl: unknown
  /** 协议文档 Markdown（人类可读，generateProtocolDoc 产出） */
  docMarkdown: string
  /** 往返验证结果摘要 */
  roundTripSummary: string
  /** 创建来源（session id） */
  createdFrom: string
  createdAt: string
}

/** 黄金样本文档（GOLD-PROTOCOL-*）的 frontmatter + body。 */
export interface ProtocolGoldenDoc {
  id: string                   // GOLD-PROTOCOL-<NAME>
  kind: 'golden-sample'
  title: string
  status: 'draft' | 'active'
  scope: string[]
  parent: string               // FEAT-PROTOCOL-<NAME>
  appliesTo: string[]
  tags: string[]
  dependsOn: string[]          // [FEAT-PROTOCOL-<NAME>]
  /** 示例帧 hex */
  sampleFrameHex: string
  /** 每字段期望解析值 */
  expectedValues: Record<string, string | number>
  /** 往返验证基线状态 */
  verificationBaseline: {
    type: 'golden-sample'
    status: 'verified' | 'unavailable'
    rationale: string
  }
  createdFrom: string
  createdAt: string
}

/** 写知识库的入参（向导 ready 后由编排层收集，FEAT/GOLD 两篇同源生成）。 */
export interface ProtocolKnowledgeWriteInput {
  /** 协议名（ASCII，已由向导强制） */
  name: string
  /** 中文/自然语言标题（可空，仅作展示 title） */
  title?: string
  /** 字段表 markdown（人类可读 body） */
  fieldTableMarkdown: string
  /** 示例帧 hex（往返验证 sentFrames[0]） */
  sampleFrameHex: string
  /** 每字段期望解析值（往返验证 fieldChecks） */
  expectedValues: Record<string, string | number>
  /** 往返验证摘要（如「往返验证通过（6 字段全部一致）」） */
  roundTripSummary: string
  /** 协议 DSL 源 */
  dsl: unknown
  /** 创建来源 session id */
  createdFrom: string
  createdAt: string
}

/**
 * 从协议名生成知识 ID（大写、连字符、PROTOCOL 前缀）。
 * 非 ASCII（中文等）一律剥离：知识 ID 必须满足 /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/。
 * "TLV-设备信息" → "FEAT-PROTOCOL-TLV"；全中文 → 兜底 UNNAMED。
 */
export function protocolNameToId(name: string, prefix: 'FEAT' | 'GOLD'): string {
  const slug = name
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
    .slice(0, 40)
  return `${prefix}-PROTOCOL-${slug || 'UNNAMED'}`
}

/**
 * 把 ProtocolKnowledgeDoc 渲染成知识文档 Markdown（frontmatter + body）。
 * 供 write 命令写入 docs/knowledge/。
 */
export function renderProtocolKnowledgeMarkdown(doc: ProtocolKnowledgeDoc): string {
  return `---
id: ${doc.id}
kind: ${doc.kind}
title: ${doc.title}
status: ${doc.status}
scope:
${doc.scope.map((s) => `  - ${s}`).join('\n')}
parent: ${doc.parent}
applies_to:
${doc.appliesTo.map((a) => `  - ${a}`).join('\n')}
tags:
${doc.tags.map((t) => `  - ${t}`).join('\n')}
depends_on:
${doc.dependsOn.map((d) => `  - ${d}`).join('\n')}
related_to: ${doc.relatedTo.length > 0 ? `\n${doc.relatedTo.map((r) => `  - ${r}`).join('\n')}` : '[]'}
supersedes: []
superseded_by: []
created_from: ${doc.createdFrom}
created_at: ${doc.createdAt}
last_reviewed: ${doc.createdAt}
verification_baseline:
  type: automated-test
  status: ${doc.roundTripSummary.includes('通过') ? 'verified' : 'planned'}
  rationale: ${doc.roundTripSummary}
  alternative_evidence: []
  residual_risk: []
  revisit_when: []
---

# ${doc.title}

${doc.docMarkdown}

## 往返验证

${doc.roundTripSummary}

## DSL（机器可读源）

\`\`\`json
${JSON.stringify(doc.dsl, null, 2)}
\`\`\`
`
}

/**
 * 把 ProtocolGoldenDoc 渲染成黄金样本 Markdown。
 */
export function renderProtocolGoldenMarkdown(doc: ProtocolGoldenDoc): string {
  return `---
id: ${doc.id}
kind: ${doc.kind}
title: ${doc.title}
status: ${doc.status}
scope:
${doc.scope.map((s) => `  - ${s}`).join('\n')}
parent: ${doc.parent}
applies_to:
${doc.appliesTo.map((a) => `  - ${a}`).join('\n')}
tags:
${doc.tags.map((t) => `  - ${t}`).join('\n')}
depends_on:
${doc.dependsOn.map((d) => `  - ${d}`).join('\n')}
related_to: []
supersedes: []
superseded_by: []
created_from: ${doc.createdFrom}
created_at: ${doc.createdAt}
last_reviewed: ${doc.createdAt}
verification_baseline:
  type: golden-sample
  status: ${doc.verificationBaseline.status}
  rationale: ${doc.verificationBaseline.rationale}
  alternative_evidence: []
  residual_risk: []
  revisit_when: []
---

# ${doc.title}

## 示例帧

\`\`\`
${doc.sampleFrameHex}
\`\`\`

## 期望解析值

| 字段 | 期望值 |
|---|---|
${Object.entries(doc.expectedValues).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}
`
}

/**
 * 一次生成 FEAT + GOLD 两篇文档的 markdown（向导写入知识库时调用）。
 * 返回 { featId, goldId, featMarkdown, goldMarkdown }，由主进程 stage + write。
 *
 * 生命周期约束（document-schema.md）：
 * - 先写 FEAT 再写 GOLD：GOLD 的 parent/depends_on 指向 FEAT，写入时 FEAT 必须已存在；
 *   FEAT 的 related_to 不反向引用 GOLD（校验要求 related_to 引用的 ID 已存在）。
 * - FEAT 用 automated-test 基线（往返验证即自动化闸门），draft 阶段允许 planned。
 */
export function buildProtocolKnowledgeDocs(input: ProtocolKnowledgeWriteInput): {
  featId: string
  goldId: string
  featMarkdown: string
  goldMarkdown: string
} {
  const featId = protocolNameToId(input.name, 'FEAT')
  const goldId = protocolNameToId(input.name, 'GOLD')
  const title = input.title && input.title.trim() ? input.title.trim() : input.name
  const verified = input.roundTripSummary.includes('通过')
  // rationale 必须是单行无引号 scalar：压缩换行，避免破坏 frontmatter
  const summary = input.roundTripSummary.replace(/\s+/g, ' ').trim()

  const featDoc: ProtocolKnowledgeDoc = {
    id: featId,
    kind: 'feature',
    title,
    status: 'draft',
    scope: ['script-editor', 'protocol'],
    parent: 'MOD-SCRIPT-EDITOR',
    appliesTo: ['src/features/script-editor/dsl/**', 'shared/samples/**'],
    tags: ['protocol', 'dsl', 'script-editor'],
    dependsOn: ['MOD-SCRIPT-EDITOR'],
    relatedTo: [],
    dsl: input.dsl,
    docMarkdown: `## 字段表\n\n${input.fieldTableMarkdown}`,
    roundTripSummary: summary,
    createdFrom: input.createdFrom,
    createdAt: input.createdAt
  }

  const goldDoc: ProtocolGoldenDoc = {
    id: goldId,
    kind: 'golden-sample',
    title: `${title} 黄金样本`,
    status: 'draft',
    scope: ['script-editor', 'protocol'],
    parent: featId,
    appliesTo: ['src/features/script-editor/dsl/**', 'test/**'],
    tags: ['protocol', 'golden-sample', 'roundtrip'],
    dependsOn: [featId],
    sampleFrameHex: input.sampleFrameHex,
    expectedValues: input.expectedValues,
    verificationBaseline: {
      type: 'golden-sample',
      status: verified ? 'verified' : 'unavailable',
      rationale: summary
    },
    createdFrom: input.createdFrom,
    createdAt: input.createdAt
  }

  return {
    featId,
    goldId,
    featMarkdown: renderProtocolKnowledgeMarkdown(featDoc),
    goldMarkdown: renderProtocolGoldenMarkdown(goldDoc)
  }
}
