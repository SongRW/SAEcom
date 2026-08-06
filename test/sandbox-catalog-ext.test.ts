import { describe, expect, it, beforeEach } from 'vitest'
import {
  SANDBOX_API_CATALOG,
  getAllSandboxApis,
  isKnownSandboxApi,
  unknownSandboxApis,
  registerSandboxApi,
  unregisterSandboxApisByProvider,
  clearExtendedSandboxApisRegistrations
} from '@/features/script-editor/nodes/component/sandboxCatalog'

describe('sandboxCatalog 扩展注册（插件贡献 API）', () => {
  beforeEach(() => {
    // 每个用例前清空扩展表，避免用例间状态泄漏
    clearExtendedSandboxApisRegistrations()
  })

  it('初始：getAllSandboxApis == SANDBOX_API_CATALOG（无扩展时）', () => {
    expect(getAllSandboxApis()).toEqual([...SANDBOX_API_CATALOG])
  })

  it('注册后：isKnownSandboxApi 认它，unknownSandboxApis 不再报它', () => {
    registerSandboxApi('mqttPublish', 'plugin.com.example.mqtt')
    expect(isKnownSandboxApi('mqttPublish')).toBe(true)
    expect(unknownSandboxApis(['mqttPublish'])).toEqual([])
  })

  it('getAllSandboxApis 包含扩展项（内置在前，扩展在后）', () => {
    registerSandboxApi('aaa', 'plugin.x')
    registerSandboxApi('bbb', 'plugin.x')
    const all = getAllSandboxApis()
    // 内置全部保留
    for (const b of SANDBOX_API_CATALOG) expect(all).toContain(b)
    // 扩展在末尾，按注册顺序
    expect(all[all.length - 2]).toBe('aaa')
    expect(all[all.length - 1]).toBe('bbb')
    expect(all.length).toBe(SANDBOX_API_CATALOG.length + 2)
  })

  it('禁止覆盖内置 API（抛错，不污染扩展表）', () => {
    expect(() => registerSandboxApi('send', 'plugin.x')).toThrow(/内置 API/)
    // 内置本就在白名单——断言注册失败后扩展表仍为空（send 未进扩展表）
    expect(getAllSandboxApis().length).toBe(SANDBOX_API_CATALOG.length)
  })

  it('注册名为空抛错', () => {
    expect(() => registerSandboxApi('', 'plugin.x')).toThrow()
  })

  it('重复注册同名：后者覆盖前者（warn 但不抛）', () => {
    registerSandboxApi('shared', 'plugin.a')
    registerSandboxApi('shared', 'plugin.b')
    // 按 provider 注销 plugin.a 后 'shared' 仍存在（归属 plugin.b）
    unregisterSandboxApisByProvider('plugin.a')
    expect(isKnownSandboxApi('shared')).toBe(true)
  })

  it('按 provider 批量注销：仅清该 provider 的扩展，不影响内置与他人', () => {
    registerSandboxApi('a1', 'plugin.a')
    registerSandboxApi('a2', 'plugin.a')
    registerSandboxApi('b1', 'plugin.b')
    unregisterSandboxApisByProvider('plugin.a')
    expect(isKnownSandboxApi('a1')).toBe(false)
    expect(isKnownSandboxApi('a2')).toBe(false)
    expect(isKnownSandboxApi('b1')).toBe(true)
    // 内置不受影响
    expect(isKnownSandboxApi('send')).toBe(true)
  })

  it('clearExtendedSandboxApisRegistrations：清空所有扩展，内置不动', () => {
    registerSandboxApi('tmp1', 'plugin.x')
    registerSandboxApi('tmp2', 'plugin.y')
    clearExtendedSandboxApisRegistrations()
    expect(getAllSandboxApis()).toEqual([...SANDBOX_API_CATALOG])
    expect(isKnownSandboxApi('tmp1')).toBe(false)
    expect(isKnownSandboxApi('send')).toBe(true)
  })
})
