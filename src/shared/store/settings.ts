import { create } from 'zustand'

/**
 * 设置项键名。fx 视觉效果（anim/animExtreme/popTop/dockJump/winter）已砍掉，不在 React 主窗口管理。
 * legacy renderer.js 仍读写这些 fx 字段到同一 localStorage，React 侧忽略即可。
 */
export type SettingKey =
  | 'fullscreen'
  | 'dark'
  | 'locale'
  | 'rxTimestamp'
  | 'txTimestamp'
  | 'confirmClear'
  | 'confirmDelete'
  | 'charEncoding'
  | 'bufferTime'
  | 'echoSend'
  | 'longCommandThreshold'
  | 'fontSize'
  | 'autoCheckUpdate'

export interface Settings {
  fullscreen: boolean
  dark: boolean
  /** 界面语言（i18n）：'zh-CN' | 'en-US' */
  locale: string
  rxTimestamp: boolean
  txTimestamp: boolean
  confirmClear: boolean
  confirmDelete: boolean
  charEncoding: string
  /** 接收缓冲时间(ms)：同一静默期内合并为一组(首块加时间戳)。0=每块独立。 */
  bufferTime: number
  /** 发送回显：发送的数据是否在展示区显示。 */
  echoSend: boolean
  /** 长命令阈值(字符数)：命令数据超过此长度时，编辑器自动展开为多行文本框。 */
  longCommandThreshold: number
  /** 基础字号 px，通过 CSS 变量 --font-size-base 应用到 <html>。 */
  fontSize: number
  /** 启动时自动检查更新（关于分区，默认开启）。 */
  autoCheckUpdate: boolean
}

/** localStorage key */
const SETTINGS_KEY = 'appSettings'

/** 默认值（时间戳/确认类默认 true） */
const DEFAULTS: Settings = {
  fullscreen: false,
  dark: false,
  locale: 'zh-CN',
  rxTimestamp: true,
  txTimestamp: true,
  confirmClear: true,
  confirmDelete: true,
  charEncoding: 'utf-8',
  bufferTime: 50,
  echoSend: false,
  longCommandThreshold: 80,
  fontSize: 14,
  autoCheckUpdate: true
}

function loadFromStorage(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return {
      ...DEFAULTS,
      fullscreen: !!s.fullscreen,
      dark: !!s.dark,
      locale: typeof s.locale === 'string' ? s.locale : 'zh-CN',
      rxTimestamp: s.rxTimestamp !== false,
      txTimestamp: s.txTimestamp !== false,
      confirmClear: s.confirmClear !== false,
      confirmDelete: s.confirmDelete !== false,
      charEncoding: s.charEncoding || 'utf-8',
      bufferTime: typeof s.bufferTime === 'number' ? s.bufferTime : 50,
      echoSend: !!s.echoSend,
      longCommandThreshold:
        typeof s.longCommandThreshold === 'number' && s.longCommandThreshold > 0
          ? s.longCommandThreshold
          : 80,
      fontSize:
        typeof s.fontSize === 'number' && s.fontSize >= 12 && s.fontSize <= 20
          ? s.fontSize
          : 14,
      autoCheckUpdate: s.autoCheckUpdate !== false
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function persist(s: Settings) {
  try {
    const existing = (() => {
      try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
      } catch {
        return {}
      }
    })()
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...existing, ...s }))
  } catch {
    /* 忽略存储错误 */
  }
}

interface SettingsState extends Settings {
  /** 修改单项设置；自动持久化 */
  setField: (key: SettingKey, value: boolean | string | number) => void
  /** 重置为默认 */
  reset: () => void
}

/**
 * 应用设置 store。
 * 持久化到 localStorage（与 legacy 共享 appSettings key）。
 * 副作用（主题/全屏）由消费方在变更时触发，不在此处直接调 IPC，保持 store 纯数据。
 */
export const useSettingsStore = create<SettingsState>((set) => ({
  ...loadFromStorage(),
  setField: (key, value) =>
    set((state) => {
      const next = { ...state, [key]: value } as SettingsState
      persist(next as Settings)
      return { [key]: value } as Partial<SettingsState>
    }),
  reset: () => {
    persist(DEFAULTS)
    set({ ...DEFAULTS })
  }
}))
