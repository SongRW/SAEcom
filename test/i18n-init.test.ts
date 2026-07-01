import { describe, it, expect, beforeAll } from 'vitest'

/**
 * i18n 基础设施测试：
 * - 默认中文
 * - 切换英文后 t() 返回英文
 * - 插值 {{count}} 生效
 * - 缺失 key 回退到 key 本身
 *
 * 注：i18n init 在 import 时读 localStorage，node 环境需先 stub。
 */
const store: Record<string, string> = {}
beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = String(v)
        },
        removeItem: (k: string) => {
          delete store[k]
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k]
        }
      },
      configurable: true
    })
  }
})

describe('i18n init', () => {
  it('默认中文：settings.appearance.title === 外观', async () => {
    const i18n = (await import('@/shared/i18n')).default
    await i18n.changeLanguage('zh-CN')
    expect(i18n.t('settings.appearance.title')).toBe('外观')
    expect(i18n.t('mainWindow.sidebar.newPanel')).toBe('新建面板')
  })

  it('切英文：settings.appearance.title === Appearance', async () => {
    const i18n = (await import('@/shared/i18n')).default
    await i18n.changeLanguage('en-US')
    expect(i18n.t('settings.appearance.title')).toBe('Appearance')
    expect(i18n.t('mainWindow.sidebar.newPanel')).toBe('New panel')
  })

  it('插值 {{count}} 生效', async () => {
    const i18n = (await import('@/shared/i18n')).default
    await i18n.changeLanguage('zh-CN')
    expect(i18n.t('mainWindow.panelOverview.count', { count: 3 })).toBe('共 3 个面板 · 点击聚焦')
    await i18n.changeLanguage('en-US')
    expect(i18n.t('mainWindow.panelOverview.count', { count: 3 })).toBe('3 panels · click to focus')
  })

  it('缺失 key 回退到 key 本身', async () => {
    const i18n = (await import('@/shared/i18n')).default
    await i18n.changeLanguage('zh-CN')
    expect(i18n.t('nonexistent.key')).toBe('nonexistent.key')
  })
})
