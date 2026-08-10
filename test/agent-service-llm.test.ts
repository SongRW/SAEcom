/**
 * AgentService LLM 域测试（provider 列表模型，配置页对齐 CC Switch）：
 * - saveLlmProvider/getLlmSettings：safeStorage 加密落盘往返；明文兜底；旧版单配置迁移
 * - 当前 provider 切换 / 删除自动改指
 * - chat：本地 mock OpenAI 兼容 SSE 端点（流式 delta 推送 + 完整文本）；HTTP 错误；未配置
 * - testLlmProvider：显式 provider 最小 chat（设置页测试连接，不落盘）
 * - abortChat：中止 in-flight 请求
 * - importFromCcSwitch：sql.js 假 cc-switch.db + 旧版 config.json 两种来源
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import {
  AgentService,
  normalizeLlmBaseUrl,
  type SafeStorageAdapter,
  type AgentLlmProvider
} from '../electron/services/agent.service'

function makeService(ccSwitchHome?: string, safeStorage?: SafeStorageAdapter): { service: AgentService; rootDir: string; userDataDir: string } {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'saecom-llm-'))
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'saecom-llm-ud-'))
  return { service: new AgentService(rootDir, userDataDir, safeStorage, ccSwitchHome), rootDir, userDataDir }
}

function cleanup(...dirs: string[]) {
  for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ } }
}

/** 简易 safeStorage stub：base64 加前缀模拟加密。 */
const stubSafeStorage: SafeStorageAdapter = {
  isEncryptionAvailable: () => true,
  encryptString: (plain: string) => Buffer.from(`ENC(${plain})`, 'utf8'),
  decryptString: (encrypted: Buffer) => encrypted.toString('utf8').replace(/^ENC\(/, '').replace(/\)$/, '')
}

const provider = (over: Partial<AgentLlmProvider> = {}): AgentLlmProvider => ({
  id: 'p1',
  name: 'claude.uy',
  baseUrl: 'https://claude.uy',
  apiKey: 'sk-secret-12345678901234567890',
  model: 'gpt-5.5',
  enabled: true,
  ...over
})

/** 启动 OpenAI 兼容 mock 端点（SSE + 可选 /models）。返回 { port, close }。 */
async function startMockEndpoint(opts: {
  chunks?: string[]
  status?: number
  delayMs?: number
  hang?: boolean
  models?: string[]
}): Promise<{ port: number; close: () => Promise<void>; requests: Array<{ path: string; auth?: string; body: string }> }> {
  const requests: Array<{ path: string; auth?: string; body: string }> = []
  const server = http.createServer((req, res) => {
    // GET /v1/models：返回模型列表（探查模型）
    if (req.method === 'GET' && req.url?.endsWith('/models')) {
      requests.push({ path: req.url, auth: req.headers.authorization, body: '' })
      const models = opts.models ?? []
      res.writeHead(models.length ? 200 : 404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data: models.map((id) => ({ id, object: 'model' })) }))
      return
    }
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      requests.push({ path: req.url ?? '', auth: req.headers.authorization, body })
      if (opts.hang) return
      const status = opts.status ?? 200
      res.writeHead(status, { 'Content-Type': 'text/event-stream' })
      if (status !== 200) {
        res.end(JSON.stringify({ error: { message: 'bad key' } }))
        return
      }
      const chunks = opts.chunks ?? ['ok']
      let i = 0
      const send = (): void => {
        if (i >= chunks.length) {
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }
        const delta = chunks[i++]
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`)
        setTimeout(send, opts.delayMs ?? 0)
      }
      send()
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = (server.address() as { port: number }).port
  return { port, close: () => new Promise((resolve) => server.close(() => resolve())), requests }
}

describe('AgentService LLM provider 持久化', () => {
  it('safeStorage 可用时 Key 加密落盘，读取解密还原；启用自动设为当前', () => {
    const { service, userDataDir } = makeService(undefined, stubSafeStorage)
    try {
      const res = service.saveLlmProvider(provider())
      expect(res.ok).toBe(true)
      const file = JSON.parse(readFileSync(path.join(userDataDir, 'agent-llm.json'), 'utf8'))
      expect(file.providers[0].keyEncrypted).toBe(true)
      expect(file.providers[0].apiKey.startsWith('enc:')).toBe(true)
      expect(file.providers[0].apiKey).not.toContain('sk-secret') // 明文不出现在文件里
      const settings = service.getLlmSettings()
      expect(settings.providers[0].apiKey).toBe('sk-secret-12345678901234567890')
      expect(settings.currentId).toBe('p1') // 唯一启用项自动设为当前
      expect(settings.providers[0].baseUrl).toBe('https://claude.uy/v1') // 归一化
      expect(service.getActiveLlmProvider()?.id).toBe('p1')
    } finally { cleanup(userDataDir) }
  })

  it('无 safeStorage 时明文兜底（测试环境 / Linux 无 keyring）', () => {
    const { service, userDataDir } = makeService()
    try {
      const res = service.saveLlmProvider(provider())
      expect(res.ok).toBe(true)
      expect(service.getLlmSettings().providers[0].apiKey).toBe('sk-secret-12345678901234567890')
    } finally { cleanup(userDataDir) }
  })

  it('缺必填字段拒绝保存；空 name/url/key/model', () => {
    const { service, userDataDir } = makeService()
    try {
      expect(service.saveLlmProvider(provider({ name: '' })).ok).toBe(false)
      expect(service.saveLlmProvider(provider({ baseUrl: '' })).ok).toBe(false)
      expect(service.saveLlmProvider(provider({ apiKey: '' })).ok).toBe(false)
      expect(service.saveLlmProvider(provider({ model: '' })).ok).toBe(false)
    } finally { cleanup(userDataDir) }
  })

  it('多 provider：设为当前 / 删除当前后自动改指第一个启用项', () => {
    const { service, userDataDir } = makeService()
    try {
      service.saveLlmProvider(provider({ id: 'a', name: 'A', enabled: true }))
      service.saveLlmProvider(provider({ id: 'b', name: 'B', enabled: true }))
      expect(service.getLlmSettings().currentId).toBe('a') // 第一个启用项为当前
      service.setCurrentLlmProvider('b')
      expect(service.getActiveLlmProvider()?.id).toBe('b')
      // 删除当前 → 改指第一个启用项
      service.deleteLlmProvider('b')
      expect(service.getLlmSettings().currentId).toBe('a')
      // 当前被禁用 → active 为 null
      service.saveLlmProvider(provider({ id: 'a', name: 'A', enabled: false }))
      expect(service.getActiveLlmProvider()).toBeNull()
    } finally { cleanup(userDataDir) }
  })

  it('旧版单配置自动迁移为 provider 列表', () => {
    const { service, userDataDir } = makeService()
    try {
      mkdirSync(userDataDir, { recursive: true })
      writeFileSync(path.join(userDataDir, 'agent-llm.json'), JSON.stringify({
        enabled: true,
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        apiKey: 'sk-legacy-12345678901234567890',
        keyEncrypted: false
      }), 'utf8')
      const settings = service.getLlmSettings()
      expect(settings.providers).toHaveLength(1)
      expect(settings.providers[0].name).toBe('deepseek-chat')
      expect(settings.providers[0].apiKey).toBe('sk-legacy-12345678901234567890')
      expect(settings.currentId).toBe('legacy')
    } finally { cleanup(userDataDir) }
  })

  it('normalizeLlmBaseUrl 补 /v1 去尾斜杠', () => {
    expect(normalizeLlmBaseUrl('https://api.deepseek.com')).toBe('https://api.deepseek.com/v1')
    expect(normalizeLlmBaseUrl('https://api.deepseek.com/v1/')).toBe('https://api.deepseek.com/v1')
    expect(normalizeLlmBaseUrl('https://claude.uy/v1')).toBe('https://claude.uy/v1')
  })
})

describe('AgentService.chat（当前 provider，OpenAI 兼容流式）', () => {
  it('SSE 流式：逐 delta 推送 agent:chunk，返回完整文本', async () => {
    const { service, userDataDir } = makeService()
    const mock = await startMockEndpoint({ chunks: ['{"name":"LLMTlv"', ',"fields":[]', '}', ''], delayMs: 5 })
    try {
      service.saveLlmProvider(provider({ baseUrl: `http://127.0.0.1:${mock.port}/v1` }))
      const chunks: string[] = []
      const sender = { send: (_ch: string, payload: unknown) => { chunks.push((payload as { delta: string }).delta) }, isDestroyed: () => false }
      const res = await service.chat({ id: 'c1', messages: [{ role: 'user', content: 'hi' }] }, sender)
      expect(res.ok).toBe(true)
      if (res.ok) expect(res.text).toBe('{"name":"LLMTlv","fields":[]}')
      expect(chunks.join('')).toBe('{"name":"LLMTlv","fields":[]}')
      expect(mock.requests[0].path).toBe('/v1/chat/completions')
      expect(mock.requests[0].auth).toBe('Bearer sk-secret-12345678901234567890')
      expect(JSON.parse(mock.requests[0].body).stream).toBe(true)
      expect(JSON.parse(mock.requests[0].body).model).toBe('gpt-5.5')
    } finally {
      await mock.close()
      cleanup(userDataDir)
    }
  })

  it('未配置/当前被禁用时返回明确错误', async () => {
    const { service, userDataDir } = makeService()
    try {
      const res = await service.chat({ id: 'c2', messages: [] }, { send: () => {}, isDestroyed: () => false })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toContain('未配置')
      // 有 provider 但未启用
      service.saveLlmProvider(provider({ enabled: false }))
      const res2 = await service.chat({ id: 'c2b', messages: [] }, { send: () => {}, isDestroyed: () => false })
      expect(res2.ok).toBe(false)
    } finally { cleanup(userDataDir) }
  })

  it('HTTP 401 返回服务端错误信息', async () => {
    const { service, userDataDir } = makeService()
    const mock = await startMockEndpoint({ status: 401 })
    try {
      service.saveLlmProvider(provider({ baseUrl: `http://127.0.0.1:${mock.port}/v1`, apiKey: 'sk-bad-12345678901234567890' }))
      const res = await service.chat({ id: 'c3', messages: [] }, { send: () => {}, isDestroyed: () => false })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toContain('401')
    } finally {
      await mock.close()
      cleanup(userDataDir)
    }
  })

  it('testLlmProvider：显式 provider 最小 chat（不落盘不切换）', async () => {
    const { service, userDataDir } = makeService()
    const mock = await startMockEndpoint({})
    try {
      const res = await service.testLlmProvider(provider({ baseUrl: `http://127.0.0.1:${mock.port}/v1` }))
      expect(res.ok).toBe(true)
      // 未落盘：设置仍是空的
      expect(service.getLlmSettings().providers).toHaveLength(0)
    } finally {
      await mock.close()
      cleanup(userDataDir)
    }
  })

  it('abortChat 中止 in-flight 请求', async () => {
    const { service, userDataDir } = makeService()
    const mock = await startMockEndpoint({ hang: true })
    try {
      service.saveLlmProvider(provider({ baseUrl: `http://127.0.0.1:${mock.port}/v1` }))
      const pending = service.chat({ id: 'c4', messages: [] }, { send: () => {}, isDestroyed: () => false })
      service.abortChat('c4')
      const res = await pending
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toBe('已中止')
    } finally {
      await mock.close()
      cleanup(userDataDir)
    }
  })
})

describe('AgentService.importFromCcSwitch', () => {
  it('从假 cc-switch.db 导入 codex 域端点 + Key + 模型（sql.js 构造）', async () => {
    const ccHome = mkdtempSync(path.join(tmpdir(), 'saecom-ccswitch-'))
    const { service, userDataDir } = makeService(ccHome)
    try {
      const initSqlJs = (await import('sql.js')).default
      const SQL = await initSqlJs({ locateFile: (f: string) => path.join(path.dirname(require.resolve('sql.js')), f) })
      const db = new SQL.Database()
      db.run(`CREATE TABLE providers (id TEXT, app_type TEXT, name TEXT, settings_config TEXT)`)
      const codexConfig = JSON.stringify({
        auth: { OPENAI_API_KEY: 'sk-61e6100b61d4fd5c767a14723d777c623ecd63a8f5f580a76b25e3e870c536d3' },
        config: 'model_provider = "custom"\nmodel = "gpt-5.5"\n[model_providers.custom]\nname = "Sub2API"\nbase_url = "https://claude.uy"'
      })
      db.run('INSERT INTO providers VALUES (?, ?, ?, ?)', ['sub2api-1', 'codex', 'n佬', codexConfig])
      const claudeConfig = JSON.stringify({
        env: { ANTHROPIC_AUTH_TOKEN: 'sk-e8362ad24f9107f07e9ffe6fa4de29c64a2c6b0ab793a' },
        website_url: 'https://claude.uy'
      })
      db.run('INSERT INTO providers VALUES (?, ?, ?, ?)', ['sub2api-2', 'claude', 'n佬赠送', claudeConfig])
      const bytes = db.export()
      db.close()
      mkdirSync(path.join(ccHome, '.cc-switch'), { recursive: true })
      writeFileSync(path.join(ccHome, '.cc-switch', 'cc-switch.db'), Buffer.from(bytes))

      const res = await service.importFromCcSwitch()
      expect(res.ok).toBe(true)
      if (!res.ok) return
      // 优先 codex 域（OpenAI 兼容）
      expect(res.source).toContain('n佬')
      expect(res.provider.baseUrl).toBe('https://claude.uy/v1')
      expect(res.provider.apiKey).toBe('sk-61e6100b61d4fd5c767a14723d777c623ecd63a8f5f580a76b25e3e870c536d3')
      expect(res.provider.model).toBe('gpt-5.5')
      expect(res.provider.enabled).toBe(false) // 导入不自动启用，UI 确认后保存
    } finally {
      cleanup(ccHome, userDataDir)
    }
  })

  it('无 cc-switch.db 时回退旧版 config.json（configs[] 格式）', async () => {
    const ccHome = mkdtempSync(path.join(tmpdir(), 'saecom-ccswitch2-'))
    const { service, userDataDir } = makeService(ccHome)
    try {
      mkdirSync(path.join(ccHome, '.cc-switch'), { recursive: true })
      writeFileSync(path.join(ccHome, '.cc-switch', 'config.json'), JSON.stringify({
        current: 'deepseek',
        configs: [
          { name: 'deepseek', type: 'openai', baseUrl: 'https://api.deepseek.com', apiKey: 'sk-legacy-123456789012345678901234567890', models: ['deepseek-chat'] }
        ]
      }), 'utf8')
      const res = await service.importFromCcSwitch()
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.source).toContain('config.json')
      expect(res.provider.baseUrl).toBe('https://api.deepseek.com/v1')
      expect(res.provider.model).toBe('deepseek-chat')
    } finally {
      cleanup(ccHome, userDataDir)
    }
  })

  it('无任何 CC Switch 配置时返回明确错误', async () => {
    const ccHome = mkdtempSync(path.join(tmpdir(), 'saecom-ccswitch3-'))
    const { service, userDataDir } = makeService(ccHome)
    try {
      const res = await service.importFromCcSwitch()
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toContain('未找到')
    } finally {
      cleanup(ccHome, userDataDir)
    }
  })
})

describe('AgentService.probeModels（自动探查模型，CC Switch 式）', () => {
  it('GET /models 拉取模型列表（Bearer 认证 + baseUrl 归一化）', async () => {
    const { service, userDataDir } = makeService()
    const mock = await startMockEndpoint({ models: ['deepseek-chat', 'deepseek-reasoner', 'gpt-5.5'] })
    try {
      const res = await service.probeModels(provider({ baseUrl: `http://127.0.0.1:${mock.port}` }))
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.models).toEqual(['deepseek-chat', 'deepseek-reasoner', 'gpt-5.5'])
      // 请求打到 /v1/models（baseUrl 自动补 /v1）且带 Bearer
      expect(mock.requests[0].path).toBe('/v1/models')
      expect(mock.requests[0].auth).toBe('Bearer sk-secret-12345678901234567890')
    } finally {
      await mock.close()
      cleanup(userDataDir)
    }
  })

  it('端点无 /models 或返回空列表时给出明确错误', async () => {
    const { service, userDataDir } = makeService()
    const mock = await startMockEndpoint({ models: [] }) // 404
    try {
      const res = await service.probeModels(provider({ baseUrl: `http://127.0.0.1:${mock.port}/v1` }))
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toContain('404')
    } finally {
      await mock.close()
      cleanup(userDataDir)
    }
  })

  it('缺 baseUrl / apiKey 拒绝探查', async () => {
    const { service, userDataDir } = makeService()
    try {
      const res = await service.probeModels(provider({ baseUrl: '', apiKey: '' }))
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toContain('Base URL')
    } finally { cleanup(userDataDir) }
  })

  it('探查不落盘不改配置', async () => {
    const { service, userDataDir } = makeService()
    const mock = await startMockEndpoint({ models: ['m1'] })
    try {
      await service.probeModels(provider({ baseUrl: `http://127.0.0.1:${mock.port}/v1` }))
      expect(service.getLlmSettings().providers).toHaveLength(0)
    } finally {
      await mock.close()
      cleanup(userDataDir)
    }
  })
})

describe('AgentService.chat — 思考强度与上下文窗口（对齐 CC Switch）', () => {
  it('reasoningEffort 设置时请求体带 reasoning_effort，未设置时不带', async () => {
    const { service, userDataDir } = makeService()
    const mock = await startMockEndpoint({})
    try {
      service.saveLlmProvider(provider({ baseUrl: `http://127.0.0.1:${mock.port}/v1`, reasoningEffort: 'high' }))
      await service.chat({ id: 'e1', messages: [{ role: 'user', content: 'hi' }] }, { send: () => {}, isDestroyed: () => false })
      expect(JSON.parse(mock.requests[0].body).reasoning_effort).toBe('high')

      service.saveLlmProvider(provider({ baseUrl: `http://127.0.0.1:${mock.port}/v1` }))
      await service.chat({ id: 'e2', messages: [{ role: 'user', content: 'hi' }] }, { send: () => {}, isDestroyed: () => false })
      expect(JSON.parse(mock.requests[1].body).reasoning_effort).toBeUndefined()
    } finally {
      await mock.close()
      cleanup(userDataDir)
    }
  })

  it('contextWindow 超长输入按 K×1024×4 字符截断（保留尾部）', async () => {
    const { service, userDataDir } = makeService()
    const mock = await startMockEndpoint({})
    try {
      // 1K tokens → 4096 字符上限
      service.saveLlmProvider(provider({ baseUrl: `http://127.0.0.1:${mock.port}/v1`, contextWindow: 1 }))
      const long = 'A'.repeat(5000) + 'TAIL'
      await service.chat({ id: 'c1', messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: long }] }, { send: () => {}, isDestroyed: () => false })
      const body = JSON.parse(mock.requests[0].body)
      const userMsg = body.messages[1]
      expect(userMsg.content.length).toBeLessThanOrEqual(4096)
      expect(userMsg.content.endsWith('TAIL')).toBe(true) // 保留尾部
      expect(body.messages[0].content).toBe('sys') // 系统消息不动
    } finally {
      await mock.close()
      cleanup(userDataDir)
    }
  })

  it('contextWindow 不设置时不截断', async () => {
    const { service, userDataDir } = makeService()
    const mock = await startMockEndpoint({})
    try {
      service.saveLlmProvider(provider({ baseUrl: `http://127.0.0.1:${mock.port}/v1` }))
      const long = 'B'.repeat(10000)
      await service.chat({ id: 'c2', messages: [{ role: 'user', content: long }] }, { send: () => {}, isDestroyed: () => false })
      expect(JSON.parse(mock.requests[0].body).messages[0].content.length).toBe(10000)
    } finally {
      await mock.close()
      cleanup(userDataDir)
    }
  })

  it('CC Switch 导入提取思考强度与上下文窗口（model_reasoning_effort / context_window）', async () => {
    const ccHome = mkdtempSync(path.join(tmpdir(), 'saecom-ccswitch4-'))
    const { service, userDataDir } = makeService(ccHome)
    try {
      const initSqlJs = (await import('sql.js')).default
      const SQL = await initSqlJs({ locateFile: (f: string) => path.join(path.dirname(require.resolve('sql.js')), f) })
      const db = new SQL.Database()
      db.run(`CREATE TABLE providers (id TEXT, app_type TEXT, name TEXT, settings_config TEXT)`)
      const codexConfig = JSON.stringify({
        auth: { OPENAI_API_KEY: 'sk-effort1234567890123456789012345678901234567890' },
        config: 'model_provider = "custom"\nmodel = "gpt-5.5"\nmodel_reasoning_effort = "high"\ncontext_window = 500000\nbase_url = "https://claude.uy"'
      })
      db.run('INSERT INTO providers VALUES (?, ?, ?, ?)', ['sub2api-1', 'codex', 'n佬', codexConfig])
      const bytes = db.export()
      db.close()
      mkdirSync(path.join(ccHome, '.cc-switch'), { recursive: true })
      writeFileSync(path.join(ccHome, '.cc-switch', 'cc-switch.db'), Buffer.from(bytes))

      const res = await service.importFromCcSwitch()
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.provider.reasoningEffort).toBe('high')
      expect(res.provider.contextWindow).toBe(488) // 500000 tokens / 1024 ≈ 488K
    } finally {
      cleanup(ccHome, userDataDir)
    }
  })
})

describe('AgentService — 思考强度完整刻度（minimal/max 极高）', () => {
  it('max（极高）与 minimal（最低）都透传 reasoning_effort', async () => {
    const { service, userDataDir } = makeService()
    const mock = await startMockEndpoint({})
    try {
      service.saveLlmProvider(provider({ baseUrl: `http://127.0.0.1:${mock.port}/v1`, reasoningEffort: 'max' }))
      await service.chat({ id: 'm1', messages: [{ role: 'user', content: 'hi' }] }, { send: () => {}, isDestroyed: () => false })
      expect(JSON.parse(mock.requests[0].body).reasoning_effort).toBe('max')

      service.saveLlmProvider(provider({ baseUrl: `http://127.0.0.1:${mock.port}/v1`, reasoningEffort: 'minimal' }))
      await service.chat({ id: 'm2', messages: [{ role: 'user', content: 'hi' }] }, { send: () => {}, isDestroyed: () => false })
      expect(JSON.parse(mock.requests[1].body).reasoning_effort).toBe('minimal')
    } finally {
      await mock.close()
      cleanup(userDataDir)
    }
  })

  it('非法强度值不落盘（按 undefined 处理）', () => {
    const { service, userDataDir } = makeService()
    try {
      const res = service.saveLlmProvider(provider({ reasoningEffort: 'ultra' as 'max' }))
      expect(res.ok).toBe(true)
      expect(service.getLlmSettings().providers[0].reasoningEffort).toBeUndefined()
    } finally { cleanup(userDataDir) }
  })
})
