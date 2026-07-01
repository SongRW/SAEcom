import type { WindowAPI } from '@shared/types'

/**
 * 类型安全的 window.api 访问器（React hook 版本）。
 * 直接返回 window.api（preload 已通过 contextBridge 暴露），仅做类型断言。
 */
export function useIPC(): WindowAPI {
  if (!window.api) {
    throw new Error('window.api 未注入——请确认 preload 已加载')
  }
  return window.api
}

/**
 * 非-hook 版本，用于 React 组件树外（如事件回调、store action）
 */
export function getIPC(): WindowAPI {
  if (!window.api) {
    throw new Error('window.api 未注入——请确认 preload 已加载')
  }
  return window.api
}
