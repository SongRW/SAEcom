import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { buildProtocolKnowledgeDocs, type ProtocolKnowledgeWriteInput } from '../../shared/protocol-knowledge-doc'

/**
 * AgentService —— 协议生成向导的后端能力域（组：agent）。
 *
 * 纯 Node 逻辑（不 import electron，可 Vitest 单测）：
 * - parseDocument：按扩展名提取文档文本（docx → mammoth；xlsx → SheetJS；
 *   pdf → pdfjs-dist legacy ESM（Node 环境）；其余按 UTF-8 文本读）
 * - writeProtocolKnowledge：把 FEAT+GOLD 协议知识文档经 knowledge-retrieval CLI
 *   写入 docs/knowledge/（query 开 trace → stage 到 session-traces → write --create ×2
 *   → complete 关 trace）。CLI 仅在本地开发仓库存在，打包环境优雅降级。
 * - LLM（二期-真模型）：OpenAI 兼容 chat/completions 流式调用（agent:chat），
 *   配置存 userData/agent-llm.json（key 经 safeStorage 加密）；importFromCcSwitch
 *   从 CC Switch（~/.cc-switch/cc-switch.db，sql.js 读 SQLite）抄 OpenAI 兼容端点。
 *
 * rootDir：项目根（dev = app.getAppPath()），用于定位 CLI 与 stage 目录。
 * userDataDir：配置落盘目录；safeStorage：Electron safeStorage 适配器（测试可注入 null）。
 */
export type ParseDocumentResult = { ok: true; text: string } | { ok: false; error: string }

export type WriteKnowledgeResult =
  | { ok: true; featId: string; goldId: string; traceId: string }
  | { ok: false; error: string }

/** 思考强度等级（OpenAI 兼容 reasoning_effort 完整刻度；max=极高，部分模型/中转支持） */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'max'

/** LLM provider（OpenAI 兼容端点，CC Switch 配置页同款形态）。apiKey 落盘时经 safeStorage 加密。 */
export interface AgentLlmProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
  /** 思考强度（OpenAI 兼容 reasoning_effort；对齐 CC Switch model_reasoning_effort） */
  reasoningEffort?: ReasoningEffort
  /** 上下文窗口（K tokens，0/缺省 = 不限制；对齐 CC Switch context_window） */
  contextWindow?: number
}

/** LLM 设置：provider 列表 + 当前生效 provider。 */
export interface AgentLlmSettings {
  currentId: string | null
  providers: AgentLlmProvider[]
}

export interface AgentChatRequest {
  id: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  model?: string
}

export type AgentChatResult = { ok: true; text: string } | { ok: false; error: string }

export type AgentLlmSettingsResult = { ok: true; settings: AgentLlmSettings } | { ok: false; error: string }

export type AgentCcSwitchImportResult =
  | { ok: true; provider: AgentLlmProvider; source: string }
  | { ok: false; error: string }

/** 探查端点可用模型列表的结果（对齐 CC Switch 配置页「自动获取模型」）。 */
export type AgentProbeModelsResult = { ok: true; models: string[] } | { ok: false; error: string }

/** safeStorage 适配器（Electron 传入；测试注入 stub）。 */
export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

/** 单文件解析上限（10MB，防止误选大文件卡死主进程） */
const MAX_DOC_BYTES = 10 * 1024 * 1024

/** 支持解析的扩展名（小写） */
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.log', '.sccom', '.js', '.xml', '.ini', '.cfg'])

/** 思考强度合法取值（OpenAI 兼容完整刻度，含极高 max） */
const REASONING_EFFORTS: ReasoningEffort[] = ['minimal', 'low', 'medium', 'high', 'max']

/** OpenAI 兼容基址归一化：去尾斜杠，确保以 /v1 结尾。 */
export function normalizeLlmBaseUrl(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, '')
  if (!/\/v1$/i.test(url)) url += '/v1'
  return url
}

export class AgentService {
  private readonly llmConfigPath: string
  /** 进行中的 chat 调用 → AbortController（agent:chatAbort 中止） */
  private readonly chatAborts = new Map<string, AbortController>()

  constructor(
    private readonly rootDir: string,
    private readonly userDataDir: string,
    private readonly safeStorage?: SafeStorageAdapter,
    private readonly ccSwitchHome: string = os.homedir()
  ) {
    this.llmConfigPath = path.join(userDataDir, 'agent-llm.json')
  }

  /** 按扩展名提取文档文本。 */
  async parseDocument(filePath: string): Promise<ParseDocumentResult> {
    if (!filePath || typeof filePath !== 'string') {
      return { ok: false, error: '未提供文件路径' }
    }
    if (!existsSync(filePath)) {
      return { ok: false, error: '文件不存在' }
    }
    try {
      const size = statSync(filePath).size
      if (size > MAX_DOC_BYTES) {
        return { ok: false, error: `文件过大（${(size / 1024 / 1024).toFixed(1)}MB，上限 10MB）` }
      }
    } catch (e) {
      return { ok: false, error: `无法读取文件信息：${(e as Error).message}` }
    }

    const ext = path.extname(filePath).toLowerCase()
    try {
      let text = ''
      if (ext === '.docx') {
        text = await this.parseDocx(filePath)
      } else if (ext === '.xlsx') {
        text = await this.parseXlsx(filePath)
      } else if (ext === '.pdf') {
        text = await this.parsePdf(filePath)
      } else if (TEXT_EXTENSIONS.has(ext)) {
        text = readFileSync(filePath, 'utf8')
      } else {
        return { ok: false, error: `不支持的文档类型「${ext}」，支持：.docx / .xlsx / .pdf / .txt / .md / .csv / .json` }
      }
      const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
      if (!cleaned) return { ok: false, error: '文档未解析出文本内容' }
      return { ok: true, text: cleaned }
    } catch (e) {
      return { ok: false, error: `解析失败：${(e as Error).message || String(e)}` }
    }
  }

  private async parseDocx(filePath: string): Promise<string> {
    // mammoth 是 CJS，require 兼容；extractRawText 返回 { value, messages }
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value
  }

  private async parseXlsx(filePath: string): Promise<string> {
    const XLSX = await import('xlsx')
    const workbook = XLSX.readFile(filePath)
    const parts: string[] = []
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) continue
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
      parts.push(`【${sheetName}】\n${csv}`)
    }
    return parts.join('\n\n')
  }

  private async parsePdf(filePath: string): Promise<string> {
    // pdfjs-dist 主构建依赖 DOMMatrix（Node 无），必须用 legacy build；
    // legacy 是 ESM，main 是 CJS → 动态 import（Node ≥ 20 支持）。
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const data = new Uint8Array(readFileSync(filePath))
    const loadingTask = pdfjs.getDocument({ data })
    const doc = await loadingTask.promise
    try {
      const parts: string[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i)
        const content = await page.getTextContent()
        const line = content.items
          .map((item: unknown) => (item as { str?: string }).str ?? '')
          .join('')
        parts.push(line)
      }
      return parts.join('\n')
    } finally {
      await loadingTask.destroy()
    }
  }

  /**
   * 写入协议知识库：FEAT + GOLD 两篇 draft 文档。
   * 走 maintaining-repository-knowledge CLI（query 开 trace → stage → write --create → complete），
   * 与本地知识治理的 trace 生命周期对齐。
   */
  writeProtocolKnowledge(input: ProtocolKnowledgeWriteInput): WriteKnowledgeResult {
    const cliPath = path.join(this.rootDir, '.agents/skills/maintaining-repository-knowledge/scripts/knowledge-retrieval.mjs')
    if (!existsSync(cliPath)) {
      return { ok: false, error: '知识库 CLI 不可用（仅本地开发仓库支持）' }
    }

    const runCli = (args: string[]): string => {
      return execFileSync('node', [cliPath, ...args], { encoding: 'utf8', timeout: 20000 })
    }

    let traceId = ''
    try {
      // 1. query：开启 trace（write 必须复用同一条 trace）
      const queryOut = JSON.parse(runCli([
        'query',
        '--task', `协议 ${input.name}（${input.title || input.name}）字段结构`,
        '--path', 'src/features/script-editor/**',
        '--path', 'shared/samples/**',
        '--level', 'feature'
      ]))
      traceId = queryOut.diagnostics?.traceId ?? ''
      if (!traceId) return { ok: false, error: '知识库 query 未返回 traceId' }

      // 2. 构建两篇文档 + stage 到 session-traces
      const { featId, goldId, featMarkdown, goldMarkdown } = buildProtocolKnowledgeDocs(input)
      const stageDir = path.join(this.rootDir, '.superpowers/knowledge/session-traces')
      mkdirSync(stageDir, { recursive: true })
      const featStaged = path.join(stageDir, `candidate-${featId}.md`)
      const goldStaged = path.join(stageDir, `candidate-${goldId}.md`)
      writeFileSync(featStaged, featMarkdown, 'utf8')
      writeFileSync(goldStaged, goldMarkdown, 'utf8')

      // 3. write --create（先 FEAT 后 GOLD：GOLD 的 parent/depends_on 引用 FEAT）
      const featuresDir = path.join(this.rootDir, 'docs/knowledge/features')
      mkdirSync(featuresDir, { recursive: true })
      runCli(['write', '--file', path.join(featuresDir, `${featId}.md`), '--input', featStaged, '--trace-id', traceId, '--create'])
      runCli(['write', '--file', path.join(featuresDir, `${goldId}.md`), '--input', goldStaged, '--trace-id', traceId, '--create'])

      // 4. 关闭 trace（自动写入的生命周期在本次调用内完成）
      runCli(['complete', '--trace-id', traceId])

      return { ok: true, featId, goldId, traceId }
    } catch (e) {
      const message = (e as Error).message || String(e)
      // 出错时尽量关掉已开的 trace，避免悬挂
      if (traceId) {
        try { execFileSync('node', [cliPath, 'complete', '--trace-id', traceId], { encoding: 'utf8', timeout: 10000 }) } catch { /* ignore */ }
      }
      return { ok: false, error: message.slice(0, 300) }
    }
  }

// ═══════════════════════════════════════════════════════════
// LLM（真模型后端）：provider 列表持久化 + OpenAI 兼容流式 chat
// （配置页形态对齐 CC Switch：多 provider + 当前切换）
// ═══════════════════════════════════════════════════════════

/** 读取 LLM 设置（provider 列表 + 当前 id；key 解密）。
 *  兼容迁移：旧版单配置结构（enabled/baseUrl/apiKey/model）自动转成单个 provider。 */
  getLlmSettings(): AgentLlmSettings {
    const fallback: AgentLlmSettings = { currentId: null, providers: [] }
    try {
      if (!existsSync(this.llmConfigPath)) return fallback
      const raw = JSON.parse(readFileSync(this.llmConfigPath, 'utf8'))
      // 旧版单配置迁移
      if (Array.isArray(raw.providers)) {
        return {
          currentId: raw.currentId ?? null,
          providers: (raw.providers as Array<Record<string, unknown>>).map((p) => ({
            id: String(p.id),
            name: String(p.name ?? '未命名'),
            baseUrl: String(p.baseUrl ?? ''),
            apiKey: p.keyEncrypted ? this.decryptKey(String(p.apiKey ?? '')) : String(p.apiKey ?? ''),
            model: String(p.model ?? ''),
            enabled: p.enabled === true,
            reasoningEffort: REASONING_EFFORTS.includes(String(p.reasoningEffort ?? '') as ReasoningEffort)
              ? String(p.reasoningEffort) as ReasoningEffort
              : undefined,
            contextWindow: typeof p.contextWindow === 'number' && p.contextWindow > 0
              ? p.contextWindow
              : undefined
          }))
        }
      }
      // 旧版单配置：包成 providers[0]
      const key: string = raw.apiKey ?? ''
      const legacy: AgentLlmProvider = {
        id: 'legacy',
        name: raw.model ? String(raw.model) : '默认',
        baseUrl: String(raw.baseUrl ?? ''),
        apiKey: raw.keyEncrypted ? this.decryptKey(key) : key,
        model: String(raw.model ?? ''),
        enabled: raw.enabled === true
      }
      return legacy.baseUrl ? { currentId: legacy.id, providers: [legacy] } : fallback
    } catch {
      return fallback
    }
  }

  /** 当前生效 provider（currentId 且 enabled）。 */
  getActiveLlmProvider(): AgentLlmProvider | null {
    const settings = this.getLlmSettings()
    const active = settings.providers.find((p) => p.id === settings.currentId)
    return active && active.enabled ? active : null
  }

  /** 校验 provider 字段（启用时必填）。 */
  private validateProvider(provider: AgentLlmProvider): string | null {
    if (!provider.name?.trim()) return '名称不能为空'
    if (!provider.baseUrl?.trim()) return 'Base URL 不能为空'
    if (!provider.apiKey?.trim()) return 'API Key 不能为空'
    if (!provider.model?.trim()) return '模型名不能为空'
    return null
  }

  /** 保存 provider（upsert 按 id）。保存后若其为唯一启用项则自动设为当前。 */
  saveLlmProvider(provider: AgentLlmProvider): AgentLlmSettingsResult {
    const error = this.validateProvider(provider)
    if (error) return { ok: false, error }
    const normalized: AgentLlmProvider = {
      ...provider,
      name: provider.name.trim(),
      baseUrl: normalizeLlmBaseUrl(provider.baseUrl),
      apiKey: provider.apiKey.trim(),
      model: provider.model.trim(),
      enabled: provider.enabled === true
    }
    try {
      mkdirSync(this.userDataDir, { recursive: true })
      const settings = this.getLlmSettings()
      const exists = settings.providers.some((p) => p.id === normalized.id)
      const providers = exists
        ? settings.providers.map((p) => (p.id === normalized.id ? normalized : p))
        : [...settings.providers, normalized]
      let currentId = settings.currentId
      if (normalized.enabled && !providers.some((p) => p.id === currentId && p.enabled)) {
        // 当前不可用 → 优先指向刚保存的；无任何启用项则置 null
        currentId = normalized.enabled ? normalized.id : null
      }
      this.writeLlmSettings({ currentId, providers })
      return { ok: true, settings: { currentId, providers } }
    } catch (e) {
      return { ok: false, error: `保存失败：${(e as Error).message}` }
    }
  }

  /** 删除 provider（currentId 失效时自动改指向第一个启用项）。 */
  deleteLlmProvider(id: string): AgentLlmSettingsResult {
    try {
      const settings = this.getLlmSettings()
      const providers = settings.providers.filter((p) => p.id !== id)
      let currentId = settings.currentId
      if (currentId === id) {
        currentId = providers.find((p) => p.enabled)?.id ?? null
      }
      this.writeLlmSettings({ currentId, providers })
      return { ok: true, settings: { currentId, providers } }
    } catch (e) {
      return { ok: false, error: `删除失败：${(e as Error).message}` }
    }
  }

  /** 设置当前 provider。 */
  setCurrentLlmProvider(id: string): AgentLlmSettingsResult {
    try {
      const settings = this.getLlmSettings()
      if (!settings.providers.some((p) => p.id === id)) {
        return { ok: false, error: 'provider 不存在' }
      }
      this.writeLlmSettings({ ...settings, currentId: id })
      return { ok: true, settings: { ...settings, currentId: id } }
    } catch (e) {
      return { ok: false, error: `切换失败：${(e as Error).message}` }
    }
  }

  private writeLlmSettings(settings: AgentLlmSettings): void {
    const payload = {
      currentId: settings.currentId,
      providers: settings.providers.map((p) => {
        const encrypted = this.encryptKey(p.apiKey)
        return {
          id: p.id,
          name: p.name,
          baseUrl: p.baseUrl,
          model: p.model,
          enabled: p.enabled,
          reasoningEffort: p.reasoningEffort,
          contextWindow: p.contextWindow,
          apiKey: encrypted,
          // true = apiKey 字段是 safeStorage 密文（enc: 前缀）
          keyEncrypted: encrypted !== p.apiKey
        }
      })
    }
    writeFileSync(this.llmConfigPath, JSON.stringify(payload, null, 2), 'utf8')
  }

  private encryptKey(key: string): string {
    if (this.safeStorage && this.safeStorage.isEncryptionAvailable() && key) {
      return `enc:${this.safeStorage.encryptString(key).toString('base64')}`
    }
    return key // 无 safeStorage（Linux 无 keyring / 测试环境）：明文兜底
  }

  private decryptKey(stored: string): string {
    if (stored.startsWith('enc:')) {
      try {
        if (this.safeStorage && this.safeStorage.isEncryptionAvailable()) {
          return this.safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
        }
      } catch { /* 解密失败按明文处理 */ }
      return ''
    }
    return stored
  }

  /**
   * OpenAI 兼容 chat/completions 流式调用（使用当前生效 provider）。
   * 逐 delta 经 sender.send('agent:chunk', { id, delta }) 推送；返回完整文本。
   * 渲染进程不持有 key：请求一律发往主进程（CSP connect-src 'self' 之外的唯一通道）。
   */
  async chat(req: AgentChatRequest, sender: { send: (channel: string, payload: unknown) => void; isDestroyed?: () => boolean }): Promise<AgentChatResult> {
    const provider = this.getActiveLlmProvider()
    if (!provider) {
      return { ok: false, error: 'LLM 未配置（请在向导「模型」中选择启用一个 provider）' }
    }
    return this.chatWithProvider(req, provider, sender)
  }

  /**
   * 用显式 provider 做最小 chat（设置页「测试连接」用，不落盘）。
   */
  async testLlmProvider(provider: AgentLlmProvider): Promise<AgentChatResult> {
    const error = this.validateProvider(provider)
    if (error) return { ok: false, error }
    return this.chatWithProvider(
      { id: `test-${Date.now()}`, messages: [{ role: 'user', content: '回复 ok' }] },
      provider,
      { send: () => {}, isDestroyed: () => true }
    )
  }

  /**
   * 探查端点的可用模型列表（GET {baseUrl}/models，OpenAI 兼容；对齐 CC Switch 自动获取模型）。
   * 只读：用表单里的 baseUrl + apiKey 探查，不落盘。
   */
  async probeModels(provider: AgentLlmProvider): Promise<AgentProbeModelsResult> {
    if (!provider.baseUrl?.trim()) return { ok: false, error: 'Base URL 不能为空' }
    if (!provider.apiKey?.trim()) return { ok: false, error: 'API Key 不能为空' }
    try {
      const resp = await fetch(`${normalizeLlmBaseUrl(provider.baseUrl)}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${provider.apiKey.trim()}` },
        signal: AbortSignal.timeout(15000)
      })
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        return { ok: false, error: `HTTP ${resp.status}：${errText.slice(0, 200) || resp.statusText}` }
      }
      const json = (await resp.json().catch(() => null)) as { data?: Array<{ id?: unknown }> } | null
      const models = (json?.data ?? [])
        .map((m) => (typeof m?.id === 'string' ? m.id : ''))
        .filter((id): id is string => id.length > 0)
      if (!models.length) return { ok: false, error: '端点未返回模型列表（/models）' }
      return { ok: true, models }
    } catch (e) {
      if ((e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError') {
        return { ok: false, error: '探查超时（15s）' }
      }
      return { ok: false, error: (e as Error).message || String(e) }
    }
  }

  private async chatWithProvider(
    req: AgentChatRequest,
    provider: AgentLlmProvider,
    sender: { send: (channel: string, payload: unknown) => void; isDestroyed?: () => boolean }
  ): Promise<AgentChatResult> {
    const ctrl = new AbortController()
    this.chatAborts.set(req.id, ctrl)
    try {
      const url = `${normalizeLlmBaseUrl(provider.baseUrl)}/chat/completions`
      // 上下文窗口（K tokens）：超长输入按「K×1024×4 字符」截断最后一条用户消息
      // （中英混排约 1 token ≈ 2-4 字符，取 4 保守）。0/缺省不限制。
      const maxChars = provider.contextWindow && provider.contextWindow > 0
        ? provider.contextWindow * 1024 * 4
        : Number.POSITIVE_INFINITY
      const messages = req.messages.map((m, i) =>
        i === req.messages.length - 1 && m.content.length > maxChars
          ? { ...m, content: m.content.slice(-maxChars) }
          : m)
      const body: Record<string, unknown> = {
        model: req.model || provider.model,
        messages,
        stream: true,
        temperature: 0.2
      }
      // 思考强度（对齐 CC Switch model_reasoning_effort → OpenAI 兼容 reasoning_effort）
      if (provider.reasoningEffort) body.reasoning_effort = provider.reasoningEffort
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      })
      if (!resp.ok || !resp.body) {
        const errText = await resp.text().catch(() => '')
        return { ok: false, error: `HTTP ${resp.status}：${errText.slice(0, 200) || resp.statusText}` }
      }
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let full = ''
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const evt of events) {
          const dataLine = evt.split('\n').find((l) => l.startsWith('data:'))
          if (!dataLine) continue
          const payload = dataLine.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          try {
            const json = JSON.parse(payload)
            const delta: string = json.choices?.[0]?.delta?.content ?? ''
            if (delta) {
              full += delta
              if (sender && (!sender.isDestroyed || !sender.isDestroyed())) {
                sender.send('agent:chunk', { id: req.id, delta })
              }
            }
          } catch { /* 忽略非 JSON 行 */ }
        }
      }
      if (!full.trim()) return { ok: false, error: '模型返回空内容' }
      return { ok: true, text: full }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return { ok: false, error: '已中止' }
      return { ok: false, error: (e as Error).message || String(e) }
    } finally {
      this.chatAborts.delete(req.id)
    }
  }

  /** 中止进行中的 chat 调用。 */
  abortChat(id: string): void {
    this.chatAborts.get(id)?.abort()
    this.chatAborts.delete(id)
  }

  /**
   * 从 CC Switch 导入 OpenAI 兼容端点 + Key（用户已明确要求「抄 cc switch 的端点」）。
   * 读取 ~/.cc-switch/cc-switch.db（sql.js 读 SQLite；Electron 31 的 Node 20 无 node:sqlite）
   * 或旧版 config.json。优先 app_type=codex / 含 OPENAI_API_KEY 的 provider。
   * 只读不写：返回候选 provider 供 UI 确认后 saveLlmProvider 保存。
   */
  async importFromCcSwitch(): Promise<AgentCcSwitchImportResult> {
    const home = this.ccSwitchHome
    const dbPath = path.join(home, '.cc-switch', 'cc-switch.db')
    if (existsSync(dbPath)) {
      const fromDb = await this.importFromCcSwitchDb(dbPath)
      if (fromDb) return fromDb
    }
    const legacyPath = path.join(home, '.cc-switch', 'config.json')
    if (existsSync(legacyPath)) {
      const fromLegacy = this.importFromCcSwitchLegacy(legacyPath)
      if (fromLegacy) return fromLegacy
    }
    return { ok: false, error: '未找到 CC Switch 配置（~/.cc-switch/cc-switch.db 或 config.json）' }
  }

  private async importFromCcSwitchDb(dbPath: string): Promise<AgentCcSwitchImportResult | null> {
    try {
      const initSqlJs = (await import('sql.js')).default
      const SQL = await initSqlJs({
        locateFile: (file: string) => path.join(path.dirname(require.resolve('sql.js')), file)
      })
      const db = new SQL.Database(readFileSync(dbPath))
      try {
        const res = db.exec('SELECT id, app_type, name, settings_config FROM providers')
        if (!res.length) return null
        const rows: unknown[][] = res[0].values
        const candidates: Array<{ name: string; baseUrl: string; apiKey: string; model: string; effort?: ReasoningEffort; contextWindow?: number; score: number }> = []
        for (const row of rows) {
          const [id, appType, name, settingsRaw] = row as [string, string, string, string]
          let parsed: Record<string, unknown>
          try { parsed = JSON.parse(settingsRaw || '{}') } catch { continue }
          const found = this.extractEndpointFromProvider(parsed)
          if (!found) continue
          const score = appType === 'codex' ? 3 : appType === 'openai' ? 3 : appType === 'claude' ? 1 : appType === 'grokbuild' ? 2 : 0
          candidates.push({
            name: name || id,
            baseUrl: found.baseUrl,
            apiKey: found.apiKey,
            model: found.model,
            effort: found.effort,
            contextWindow: found.contextWindow,
            score
          })
        }
        if (!candidates.length) return null
        candidates.sort((a, b) => b.score - a.score)
        const best = candidates[0]
        return {
          ok: true,
          source: `CC Switch · ${best.name}`,
          provider: {
            id: `cc-${Date.now()}`,
            name: best.name,
            baseUrl: normalizeLlmBaseUrl(best.baseUrl),
            apiKey: best.apiKey,
            model: best.model,
            enabled: false,
            reasoningEffort: best.effort,
            contextWindow: best.contextWindow
          }
        }
      } finally {
        db.close()
      }
    } catch (e) {
      return { ok: false, error: `读取 CC Switch 数据库失败：${(e as Error).message}` }
    }
  }

  private importFromCcSwitchLegacy(configPath: string): AgentCcSwitchImportResult | null {
    try {
      const parsed = JSON.parse(readFileSync(configPath, 'utf8'))
      const configs: unknown[] = Array.isArray(parsed.configs) ? parsed.configs : []
      for (const entry of configs) {
        const e = entry as { baseUrl?: string; apiKey?: string; models?: unknown[] }
        if (typeof e.baseUrl === 'string' && typeof e.apiKey === 'string' && e.baseUrl && e.apiKey) {
          const model = Array.isArray(e.models) && typeof e.models[0] === 'string' ? e.models[0] : ''
          const name = typeof (entry as { name?: string }).name === 'string' ? (entry as { name: string }).name : 'CC Switch'
          return {
            ok: true,
            source: 'CC Switch · config.json',
            provider: {
              id: `cc-${Date.now()}`,
              name,
              baseUrl: normalizeLlmBaseUrl(e.baseUrl),
              apiKey: e.apiKey,
              model,
              enabled: false
            }
          }
        }
      }
      return null
    } catch {
      return null
    }
  }

  /** 从 provider 的 settings_config JSON 提取 { baseUrl, apiKey, model, effort, contextWindow }
   *  （OpenAI 兼容格式；对齐 CC Switch：model_reasoning_effort / context_window）。
   *  宽松扫描：key/url 可能嵌在 config 文本里（如 `base_url = "https://claude.uy"`），
   *  对全部字符串 join 后正则提取，而非要求字段独立成串。 */
  private extractEndpointFromProvider(parsed: Record<string, unknown>): {
    baseUrl: string
    apiKey: string
    model: string
    effort?: ReasoningEffort
    contextWindow?: number
  } | null {
    const strings: string[] = []
    const collect = (v: unknown): void => {
      if (typeof v === 'string') strings.push(v)
      else if (v && typeof v === 'object') for (const x of Object.values(v)) collect(x)
    }
    collect(parsed)
    const joined = strings.join('\n')
    const keyMatch = /sk-[A-Za-z0-9]{16,}/.exec(joined)
    const apiKey = keyMatch?.[0] ?? ''
    const urls = [...joined.matchAll(/https?:\/\/[^\s"'，,）)\]]+/g)].map((m) => m[0])
    const baseUrl = urls.find((u) => !/claude\.ai$|openai\.com$|anthropic\.com$|google\.ai$|ai\.google$|deepseek\.com$/.test(u)) ?? ''
    // model：codex 配置里 `model = "gpt-5.5"`；grokbuild 里 `default = "grok-4.5"`
    const modelMatch = /(?:^|\n)\s*(?:model|default)\s*=\s*"([^"]+)"/.exec(joined)
    const model = modelMatch?.[1] ?? ''
    // 思考强度：model_reasoning_effort = "high"（支持 minimal/low/medium/high/max）
    const effortMatch = /model_reasoning_effort\s*=\s*"?([a-z]+)"?/i.exec(joined)
    const effort = REASONING_EFFORTS.includes(effortMatch?.[1] as ReasoningEffort)
      ? effortMatch![1] as ReasoningEffort
      : undefined
    // 上下文窗口：context_window = 500000（tokens）→ 存 K 单位
    const ctxMatch = /context_window\s*=\s*"?(\d+)"?/i.exec(joined)
    const contextWindow = ctxMatch ? Math.max(1, Math.round(Number(ctxMatch[1]) / 1024)) : undefined
    if (!apiKey || !baseUrl) return null
    return { baseUrl, apiKey, model, effort, contextWindow }
  }
}