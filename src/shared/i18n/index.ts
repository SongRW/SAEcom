import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

/** 支持的语言 */
export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: SupportedLocale = 'zh-CN'

/** 从 localStorage(appSettings.locale) 读取用户选择的语言，无则默认中文 */
function readLocale(): SupportedLocale {
  try {
    const raw = JSON.parse(localStorage.getItem('appSettings') || '{}')
    const v = raw?.locale
    if (v && (SUPPORTED_LOCALES as readonly string[]).includes(v)) return v as SupportedLocale
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE
}

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS }
  },
  lng: readLocale(),
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false }
})

export default i18n
