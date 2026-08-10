import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, DownloadSimple, Plug, CheckCircle, XCircle, Trash, Play } from '@phosphor-icons/react'
import { getIPC } from '@/shared/ipc'
import type { AgentLlmProvider, AgentLlmSettings } from '@shared/types'

/**
 * AI 与 Agent 分区 —— provider 管理（配置页形态对齐 CC Switch）。
 *
 * 左栏：provider 列表（当前徽标 / 启用点 / 设为当前 / 删除 / 新增 / 从 CC Switch 导入）
 * 右栏：编辑表单（名称 / Base URL / API Key / 模型 / 启用）+ 测试连接 + 保存
 *
 * 通用 Agent 基础设施：agent:chat / testLlmProvider / importFromCcSwitch 走主进程 IPC，
 * 向导深度模式与后续 agent 功能共用同一套 provider（agent:chat 用当前启用项）。
 * Key 只在主进程持久化（safeStorage 加密），渲染进程表单展示明文便于编辑（本机自持）。
 */
const EMPTY_SETTINGS: AgentLlmSettings = { currentId: null, providers: [] }

interface AgentSectionProps {
  /** 独立窗口内嵌模式：不渲染分区标题/副标题（由窗口头部承担） */
  embedded?: boolean
}

export function AgentSection({ embedded = false }: AgentSectionProps) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AgentLlmSettings>(EMPTY_SETTINGS)
  // 正在编辑的 provider id：null = 新建
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AgentLlmProvider | null>(null)
  const [source, setSource] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  // 探查模型（GET /models，对齐 CC Switch 自动获取模型）
  const [probing, setProbing] = useState(false)
  const [probedModels, setProbedModels] = useState<string[] | null>(null)

  const load = useCallback(async () => {
    const res = await getIPC().agent.getLlmSettings()
    if (!res.ok || !res.settings) return
    setSettings(res.settings)
    const target = res.settings.providers.find((p) => p.id === res.settings?.currentId)
      ?? res.settings.providers[0]
    setEditingId(target?.id ?? null)
    setForm(target ? { ...target } : null)
  }, [])

  useEffect(() => {
    setTestResult(null)
    setSource('')
    void load()
  }, [load])

  const startNew = useCallback(() => {
    setEditingId(null)
    setForm({ id: `local-${Date.now()}`, name: '', baseUrl: '', apiKey: '', model: '', enabled: true })
    setSource('')
    setTestResult(null)
  }, [])

  const selectProvider = useCallback((p: AgentLlmProvider) => {
    setEditingId(p.id)
    setForm({ ...p })
    setSource('')
    setTestResult(null)
  }, [])

  /** 从 CC Switch 导入端点 + Key（不保存，填入表单供确认；导入后自动探查模型）。 */
  const handleImport = useCallback(async () => {
    const res = await getIPC().agent.importFromCcSwitch()
    if (res.ok && res.provider) {
      setEditingId(res.provider.id)
      setForm({ ...res.provider })
      setSource(res.source ?? '')
      setTestResult(null)
      // 自动探查模型（CC Switch 式：导入即拉取可用模型列表）
      void probeModelsWith(res.provider)
    } else {
      setTestResult({ ok: false, text: res.error ?? t('settings.agent.importCc') })
    }
  }, [t])

  /** 探查端点模型列表（可传显式 provider；默认用当前表单值，不落盘）。 */
  const probeModelsWith = useCallback(async (provider: AgentLlmProvider) => {
    setProbing(true)
    setProbedModels(null)
    try {
      const res = await getIPC().agent.probeModels(provider)
      if (res.ok && res.models?.length) {
        setProbedModels(res.models)
      } else {
        setTestResult({ ok: false, text: res.error ?? t('settings.agent.probeFail') })
      }
    } catch (e) {
      setTestResult({ ok: false, text: (e as Error).message })
    } finally {
      setProbing(false)
    }
  }, [t])

  const handleProbe = useCallback(() => {
    if (!form) return
    void probeModelsWith(form)
  }, [form, probeModelsWith])

  /** 测试连接：用当前表单值直接调端点（不落盘、不切换）。 */
  const handleTest = useCallback(async () => {
    if (!form) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await getIPC().agent.testLlmProvider(form)
      setTestResult(
        res.ok
          ? { ok: true, text: `${t('settings.agent.testOk')}（${(res.text ?? '').slice(0, 40)}）` }
          : { ok: false, text: res.error ?? 'failed' }
      )
    } catch (e) {
      setTestResult({ ok: false, text: (e as Error).message })
    } finally {
      setTesting(false)
    }
  }, [form, t])

  /** 保存当前表单（新增或更新）。 */
  const handleSave = useCallback(async () => {
    if (!form) return
    setSaving(true)
    try {
      const res = await getIPC().agent.saveLlmProvider(form)
      if (res.ok) {
        setSettings(res.settings ?? EMPTY_SETTINGS)
        setEditingId(form.id)
      } else {
        setTestResult({ ok: false, text: res.error ?? 'failed' })
      }
    } finally {
      setSaving(false)
    }
  }, [form])

  /** 删除 provider。 */
  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm(t('settings.agent.deleteConfirm'))) return
    const res = await getIPC().agent.deleteLlmProvider(id)
    if (res.ok) {
      const next = res.settings ?? EMPTY_SETTINGS
      setSettings(next)
      const target = next.providers.find((p) => p.id === next.currentId) ?? next.providers[0]
      setEditingId(target?.id ?? null)
      setForm(target ? { ...target } : null)
    }
  }, [t])

  /** 设为当前。 */
  const handleSetCurrent = useCallback(async (id: string) => {
    const res = await getIPC().agent.setCurrentLlmProvider(id)
    if (res.ok) setSettings(res.settings ?? EMPTY_SETTINGS)
  }, [])

  return (
    <div className="flex flex-col py-1">
      {!embedded && (
        <>
          <h3 className="text-sm font-semibold">{t('settings.agent.title')}</h3>
          <p className="text-xs text-muted-foreground mb-3">{t('settings.agent.subtitle')}</p>
        </>
      )}

      <div className="agent-settings__body">
        {/* 左栏：provider 列表 */}
        <div className="agent-settings__list" data-testid="llm-provider-list">
          <div className="agent-settings__list-actions">
            <Button variant="outline" size="sm" onClick={startNew} data-testid="llm-add">
              <Plus size={14} weight="bold" />
              {t('settings.agent.add')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleImport()} data-testid="llm-import-cc">
              <DownloadSimple size={14} weight="bold" />
              {t('settings.agent.importCc')}
            </Button>
          </div>
          {settings.providers.length === 0 && (
            <div className="agent-settings__empty">{t('settings.agent.emptyList')}</div>
          )}
          {settings.providers.map((p) => (
            <div
              key={p.id}
              className={`agent-settings__item ${editingId === p.id ? 'is-active' : ''} ${!p.enabled ? 'is-disabled' : ''}`}
              onClick={() => selectProvider(p)}
              data-testid="llm-provider-item"
            >
              <div className="agent-settings__item-head">
                <span className={`protocol-gen-wizard__llm-dot ${p.enabled ? 'is-on' : ''}`} />
                <span className="agent-settings__item-name">{p.name || t('settings.agent.unknown')}</span>
                {p.id === settings.currentId && (
                  <Badge variant="default" data-testid="llm-provider-current">{t('settings.agent.current')}</Badge>
                )}
              </div>
              <div className="agent-settings__item-sub">
                {p.model || '—'} · {p.baseUrl || '—'}
              </div>
              <div className="agent-settings__item-actions">
                {p.id !== settings.currentId && (
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void handleSetCurrent(p.id) }} data-testid="llm-set-current">
                    <Play size={12} weight="bold" />
                    {t('settings.agent.setCurrent')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void handleDelete(p.id) }} data-testid="llm-delete">
                  <Trash size={12} weight="bold" />
                  {t('settings.agent.delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* 右栏：编辑表单 */}
        <div className="agent-settings__form" data-testid="llm-provider-form">
          {form ? (
            <>
              <label className="agent-settings__row">
                <span className="agent-settings__label">{t('settings.agent.name')}</span>
                <input
                  className="agent-settings__input"
                  value={form.name}
                  onChange={(e) => setForm((p) => (p ? { ...p, name: e.target.value } : p))}
                  placeholder="ChatGPT / DeepSeek"
                  data-testid="llm-name"
                />
              </label>
              <label className="agent-settings__row">
                <span className="agent-settings__label">{t('settings.agent.baseUrl')}</span>
                <input
                  className="agent-settings__input"
                  value={form.baseUrl}
                  onChange={(e) => setForm((p) => (p ? { ...p, baseUrl: e.target.value } : p))}
                  placeholder="https://api.deepseek.com/v1"
                  data-testid="llm-base-url"
                />
              </label>
              <label className="agent-settings__row">
                <span className="agent-settings__label">{t('settings.agent.apiKey')}</span>
                <input
                  className="agent-settings__input"
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm((p) => (p ? { ...p, apiKey: e.target.value } : p))}
                  placeholder="sk-…"
                  data-testid="llm-key"
                />
              </label>
              <label className="agent-settings__row">
                <span className="agent-settings__label">{t('settings.agent.model')}</span>
                <input
                  className="agent-settings__input"
                  value={form.model}
                  onChange={(e) => setForm((p) => (p ? { ...p, model: e.target.value } : p))}
                  placeholder="deepseek-chat / gpt-4o"
                  data-testid="llm-model"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={probing || !form.baseUrl || !form.apiKey}
                  onClick={() => handleProbe()}
                  title={t('settings.agent.probe')}
                  data-testid="llm-probe"
                >
                  {probing ? t('settings.agent.probing') : t('settings.agent.probe')}
                </Button>
              </label>
              {probedModels && (
                <div className="agent-settings__row agent-settings__select-row">
                  <Select
                    value={form.model}
                    onValueChange={(v) => setForm((p) => (p ? { ...p, model: v } : p))}
                  >
                    <SelectTrigger className="agent-settings__select-trigger w-full" data-testid="llm-model-select">
                      <SelectValue placeholder={t('settings.agent.pickModel')} />
                    </SelectTrigger>
                    <SelectContent>
                      {probedModels.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* 思考强度（对齐 CC Switch model_reasoning_effort；完整刻度含极高） */}
              <div className="agent-settings__row">
                <span className="agent-settings__label">{t('settings.agent.effort')}</span>
                <Select
                  value={form.reasoningEffort ?? ''}
                  onValueChange={(v) => setForm((p) => (p ? { ...p, reasoningEffort: (v || undefined) as 'minimal' | 'low' | 'medium' | 'high' | 'max' | undefined } : p))}
                >
                  <SelectTrigger className="agent-settings__select-trigger w-full" data-testid="llm-effort">
                    <SelectValue placeholder={t('settings.agent.effortNone')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('settings.agent.effortNone')}</SelectItem>
                    <SelectItem value="minimal">{t('settings.agent.effortMinimal')}</SelectItem>
                    <SelectItem value="low">{t('settings.agent.effortLow')}</SelectItem>
                    <SelectItem value="medium">{t('settings.agent.effortMedium')}</SelectItem>
                    <SelectItem value="high">{t('settings.agent.effortHigh')}</SelectItem>
                    <SelectItem value="max">{t('settings.agent.effortMax')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 上下文窗口（K tokens，对齐 CC Switch context_window） */}
              <div className="agent-settings__row">
                <span className="agent-settings__label">{t('settings.agent.context')}</span>
                <input
                  className="agent-settings__input"
                  type="number"
                  min={0}
                  value={form.contextWindow ?? 0}
                  onChange={(e) => {
                    const k = Math.max(0, Number(e.target.value) || 0)
                    setForm((p) => (p ? { ...p, contextWindow: k > 0 ? k : undefined } : p))
                  }}
                  placeholder="128"
                  data-testid="llm-context"
                />
                <span className="agent-settings__hint">{t('settings.agent.contextHint')}</span>
              </div>
              <label className="agent-settings__row">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((p) => (p ? { ...p, enabled: e.target.checked } : p))}
                  data-testid="llm-enabled"
                />
                <span>{t('settings.agent.enabled')}</span>
              </label>

              {source && (
                <div className="agent-settings__source" data-testid="llm-source">
                  {t('settings.agent.importedFrom', { source })}
                </div>
              )}

              {testResult && (
                <div className={`agent-settings__test ${testResult.ok ? 'is-ok' : 'is-fail'}`}>
                  {testResult.ok ? <CheckCircle size={14} weight="bold" /> : <XCircle size={14} weight="bold" />}
                  <span>{testResult.text}</span>
                </div>
              )}

              <div className="agent-settings__actions">
                <span className="flex-1" />
                <Button variant="outline" size="sm" disabled={testing} onClick={() => void handleTest()} data-testid="llm-test">
                  <Plug size={14} weight="bold" />
                  {testing ? t('settings.agent.testing') : t('settings.agent.test')}
                </Button>
                <Button size="sm" disabled={saving} onClick={() => void handleSave()} data-testid="llm-save">
                  {t('settings.agent.save')}
                </Button>
              </div>
            </>
          ) : (
            <div className="agent-settings__empty">{t('settings.agent.emptyForm')}</div>
          )}
        </div>
      </div>
    </div>
  )
}
